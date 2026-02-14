/**
 * Matrix and Quaternion Math Tests
 * Tests the mathematical operations used in skinning without requiring WebGPU
 */

import { describe, it, expect } from 'vitest';

// Test quaternion to matrix conversion (column-major for WebGPU)
function quatToMat4(q: [number, number, number, number], t: [number, number, number]): Float32Array {
  const [x, y, z, w] = q;
  const [tx, ty, tz] = t;

  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;

  const out = new Float32Array(16);

  // Column 0 (right vector)
  out[0] = 1 - 2 * (yy + zz);
  out[1] = 2 * (xy + wz);
  out[2] = 2 * (xz - wy);
  out[3] = 0;

  // Column 1 (up vector)
  out[4] = 2 * (xy - wz);
  out[5] = 1 - 2 * (xx + zz);
  out[6] = 2 * (yz + wx);
  out[7] = 0;

  // Column 2 (forward vector)
  out[8] = 2 * (xz + wy);
  out[9] = 2 * (yz - wx);
  out[10] = 1 - 2 * (xx + yy);
  out[11] = 0;

  // Column 3 (position)
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  out[15] = 1;

  return out;
}

// Test matrix-vector multiplication (column-major)
function transformPoint(mat: Float32Array, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;

  const rx = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
  const ry = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
  const rz = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

  return [rx, ry, rz];
}

// Test matrix multiplication (column-major)
function matrixMultiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      result[col * 4 + row] = sum;
    }
  }

  return result;
}

// Create identity matrix
function identityMatrix(): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

describe('WebGPU Coordinate System Compatibility', () => {
  it('column-major matrix storage matches WebGPU expectations', () => {
    // WebGPU expects column-major matrices
    // Column 0 = right vector (X axis)
    // Column 1 = up vector (Y axis)
    // Column 2 = forward vector (Z axis)
    // Column 3 = translation

    const mat = new Float32Array([
      1, 0, 0, 0,  // Column 0: X axis (right)
      0, 1, 0, 0,  // Column 1: Y axis (up)
      0, 0, 1, 0,  // Column 2: Z axis (forward)
      5, 10, 15, 1 // Column 3: translation
    ]);

    // In column-major:
    // mat[0-3]   = column 0 (X axis)
    // mat[4-7]   = column 1 (Y axis)
    // mat[8-11]  = column 2 (Z axis)
    // mat[12-15] = column 3 (position)

    expect(mat[0]).toBe(1);  // X axis X component
    expect(mat[5]).toBe(1);  // Y axis Y component
    expect(mat[10]).toBe(1); // Z axis Z component
    expect(mat[12]).toBe(5); // Translation X
    expect(mat[13]).toBe(10); // Translation Y
    expect(mat[14]).toBe(15); // Translation Z
  });

  it('quaternion rotation follows right-handed system', () => {
    // WebGPU uses right-handed coordinate system
    // Positive rotation around Y axis: X -> -Z
    // (counterclockwise when looking down Y axis)

    const angle = Math.PI / 2; // 90 degrees
    const quatY: [number, number, number, number] = [0, Math.sin(angle/2), 0, Math.cos(angle/2)];
    const mat = quatToMat4(quatY, [0, 0, 0]);

    // (1, 0, 0) should rotate to (0, 0, -1)
    const result = transformPoint(mat, [1, 0, 0]);

    expect(result[0]).toBeCloseTo(0, 4);
    expect(result[2]).toBeCloseTo(-1, 4);
  });

  it('matrix multiplication order is correct for column-major', () => {
    // In column-major: M * v applies M to v
    // For transforms: Child * Parent applies Parent first, then Child

    const translate = quatToMat4([0,0,0,1], [5, 0, 0]); // Move right by 5
    const rotate90Y = quatToMat4([0, Math.sin(Math.PI/4), 0, Math.cos(Math.PI/4)], [0,0,0]);

    // Apply translation first, then rotation
    const combined = matrixMultiply(rotate90Y, translate);

    // Point at origin
    const point: [number, number, number] = [0, 0, 0];

    // Manual application: translate first
    const afterTranslate = transformPoint(translate, point); // (5, 0, 0)
    const afterRotate = transformPoint(rotate90Y, afterTranslate); // Should rotate (5,0,0)

    // Combined matrix should give same result
    const combinedResult = transformPoint(combined, point);

    expect(combinedResult[0]).toBeCloseTo(afterRotate[0], 4);
    expect(combinedResult[1]).toBeCloseTo(afterRotate[1], 4);
    expect(combinedResult[2]).toBeCloseTo(afterRotate[2], 4);
  });

  it('WGSL matrix multiplication matches CPU implementation', () => {
    // In WGSL: transform * vec4 means multiply matrix by vector
    // Column-major: result = M[0]*v.x + M[1]*v.y + M[2]*v.z + M[3]*v.w

    const quat: [number, number, number, number] = [0, Math.sin(Math.PI/6), 0, Math.cos(Math.PI/6)];
    const trans: [number, number, number] = [1, 2, 3];
    const mat = quatToMat4(quat, trans);

    // Test point
    const p: [number, number, number] = [1, 0, 0];

    // CPU computation
    const result = transformPoint(mat, p);

    // Manual WGSL-style computation
    const v = [p[0], p[1], p[2], 1];
    const wgslResult = [
      mat[0]*v[0] + mat[4]*v[1] + mat[8]*v[2] + mat[12]*v[3],
      mat[1]*v[0] + mat[5]*v[1] + mat[9]*v[2] + mat[13]*v[3],
      mat[2]*v[0] + mat[6]*v[1] + mat[10]*v[2] + mat[14]*v[3]
    ];

    expect(wgslResult[0]).toBeCloseTo(result[0], 5);
    expect(wgslResult[1]).toBeCloseTo(result[1], 5);
    expect(wgslResult[2]).toBeCloseTo(result[2], 5);
  });
});

describe('Matrix Math', () => {
  it('identity quaternion produces identity matrix', () => {
    const identityQuat: [number, number, number, number] = [0, 0, 0, 1];
    const zeroTranslation: [number, number, number] = [0, 0, 0];

    const mat = quatToMat4(identityQuat, zeroTranslation);

    // Check diagonal is 1
    expect(mat[0]).toBeCloseTo(1, 5);  // M00
    expect(mat[5]).toBeCloseTo(1, 5);  // M11
    expect(mat[10]).toBeCloseTo(1, 5); // M22
    expect(mat[15]).toBeCloseTo(1, 5); // M33

    // Check off-diagonal rotation part is 0
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i !== j) {
          expect(mat[j * 4 + i]).toBeCloseTo(0, 5);
        }
      }
    }
  });

  it('90-degree Y rotation transforms X axis to -Z axis', () => {
    // Quaternion for 90-degree rotation around Y axis
    const angle = Math.PI / 2;
    const quat: [number, number, number, number] = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const translation: [number, number, number] = [0, 0, 0];

    const mat = quatToMat4(quat, translation);

    // Transform point (1, 0, 0) - should become approximately (0, 0, -1)
    const result = transformPoint(mat, [1, 0, 0]);

    console.log('90° Y rotation: (1,0,0) ->', result);

    expect(result[0]).toBeCloseTo(0, 4);  // X component
    expect(result[1]).toBeCloseTo(0, 4);  // Y component
    expect(result[2]).toBeCloseTo(-1, 4); // Z component
  });

  it('90-degree Z rotation transforms X axis to Y axis', () => {
    const angle = Math.PI / 2;
    const quat: [number, number, number, number] = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    const translation: [number, number, number] = [0, 0, 0];

    const mat = quatToMat4(quat, translation);

    const result = transformPoint(mat, [1, 0, 0]);

    console.log('90° Z rotation: (1,0,0) ->', result);

    expect(result[0]).toBeCloseTo(0, 4);  // X component
    expect(result[1]).toBeCloseTo(1, 4);  // Y component
    expect(result[2]).toBeCloseTo(0, 4);  // Z component
  });

  it('translation moves point correctly', () => {
    const identityQuat: [number, number, number, number] = [0, 0, 0, 1];
    const translation: [number, number, number] = [5, 10, -3];

    const mat = quatToMat4(identityQuat, translation);

    const result = transformPoint(mat, [1, 2, 3]);

    expect(result[0]).toBeCloseTo(6, 5);   // 1 + 5
    expect(result[1]).toBeCloseTo(12, 5);  // 2 + 10
    expect(result[2]).toBeCloseTo(0, 5);   // 3 + (-3)
  });

  it('30-degree Y rotation (test rotation)', () => {
    // This is the test rotation used in the app
    const angle = Math.PI / 6; // 30 degrees
    const quat: [number, number, number, number] = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const translation: [number, number, number] = [0, 0, 0];

    const mat = quatToMat4(quat, translation);

    // Print matrix for debugging
    console.log('30° Y rotation matrix (column-major):');
    console.log('  Col 0:', [mat[0], mat[1], mat[2], mat[3]].map(v => v.toFixed(3)));
    console.log('  Col 1:', [mat[4], mat[5], mat[6], mat[7]].map(v => v.toFixed(3)));
    console.log('  Col 2:', [mat[8], mat[9], mat[10], mat[11]].map(v => v.toFixed(3)));
    console.log('  Col 3:', [mat[12], mat[13], mat[14], mat[15]].map(v => v.toFixed(3)));

    // Transform a point along X axis
    const result = transformPoint(mat, [1, 0, 0]);
    console.log('  (1,0,0) ->', result.map(v => v.toFixed(3)));

    // After 30° rotation around Y:
    // X (1,0,0) should become (cos(30°), 0, -sin(30°)) = (0.866, 0, -0.5)
    expect(result[0]).toBeCloseTo(Math.cos(angle), 4);
    expect(result[1]).toBeCloseTo(0, 4);
    expect(result[2]).toBeCloseTo(-Math.sin(angle), 4);
  });
});
