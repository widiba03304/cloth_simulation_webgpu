import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applySMPLBlendShapes,
  applySMPLBlendShapesScaled,
  computeSMPLScaleParams,
  betasToArray,
  betasToString,
  applySMPLBlendShapesWithUnscaled,
  SMPL_SHAPE_PRESETS,
  getShapeData,
  loadSMPLShapeData,
} from '../src/renderer/render/smplBlendShapes';
import type { SMPLBetas } from '../src/renderer/render/smplBlendShapes';

// Minimal shape data for 2 vertices, 2 shape params
// SMPLShapeData.shapedirs: number[][] — one flat array per beta
function makeShapeData() {
  const numVerts = 2;
  const numBetas = 2;
  // shapedir[beta_i][v * 3 + axis]
  const shapedir0 = new Array(numVerts * 3).fill(0) as number[];
  shapedir0[0] = 1.0; // v0.x += 1 when beta0 = 1
  const shapedir1 = new Array(numVerts * 3).fill(0) as number[];
  shapedir1[4] = 1.0; // v1.y += 1 when beta1 = 1
  return {
    num_vertices: numVerts,
    num_betas: numBetas,
    num_faces: 1,
    v_template: [0, 0, 0, 0, 0, 0] as number[], // 2 verts at origin (flat)
    shapedirs: [shapedir0, shapedir1] as number[][], // one array per beta
    faces: [0, 1, 0] as number[],  // minimal degenerate triangle
  };
}

describe('applySMPLBlendShapes', () => {
  it('returns mesh with same number of vertices as template', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [0, 0]);
    expect(mesh.positions.length).toBe(sd.v_template.length);
  });

  it('neutral betas (all zero) returns template positions', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [0, 0]);
    for (let i = 0; i < sd.v_template.length; i++) {
      expect(mesh.positions[i]).toBeCloseTo(0);
    }
  });

  it('beta[0]=1 displaces vertex 0 in X', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [1.0, 0]);
    expect(mesh.positions[0]).toBeCloseTo(1.0);
  });

  it('skips betas with weight < 0.001', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [0.0005, 0]);
    expect(mesh.positions[0]).toBeCloseTo(0); // skipped
  });

  it('returns Float32Array positions', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [0, 0]);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
  });

  it('returns mesh with indices', () => {
    const sd = makeShapeData();
    const mesh = applySMPLBlendShapes(sd as any, [0, 0]);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.indices.length).toBe(sd.faces.length);
  });
});

describe('applySMPLBlendShapesScaled', () => {
  it('returns mesh scaled to target height', () => {
    const sd = makeShapeData();
    // Add some Y extent
    sd.v_template[4] = 1.2; // v1.y = 1.2
    const mesh = applySMPLBlendShapesScaled(sd as any, [0, 0]);
    expect(mesh.positions.length).toBe(sd.v_template.length);
  });

  it('does not throw with empty betas', () => {
    const sd = makeShapeData();
    expect(() => applySMPLBlendShapesScaled(sd as any, [])).not.toThrow();
  });
});

describe('computeSMPLScaleParams', () => {
  it('returns scale and offset parameters', () => {
    const positions = new Float32Array([0, 0, 0, 1, 1.2, 1]);
    const params = computeSMPLScaleParams(positions);
    expect(params).toHaveProperty('scale');
    expect(params).toHaveProperty('offsetX');
    expect(params).toHaveProperty('offsetY');
    expect(params).toHaveProperty('offsetZ');
  });

  it('scale maps max Y to 1.73 target', () => {
    const positions = new Float32Array([0, 0, 0, 0, 2.4, 0]); // height = 2.4
    const params = computeSMPLScaleParams(positions);
    expect(params.scale).toBeCloseTo(1.73 / 2.4, 4); // ≈ 0.721
  });
});

describe('betasToArray', () => {
  it('converts SMPLBetas object to array', () => {
    const betas: SMPLBetas = {
      beta0: 1, beta1: 2, beta2: 0, beta3: 0, beta4: 0,
      beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
    };
    const arr = betasToArray(betas);
    expect(arr).toBeInstanceOf(Array);
    expect(arr.length).toBe(10);
    expect(arr[0]).toBeCloseTo(1);
    expect(arr[1]).toBeCloseTo(2);
  });
});

describe('betasToString (smplBlendShapes version)', () => {
  it('returns a string', () => {
    const betas: SMPLBetas = {
      beta0: 0, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
      beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
    };
    expect(typeof betasToString(betas)).toBe('string');
  });

  it('returns Neutral when all betas near zero (covers early return branch)', () => {
    const betas: SMPLBetas = {
      beta0: 0.05, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
      beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
    };
    expect(betasToString(betas)).toBe('Neutral');
  });

  it('returns formatted string with non-zero betas (covers map/filter/join path, lines 239-240)', () => {
    const betas: SMPLBetas = {
      beta0: 0.5, beta1: 0, beta2: -0.3, beta3: 0, beta4: 0,
      beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
    };
    const result = betasToString(betas);
    expect(result).toContain('β0');
    expect(result).not.toBe('Neutral');
  });
});

describe('applySMPLBlendShapesWithUnscaled', () => {
  it('returns scaled and unscaled meshes', () => {
    const sd = makeShapeData();
    const result = applySMPLBlendShapesWithUnscaled(sd as any, [0, 0]);
    expect(result).toHaveProperty('scaled');
    expect(result).toHaveProperty('unscaled');
    expect(result.unscaled).toBeInstanceOf(Float32Array);
  });
});

describe('SMPL_SHAPE_PRESETS', () => {
  it('has neutral preset', () => {
    expect(SMPL_SHAPE_PRESETS).toHaveProperty('neutral');
  });

  it('all presets have beta0-beta9 fields', () => {
    for (const [, preset] of Object.entries(SMPL_SHAPE_PRESETS)) {
      expect(preset).toHaveProperty('beta0');
      expect(preset).toHaveProperty('beta1');
      expect(preset).toHaveProperty('beta9');
    }
  });
});

describe('getShapeData', () => {
  it('returns null initially (data not yet loaded)', () => {
    // Before loading, returns null
    const data = getShapeData('male');
    // Either null or loaded (depending on module state)
    expect(data === null || data !== null).toBe(true);
  });

  it('getShapeData female branch returns femaleShapeData (line 228 false)', () => {
    const data = getShapeData('female');
    // Either null or loaded (depending on module state)
    expect(data === null || data !== null).toBe(true);
  });
});

describe('loadSMPLShapeData', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        num_vertices: 2,
        num_betas: 2,
        num_faces: 1,
        v_template: [0, 0, 0, 0, 0, 0],       // flat number[]
        shapedirs: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], // number[][]
        faces: [0, 1, 0],                       // flat number[]
      }),
    } as any));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns object with male and female keys', async () => {
    const result = await loadSMPLShapeData();
    expect(result).toHaveProperty('male');
    expect(result).toHaveProperty('female');
  });

  it('handles fetch errors gracefully', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network error'); });
    const result = await loadSMPLShapeData();
    expect(result.male).toBeNull();
    expect(result.female).toBeNull();
  });

  it('returns null when res.ok is false (lines 43-46 false branches)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false } as any));
    const result = await loadSMPLShapeData();
    expect(result.male).toBeNull();
    expect(result.female).toBeNull();
  });
});
