/**
 * Quaternion Operations Tests
 * Tests quaternion math used in IK system
 */

import { describe, it, expect } from 'vitest';

type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

// Quaternion operations from skeleton.ts
function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len < 1e-10) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return [
    axis[0] * s,
    axis[1] * s,
    axis[2] * s,
    Math.cos(halfAngle)
  ];
}

function quatRotateVector(q: Quat, v: Vec3): Vec3 {
  const qv: Quat = [v[0], v[1], v[2], 0];
  const qConj = quatConjugate(q);
  const rotated = quatMultiply(quatMultiply(q, qv), qConj);
  return [rotated[0], rotated[1], rotated[2]];
}

describe('Quaternion Operations', () => {
  describe('Identity and Normalization', () => {
    it('identity quaternion has correct properties', () => {
      const identity: Quat = [0, 0, 0, 1];
      const v: Vec3 = [1, 2, 3];
      const rotated = quatRotateVector(identity, v);

      expect(rotated[0]).toBeCloseTo(v[0], 5);
      expect(rotated[1]).toBeCloseTo(v[1], 5);
      expect(rotated[2]).toBeCloseTo(v[2], 5);
    });

    it('normalizes quaternions correctly', () => {
      const unnormalized: Quat = [1, 2, 3, 4];
      const normalized = quatNormalize(unnormalized);

      const length = Math.sqrt(
        normalized[0] ** 2 +
        normalized[1] ** 2 +
        normalized[2] ** 2 +
        normalized[3] ** 2
      );

      expect(length).toBeCloseTo(1.0, 10);
    });

    it('handles zero quaternion', () => {
      const zero: Quat = [0, 0, 0, 0];
      const normalized = quatNormalize(zero);

      expect(normalized).toEqual([0, 0, 0, 1]); // Returns identity
    });
  });

  describe('Conjugate', () => {
    it('computes conjugate correctly', () => {
      const q: Quat = [1, 2, 3, 4];
      const conj = quatConjugate(q);

      expect(conj).toEqual([-1, -2, -3, 4]);
    });

    it('conjugate of conjugate equals original', () => {
      const q: Quat = [0.5, 0.5, 0.5, 0.5];
      const conj1 = quatConjugate(q);
      const conj2 = quatConjugate(conj1);

      expect(conj2[0]).toBeCloseTo(q[0], 10);
      expect(conj2[1]).toBeCloseTo(q[1], 10);
      expect(conj2[2]).toBeCloseTo(q[2], 10);
      expect(conj2[3]).toBeCloseTo(q[3], 10);
    });

    it('q * conjugate(q) = identity (for unit quaternions)', () => {
      const q: Quat = [0, 0.707, 0, 0.707]; // 90° around Y
      const qNorm = quatNormalize(q); // Normalize first to avoid precision issues
      const qConj = quatConjugate(qNorm);
      const result = quatMultiply(qNorm, qConj);

      // Should be close to identity [0,0,0,1]
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(1, 4); // Relax tolerance slightly (4 decimal places)
    });
  });

  describe('Multiplication', () => {
    it('identity * q = q', () => {
      const identity: Quat = [0, 0, 0, 1];
      const q: Quat = [1, 2, 3, 4];
      const result = quatMultiply(identity, q);

      expect(result[0]).toBeCloseTo(q[0], 10);
      expect(result[1]).toBeCloseTo(q[1], 10);
      expect(result[2]).toBeCloseTo(q[2], 10);
      expect(result[3]).toBeCloseTo(q[3], 10);
    });

    it('combines rotations correctly', () => {
      // 90° around X, then 90° around Y
      const rotX90 = quatFromAxisAngle([1, 0, 0], Math.PI / 2);
      const rotY90 = quatFromAxisAngle([0, 1, 0], Math.PI / 2);

      // Combined rotation: Y * X (apply X first, then Y)
      const combined = quatMultiply(rotY90, rotX90);

      // Test with vector (0, 0, 1)
      // After X rotation: (0, -1, 0)
      // After Y rotation: (0, -1, 0) stays same
      const v: Vec3 = [0, 0, 1];
      const result = quatRotateVector(combined, v);

      expect(result[0]).toBeCloseTo(0, 4);
      expect(result[1]).toBeCloseTo(-1, 4);
      expect(result[2]).toBeCloseTo(0, 4);
    });
  });

  describe('Axis-Angle Conversion', () => {
    it('creates quaternion from X-axis rotation', () => {
      const q = quatFromAxisAngle([1, 0, 0], Math.PI / 2); // 90° around X

      // Quaternion for 90° X rotation: (sin(45°), 0, 0, cos(45°))
      expect(q[0]).toBeCloseTo(0.707, 3);
      expect(q[1]).toBeCloseTo(0, 3);
      expect(q[2]).toBeCloseTo(0, 3);
      expect(q[3]).toBeCloseTo(0.707, 3);
    });

    it('creates quaternion from Y-axis rotation', () => {
      const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2); // 90° around Y

      expect(q[0]).toBeCloseTo(0, 3);
      expect(q[1]).toBeCloseTo(0.707, 3);
      expect(q[2]).toBeCloseTo(0, 3);
      expect(q[3]).toBeCloseTo(0.707, 3);
    });

    it('creates quaternion from Z-axis rotation', () => {
      const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2); // 90° around Z

      expect(q[0]).toBeCloseTo(0, 3);
      expect(q[1]).toBeCloseTo(0, 3);
      expect(q[2]).toBeCloseTo(0.707, 3);
      expect(q[3]).toBeCloseTo(0.707, 3);
    });
  });

  describe('Vector Rotation', () => {
    it('rotates vector around X-axis', () => {
      const q = quatFromAxisAngle([1, 0, 0], Math.PI / 2); // 90° around X
      const v: Vec3 = [0, 1, 0]; // Y-axis vector

      const rotated = quatRotateVector(q, v);

      // (0,1,0) rotated 90° around X -> (0,0,1)
      expect(rotated[0]).toBeCloseTo(0, 4);
      expect(rotated[1]).toBeCloseTo(0, 4);
      expect(rotated[2]).toBeCloseTo(1, 4);
    });

    it('rotates vector around Y-axis', () => {
      const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2); // 90° around Y
      const v: Vec3 = [1, 0, 0]; // X-axis vector

      const rotated = quatRotateVector(q, v);

      // (1,0,0) rotated 90° around Y -> (0,0,-1)
      expect(rotated[0]).toBeCloseTo(0, 4);
      expect(rotated[1]).toBeCloseTo(0, 4);
      expect(rotated[2]).toBeCloseTo(-1, 4);
    });

    it('rotates vector around Z-axis', () => {
      const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2); // 90° around Z
      const v: Vec3 = [1, 0, 0]; // X-axis vector

      const rotated = quatRotateVector(q, v);

      // (1,0,0) rotated 90° around Z -> (0,1,0)
      expect(rotated[0]).toBeCloseTo(0, 4);
      expect(rotated[1]).toBeCloseTo(1, 4);
      expect(rotated[2]).toBeCloseTo(0, 4);
    });

    it('preserves vector length', () => {
      const q = quatNormalize([1, 2, 3, 4]);
      const v: Vec3 = [3, 4, 5];

      const rotated = quatRotateVector(q, v);

      const originalLen = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
      const rotatedLen = Math.sqrt(
        rotated[0] ** 2 + rotated[1] ** 2 + rotated[2] ** 2
      );

      expect(rotatedLen).toBeCloseTo(originalLen, 5);
    });
  });

  describe('Composition Properties', () => {
    it('satisfies associativity: (a*b)*c = a*(b*c)', () => {
      const a = quatFromAxisAngle([1, 0, 0], 0.5);
      const b = quatFromAxisAngle([0, 1, 0], 0.7);
      const c = quatFromAxisAngle([0, 0, 1], 0.3);

      const left = quatMultiply(quatMultiply(a, b), c);
      const right = quatMultiply(a, quatMultiply(b, c));

      expect(left[0]).toBeCloseTo(right[0], 5);
      expect(left[1]).toBeCloseTo(right[1], 5);
      expect(left[2]).toBeCloseTo(right[2], 5);
      expect(left[3]).toBeCloseTo(right[3], 5);
    });

    it('has identity element', () => {
      const q: Quat = [0.1, 0.2, 0.3, 0.9];
      const identity: Quat = [0, 0, 0, 1];

      const result1 = quatMultiply(q, identity);
      const result2 = quatMultiply(identity, q);

      for (let i = 0; i < 4; i++) {
        expect(result1[i]).toBeCloseTo(q[i], 10);
        expect(result2[i]).toBeCloseTo(q[i], 10);
      }
    });
  });
});
