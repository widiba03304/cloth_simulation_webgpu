import { describe, it, expect } from 'vitest';
import {
  applySMPLBetas,
  betasToString,
  SHAPE_PRESETS,
  type SMPLBetas,
} from '../src/renderer/render/smplShapes';
import type { BodyMesh } from '../src/renderer/render/bodyMesh';

function makeMesh(verts: number[]): BodyMesh {
  const positions = new Float32Array(verts);
  const indices = new Uint32Array([0, 1, 2]);
  return { positions, indices };
}

// Simple mesh: 3 vertices in a triangle
const TRIANGLE_MESH = makeMesh([
  0, 0, 0,   // v0 at origin
  1, 0, 0,   // v1 at x=1
  0, 1, 0,   // v2 at y=1
]);

describe('applySMPLBetas', () => {
  it('returns a new BodyMesh with same index count', () => {
    const betas: SMPLBetas = { weight: 0, height: 0, muscle: 0, chest: 0 };
    const result = applySMPLBetas(TRIANGLE_MESH, betas);
    expect(result.positions.length).toBe(TRIANGLE_MESH.positions.length);
    expect(result.indices).toBe(TRIANGLE_MESH.indices); // same reference
  });

  it('neutral betas (all 0) leaves positions approximately unchanged', () => {
    const betas: SMPLBetas = { weight: 0, height: 0, muscle: 0, chest: 0 };
    const result = applySMPLBetas(TRIANGLE_MESH, betas);
    for (let i = 0; i < TRIANGLE_MESH.positions.length; i++) {
      expect(result.positions[i]).toBeCloseTo(TRIANGLE_MESH.positions[i]!);
    }
  });

  it('positive weight scales X and Z outward', () => {
    const heavy = applySMPLBetas(TRIANGLE_MESH, { weight: 2, height: 0, muscle: 0, chest: 0 });
    const neutral = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 0 });
    // v1 at x=1 should be wider with heavy weight
    expect(Math.abs(heavy.positions[3]!)).toBeGreaterThan(Math.abs(neutral.positions[3]!));
  });

  it('positive height scales Y upward', () => {
    const tall = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 2, muscle: 0, chest: 0 });
    const neutral = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 0 });
    // v2 at y=1 should be taller
    expect(Math.abs(tall.positions[7]!)).toBeGreaterThan(Math.abs(neutral.positions[7]!));
  });

  it('returns Float32Array for positions', () => {
    const result = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 0 });
    expect(result.positions).toBeInstanceOf(Float32Array);
  });

  it('does not mutate input mesh positions', () => {
    const original = new Float32Array(TRIANGLE_MESH.positions);
    applySMPLBetas(TRIANGLE_MESH, { weight: 2, height: 2, muscle: 2, chest: 2 });
    for (let i = 0; i < original.length; i++) {
      expect(TRIANGLE_MESH.positions[i]).toBe(original[i]);
    }
  });

  it('chest factor only applies above y=0.4', () => {
    // v2 at (0, 1, 0) has normalizedY = 1/1.2 ≈ 0.833 > 0.4, so chest affects it
    const broad = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 2 });
    const neutral = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 0 });
    // v2.x (index 6): x=0, so chest * x = 0, no change; but v1.x = 1 at y=0 < 0.4 * 1.2 = 0.48
    // v1 at y=0 → normalizedY=0 → chestFactor=1 (below threshold)
    // Actually v1 at y=0 < 0.4: no chest effect
    // For v2 at y=1: chest applies → x=0 * chestFactor = 0 (still 0)
    // Let's use a mesh where we can clearly see the chest effect
    const mesh = makeMesh([0.5, 0.6, 0, 0, 0, 0, 0, 0, 0]);
    const broadChest = applySMPLBetas(mesh, { weight: 0, height: 0, muscle: 0, chest: 2 });
    const neutralChest = applySMPLBetas(mesh, { weight: 0, height: 0, muscle: 0, chest: 0 });
    // v0 at (0.5, 0.6, 0): normalizedY = 0.6/1.2 = 0.5 > 0.4, chestFactor > 1
    expect(Math.abs(broadChest.positions[0]!)).toBeGreaterThan(Math.abs(neutralChest.positions[0]!));
  });

  it('muscle factor based on distance from center axis', () => {
    // vertex at x=1, y=0, z=0 has distFromCenter = 1, should have muscle effect
    const muscular = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 2, chest: 0 });
    const neutral = applySMPLBetas(TRIANGLE_MESH, { weight: 0, height: 0, muscle: 0, chest: 0 });
    // v1 at (1, 0, 0): distFromCenter = 1, muscleFactor > 1
    expect(Math.abs(muscular.positions[3]!)).toBeGreaterThan(Math.abs(neutral.positions[3]!));
  });
});

describe('betasToString', () => {
  it('returns Neutral for all-zero betas', () => {
    const s = betasToString({ weight: 0, height: 0, muscle: 0, chest: 0 });
    expect(s).toBe('Neutral');
  });

  it('describes heavy weight', () => {
    const s = betasToString({ weight: 1, height: 0, muscle: 0, chest: 0 });
    expect(s).toContain('heavy');
  });

  it('describes thin weight', () => {
    const s = betasToString({ weight: -1, height: 0, muscle: 0, chest: 0 });
    expect(s).toContain('thin');
  });

  it('describes tall height', () => {
    const s = betasToString({ weight: 0, height: 1, muscle: 0, chest: 0 });
    expect(s).toContain('tall');
  });

  it('describes short height', () => {
    const s = betasToString({ weight: 0, height: -1, muscle: 0, chest: 0 });
    expect(s).toContain('short');
  });

  it('describes muscular', () => {
    const s = betasToString({ weight: 0, height: 0, muscle: 1, chest: 0 });
    expect(s).toContain('muscular');
  });

  it('describes slim muscle', () => {
    const s = betasToString({ weight: 0, height: 0, muscle: -1, chest: 0 });
    expect(s).toContain('slim');
  });

  it('describes broad chest', () => {
    const s = betasToString({ weight: 0, height: 0, muscle: 0, chest: 1 });
    expect(s).toContain('broad');
  });

  it('describes narrow chest', () => {
    const s = betasToString({ weight: 0, height: 0, muscle: 0, chest: -1 });
    expect(s).toContain('narrow');
  });

  it('ignores values below 0.1 threshold', () => {
    const s = betasToString({ weight: 0.05, height: 0.05, muscle: 0.05, chest: 0.05 });
    expect(s).toBe('Neutral');
  });

  it('combines multiple traits', () => {
    const s = betasToString({ weight: 1, height: 1, muscle: 1, chest: 1 });
    expect(s).toContain('heavy');
    expect(s).toContain('tall');
    expect(s).toContain('muscular');
    expect(s).toContain('broad');
  });
});

describe('SHAPE_PRESETS', () => {
  it('has neutral preset with all zeros', () => {
    const p = SHAPE_PRESETS['neutral']!;
    expect(p.weight).toBe(0);
    expect(p.height).toBe(0);
    expect(p.muscle).toBe(0);
    expect(p.chest).toBe(0);
  });

  it('has all expected presets', () => {
    expect(SHAPE_PRESETS).toHaveProperty('neutral');
    expect(SHAPE_PRESETS).toHaveProperty('thin');
    expect(SHAPE_PRESETS).toHaveProperty('athletic');
    expect(SHAPE_PRESETS).toHaveProperty('heavy');
    expect(SHAPE_PRESETS).toHaveProperty('tall');
    expect(SHAPE_PRESETS).toHaveProperty('short');
    expect(SHAPE_PRESETS).toHaveProperty('muscular');
  });

  it('thin preset has negative weight and muscle', () => {
    const p = SHAPE_PRESETS['thin']!;
    expect(p.weight).toBeLessThan(0);
    expect(p.muscle).toBeLessThan(0);
  });

  it('tall preset has positive height', () => {
    expect(SHAPE_PRESETS['tall']!.height).toBeGreaterThan(0);
  });

  it('short preset has negative height', () => {
    expect(SHAPE_PRESETS['short']!.height).toBeLessThan(0);
  });
});
