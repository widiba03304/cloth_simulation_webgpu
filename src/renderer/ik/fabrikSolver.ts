/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver.
 * Fast iterative algorithm for solving IK chains in real-time.
 */

import type { Skeleton, Vec3, Quat } from './skeleton';
import { vec3Distance, vec3Normalize, vec3Subtract, vec3Add, vec3Scale, quatFromTwoVectors, quatConjugate, quatMultiply } from './skeleton';

export interface IKChain {
  jointIds: number[]; // Joint IDs from root to end effector
  lengths: number[]; // Bone lengths between joints
  positions: Vec3[]; // Current positions (updated during solve)
  target: Vec3; // Target position for end effector
  poleVector?: Vec3; // Optional constraint (e.g., knee direction)
}

/**
 * FABRIK IK solver for SMPL skeleton.
 */
export class FABRIKSolver {
  skeleton: Skeleton;
  chains: Map<number, IKChain>; // endEffectorId -> IKChain
  tolerance: number = 0.001; // Convergence tolerance (1mm) - tighter for better accuracy
  maxIterations: number = 50; // Maximum FABRIK iterations - increased for better convergence

  constructor(skeleton: Skeleton) {
    this.skeleton = skeleton;
    this.chains = new Map();
  }

  /**
   * Define an IK chain from root to end effector.
   * @param endEffectorId - Joint ID of the end effector (e.g., wrist, ankle)
   * @param rootId - Joint ID of the chain root (e.g., shoulder, hip)
   * @param poleVector - Optional pole vector for constraining joint direction
   */
  addChain(endEffectorId: number, rootId: number, poleVector?: Vec3): void {
    // Get chain of joints from root to end effector
    const jointIds = this.skeleton.getChain(endEffectorId, rootId);

    if (jointIds.length < 2) {
      console.warn(`IK chain too short: ${jointIds.length} joints`);
      return;
    }

    // Calculate bone lengths
    const lengths: number[] = [];
    const positions: Vec3[] = [];

    for (let i = 0; i < jointIds.length; i++) {
      const joint = this.skeleton.getJoint(jointIds[i])!;
      positions.push([...joint.worldPosition]);

      if (i < jointIds.length - 1) {
        const nextJoint = this.skeleton.getJoint(jointIds[i + 1])!;
        const length = vec3Distance(joint.worldPosition, nextJoint.worldPosition);
        lengths.push(length);
      }
    }

    const chain: IKChain = {
      jointIds,
      lengths,
      positions,
      target: [...positions[positions.length - 1]], // Initialize target to current end effector position
      poleVector,
    };

    this.chains.set(endEffectorId, chain);

    console.log(`Added IK chain: ${jointIds.length} joints, ${lengths.length} bones`);
    console.log(`  Root: ${this.skeleton.getJoint(rootId)?.name}`);
    console.log(`  End: ${this.skeleton.getJoint(endEffectorId)?.name}`);
  }

  /**
   * Solve IK for a specific end effector to reach target position.
   * @param endEffectorId - Joint ID of the end effector
   * @param target - Target position in world space
   * @returns true if converged, false if max iterations reached
   */
  solve(endEffectorId: number, target: Vec3): boolean {
    const chain = this.chains.get(endEffectorId);
    if (!chain) {
      console.warn(`No IK chain found for joint ${endEffectorId}`);
      return false;
    }

    // Update chain positions from skeleton (in case FK updated them)
    this.updateChainFromSkeleton(chain);

    // Set new target
    chain.target = [...target];

    // Check if target is reachable
    const totalLength = chain.lengths.reduce((sum, len) => sum + len, 0);
    const distToTarget = vec3Distance(chain.positions[0], chain.target);

    if (distToTarget > totalLength * 0.999) {
      // Target is out of reach - stretch chain fully toward target
      this.stretchChain(chain);
      this.applyChainToSkeleton(chain);
      return false;
    }

    // FABRIK iteration
    let converged = false;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Check convergence
      const endPos = chain.positions[chain.positions.length - 1];
      const dist = vec3Distance(endPos, chain.target);

      if (dist < this.tolerance) {
        converged = true;
        break;
      }

      // Forward pass: reach target
      this.forwardPass(chain);

      // Backward pass: maintain root
      this.backwardPass(chain);

      // Optional: Apply pole vector constraint
      if (chain.poleVector) {
        this.applyPoleVector(chain);
      }
    }

    // Apply solved positions to skeleton (convert to rotations)
    this.applyChainToSkeleton(chain);

    return converged;
  }

  /**
   * Forward pass: Start from end effector, reach toward target.
   */
  private forwardPass(chain: IKChain): void {
    const { positions, lengths, target } = chain;
    const n = positions.length;

    // Set end effector to target
    positions[n - 1] = [...target];

    // Work backward from end effector to root
    for (let i = n - 2; i >= 0; i--) {
      const dir = vec3Normalize(vec3Subtract(positions[i], positions[i + 1]));
      positions[i] = vec3Add(positions[i + 1], vec3Scale(dir, lengths[i]));
    }
  }

  /**
   * Backward pass: Start from root, maintain original root position.
   */
  private backwardPass(chain: IKChain): void {
    const { positions, lengths, jointIds } = chain;
    const n = positions.length;

    // Restore root to original skeleton position
    const rootJoint = this.skeleton.getJoint(jointIds[0])!;
    positions[0] = [...rootJoint.worldPosition];

    // Work forward from root to end effector
    for (let i = 1; i < n; i++) {
      const dir = vec3Normalize(vec3Subtract(positions[i], positions[i - 1]));
      positions[i] = vec3Add(positions[i - 1], vec3Scale(dir, lengths[i - 1]));
    }
  }

  /**
   * Stretch chain fully toward target (when target is out of reach).
   */
  private stretchChain(chain: IKChain): void {
    const { positions, lengths, target } = chain;
    const n = positions.length;

    // Direction from root to target
    const dir = vec3Normalize(vec3Subtract(target, positions[0]));

    // Place each joint along the direction
    let accumulated = 0;
    for (let i = 1; i < n; i++) {
      accumulated += lengths[i - 1];
      positions[i] = vec3Add(positions[0], vec3Scale(dir, accumulated));
    }
  }

  /**
   * Apply pole vector constraint (for knees/elbows).
   * Forces the middle joint to bend toward the pole vector.
   */
  private applyPoleVector(chain: IKChain): void {
    if (!chain.poleVector || chain.positions.length < 3) return;

    // Apply to middle joint (e.g., knee/elbow)
    const midIdx = Math.floor(chain.positions.length / 2);

    const root = chain.positions[0];
    const mid = chain.positions[midIdx];
    const end = chain.positions[chain.positions.length - 1];

    // Plane formed by root -> end
    const lineDir = vec3Normalize(vec3Subtract(end, root));

    // Project pole vector onto plane perpendicular to line
    const toPole = vec3Subtract(chain.poleVector, mid);
    const projection = vec3Scale(lineDir, vec3Dot(toPole, lineDir));
    const perpendicular = vec3Normalize(vec3Subtract(toPole, projection));

    // Adjust middle joint position toward pole
    const toMid = vec3Subtract(mid, root);
    const midDist = vec3Distance(root, mid);

    // Project onto plane and add pole influence
    const midProjection = vec3Scale(lineDir, vec3Dot(toMid, lineDir));
    const midPerpendicular = vec3Subtract(toMid, midProjection);

    // Blend toward pole direction
    const blended = vec3Normalize(vec3Add(midPerpendicular, vec3Scale(perpendicular, 0.5)));
    chain.positions[midIdx] = vec3Add(root, vec3Add(midProjection, vec3Scale(blended, midDist)));
  }

  /**
   * Update chain positions from current skeleton state.
   */
  private updateChainFromSkeleton(chain: IKChain): void {
    for (let i = 0; i < chain.jointIds.length; i++) {
      const joint = this.skeleton.getJoint(chain.jointIds[i])!;
      chain.positions[i] = [...joint.worldPosition];
    }
  }

  /**
   * Apply solved chain positions back to skeleton as rotations.
   * Converts position changes to joint rotations using FK.
   */
  private applyChainToSkeleton(chain: IKChain): void {
    const { jointIds, positions } = chain;

    console.log('[FABRIK] applyChainToSkeleton - chain length:', jointIds.length);
    console.log('[FABRIK] Chain positions:', positions);

    // For each joint in chain (except last), compute rotation to point toward next joint
    for (let i = 0; i < jointIds.length - 1; i++) {
      const joint = this.skeleton.getJoint(jointIds[i])!;
      const nextJoint = this.skeleton.getJoint(jointIds[i + 1])!;

      // Original bone direction in WORLD space (from current skeleton state)
      const originalDir = vec3Normalize(vec3Subtract(nextJoint.worldPosition, joint.worldPosition));

      // New bone direction in WORLD space (from FABRIK solution)
      const newWorldDir = vec3Normalize(vec3Subtract(positions[i + 1], positions[i]));

      console.log(`[FABRIK] Joint ${jointIds[i]} (${joint.name}): originalDir =`, originalDir, 'newWorldDir =', newWorldDir);

      // Compute rotation quaternion from original to new direction (both in world space)
      const deltaRotation = quatFromTwoVectors(originalDir, newWorldDir);

      console.log(`[FABRIK] Computed delta rotation:`, deltaRotation);

      // Apply delta rotation to current world rotation
      const newWorldRotation = quatMultiply(deltaRotation, joint.worldRotation);

      // Convert world rotation to local rotation
      // local_rotation = parent_world_rotation^-1 * world_rotation
      let localRotation: Quat;
      if (joint.parent >= 0) {
        const parent = this.skeleton.getJoint(joint.parent)!;
        const parentWorldRotInv = quatConjugate(parent.worldRotation);
        localRotation = quatMultiply(parentWorldRotInv, newWorldRotation);
      } else {
        // Root joint: local = world
        localRotation = newWorldRotation;
      }

      console.log(`[FABRIK] New world rotation:`, newWorldRotation, `local rotation:`, localRotation);

      // Apply rotation to joint
      this.skeleton.setJointRotation(jointIds[i], localRotation);
    }

    console.log('[FABRIK] Calling updateWorldTransforms');

    // Update skeleton FK to propagate changes
    this.skeleton.updateWorldTransforms();

    console.log('[FABRIK] updateWorldTransforms completed');
  }

  /**
   * Get target position for a specific end effector.
   */
  getTarget(endEffectorId: number): Vec3 | null {
    const chain = this.chains.get(endEffectorId);
    return chain ? chain.target : null;
  }

  /**
   * Set target position for a specific end effector.
   */
  setTarget(endEffectorId: number, target: Vec3): void {
    const chain = this.chains.get(endEffectorId);
    if (chain) {
      chain.target = [...target];
    }
  }

  /**
   * Remove an IK chain.
   */
  removeChain(endEffectorId: number): void {
    this.chains.delete(endEffectorId);
  }

  /**
   * Clear all IK chains.
   */
  clearChains(): void {
    this.chains.clear();
  }
}

// Helper for vec3Dot (if not exported from skeleton.ts)
function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
