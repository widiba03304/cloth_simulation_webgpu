import { describe, it, expect } from 'vitest';
import { parseObj } from '../src/renderer/render/loadObj';

const TRIANGLE_OBJ = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;

const QUAD_OBJ = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`;

const NORMALS_OBJ = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vn 0 0 1
vn 0 0 1
f 1//1 2//2 3//3
`;

const NORMALS_WITH_UV_OBJ = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
vn 0 0 1
vn 0 0 1
f 1/1/1 2/2/2 3/3/3
`;

describe('parseObj', () => {
  it('parses a single triangle', () => {
    const mesh = parseObj(TRIANGLE_OBJ);
    expect(mesh.positions.length).toBe(9);  // 3 verts × 3
    expect(mesh.indices.length).toBe(3);
    expect(mesh.indices[0]).toBe(0);
    expect(mesh.indices[1]).toBe(1);
    expect(mesh.indices[2]).toBe(2);
  });

  it('converts a quad to 2 triangles', () => {
    const mesh = parseObj(QUAD_OBJ);
    expect(mesh.indices.length).toBe(6);  // 2 triangles × 3
    expect(mesh.positions.length).toBe(12); // 4 verts × 3
  });

  it('parses vertex positions correctly', () => {
    const mesh = parseObj(TRIANGLE_OBJ);
    expect(mesh.positions[0]).toBeCloseTo(0);
    expect(mesh.positions[1]).toBeCloseTo(0);
    expect(mesh.positions[2]).toBeCloseTo(0);
    expect(mesh.positions[3]).toBeCloseTo(1);
    expect(mesh.positions[4]).toBeCloseTo(0);
    expect(mesh.positions[5]).toBeCloseTo(0);
  });

  it('parses normals when present (// syntax)', () => {
    const mesh = parseObj(NORMALS_OBJ);
    expect(mesh.normals).toBeDefined();
    expect(mesh.normals!.length).toBe(9); // 3 verts × 3
    // All normals should point in +Z
    expect(mesh.normals![2]).toBeCloseTo(1);
    expect(mesh.normals![5]).toBeCloseTo(1);
    expect(mesh.normals![8]).toBeCloseTo(1);
  });

  it('parses normals with UV references (/ syntax)', () => {
    const mesh = parseObj(NORMALS_WITH_UV_OBJ);
    expect(mesh.normals).toBeDefined();
    expect(mesh.normals!.length).toBe(9);
    expect(mesh.normals![2]).toBeCloseTo(1);
  });

  it('returns empty mesh for empty input', () => {
    const mesh = parseObj('');
    expect(mesh.positions.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });

  it('ignores comment lines', () => {
    const obj = `
# This is a comment
v 0 0 0
v 1 0 0
v 0 1 0
# Another comment
f 1 2 3
`;
    const mesh = parseObj(obj);
    expect(mesh.positions.length).toBe(9);
    expect(mesh.indices.length).toBe(3);
  });

  it('handles multiple triangles', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
f 1 2 3
f 2 4 3
`;
    const mesh = parseObj(obj);
    expect(mesh.indices.length).toBe(6);
  });

  it('ignores polygon faces with more than 4 vertices (n>4 not supported)', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0.5 2 0
f 1 2 3 4 5
`;
    const mesh = parseObj(obj);
    // n=5 is not handled -> skipped -> 0 indices
    expect(mesh.indices.length).toBe(0);
  });

  it('returns Float32Array for positions', () => {
    const mesh = parseObj(TRIANGLE_OBJ);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
  });

  it('normals are undefined when not specified', () => {
    const mesh = parseObj(TRIANGLE_OBJ);
    expect(mesh.normals).toBeUndefined();
  });

  it('vn with zero third component covers parseFloat || 0 branch (line 35)', () => {
    // vn 0 0 0: parseFloat('0') = 0 (falsy) → || 0 evaluated; also len=0 → line 99 false branch
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 0
f 1//1 2//1 3//1
`;
    const mesh = parseObj(obj);
    // normals exist but are all zero → normalized to zero (len <= 0.0001)
    expect(mesh.normals).toBeDefined();
    // Components should stay 0 (not normalized since len = 0)
    expect(mesh.normals![0]).toBeCloseTo(0);
    expect(mesh.normals![1]).toBeCloseTo(0);
    expect(mesh.normals![2]).toBeCloseTo(0);
  });

  it('normal index out of range covers if(nIdx >= 0 && ...) false branch (line 82)', () => {
    // nIdx=4 (vn index 5) but only 1 normal exists → 4*3+2=14 >= normals.length(3) → false branch
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 1//1 2//1 3//5
`;
    const mesh = parseObj(obj);
    // Outer check: normals.length=3 > 0 ✓, all nIdx >= 0 ✓ → enters block
    // But nIdx=4: 14 >= 3 → false branch → vertex 3 skips normal
    expect(mesh.normals).toBeDefined();
  });

  it('unreferenced vertex covers count=0 branch (line 93)', () => {
    // Vertex 3 (index 3) is never referenced by any face → normalCounts[3]=0
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 2 2
vn 0 0 1
f 1//1 2//1 3//1
`;
    const mesh = parseObj(obj);
    expect(mesh.normals).toBeDefined();
    expect(mesh.normals!.length).toBe(12); // 4 verts × 3
    // Vertex 3 has count=0 → its normal stays 0
    expect(mesh.normals![9]).toBeCloseTo(0);
  });

  it('vertex index 0 in face covers vIdx > 0 false branch (line 46)', () => {
    // f 0//1 1//1 2//1 → vIdx=0 → vIdx > 0 false → returns 0
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 0//1 1//1 2//1
`;
    const mesh = parseObj(obj);
    // Should not throw
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});
