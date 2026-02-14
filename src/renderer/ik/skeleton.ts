/**
 * Skeleton system with forward kinematics for SMPL body model.
 * Manages joint hierarchy, local/world transforms, and pose updates.
 */

import type { SMPLPoseData } from '../render/smplPoseData';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]
export type Mat4 = Float32Array; // 4x4 matrix, row-major

export type JointConstraintType = 'none' | 'hinge' | 'ball' | 'multi-axis';

export interface JointConstraint {
  type: JointConstraintType;

  // Hinge joint: rotation around single axis (e.g., knee, elbow)
  hingeAxis?: 'x' | 'y' | 'z'; // Which axis to rotate around
  minAngle?: number; // Min angle in radians (can be negative for hyperextension)
  maxAngle?: number; // Max angle in radians

  // Ball joint: limited rotation in all directions (e.g., shoulder, hip)
  maxSwing?: number; // Max swing angle from rest pose

  // Multi-axis joint: different limits per axis (e.g., ankle, wrist)
  // Stored as [minX, maxX, minY, maxY, minZ, maxZ] in radians
  axisLimits?: [number, number, number, number, number, number];
}

export interface Joint {
  id: number;
  name: string;
  parent: number; // Parent joint ID (-1 for root)
  children: number[]; // Child joint IDs

  // Rest pose (initial configuration)
  restPosition: Vec3; // Local position relative to parent

  // Current pose (modified by IK)
  localPosition: Vec3; // Local position relative to parent
  localRotation: Quat; // Local rotation relative to parent

  // World transform (computed by FK)
  worldPosition: Vec3; // World space position
  worldRotation: Quat; // World space rotation
  worldTransform: Mat4; // 4x4 world transform matrix

  // Bind pose (for skinning)
  bindPoseTransform: Mat4; // World transform in rest pose (for inverse bind pose)
  inverseBindPose: Mat4; // Inverse of bind pose transform

  // Joint constraints (angle limits)
  constraint: JointConstraint;
}

/**
 * Skeleton class manages SMPL joint hierarchy and forward kinematics.
 */
export class Skeleton {
  joints: Joint[];
  kintree: number[][]; // [parent_ids, joint_ids]
  numJoints: number;

  constructor(poseData: SMPLPoseData) {
    this.numJoints = poseData.num_joints;
    this.kintree = poseData.kintree_table;
    this.joints = [];

    // Debug: Check kintree structure
    console.log('[Skeleton] kintree_table structure:', {
      isArray: Array.isArray(this.kintree),
      length: this.kintree.length,
      row0Sample: this.kintree[0]?.slice(0, 5),
      row1Sample: this.kintree[1]?.slice(0, 5),
    });

    // Initialize joints from pose data
    // Note: joint_positions contains WORLD positions, need to convert to local
    const worldPositions: Vec3[] = [];
    for (let i = 0; i < this.numJoints; i++) {
      worldPositions.push([
        poseData.joint_positions[i * 3],
        poseData.joint_positions[i * 3 + 1],
        poseData.joint_positions[i * 3 + 2],
      ]);
    }

    for (let i = 0; i < this.numJoints; i++) {
      const name = poseData.joint_names[i];
      let parent = this.kintree[0][i];  // Row 0 contains parent IDs

      // Handle unsigned -1 (4294967295 = 2^32 - 1 = 0xFFFFFFFF)
      // JSON doesn't preserve signed integers, so -1 becomes unsigned
      if (parent > this.numJoints || parent === 4294967295 || parent === 0xFFFFFFFF) {
        parent = -1;
      }

      // Debug: Log first few joints
      if (i < 3) {
        console.log(`[Skeleton] Joint ${i} (${name}): parent=${parent}, worldPos=`, worldPositions[i]);
      }

      // Validate parent index
      if (parent !== -1 && (parent < 0 || parent >= this.numJoints)) {
        console.error(`[Skeleton] Invalid parent ${parent} for joint ${i} (${name})`);
        throw new Error(`Invalid parent index ${parent} for joint ${i}`);
      }

      // Convert world position to local position (offset from parent)
      let localPos: Vec3;
      if (parent === -1) {
        // Root joint: local position = world position
        localPos = worldPositions[i];
      } else {
        // Child joint: local position = world position - parent world position
        localPos = vec3Subtract(worldPositions[i], worldPositions[parent]);
      }

      // Define constraints based on joint type
      const constraint = this.getJointConstraint(name);

      // Initialize joint
      const joint: Joint = {
        id: i,
        name,
        parent,
        children: [],
        restPosition: localPos,
        localPosition: [...localPos],
        localRotation: [0, 0, 0, 1], // Identity quaternion
        worldPosition: [...worldPositions[i]], // Will be updated by FK
        worldRotation: [0, 0, 0, 1], // Identity quaternion
        worldTransform: new Float32Array(16), // 4x4 identity matrix
        bindPoseTransform: new Float32Array(16), // Will be computed after FK
        inverseBindPose: new Float32Array(16), // Will be computed after FK
        constraint, // Joint angle constraints
      };

      // Initialize world transform as identity
      mat4Identity(joint.worldTransform);

      this.joints.push(joint);
    }

    // Build child lists
    for (let i = 0; i < this.numJoints; i++) {
      const parent = this.joints[i].parent;
      if (parent >= 0 && parent < this.numJoints) {
        this.joints[parent].children.push(i);
      }
    }

    // Initial FK update
    this.updateWorldTransforms();

    // Save bind pose transforms and compute inverse bind poses
    for (const joint of this.joints) {
      // Copy current world transform as bind pose
      joint.bindPoseTransform.set(joint.worldTransform);

      // Compute inverse bind pose
      mat4Invert(joint.inverseBindPose, joint.bindPoseTransform);
    }

    console.log('[Skeleton] Bind pose transforms saved');

    // Joint constraints disabled - all joints can move freely
    console.log('[Skeleton] Joint constraints disabled - free movement enabled');

    // Verify initial transforms
    console.log('[Skeleton] Initial transforms after construction:');
    const joint0 = this.joints[0];
    const j0m = Array.from(joint0.worldTransform.slice(0, 16)).map(v => v.toFixed(2));
    console.log(`  Joint 0: pos=(${joint0.worldPosition.map(v => v.toFixed(2)).join(', ')})`);
    console.log(`  Joint 0 matrix: [${j0m.slice(0, 4)}] [${j0m.slice(4, 8)}] [${j0m.slice(8, 12)}] [${j0m.slice(12, 16)}]`);
  }

  /**
   * Get constraint configuration for a joint based on its name/type.
   * Currently all constraints are disabled for free joint movement.
   */
  private getJointConstraint(jointName: string): JointConstraint {
    // No constraints - all joints can move freely
    return { type: 'none' };
  }

  /**
   * Update all world transforms using forward kinematics.
   * Traverses the joint hierarchy from root to leaves.
   */
  updateWorldTransforms(): void {
    console.log('[Skeleton] updateWorldTransforms called');

    // Traverse in breadth-first order starting from root
    const queue: number[] = [];

    // Find root joints (parent === -1)
    for (let i = 0; i < this.numJoints; i++) {
      if (this.joints[i].parent === -1) {
        queue.push(i);
      }
    }

    while (queue.length > 0) {
      const jointId = queue.shift()!;
      const joint = this.joints[jointId];

      if (joint.parent === -1) {
        // Root joint: world transform = local transform
        joint.worldPosition = [...joint.localPosition];
        joint.worldRotation = [...joint.localRotation];

        // Build transform matrix from position and rotation
        quatToMat4(joint.localRotation, joint.localPosition, joint.worldTransform);
      } else {
        // Child joint: world transform = parent_world * local
        const parent = this.joints[joint.parent];

        // World position = parent_world * local_position
        joint.worldPosition = transformPoint(parent.worldTransform, joint.localPosition);

        // World rotation = parent_rotation * local_rotation
        joint.worldRotation = quatMultiply(parent.worldRotation, joint.localRotation);

        // Build world transform matrix
        quatToMat4(joint.worldRotation, joint.worldPosition, joint.worldTransform);
      }

      // Add children to queue
      for (const childId of joint.children) {
        queue.push(childId);
      }
    }

    // Log key joints after update
    const joint17 = this.joints[17];
    const joint19 = this.joints[19];
    const joint21 = this.joints[21];
    if (joint17) {
      console.log('[Skeleton] Joint 17 (right_shoulder) after FK - worldPos:', joint17.worldPosition, 'localRot:', joint17.localRotation);
      console.log('[Skeleton] Joint 17 worldTransform:', Array.from(joint17.worldTransform));
    }
    if (joint19) {
      console.log('[Skeleton] Joint 19 (right_elbow) after FK - worldPos:', joint19.worldPosition, 'localRot:', joint19.localRotation);
      console.log('[Skeleton] Joint 19 worldTransform:', Array.from(joint19.worldTransform));
    }
    if (joint21) {
      console.log('[Skeleton] Joint 21 (right_wrist) after FK - worldPos:', joint21.worldPosition, 'localRot:', joint21.localRotation);
      console.log('[Skeleton] Joint 21 worldTransform:', Array.from(joint21.worldTransform));
    }
  }

  /**
   * Get joint by ID.
   */
  getJoint(jointId: number): Joint | null {
    if (jointId < 0 || jointId >= this.numJoints) return null;
    return this.joints[jointId];
  }

  /**
   * Get joint by name.
   */
  getJointByName(name: string): Joint | null {
    return this.joints.find((j) => j.name === name) || null;
  }

  /**
   * Get world position of a joint.
   */
  getJointWorldPosition(jointId: number): Vec3 | null {
    const joint = this.getJoint(jointId);
    return joint ? joint.worldPosition : null;
  }

  /**
   * Set local rotation of a joint (for IK or animation).
   */
  setJointRotation(jointId: number, rotation: Quat): void {
    const joint = this.getJoint(jointId);
    if (joint) {
      console.log(`[Skeleton] setJointRotation - joint ${jointId} (${joint.name}): old =`, joint.localRotation, 'new =', rotation);

      // No constraints - set rotation directly
      joint.localRotation = quatNormalize(rotation);

      console.log(`[Skeleton] setJointRotation - joint ${jointId} after:`, joint.localRotation);
    }
  }

  /**
   * Apply joint constraints to a rotation quaternion.
   */
  private applyJointConstraint(joint: Joint, rotation: Quat): Quat {
    if (joint.constraint.type === 'none') {
      return rotation;
    }

    if (joint.constraint.type === 'hinge') {
      // Hinge joint: limit rotation around a SPECIFIC axis
      const minAngle = joint.constraint.minAngle || 0;
      const maxAngle = joint.constraint.maxAngle || Math.PI;
      const axis = joint.constraint.hingeAxis || 'x';

      // Convert quaternion to Euler angles (approximate)
      const euler = quatToEuler(rotation);

      // Get the angle around the hinge axis
      const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      let hingeAngle = euler[axisIndex];

      // Clamp the hinge angle
      const clampedAngle = Math.max(minAngle, Math.min(maxAngle, hingeAngle));

      // If clamped, reconstruct quaternion with only rotation around hinge axis
      if (Math.abs(clampedAngle - hingeAngle) > 0.001) {
        console.log(`[Constraint] ${joint.name}: clamping ${axis}-axis from ${(hingeAngle * 180 / Math.PI).toFixed(1)}° to ${(clampedAngle * 180 / Math.PI).toFixed(1)}°`);

        // Create quaternion with only the hinge rotation
        const axisVec: Vec3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
        return quatFromAxisAngle(axisVec, clampedAngle);
      }

      return rotation;
    }

    if (joint.constraint.type === 'ball') {
      // Ball joint: limit swing angle from rest pose
      const maxSwing = joint.constraint.maxSwing || Math.PI / 2;

      // Calculate swing angle
      const angle = 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(rotation[3]))));

      if (angle > maxSwing) {
        console.log(`[Constraint] ${joint.name}: clamping swing from ${(angle * 180 / Math.PI).toFixed(1)}° to ${(maxSwing * 180 / Math.PI).toFixed(1)}°`);

        // Clamp by scaling the rotation
        const scale = maxSwing / angle;
        const halfAngle = angle * scale / 2;
        const sinHalf = Math.sin(halfAngle);
        const sinOrig = Math.sin(angle / 2);
        const s = sinOrig > 0.001 ? sinHalf / sinOrig : 1;

        return quatNormalize([
          rotation[0] * s,
          rotation[1] * s,
          rotation[2] * s,
          Math.cos(halfAngle)
        ]);
      }

      return rotation;
    }

    if (joint.constraint.type === 'multi-axis') {
      // Multi-axis: different limits per axis
      const limits = joint.constraint.axisLimits!;
      const [minX, maxX, minY, maxY, minZ, maxZ] = limits;

      // Convert to Euler angles
      const euler = quatToEuler(rotation);
      let [x, y, z] = euler;

      // Clamp each axis
      const clampedX = Math.max(minX, Math.min(maxX, x));
      const clampedY = Math.max(minY, Math.min(maxY, y));
      const clampedZ = Math.max(minZ, Math.min(maxZ, z));

      // Check if any clamping occurred
      if (Math.abs(x - clampedX) > 0.001 || Math.abs(y - clampedY) > 0.001 || Math.abs(z - clampedZ) > 0.001) {
        console.log(`[Constraint] ${joint.name}: clamping euler (${(x * 180 / Math.PI).toFixed(1)}°, ${(y * 180 / Math.PI).toFixed(1)}°, ${(z * 180 / Math.PI).toFixed(1)}°) to (${(clampedX * 180 / Math.PI).toFixed(1)}°, ${(clampedY * 180 / Math.PI).toFixed(1)}°, ${(clampedZ * 180 / Math.PI).toFixed(1)}°)`);

        // Reconstruct quaternion from clamped Euler angles
        return eulerToQuat([clampedX, clampedY, clampedZ]);
      }

      return rotation;
    }

    return rotation;
  }

  /**
   * Set local position of a joint (for IK or animation).
   */
  setJointPosition(jointId: number, position: Vec3): void {
    const joint = this.getJoint(jointId);
    if (joint) {
      joint.localPosition = [...position];
    }
  }

  /**
   * Reset all joints to rest pose.
   */
  resetPose(): void {
    for (const joint of this.joints) {
      joint.localPosition = [...joint.restPosition];
      joint.localRotation = [0, 0, 0, 1]; // Identity quaternion
    }
    this.updateWorldTransforms();
  }

  /**
   * Get bone length between two joints.
   */
  getBoneLength(fromJointId: number, toJointId: number): number {
    const from = this.getJoint(fromJointId);
    const to = this.getJoint(toJointId);
    if (!from || !to) return 0;

    return vec3Distance(from.worldPosition, to.worldPosition);
  }

  /**
   * Get all joints in a chain from root to end effector.
   */
  getChain(endEffectorId: number, rootId?: number): number[] {
    const chain: number[] = [];
    let current = endEffectorId;

    // Walk up the hierarchy until we hit root or specified root
    while (current >= 0) {
      chain.unshift(current); // Add to front

      if (rootId !== undefined && current === rootId) {
        break;
      }

      const joint = this.getJoint(current);
      if (!joint) break;

      current = joint.parent;
    }

    return chain;
  }
}

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Create identity 4x4 matrix.
 */
function mat4Identity(out: Mat4): Mat4 {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/**
 * Invert a 4x4 matrix (row-major order).
 */
function mat4Invert(out: Mat4, m: Mat4): Mat4 {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) {
    // Matrix is singular, return identity
    console.warn('[mat4Invert] Singular matrix, returning identity');
    return mat4Identity(out);
  }

  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/**
 * Build 4x4 transform matrix from quaternion rotation and translation.
 * Matrix is COLUMN-MAJOR order for WebGPU/WGSL compatibility.
 */
function quatToMat4(q: Quat, t: Vec3, out: Mat4): Mat4 {
  const [x, y, z, w] = q;

  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;

  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  // Build rotation matrix in COLUMN-MAJOR layout for GPU
  // Column 0 (indices 0-3)
  out[0] = 1 - (yy + zz);  // R00
  out[1] = xy + wz;        // R10
  out[2] = xz - wy;        // R20
  out[3] = 0;              // 0

  // Column 1 (indices 4-7)
  out[4] = xy - wz;        // R01
  out[5] = 1 - (xx + zz);  // R11
  out[6] = yz + wx;        // R21
  out[7] = 0;              // 0

  // Column 2 (indices 8-11)
  out[8] = xz + wy;        // R02
  out[9] = yz - wx;        // R12
  out[10] = 1 - (xx + yy); // R22
  out[11] = 0;             // 0

  // Column 3 (indices 12-15) - Translation
  out[12] = t[0];  // Tx
  out[13] = t[1];  // Ty
  out[14] = t[2];  // Tz
  out[15] = 1;     // 1

  // Debug: Check if we're computing non-identity matrices
  const isIdentity = out[0] === 1 && out[5] === 1 && out[10] === 1 &&
                     out[1] === 0 && out[2] === 0 && out[3] === 0 &&
                     out[4] === 0 && out[6] === 0 && out[7] === 0 &&
                     out[8] === 0 && out[9] === 0 && out[11] === 0;

  if (!isIdentity) {
    console.log('[quatToMat4] Non-identity matrix computed - q:', q, 't:', t, 'result:', Array.from(out).slice(0, 12));
  }

  return out;
}

/**
 * Transform a 3D point by a 4x4 COLUMN-MAJOR matrix (apply translation and rotation).
 */
function transformPoint(mat: Mat4, point: Vec3): Vec3 {
  const [x, y, z] = point;

  // Column-major matrix multiplication
  const rx = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
  const ry = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
  const rz = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

  return [rx, ry, rz];
}

/**
 * Multiply two quaternions: q1 * q2.
 */
export function quatMultiply(q1: Quat, q2: Quat): Quat {
  const [x1, y1, z1, w1] = q1;
  const [x2, y2, z2, w2] = q2;

  return [
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
  ];
}

/**
 * Quaternion conjugate (inverse for unit quaternions).
 */
export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Normalize a quaternion to unit length.
 */
export function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len < 1e-10) return [0, 0, 0, 1]; // Return identity for zero quaternion
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/**
 * Calculate distance between two 3D points.
 */
export function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalize a vector.
 */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 0.0001) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Subtract two vectors: a - b.
 */
export function vec3Subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Add two vectors: a + b.
 */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Scale a vector: v * s.
 */
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Dot product of two vectors.
 */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Create quaternion from two unit vectors (rotation from v1 to v2).
 */
export function quatFromTwoVectors(v1: Vec3, v2: Vec3): Quat {
  const dot = vec3Dot(v1, v2);

  // Vectors are parallel
  if (dot > 0.999999) {
    return [0, 0, 0, 1]; // Identity
  }

  // Vectors are opposite
  if (dot < -0.999999) {
    // Find perpendicular axis
    let axis: Vec3 = [1, 0, 0];
    const test = vec3Cross(v1, axis);
    if (vec3Dot(test, test) < 0.0001) {
      axis = [0, 1, 0];
    }
    axis = vec3Normalize(vec3Cross(v1, axis));
    // 180 degree rotation
    return [axis[0], axis[1], axis[2], 0];
  }

  // General case
  const cross = vec3Cross(v1, v2);
  const s = Math.sqrt((1 + dot) * 2);
  const invS = 1 / s;

  return [
    cross[0] * invS,
    cross[1] * invS,
    cross[2] * invS,
    s * 0.5,
  ];
}

/**
 * Cross product of two vectors.
 */
function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Create quaternion from axis and angle.
 * @param axis - Unit vector representing rotation axis
 * @param angle - Rotation angle in radians
 */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return [
    axis[0] * s,
    axis[1] * s,
    axis[2] * s,
    Math.cos(halfAngle),
  ];
}

/**
 * Convert quaternion to Euler angles (XYZ order, intrinsic rotations).
 * Returns [x, y, z] in radians.
 * Note: Euler angles have gimbal lock issues, but useful for constraints.
 */
export function quatToEuler(q: Quat): Vec3 {
  const [x, y, z, w] = q;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2; // Use 90 degrees if out of range
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return [roll, pitch, yaw];
}

/**
 * Convert Euler angles to quaternion (XYZ order, intrinsic rotations).
 * @param euler - [x, y, z] angles in radians
 */
export function eulerToQuat(euler: Vec3): Quat {
  const [x, y, z] = euler;

  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);

  return quatNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}
