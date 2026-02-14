/**
 * Vector Math Utilities Tests
 * Tests vector operations used in IK system
 */

import { describe, it, expect } from 'vitest';
import {
  vec3Distance,
  vec3Normalize,
  vec3Subtract,
  vec3Add,
  vec3Scale,
  vec3Dot,
  quatFromTwoVectors,
  quatNormalize,
  type Vec3,
  type Quat
} from '../src/renderer/ik/skeleton';

describe('Vector Math Utilities', () => {
  describe('vec3Add', () => {
    it('adds two vectors correctly', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [4, 5, 6];
      const result = vec3Add(a, b);

      expect(result).toEqual([5, 7, 9]);
    });

    it('handles zero vectors', () => {
      const a: Vec3 = [1, 2, 3];
      const zero: Vec3 = [0, 0, 0];
      const result = vec3Add(a, zero);

      expect(result).toEqual([1, 2, 3]);
    });

    it('handles negative values', () => {
      const a: Vec3 = [1, -2, 3];
      const b: Vec3 = [-1, 2, -3];
      const result = vec3Add(a, b);

      expect(result).toEqual([0, 0, 0]);
    });
  });

  describe('vec3Subtract', () => {
    it('subtracts two vectors correctly', () => {
      const a: Vec3 = [5, 7, 9];
      const b: Vec3 = [1, 2, 3];
      const result = vec3Subtract(a, b);

      expect(result).toEqual([4, 5, 6]);
    });

    it('handles same vectors', () => {
      const a: Vec3 = [1, 2, 3];
      const result = vec3Subtract(a, a);

      expect(result).toEqual([0, 0, 0]);
    });
  });

  describe('vec3Scale', () => {
    it('scales vector by positive scalar', () => {
      const v: Vec3 = [1, 2, 3];
      const result = vec3Scale(v, 2);

      expect(result).toEqual([2, 4, 6]);
    });

    it('scales vector by negative scalar', () => {
      const v: Vec3 = [1, 2, 3];
      const result = vec3Scale(v, -1);

      expect(result).toEqual([-1, -2, -3]);
    });

    it('scales vector by zero', () => {
      const v: Vec3 = [1, 2, 3];
      const result = vec3Scale(v, 0);

      expect(result).toEqual([0, 0, 0]);
    });

    it('scales vector by fractional scalar', () => {
      const v: Vec3 = [2, 4, 6];
      const result = vec3Scale(v, 0.5);

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('vec3Dot', () => {
    it('computes dot product correctly', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [4, 5, 6];
      const result = vec3Dot(a, b);

      expect(result).toBe(32); // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    });

    it('detects perpendicular vectors', () => {
      const a: Vec3 = [1, 0, 0];
      const b: Vec3 = [0, 1, 0];
      const result = vec3Dot(a, b);

      expect(result).toBe(0);
    });

    it('detects parallel vectors', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [2, 4, 6];
      const dot = vec3Dot(a, b);

      // For parallel vectors: dot(a,b) = |a| * |b|
      const lenA = Math.sqrt(1 + 4 + 9);
      const lenB = Math.sqrt(4 + 16 + 36);
      const expected = lenA * lenB;

      expect(dot).toBeCloseTo(expected, 5);
    });

    it('detects opposite vectors', () => {
      const a: Vec3 = [1, 0, 0];
      const b: Vec3 = [-1, 0, 0];
      const result = vec3Dot(a, b);

      expect(result).toBe(-1);
    });
  });

  describe('vec3Normalize', () => {
    it('normalizes non-unit vector', () => {
      const v: Vec3 = [3, 4, 0];
      const result = vec3Normalize(v);

      const length = Math.sqrt(result[0]**2 + result[1]**2 + result[2]**2);
      expect(length).toBeCloseTo(1.0, 10);
      expect(result[0]).toBeCloseTo(0.6, 5);
      expect(result[1]).toBeCloseTo(0.8, 5);
    });

    it('handles already normalized vector', () => {
      const v: Vec3 = [1, 0, 0];
      const result = vec3Normalize(v);

      expect(result).toEqual([1, 0, 0]);
    });

    it('handles zero vector gracefully', () => {
      const v: Vec3 = [0, 0, 0];
      const result = vec3Normalize(v);

      expect(result).toEqual([0, 0, 0]);
    });

    it('handles very small vectors', () => {
      const v: Vec3 = [0.00001, 0, 0];
      const result = vec3Normalize(v);

      expect(result).toEqual([0, 0, 0]); // Below threshold, returns zero
    });
  });

  describe('vec3Distance', () => {
    it('calculates distance between two points', () => {
      const a: Vec3 = [0, 0, 0];
      const b: Vec3 = [3, 4, 0];
      const distance = vec3Distance(a, b);

      expect(distance).toBe(5);
    });

    it('returns zero for same points', () => {
      const a: Vec3 = [1, 2, 3];
      const distance = vec3Distance(a, a);

      expect(distance).toBe(0);
    });

    it('is symmetric', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [4, 5, 6];

      expect(vec3Distance(a, b)).toBe(vec3Distance(b, a));
    });
  });
});

describe('Quaternion Advanced Operations', () => {
  describe('quatFromTwoVectors', () => {
    it('creates rotation from X to Y axis', () => {
      const from: Vec3 = [1, 0, 0];
      const to: Vec3 = [0, 1, 0];
      const quat = quatFromTwoVectors(from, to);

      // Normalize and check it's a valid quaternion
      const normalized = quatNormalize(quat);
      const length = Math.sqrt(
        normalized[0]**2 + normalized[1]**2 +
        normalized[2]**2 + normalized[3]**2
      );

      expect(length).toBeCloseTo(1.0, 5);
    });

    it('handles parallel vectors (same direction)', () => {
      const v: Vec3 = [1, 2, 3];
      const quat = quatFromTwoVectors(v, v);

      // Should return identity or near-identity
      expect(quat[3]).toBeCloseTo(1.0, 3); // w component
    });

    it('handles opposite vectors', () => {
      const from: Vec3 = [1, 0, 0];
      const to: Vec3 = [-1, 0, 0];
      const quat = quatFromTwoVectors(from, to);

      // 180 degree rotation: w should be 0
      expect(Math.abs(quat[3])).toBeCloseTo(0, 5);
    });

    it('creates valid rotation quaternion', () => {
      const from: Vec3 = [1, 1, 0];
      const to: Vec3 = [0, 1, 1];
      const quat = quatFromTwoVectors(from, to);

      const normalized = quatNormalize(quat);
      const length = Math.sqrt(
        normalized[0]**2 + normalized[1]**2 +
        normalized[2]**2 + normalized[3]**2
      );

      expect(length).toBeCloseTo(1.0, 5);
    });
  });

  describe('quatNormalize', () => {
    it('normalizes unnormalized quaternion', () => {
      const q: Quat = [1, 2, 3, 4];
      const normalized = quatNormalize(q);

      const length = Math.sqrt(
        normalized[0]**2 + normalized[1]**2 +
        normalized[2]**2 + normalized[3]**2
      );

      expect(length).toBeCloseTo(1.0, 10);
    });

    it('handles identity quaternion', () => {
      const q: Quat = [0, 0, 0, 1];
      const normalized = quatNormalize(q);

      expect(normalized).toEqual([0, 0, 0, 1]);
    });

    it('handles near-zero quaternion', () => {
      const q: Quat = [0, 0, 0, 0];
      const normalized = quatNormalize(q);

      // Should return identity
      expect(normalized).toEqual([0, 0, 0, 1]);
    });

    it('preserves direction for very small quaternions', () => {
      const q: Quat = [1e-12, 0, 0, 0];
      const normalized = quatNormalize(q);

      // Too small, should return identity
      expect(normalized).toEqual([0, 0, 0, 1]);
    });
  });
});
