/**
 * Advanced FABRIK IK Solver Tests
 * Tests edge cases, multiple chains, and complex scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Skeleton } from '../src/renderer/ik/skeleton';
import { FABRIKSolver } from '../src/renderer/ik/fabrikSolver';
import { createTestPoseData } from './testUtils';

type Vec3 = [number, number, number];

function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe('FABRIK Advanced Tests', () => {
  describe('Multiple Chains', () => {
    it('handles two independent chains', () => {
      // Create branching skeleton:
      //     0 (root)
      //    / \
      //   1   3
      //   |   |
      //   2   4
      const jointPositions = new Float32Array([
        0, 0, 0,   // 0: root
        1, 0, 0,   // 1: left branch
        2, 0, 0,   // 2: left end
        -1, 0, 0,  // 3: right branch
        -2, 0, 0   // 4: right end
      ]);

      const jointHierarchy = new Int32Array([-1, 0, 1, 0, 3]);
      const poseData = createTestPoseData(5, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      // Add two chains
      solver.addChain(2, 0); // Left chain: 0->1->2
      solver.addChain(4, 0); // Right chain: 0->3->4

      expect(solver['chains'].size).toBe(2);
      expect(solver['chains'].has(2)).toBe(true);
      expect(solver['chains'].has(4)).toBe(true);
    });

    it('solves multiple chains independently', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,   // 0: root
        1, 0, 0,   // 1: left branch
        2, 0, 0,   // 2: left end
        -1, 0, 0,  // 3: right branch
        -2, 0, 0   // 4: right end
      ]);

      const jointHierarchy = new Int32Array([-1, 0, 1, 0, 3]);
      const poseData = createTestPoseData(5, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(2, 0);
      solver.addChain(4, 0);

      // Solve left chain
      const target1: Vec3 = [1, 1, 0];
      solver.solve(2, target1);

      const endPos1 = skeleton.getJointWorldPosition(2);
      const dist1 = vec3Distance(endPos1 as Vec3, target1);

      expect(dist1).toBeLessThan(2.0);

      // Solve right chain
      const target2: Vec3 = [-1, -1, 0];
      solver.solve(4, target2);

      const endPos2 = skeleton.getJointWorldPosition(4);
      const dist2 = vec3Distance(endPos2 as Vec3, target2);

      expect(dist2).toBeLessThan(2.0);
    });
  });

  describe('Long Chains', () => {
    it('handles very long chain (10 joints)', () => {
      const numJoints = 10;
      const jointPositions = new Float32Array(numJoints * 3);
      const jointHierarchy = new Int32Array(numJoints);

      // Create long chain
      for (let i = 0; i < numJoints; i++) {
        jointPositions[i * 3] = i;
        jointPositions[i * 3 + 1] = 0;
        jointPositions[i * 3 + 2] = 0;
        jointHierarchy[i] = i - 1;
      }

      const poseData = createTestPoseData(numJoints, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(9, 0);

      const chain = solver['chains'].get(9)!;
      expect(chain.lengths.length).toBe(9); // 9 segments for 10 joints

      // Total length should be 9 units
      const totalLength = chain.lengths.reduce((sum, len) => sum + len, 0);
      expect(totalLength).toBeCloseTo(9.0, 5);
    });

    it('solves long chain successfully', () => {
      const numJoints = 8;
      const jointPositions = new Float32Array(numJoints * 3);
      const jointHierarchy = new Int32Array(numJoints);

      for (let i = 0; i < numJoints; i++) {
        jointPositions[i * 3] = i;
        jointPositions[i * 3 + 1] = 0;
        jointPositions[i * 3 + 2] = 0;
        jointHierarchy[i] = i - 1;
      }

      const poseData = createTestPoseData(numJoints, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(7, 0);

      const target: Vec3 = [5, 2, 0];
      solver.solve(7, target);

      const endPos = skeleton.getJointWorldPosition(7);
      const distance = vec3Distance(endPos as Vec3, target);

      // Should reach or get close to target
      expect(distance).toBeLessThan(3.0);
    });
  });

  describe('Edge Cases', () => {
    it('handles 2-joint chain (minimal chain)', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(1, 0);

      const chain = solver['chains'].get(1)!;
      expect(chain.jointIds).toEqual([0, 1]);
      expect(chain.lengths.length).toBe(1);
    });

    it('handles target at current position', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(2, 0);

      skeleton.updateWorldTransforms();
      const currentPos = skeleton.getJointWorldPosition(2)!;

      // Target at current position
      solver.solve(2, currentPos as Vec3);

      const newPos = skeleton.getJointWorldPosition(2);
      const distance = vec3Distance(newPos as Vec3, currentPos as Vec3);

      // Should stay at current position
      expect(distance).toBeLessThan(0.5);
    });

    it('returns false when solving non-existent chain', () => {
      const jointPositions = new Float32Array([0, 0, 0, 1, 0, 0]);
      const jointHierarchy = new Int32Array([-1, 0]);
      const poseData = createTestPoseData(2, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      // Don't add any chain
      const result = solver.solve(1, [1, 1, 1]);

      expect(result).toBe(false);
    });

    it('handles very short chain segments', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        0.01, 0, 0,
        0.02, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(2, 0);

      const chain = solver['chains'].get(2)!;
      expect(chain.lengths[0]).toBeCloseTo(0.01, 5);
      expect(chain.lengths[1]).toBeCloseTo(0.01, 5);
    });
  });

  describe('Target Management', () => {
    let skeleton: Skeleton;
    let solver: FABRIKSolver;

    beforeEach(() => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      skeleton = new Skeleton(poseData);
      solver = new FABRIKSolver(skeleton);
      solver.addChain(2, 0);
    });

    it('gets target for existing chain', () => {
      solver.setTarget(2, [5, 5, 5]);
      const target = solver.getTarget(2);

      expect(target).not.toBeNull();
      expect(target).toEqual([5, 5, 5]);
    });

    it('returns null for non-existent chain', () => {
      const target = solver.getTarget(999);
      expect(target).toBeNull();
    });

    it('sets target for existing chain', () => {
      solver.setTarget(2, [1, 2, 3]);
      const target = solver.getTarget(2);

      expect(target).toEqual([1, 2, 3]);
    });

    it('does nothing when setting target for non-existent chain', () => {
      // Should not throw
      expect(() => {
        solver.setTarget(999, [1, 2, 3]);
      }).not.toThrow();
    });
  });

  describe('Chain Retrieval', () => {
    it('warns about too short chains', () => {
      // Create single joint
      const jointPositions = new Float32Array([0, 0, 0]);
      const jointHierarchy = new Int32Array([-1]);
      const poseData = createTestPoseData(1, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      // Try to add chain with same root and end effector
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      solver.addChain(0, 0);

      // Should warn about short chain
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('too short'));

      consoleWarnSpy.mockRestore();
    });

    it('handles chain that crosses back to root', () => {
      // Normal chain
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
        3, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1, 2]);
      const poseData = createTestPoseData(4, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(3, 0);

      const chain = solver['chains'].get(3)!;
      expect(chain.jointIds[0]).toBe(0); // Should start at root
      expect(chain.jointIds[chain.jointIds.length - 1]).toBe(3); // Should end at effector
    });
  });

  describe('Performance Characteristics', () => {
    it('maintains segment lengths after multiple solves', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
        3, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1, 2]);
      const poseData = createTestPoseData(4, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(3, 0);

      // Solve multiple times with different targets
      const targets: Vec3[] = [
        [1, 1, 0],
        [0, 2, 0],
        [2, 0, 1],
        [-1, 1, 0],
        [1, -1, 0]
      ];

      for (const target of targets) {
        solver.solve(3, target);

        // Check segment lengths are preserved
        const pos0 = skeleton.getJointWorldPosition(0) as Vec3;
        const pos1 = skeleton.getJointWorldPosition(1) as Vec3;
        const pos2 = skeleton.getJointWorldPosition(2) as Vec3;
        const pos3 = skeleton.getJointWorldPosition(3) as Vec3;

        const seg1 = vec3Distance(pos0, pos1);
        const seg2 = vec3Distance(pos1, pos2);
        const seg3 = vec3Distance(pos2, pos3);

        // Allow some tolerance for cumulative errors
        expect(seg1).toBeCloseTo(1.0, 1);
        expect(seg2).toBeCloseTo(1.0, 1);
        expect(seg3).toBeCloseTo(1.0, 1);
      }
    });

    it('handles rapid target changes', () => {
      const jointPositions = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0
      ]);
      const jointHierarchy = new Int32Array([-1, 0, 1]);
      const poseData = createTestPoseData(3, 100, jointPositions, jointHierarchy);
      const skeleton = new Skeleton(poseData);
      const solver = new FABRIKSolver(skeleton);

      solver.addChain(2, 0);

      // Rapidly change targets
      for (let i = 0; i < 10; i++) {
        const target: Vec3 = [
          Math.cos(i) * 2,
          Math.sin(i) * 2,
          0
        ];

        solver.solve(2, target);
      }

      // Should not crash or produce NaN
      const endPos = skeleton.getJointWorldPosition(2)!;
      expect(isNaN(endPos[0])).toBe(false);
      expect(isNaN(endPos[1])).toBe(false);
      expect(isNaN(endPos[2])).toBe(false);
    });
  });
});
