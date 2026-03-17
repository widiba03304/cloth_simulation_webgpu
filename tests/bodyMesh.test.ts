import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMannequinMesh,
  getPelvisTarget,
  applyBodyScale,
  calculateSmoothNormals,
  loadSMPLMannequins,
  loadSMPLMannequin,
} from '../src/renderer/render/bodyMesh';

// Mock fetch for OBJ loading
const SIMPLE_OBJ = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;

describe('buildMannequinMesh', () => {
  it('returns a mesh with positions and indices', () => {
    const mesh = buildMannequinMesh();
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 3).toBe(0);
  });

  it('returns Float32Array positions and Uint32Array indices', () => {
    const mesh = buildMannequinMesh();
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
  });

  it('mesh has valid triangle indices', () => {
    const mesh = buildMannequinMesh();
    const numVerts = mesh.positions.length / 3;
    for (const idx of mesh.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(numVerts);
    }
  });
});

describe('getPelvisTarget', () => {
  it('returns a 3-tuple', () => {
    const positions = new Float32Array([
      0, 0, 0,
      1, 1.2, 0,
      -1, 0.6, 0,
    ]);
    const target = getPelvisTarget(positions);
    expect(target).toHaveLength(3);
  });

  it('returns a Y value about 35% of height', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0, 1.2, 0,
    ]);
    const [, y] = getPelvisTarget(positions);
    // 35% of height 1.2 = 0.42
    expect(y).toBeCloseTo(1.2 * 0.35, 1);
  });
});

describe('applyBodyScale', () => {
  it('scales positions by given scale', () => {
    const mesh = {
      positions: new Float32Array([1, 1, 1]),
      indices: new Uint32Array([0]),
    };
    const result = applyBodyScale(mesh, { height: 2, width: 3, depth: 4 });
    expect(result.positions[0]).toBeCloseTo(3); // x * width
    expect(result.positions[1]).toBeCloseTo(2); // y * height
    expect(result.positions[2]).toBeCloseTo(4); // z * depth
  });

  it('returns a new mesh, does not mutate original', () => {
    const mesh = {
      positions: new Float32Array([1, 1, 1]),
      indices: new Uint32Array([0]),
    };
    const orig = new Float32Array(mesh.positions);
    applyBodyScale(mesh, { height: 2, width: 2, depth: 2 });
    expect(mesh.positions[0]).toBe(orig[0]);
  });
});

describe('calculateSmoothNormals', () => {
  it('returns Float32Array of same length as positions', () => {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2]);
    const normals = calculateSmoothNormals(positions, indices);
    expect(normals).toBeInstanceOf(Float32Array);
    expect(normals.length).toBe(positions.length);
  });

  it('normals point in correct half-space for XY triangle', () => {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2]);
    const normals = calculateSmoothNormals(positions, indices);
    // Triangle in XY plane should have normals pointing in ±Z
    for (let i = 0; i < 3; i++) {
      const nz = normals[i * 3 + 2]!;
      expect(Math.abs(nz)).toBeGreaterThan(0.9);
    }
  });

  it('handles degenerate zero-area triangle', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0, 0, 0,  // degenerate: same point
      0, 0, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2]);
    expect(() => calculateSmoothNormals(positions, indices)).not.toThrow();
  });

  it('handles multiple triangles', () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0
    ]);
    const indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
    const normals = calculateSmoothNormals(positions, indices);
    expect(normals.length).toBe(12);
  });
});

describe('loadSMPLMannequins and loadSMPLMannequin', () => {
  beforeEach(() => {
    // Mock fetch to return a simple OBJ
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => SIMPLE_OBJ,
    } as Response));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadSMPLMannequins returns male and female meshes', async () => {
    const result = await loadSMPLMannequins();
    expect(result).toHaveProperty('male');
    expect(result).toHaveProperty('female');
    // With tiny OBJ mesh, positions should be > 0
    expect(result.male.positions.length).toBeGreaterThan(0);
  });

  it('loadSMPLMannequin returns a mesh or null', async () => {
    const mesh = await loadSMPLMannequin();
    // Either succeeds or returns null
    if (mesh !== null) {
      expect(mesh.positions.length).toBeGreaterThan(0);
    }
  });

  it('falls back to buildMannequinMesh on fetch failure', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network error'); });
    const result = await loadSMPLMannequins();
    // Should not throw and should return meshes (fallback)
    expect(result.male.positions.length).toBeGreaterThan(0);
    expect(result.female.positions.length).toBeGreaterThan(0);
  });

  it('falls back to buildMannequinMesh on empty OBJ', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '', // empty OBJ = invalid
    } as Response));
    const result = await loadSMPLMannequins();
    expect(result.male.positions.length).toBeGreaterThan(0);
  });

  it('uses OBJ normals directly when present (line 71)', async () => {
    const OBJ_WITH_NORMALS = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vn 0 0 1
vn 0 0 1
f 1//1 2//2 3//3
`;
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => OBJ_WITH_NORMALS,
    } as Response));
    const result = await loadSMPLMannequins();
    // Normals from OBJ should be present on the mesh
    expect(result.male.normals).toBeDefined();
  });
});
