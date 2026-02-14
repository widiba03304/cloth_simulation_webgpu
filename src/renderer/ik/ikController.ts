/**
 * IK Controller - Main interface for the inverse kinematics system.
 * Coordinates skeleton, FABRIK solver, and skinning for real-time pose manipulation.
 */

import { Skeleton } from './skeleton';
import { FABRIKSolver } from './fabrikSolver';
import { GPUSkinning } from '../compute/gpuSkinning';
import type { Vec3 } from './skeleton';
import type { SMPLPoseData } from '../render/smplPoseData';
import { recomputeJointPositions } from '../render/smplPoseData';
import type { BodyMesh } from '../render/bodyMesh';
import { computeSMPLScaleParams } from '../render/smplBlendShapes';

export interface IKControllerState {
  enabled: boolean;
  activeJoint: number | null; // Currently dragged joint ID
  targetPosition: Vec3 | null; // Current IK target
}

/**
 * Main IK controller that manages the complete IK system.
 */
export class IKController {
  skeleton: Skeleton;
  solver: FABRIKSolver;
  gpuSkinning: GPUSkinning;
  state: IKControllerState;

  // IK-enabled joints
  private enabledJoints: Set<number>;

  // Skeleton dirty flag (marks when GPU skinning needs to recompute)
  private skeletonDirty: boolean = false;

  constructor(
    poseData: SMPLPoseData,
    baseMesh: BodyMesh,
    gpuDevice: GPUDevice,
    unscaledMeshVertices?: Float32Array
  ) {
    // IMPORTANT: Compute joint positions directly from the SCALED mesh (baseMesh.positions)
    // This ensures joints are already in the same coordinate space as the rendered mesh
    const jointPositionsToUse = recomputeJointPositions(poseData, baseMesh.positions);
    console.log('Recomputed joint positions from scaled mesh vertices');

    // Create modified pose data with correct joint positions
    const modifiedPoseData = {
      ...poseData,
      joint_positions: jointPositionsToUse,
    };

    // Initialize skeleton from SMPL data with joint positions already in mesh space
    this.skeleton = new Skeleton(modifiedPoseData);

    // Skeleton joints are now in the same coordinate space as baseMesh.positions
    // No additional scaling needed!
    console.log('Skeleton initialized with joint positions matching scaled mesh');

    // Initialize FABRIK solver
    this.solver = new FABRIKSolver(this.skeleton);

    // Initialize GPU skinning (required)
    this.gpuSkinning = new GPUSkinning(gpuDevice, poseData, baseMesh);
    console.log('GPU skinning initialized');

    // Initialize state
    this.state = {
      enabled: false,
      activeJoint: null,
      targetPosition: null,
    };

    // Initially no joints are enabled
    this.enabledJoints = new Set();

    console.log('IK Controller initialized - joints match mesh coordinate space');

    // Don't apply test rotation - keep skeleton in rest pose
    // Skinning will only be applied when IK is enabled and actively used
  }

  /**
   * Enable IK for specific joints (e.g., wrists, ankles, elbows, knees).
   * @param jointIds - Array of joint IDs to enable for IK control
   */
  setEnabledJoints(jointIds: number[]): void {
    this.enabledJoints = new Set(jointIds);

    // Set up IK chains for enabled joints
    this.solver.clearChains();

    for (const jointId of jointIds) {
      const joint = this.skeleton.getJoint(jointId);
      if (!joint) continue;

      // Find appropriate root joint for this end effector
      const rootId = this.findChainRoot(jointId);

      if (rootId >= 0) {
        // Add IK chain
        this.solver.addChain(jointId, rootId);
        console.log(`  IK chain: ${this.skeleton.getJoint(rootId)?.name} → ${joint.name}`);
      }
    }
  }

  /**
   * Find appropriate root joint for an end effector.
   * Goes up the hierarchy to find a good root (e.g., shoulder for wrist, hip for ankle).
   * IMPORTANT: Never use pelvis (joint 0) as root to avoid moving entire body.
   */
  private findChainRoot(endEffectorId: number): number {
    const joint = this.skeleton.getJoint(endEffectorId);
    if (!joint) return -1;

    const jointName = joint.name.toLowerCase();

    // Define chain roots based on joint type to avoid moving pelvis
    if (jointName.includes('knee') || jointName.includes('ankle')) {
      // Leg joints: use hip as root (NOT pelvis)
      // Chain: hip → knee or hip → knee → ankle
      let current = joint.parent; // Start from parent
      while (current >= 0) {
        const parentJoint = this.skeleton.getJoint(current);
        if (!parentJoint) break;

        // Stop at hip (parent of knee is hip)
        if (parentJoint.name.toLowerCase().includes('hip')) {
          return current;
        }

        current = parentJoint.parent;
      }

      // Fallback: use immediate parent if hip not found
      return joint.parent >= 0 ? joint.parent : 1; // Avoid pelvis (0)
    }

    if (jointName.includes('elbow') || jointName.includes('wrist')) {
      // Arm joints: use shoulder as root
      // Chain: shoulder → elbow or shoulder → elbow → wrist
      let current = joint.parent;
      while (current >= 0) {
        const parentJoint = this.skeleton.getJoint(current);
        if (!parentJoint) break;

        // Stop at shoulder
        if (parentJoint.name.toLowerCase().includes('shoulder')) {
          return current;
        }

        current = parentJoint.parent;
      }

      // Fallback: use immediate parent
      return joint.parent >= 0 ? joint.parent : 1; // Avoid pelvis (0)
    }

    // Default: use immediate parent but never pelvis
    const parentId = joint.parent >= 0 ? joint.parent : 1;
    return parentId === 0 ? 1 : parentId; // If parent is pelvis, use joint 1 instead
  }

  /**
   * Start dragging a joint (begin IK solve).
   * @param jointId - Joint ID to drag
   * @param targetPosition - Initial target position
   */
  startDrag(jointId: number, targetPosition: Vec3): void {
    if (!this.enabledJoints.has(jointId)) {
      console.warn(`Joint ${jointId} is not enabled for IK`);
      return;
    }

    this.state.activeJoint = jointId;
    this.state.targetPosition = [...targetPosition];

    console.log(`Started dragging joint ${jointId} (${this.skeleton.getJoint(jointId)?.name})`);
  }

  /**
   * Update drag target position (continues IK solve).
   * @param targetPosition - New target position
   */
  updateDrag(targetPosition: Vec3): void {
    if (this.state.activeJoint === null) {
      console.warn('[IK] updateDrag called but activeJoint is null');
      return;
    }

    this.state.targetPosition = [...targetPosition];

    // Get joint position before IK solve
    const jointBefore = this.skeleton.getJointWorldPosition(this.state.activeJoint);
    console.log('[IK] updateDrag - joint:', this.state.activeJoint, 'target:', targetPosition, 'current pos:', jointBefore);

    // Solve IK for active joint
    const converged = this.solver.solve(this.state.activeJoint, targetPosition);

    // Get joint position after IK solve
    const jointAfter = this.skeleton.getJointWorldPosition(this.state.activeJoint);
    console.log('[IK] IK solved - converged:', converged, 'new pos:', jointAfter);

    // Mark skeleton as dirty so mesh will be recomputed
    this.skeletonDirty = true;

    if (!converged) {
      // console.warn(`IK did not converge for joint ${this.state.activeJoint}`);
    }
  }

  /**
   * End dragging (finish IK solve).
   */
  endDrag(): void {
    if (this.state.activeJoint !== null) {
      console.log(`Ended dragging joint ${this.state.activeJoint}`);
    }

    this.state.activeJoint = null;
    this.state.targetPosition = null;
  }

  /**
   * Compute GPU skinning (if available) and copy to render buffers
   * All operations in a single command encoder for proper synchronization
   */
  computeAndCopyGPUSkinning(
    commandEncoder: GPUCommandEncoder,
    targetPositionsBuffer: GPUBuffer,
    targetNormalsBuffer: GPUBuffer
  ): void {
    if (!this.skeletonDirty) {
      // Skeleton hasn't changed, no need to recompute
      console.log('[IKController] Skipping GPU skinning - skeleton not dirty');
      return;
    }

    try {
      console.log('[IKController] Computing GPU skinning - skeleton is dirty');

      // Compute skinning on GPU
      this.gpuSkinning.computeSkinning(this.skeleton, commandEncoder);

      // Copy to render buffers (in same command encoder for synchronization)
      this.gpuSkinning.copyToRenderBuffers(
        commandEncoder,
        targetPositionsBuffer,
        targetNormalsBuffer
      );

      this.skeletonDirty = false;
      console.log('[IKController] GPU skinning completed, skeleton marked clean');
    } catch (error) {
      console.error('[IKController] GPU skinning failed:', error);
    }
  }

  /**
   * Copy deformed mesh from GPU to render buffers
   */
  copyDeformedToRenderBuffers(
    commandEncoder: GPUCommandEncoder,
    targetPositionsBuffer: GPUBuffer,
    targetNormalsBuffer: GPUBuffer
  ): void {
    this.gpuSkinning.copyToRenderBuffers(
      commandEncoder,
      targetPositionsBuffer,
      targetNormalsBuffer
    );
  }


  /**
   * Reset skeleton to rest pose.
   */
  reset(): void {
    this.skeleton.resetPose();
    this.state.activeJoint = null;
    this.state.targetPosition = null;
    this.skeletonDirty = true; // Mark as dirty to recompute mesh
  }

  /**
   * Enable/disable IK system.
   */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;

    if (!enabled) {
      this.reset();
    } else {
      // When enabling, mark as dirty to ensure mesh is computed
      this.skeletonDirty = true;
    }
  }

  /**
   * Check if a joint is enabled for IK.
   */
  isJointEnabled(jointId: number): boolean {
    return this.enabledJoints.has(jointId);
  }

  /**
   * Get all enabled joint IDs.
   */
  getEnabledJoints(): number[] {
    return Array.from(this.enabledJoints);
  }

  /**
   * Get world positions of all joints.
   */
  getJointPositions(): Vec3[] {
    return this.skeleton.joints.map((j) => j.worldPosition);
  }

  /**
   * Get world position of a specific joint.
   */
  getJointPosition(jointId: number): Vec3 | null {
    return this.skeleton.getJointWorldPosition(jointId);
  }

  /**
   * Check if currently dragging.
   */
  isDragging(): boolean {
    return this.state.activeJoint !== null;
  }

  /**
   * Get currently dragged joint ID.
   */
  getActiveJoint(): number | null {
    return this.state.activeJoint;
  }

  /**
   * Mark skeleton as dirty to trigger GPU skinning recomputation.
   * Used by external systems like rotation gizmo.
   */
  markSkeletonDirty(): void {
    this.skeletonDirty = true;
  }
}
