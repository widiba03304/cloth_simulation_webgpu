import { createTestPoseData } from "./testUtils";
/**
 * Skeleton Tests
 * Tests joint hierarchy, forward kinematics, and transform propagation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Skeleton,
  quatMultiply, quatConjugate, quatNormalize,
  vec3Distance, vec3Normalize, vec3Subtract, vec3Add, vec3Scale, vec3Dot,
  quatFromTwoVectors, quatFromAxisAngle, quatToEuler, eulerToQuat,
} from '../src/renderer/ik/skeleton';
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

  describe('Other Skeleton methods', () => {
    it('getJointByName returns joint when found', () => {
      const joint = skeleton.getJointByName('joint_0');
      expect(joint).not.toBeNull();
      expect(joint?.id).toBe(0);
    });

    it('getJointByName returns null when not found', () => {
      expect(skeleton.getJointByName('nonexistent')).toBeNull();
    });

    it('getJointWorldPosition returns null for invalid joint', () => {
      expect(skeleton.getJointWorldPosition(999)).toBeNull();
    });

    it('setJointPosition updates local position', () => {
      skeleton.setJointPosition(1, [5, 5, 5]);
      expect(skeleton.joints[1].localPosition).toEqual([5, 5, 5]);
    });

    it('resetPose restores joints to rest positions', () => {
      skeleton.setJointRotation(1, [0.5, 0.5, 0.5, 0.5]);
      skeleton.resetPose();
      expect(skeleton.joints[1].localRotation).toEqual([0, 0, 0, 1]);
    });

    it('getBoneLength returns distance between two joints', () => {
      skeleton.updateWorldTransforms();
      const len = skeleton.getBoneLength(0, 1);
      expect(len).toBeGreaterThan(0);
    });

    it('getBoneLength returns 0 for invalid joint IDs', () => {
      expect(skeleton.getBoneLength(999, 0)).toBe(0);
      expect(skeleton.getBoneLength(0, 999)).toBe(0);
    });
  });
});

describe('Skeleton utility functions', () => {
  it('quatMultiply: identity * identity = identity', () => {
    const id: [number,number,number,number] = [0,0,0,1];
    const r = quatMultiply(id, id);
    expect(r[3]).toBeCloseTo(1);
    expect(r[0]).toBeCloseTo(0);
  });

  it('quatConjugate: negates xyz, keeps w', () => {
    const r = quatConjugate([0.1, 0.2, 0.3, 0.9]);
    expect(r[0]).toBeCloseTo(-0.1);
    expect(r[1]).toBeCloseTo(-0.2);
    expect(r[2]).toBeCloseTo(-0.3);
    expect(r[3]).toBeCloseTo(0.9);
  });

  it('quatNormalize: normalizes to unit length', () => {
    const r = quatNormalize([1, 1, 1, 1]);
    const len = Math.sqrt(r[0]**2 + r[1]**2 + r[2]**2 + r[3]**2);
    expect(len).toBeCloseTo(1.0);
  });

  it('quatNormalize: zero quaternion returns identity', () => {
    const r = quatNormalize([0, 0, 0, 0]);
    expect(r).toEqual([0, 0, 0, 1]);
  });

  it('vec3Distance: correct distance', () => {
    expect(vec3Distance([0,0,0], [3,4,0])).toBeCloseTo(5);
  });

  it('vec3Normalize: normalizes non-zero vector', () => {
    const r = vec3Normalize([3, 4, 0]);
    expect(Math.sqrt(r[0]**2+r[1]**2+r[2]**2)).toBeCloseTo(1.0);
  });

  it('vec3Normalize: zero vector returns [0,0,0]', () => {
    expect(vec3Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('vec3Subtract: correct result', () => {
    expect(vec3Subtract([3,2,1],[1,1,1])).toEqual([2,1,0]);
  });

  it('vec3Add: correct result', () => {
    expect(vec3Add([1,2,3],[4,5,6])).toEqual([5,7,9]);
  });

  it('vec3Scale: correct result', () => {
    expect(vec3Scale([1,2,3], 2)).toEqual([2,4,6]);
  });

  it('vec3Dot: correct dot product', () => {
    expect(vec3Dot([1,0,0],[0,1,0])).toBeCloseTo(0);
    expect(vec3Dot([1,0,0],[1,0,0])).toBeCloseTo(1);
  });

  it('quatFromTwoVectors: identity for parallel vectors', () => {
    const r = quatFromTwoVectors([1,0,0],[1,0,0]);
    expect(r[3]).toBeCloseTo(1); // identity quaternion
  });

  it('quatFromTwoVectors: 180° rotation for opposite vectors', () => {
    const r = quatFromTwoVectors([1,0,0],[-1,0,0]);
    // w should be 0 for 180° rotation
    expect(r[3]).toBeCloseTo(0);
  });

  it('quatFromTwoVectors: general case', () => {
    const r = quatFromTwoVectors([1,0,0],[0,1,0]);
    const len = Math.sqrt(r[0]**2+r[1]**2+r[2]**2+r[3]**2);
    expect(len).toBeCloseTo(1.0);
  });

  it('quatFromAxisAngle: rotation around Y by PI/2', () => {
    const r = quatFromAxisAngle([0,1,0], Math.PI/2);
    expect(r[1]).toBeCloseTo(Math.sin(Math.PI/4));
    expect(r[3]).toBeCloseTo(Math.cos(Math.PI/4));
  });

  it('quatToEuler: identity quaternion gives zero angles', () => {
    const r = quatToEuler([0,0,0,1]);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(0);
    expect(r[2]).toBeCloseTo(0);
  });

  it('quatToEuler: |sinp| >= 1 covers gimbal lock branch', () => {
    // Use q=[0,1,0,1] (non-unit OK for math): sinp = 2*(w*y - z*x) = 2*(1*1-0) = 2 >= 1
    const r = quatToEuler([0, 1, 0, 1]);
    expect(Math.abs(r[1])).toBeCloseTo(Math.PI/2);
  });

  it('eulerToQuat: zero angles gives identity quaternion', () => {
    const r = eulerToQuat([0, 0, 0]);
    expect(r[3]).toBeCloseTo(1);
    expect(r[0]).toBeCloseTo(0);
  });

  it('eulerToQuat: round-trips through quatToEuler', () => {
    const euler: [number,number,number] = [0.3, 0.2, 0.1];
    const q = eulerToQuat(euler);
    const back = quatToEuler(q);
    expect(back[0]).toBeCloseTo(euler[0], 4);
    expect(back[1]).toBeCloseTo(euler[1], 4);
    expect(back[2]).toBeCloseTo(euler[2], 4);
  });
});

describe('Skeleton applyJointConstraint (private method)', () => {
  function make5JointSkeleton(): Skeleton {
    const numJoints = 5;
    const jointPositions = new Float32Array([0,0,0, 1,0,0, 2,0,0, 3,0,0, 4,0,0]);
    const jointHierarchy = new Int32Array([-1, 0, 1, 2, 3]);
    const poseData = createTestPoseData(numJoints, 10, jointPositions, jointHierarchy);
    const sk = new Skeleton(poseData);
    sk.updateWorldTransforms();
    return sk;
  }

  it('hinge: returns rotation unchanged when within limits', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'hinge', hingeAxis: 'x', minAngle: 0, maxAngle: Math.PI };
    const rot: [number,number,number,number] = [Math.sin(Math.PI/8), 0, 0, Math.cos(Math.PI/8)];
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result[3]).toBeCloseTo(rot[3], 4);
  });

  it('hinge x-axis: clamps rotation exceeding maxAngle', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'hinge', hingeAxis: 'x', minAngle: 0, maxAngle: Math.PI / 4 };
    const rot: [number,number,number,number] = [1, 0, 0, 0]; // 180° around X → exceeds PI/4
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });

  it('hinge y-axis: clamps rotation exceeding maxAngle', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'hinge', hingeAxis: 'y', minAngle: 0, maxAngle: Math.PI / 4 };
    const rot: [number,number,number,number] = [0, 1, 0, 0]; // 180° around Y → exceeds PI/4
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });

  it('hinge z-axis: clamps rotation exceeding maxAngle', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'hinge', hingeAxis: 'z', minAngle: 0, maxAngle: Math.PI / 4 };
    const rot: [number,number,number,number] = [0, 0, 1, 0]; // 180° around Z → exceeds PI/4
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });

  it('ball: returns rotation unchanged when within maxSwing', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'ball', maxSwing: Math.PI };
    const rot: [number,number,number,number] = [0, Math.sin(Math.PI/8), 0, Math.cos(Math.PI/8)];
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result[3]).toBeCloseTo(rot[3], 4);
  });

  it('ball: clamps rotation exceeding maxSwing', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'ball', maxSwing: Math.PI / 4 };
    const rot: [number,number,number,number] = [0, 1, 0, 0]; // 180° → angle=PI > PI/4
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });

  it('multi-axis: returns rotation unchanged when within all limits', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'multi-axis', axisLimits: [-Math.PI, Math.PI, -Math.PI, Math.PI, -Math.PI, Math.PI] };
    const rot: [number,number,number,number] = [0.1, 0.1, 0.1, 0.987];
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });

  it('multi-axis: clamps when euler angles exceed limits', () => {
    const sk = make5JointSkeleton();
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'multi-axis', axisLimits: [0, Math.PI/4, 0, Math.PI/4, 0, Math.PI/4] };
    const rot: [number,number,number,number] = [1, 0, 0, 0]; // 180° → euler[0]=PI > PI/4
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toHaveLength(4);
  });
});

describe('Skeleton getChain without rootId', () => {
  it('walks to absolute root when rootId is undefined', () => {
    const numJoints = 5;
    const jointPositions = new Float32Array([0,0,0, 1,0,0, 2,0,0, 3,0,0, 4,0,0]);
    const jointHierarchy = new Int32Array([-1, 0, 1, 2, 3]);
    const poseData = createTestPoseData(numJoints, 10, jointPositions, jointHierarchy);
    const sk = new Skeleton(poseData);
    const chain = sk.getChain(4); // no rootId → walk all the way to root
    expect(chain).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('Skeleton updateWorldTransforms with 22-joint skeleton', () => {
  it('covers joints 17/19/21 console-log branches', () => {
    const numJoints = 22;
    const jointPositions = new Float32Array(numJoints * 3); // all at origin
    const parentArr = [-1, ...Array.from({ length: 21 }, (_, i) => i)];
    const jointHierarchy = new Int32Array(parentArr);
    const poseData = createTestPoseData(numJoints, 10, jointPositions, jointHierarchy);
    const sk = new Skeleton(poseData);
    expect(() => sk.updateWorldTransforms()).not.toThrow();
  });
});

describe('Skeleton constructor edge cases', () => {
  it('unsigned -1 parent (line 96): parent > numJoints is treated as root', () => {
    const poseData = {
      num_joints: 5,
      num_vertices: 10,
      v_template: new Float32Array(30),
      j_regressor: new Float32Array(50),
      joint_positions: new Float32Array(15),
      kintree_table: [[100, 0, 1, 2, 3], [0, 1, 2, 3, 4]], // 100 > numJoints=5 → treated as -1
      weights: new Float32Array(50),
      joint_names: ['j0', 'j1', 'j2', 'j3', 'j4'],
    };
    expect(() => new Skeleton(poseData as any)).not.toThrow();
  });
});

describe('Skeleton applyJointConstraint unknown type fallthrough', () => {
  it('unknown constraint type falls through to line 380 return rotation', () => {
    const numJoints = 5;
    const jointPositions = new Float32Array([0,0,0, 1,0,0, 2,0,0, 3,0,0, 4,0,0]);
    const jointHierarchy = new Int32Array([-1, 0, 1, 2, 3]);
    const poseData = createTestPoseData(numJoints, 10, jointPositions, jointHierarchy);
    const sk = new Skeleton(poseData);
    const joint = sk.joints[1]!;
    joint.constraint = { type: 'unknown' as any };
    const rot: [number,number,number,number] = [0, 0, 0, 1];
    const result = (sk as any).applyJointConstraint(joint, rot);
    expect(result).toEqual(rot);
  });
});
