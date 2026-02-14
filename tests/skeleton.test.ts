import { createTestPoseData } from "./testUtils";
/**
 * Skeleton Tests
 * Tests joint hierarchy, forward kinematics, and transform propagation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Skeleton } from '../src/renderer/ik/skeleton';
// import type { SMPLPoseData } from '../src/renderer/render/smplPoseData';

describe('Skeleton', () => {
  let skeleton: Skeleton;
  const numJoints = 5;
  const numVertices = 100;

  beforeEach(() => {
    // Create a simple 5-joint skeleton hierarchy:
    // 0 (root) -> 1 -> 2 -> 3 -> 4 (chain)
    const jointPositions = new Float32Array([
      0, 0, 0,    // Joint 0 at origin
      1, 0, 0,    // Joint 1 at (1, 0, 0)
      2, 0, 0,    // Joint 2 at (2, 0, 0)
      3, 0, 0,    // Joint 3 at (3, 0, 0)
      4, 0, 0     // Joint 4 at (4, 0, 0)
    ]);

    const jointHierarchy = new Int32Array([
      -1,  // Joint 0 has no parent (root)
      0,   // Joint 1's parent is 0
      1,   // Joint 2's parent is 1
      2,   // Joint 3's parent is 2
      3    // Joint 4's parent is 3
    ]);

    const poseData = createTestPoseData(numJoints, numVertices, jointPositions, jointHierarchy);
    skeleton = new Skeleton(poseData);
  });

  describe('Initialization', () => {
    it('creates correct number of joints', () => {
      expect(skeleton.joints.length).toBe(numJoints);
    });

    it('sets up parent-child relationships correctly', () => {
      expect(skeleton.joints[0].parent).toBe(-1);  // Root
      expect(skeleton.joints[1].parent).toBe(0);
      expect(skeleton.joints[2].parent).toBe(1);
      expect(skeleton.joints[3].parent).toBe(2);
      expect(skeleton.joints[4].parent).toBe(3);
    });

    it('initializes joints at correct rest positions', () => {
      // restPosition is LOCAL position (offset from parent)
      expect(skeleton.joints[0].restPosition).toEqual([0, 0, 0]); // Root joint
      expect(skeleton.joints[1].restPosition).toEqual([1, 0, 0]); // Offset from joint 0
      expect(skeleton.joints[2].restPosition).toEqual([1, 0, 0]); // Offset from joint 1
    });

    it('initializes joints with identity rotation', () => {
      for (const joint of skeleton.joints) {
        expect(joint.localRotation).toEqual([0, 0, 0, 1]); // Identity quaternion
      }
    });
  });

  describe('World Position Calculation', () => {
    it('calculates world positions correctly with identity transforms', () => {
      skeleton.updateWorldTransforms();

      expect(skeleton.getJointWorldPosition(0)).toEqual([0, 0, 0]);
      expect(skeleton.getJointWorldPosition(1)).toEqual([1, 0, 0]);
      expect(skeleton.getJointWorldPosition(2)).toEqual([2, 0, 0]);
      expect(skeleton.getJointWorldPosition(3)).toEqual([3, 0, 0]);
      expect(skeleton.getJointWorldPosition(4)).toEqual([4, 0, 0]);
    });

    it('propagates rotation from parent to children', () => {
      // Rotate root joint 90 degrees around Y axis
      const angle = Math.PI / 2;
      const quat: [number, number, number, number] = [
        0, Math.sin(angle / 2), 0, Math.cos(angle / 2)
      ];
      skeleton.setJointRotation(0, quat);
      skeleton.updateWorldTransforms();

      // Joint 1 should rotate from (1,0,0) to approximately (0,0,-1)
      const pos1 = skeleton.getJointWorldPosition(1);
      expect(pos1[0]).toBeCloseTo(0, 4);
      expect(pos1[2]).toBeCloseTo(-1, 4);

      // Joint 2 should rotate from (2,0,0) to approximately (0,0,-2)
      const pos2 = skeleton.getJointWorldPosition(2);
      expect(pos2[0]).toBeCloseTo(0, 4);
      expect(pos2[2]).toBeCloseTo(-2, 4);
    });

    it('handles local rotations independently', () => {
      // Rotate joint 1 (not root) by 90 degrees around Y
      const angle = Math.PI / 2;
      const quat: [number, number, number, number] = [
        0, Math.sin(angle / 2), 0, Math.cos(angle / 2)
      ];
      skeleton.setJointRotation(1, quat);
      skeleton.updateWorldTransforms();

      // Joint 0 should stay at origin
      expect(skeleton.getJointWorldPosition(0)).toEqual([0, 0, 0]);

      // Joint 1 should stay at (1,0,0) - rotation doesn't change position
      const pos1 = skeleton.getJointWorldPosition(1);
      expect(pos1[0]).toBeCloseTo(1, 4);
      expect(pos1[1]).toBeCloseTo(0, 4);
      expect(pos1[2]).toBeCloseTo(0, 4);

      // Joint 2's local offset (1,0,0) from joint 1 should be rotated
      // After 90° Y rotation: (1,0,0) -> (0,0,-1)
      // World position: joint1_pos + rotated_offset = (1,0,0) + (0,0,-1) = (1,0,-1)
      const pos2 = skeleton.getJointWorldPosition(2);
      expect(pos2[0]).toBeCloseTo(1, 4);
      expect(pos2[2]).toBeCloseTo(-1, 4);
    });
  });

  describe('Rotation Operations', () => {
    it('accepts valid quaternion rotations', () => {
      const angle = Math.PI / 4;
      const quat: [number, number, number, number] = [
        0, Math.sin(angle / 2), 0, Math.cos(angle / 2)
      ];

      skeleton.setJointRotation(0, quat);
      expect(skeleton.joints[0].localRotation).toEqual(quat);
    });

    it('normalizes quaternions', () => {
      // Non-normalized quaternion
      const quat: [number, number, number, number] = [1, 1, 1, 1];
      skeleton.setJointRotation(0, quat);

      const normalized = skeleton.joints[0].localRotation;
      const length = Math.sqrt(
        normalized[0] * normalized[0] +
        normalized[1] * normalized[1] +
        normalized[2] * normalized[2] +
        normalized[3] * normalized[3]
      );

      expect(length).toBeCloseTo(1.0, 5);
    });
  });

  describe('Transform Matrix', () => {
    it('generates identity matrix for identity rotation', () => {
      skeleton.updateWorldTransforms();

      const joint = skeleton.getJoint(0);
      if (!joint) throw new Error('Joint not found');

      const transform = joint.worldTransform;

      // Check it's an identity matrix
      expect(transform[0]).toBeCloseTo(1, 5);   // M00
      expect(transform[5]).toBeCloseTo(1, 5);   // M11
      expect(transform[10]).toBeCloseTo(1, 5);  // M22
      expect(transform[15]).toBeCloseTo(1, 5);  // M33
    });

    it('generates correct rotation matrix', () => {
      // 90-degree rotation around Y axis
      const angle = Math.PI / 2;
      const quat: [number, number, number, number] = [
        0, Math.sin(angle / 2), 0, Math.cos(angle / 2)
      ];
      skeleton.setJointRotation(0, quat);
      skeleton.updateWorldTransforms();

      const joint = skeleton.getJoint(0);
      if (!joint) throw new Error('Joint not found');

      const m = joint.worldTransform;

      // For 90° Y rotation in column-major (right-handed):
      // X-axis (1,0,0) rotates to -Z (0,0,-1) → Column 0 = (0, 0, -1, 0)
      // Z-axis (0,0,1) rotates to +X (1,0,0)  → Column 2 = (1, 0, 0, 0)
      expect(m[0]).toBeCloseTo(0, 4);   // Column 0, row 0
      expect(m[2]).toBeCloseTo(-1, 4);  // Column 0, row 2  (X→-Z)
      expect(m[8]).toBeCloseTo(1, 4);   // Column 2, row 0  (Z→X)
      expect(m[10]).toBeCloseTo(0, 4);  // Column 2, row 2
    });
  });

  describe('Joint Retrieval', () => {
    it('returns joint by valid ID', () => {
      const joint = skeleton.getJoint(2);
      expect(joint).toBeDefined();
      expect(joint?.parent).toBe(1);
    });

    it('returns null for invalid joint ID', () => {
      expect(skeleton.getJoint(-1)).toBeNull();
      expect(skeleton.getJoint(999)).toBeNull();
    });
  });
});
