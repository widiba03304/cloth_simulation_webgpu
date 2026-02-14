/**
 * Advanced Skeleton Tests
 * Tests edge cases, error handling, and complex scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Skeleton } from '../src/renderer/ik/skeleton';
import { createTestPoseData } from './testUtils';

describe('Skeleton Advanced Tests', () => {
  describe('Edge Cases', () => {
    it('handles single joint skeleton', () => {
      const jointPositions = new Float32Array([0, 0, 0]);
      const jointHierarchy = new Int32Array([-1]);
      const poseData = createTestPoseData(1, 10, jointPositions, jointHierarchy);

      const skeleton = new Skeleton(poseData);

      expect(skeleton.joints.length).toBe(1);
      expect(skeleton.joints[0].parent).toBe(-1);
      expect(skeleton.joints[0].children).toEqual([]);
    });

    it('handles deep hierarchy (10 levels)', () => {
      const numJoints = 10;
      const jointPositions = new Float32Array(numJoints * 3);
      const jointHierarchy = new Int32Array(numJoints);

      // Create chain: 0 -> 1 -> 2 -> ... -> 9
      for (let i = 0; i < numJoints; i++) {
        jointPositions[i * 3] = i;
        jointPositions[i * 3 + 1] = 0;
        jointPositions[i * 3 + 2] = 0;
        jointHierarchy[i] = i - 1; // Parent is previous joint
      }

      const poseData = createTestPoseData(numJoints, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      expect(skeleton.joints.length).toBe(10);
      expect(skeleton.joints[0].parent).toBe(-1);
      expect(skeleton.joints[9].parent).toBe(8);
    });

    it('handles branching hierarchy', () => {
      // Hierarchy:
      //       0 (root)
      //      / \
      //     1   2
      //    /     \
      //   3       4
      const jointPositions = new Float32Array([
        0, 0, 0,  // Joint 0: root
        1, 0, 0,  // Joint 1: left branch
        -1, 0, 0, // Joint 2: right branch
        2, 0, 0,  // Joint 3: left child
        -2, 0, 0  // Joint 4: right child
      ]);

      const jointHierarchy = new Int32Array([
        -1,  // Joint 0: root
        0,   // Joint 1: child of 0
        0,   // Joint 2: child of 0
        1,   // Joint 3: child of 1
        2    // Joint 4: child of 2
      ]);

      const poseData = createTestPoseData(5, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      expect(skeleton.joints[0].children).toEqual([1, 2]);
      expect(skeleton.joints[1].children).toEqual([3]);
      expect(skeleton.joints[2].children).toEqual([4]);
      expect(skeleton.joints[3].children).toEqual([]);
      expect(skeleton.joints[4].children).toEqual([]);
    });

    it('handles multiple root joints', () => {
      // Two separate trees
      const jointPositions = new Float32Array([
        0, 0, 0,  // Joint 0: root 1
        1, 0, 0,  // Joint 1: child of 0
        10, 0, 0, // Joint 2: root 2
        11, 0, 0  // Joint 3: child of 2
      ]);

      const jointHierarchy = new Int32Array([
        -1,  // Joint 0: root
        0,   // Joint 1: child of 0
        -1,  // Joint 2: root
        2    // Joint 3: child of 2
      ]);

      const poseData = createTestPoseData(4, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      expect(skeleton.joints[0].parent).toBe(-1);
      expect(skeleton.joints[2].parent).toBe(-1);
    });
  });

  describe('getJoint Edge Cases', () => {
    let skeleton: Skeleton;

    beforeEach(() => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      skeleton = new Skeleton(poseData);
    });

    it('returns null for negative joint ID', () => {
      expect(skeleton.getJoint(-1)).toBeNull();
      expect(skeleton.getJoint(-100)).toBeNull();
    });

    it('returns null for out of bounds joint ID', () => {
      expect(skeleton.getJoint(3)).toBeNull();
      expect(skeleton.getJoint(100)).toBeNull();
    });

    it('returns valid joint for boundary IDs', () => {
      expect(skeleton.getJoint(0)).not.toBeNull();
      expect(skeleton.getJoint(2)).not.toBeNull();
    });
  });

  describe('getJointByName', () => {
    let skeleton: Skeleton;

    beforeEach(() => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      skeleton = new Skeleton(poseData);
    });

    it('finds joint by name', () => {
      const joint = skeleton.getJointByName('joint_0');
      expect(joint).not.toBeNull();
      expect(joint?.id).toBe(0);
    });

    it('returns null for non-existent name', () => {
      const joint = skeleton.getJointByName('nonexistent');
      expect(joint).toBeNull();
    });

    it('is case sensitive', () => {
      const joint = skeleton.getJointByName('JOINT_0');
      expect(joint).toBeNull();
    });
  });

  describe('getChain', () => {
    let skeleton: Skeleton;

    beforeEach(() => {
      // Chain: 0 -> 1 -> 2 -> 3
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
        3, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1, 2]);
      const poseData = createTestPoseData(4, 100, jointPositions, jointHierarchy);
      skeleton = new Skeleton(poseData);
    });

    it('gets full chain from end effector to root', () => {
      const chain = skeleton.getChain(3);
      expect(chain).toEqual([0, 1, 2, 3]);
    });

    it('gets partial chain with specified root', () => {
      const chain = skeleton.getChain(3, 1);
      expect(chain).toEqual([1, 2, 3]);
    });

    it('gets single joint chain', () => {
      const chain = skeleton.getChain(0);
      expect(chain).toEqual([0]);
    });

    it('stops at specified root', () => {
      const chain = skeleton.getChain(2, 1);
      expect(chain).toEqual([1, 2]);
    });
  });

  describe('resetPose', () => {
    it('resets all joints to rest pose', () => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      // Modify joint rotation
      skeleton.setJointRotation(0, [0, 0.5, 0, 0.866]);
      expect(skeleton.joints[0].localRotation).not.toEqual([0, 0, 0, 1]);

      // Reset pose
      skeleton.resetPose();

      // Check rotation is back to identity
      expect(skeleton.joints[0].localRotation).toEqual([0, 0, 0, 1]);
      expect(skeleton.joints[1].localRotation).toEqual([0, 0, 0, 1]);
    });

    it('resets positions to rest position', () => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      const originalLocalPos = [...skeleton.joints[1].localPosition];

      // Modify joint position
      skeleton.setJointPosition(1, [2, 0, 0]);

      // Reset pose
      skeleton.resetPose();

      // Check position is back to rest
      expect(skeleton.joints[1].localPosition).toEqual(originalLocalPos);
    });
  });

  describe('getBoneLength', () => {
    let skeleton: Skeleton;

    beforeEach(() => {
      // 3-4-5 triangle
      const jointPositions = new Float32Array([
        0, 0, 0,
        3, 0, 0,
        3, 4, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      skeleton = new Skeleton(poseData);
    });

    it('calculates bone length correctly', () => {
      skeleton.updateWorldTransforms();
      const length = skeleton.getBoneLength(0, 1);
      expect(length).toBeCloseTo(3.0, 5);
    });

    it('calculates non-adjacent bone length', () => {
      skeleton.updateWorldTransforms();
      const length = skeleton.getBoneLength(0, 2);
      expect(length).toBeCloseTo(5.0, 5);
    });

    it('returns 0 for invalid joint IDs', () => {
      expect(skeleton.getBoneLength(-1, 0)).toBe(0);
      expect(skeleton.getBoneLength(0, 100)).toBe(0);
    });

    it('returns 0 for same joint', () => {
      const length = skeleton.getBoneLength(0, 0);
      expect(length).toBe(0);
    });
  });

  describe('Complex Transformations', () => {
    it('handles cascading rotations correctly', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      // Rotate joint 0 by 45° around Y
      const angle1 = Math.PI / 4;
      skeleton.setJointRotation(0, [0, Math.sin(angle1/2), 0, Math.cos(angle1/2)]);

      // Rotate joint 1 by 45° around Y
      const angle2 = Math.PI / 4;
      skeleton.setJointRotation(1, [0, Math.sin(angle2/2), 0, Math.cos(angle2/2)]);

      skeleton.updateWorldTransforms();

      // Joint 2 should have experienced 90° total rotation in world space
      const pos2 = skeleton.getJointWorldPosition(2);

      // Joint 1 at (0.707, 0, -0.707) after 45° rot
      // Joint 2 offset (1,0,0) rotated 90° total = (0,0,-1)
      // Joint 2 world pos = (0.707, 0, -0.707) + (0,0,-1) = (0.707, 0, -1.707)
      expect(pos2![0]).toBeCloseTo(0.707, 2); // X component from joint 1's position
      expect(pos2![2]).toBeCloseTo(-1.707, 2); // Z component accumulated
      expect(pos2![2]).toBeLessThan(0); // Should be negative Z
    });

    it('handles rotation + translation combinations', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      // Rotate root 90° around Z (XY plane rotation)
      const angle = Math.PI / 2;
      skeleton.setJointRotation(0, [0, 0, Math.sin(angle/2), Math.cos(angle/2)]);

      skeleton.updateWorldTransforms();

      const pos1 = skeleton.getJointWorldPosition(1);

      // (1,0,0) rotated 90° around Z -> (0,1,0)
      expect(pos1![0]).toBeCloseTo(0, 4);
      expect(pos1![1]).toBeCloseTo(1, 4);
      expect(pos1![2]).toBeCloseTo(0, 4);
    });
  });

  describe('getJointWorldPosition', () => {
    it('returns null for invalid joint ID', () => {
      const jointPositions = new Float32Array([0, 0, 0]);
      const jointHierarchy = new Int32Array([-1]);
      const poseData = createTestPoseData(1, 10, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      expect(skeleton.getJointWorldPosition(-1)).toBeNull();
      expect(skeleton.getJointWorldPosition(100)).toBeNull();
    });

    it('returns valid position for valid joint', () => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 2, 3]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 10, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      const pos = skeleton.getJointWorldPosition(1);
      expect(pos).not.toBeNull();
      expect(pos!.length).toBe(3);
    });
  });

  describe('setJointPosition', () => {
    it('updates local position', () => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 10, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      skeleton.setJointPosition(1, [5, 5, 5]);

      expect(skeleton.joints[1].localPosition).toEqual([5, 5, 5]);
    });

    it('handles invalid joint ID gracefully', () => {
      const jointPositions = new Float32Array([0, 0, 0]);
      const jointHierarchy = new Int32Array([-1]);
      const poseData = createTestPoseData(1, 10, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);

      // Should not throw
      expect(() => {
        skeleton.setJointPosition(-1, [1, 1, 1]);
        skeleton.setJointPosition(100, [1, 1, 1]);
      }).not.toThrow();
    });
  });
});
