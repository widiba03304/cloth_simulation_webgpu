/**
 * Unit tests for cloth3d.builders.ts — pure CPU data-building functions.
 * No GPU / WebGPU dependencies required.
 * Target: 100% branch + statement coverage of cloth3d.builders.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  KIND_H, KIND_V, KIND_SHEAR, KIND_BEND, KIND_SEAM,
  SUB_STEPS, NUM_CAPSULES,
  BODY_CAPSULES, CAPSULE_JOINT_MAP,
  buildConstraints, buildInitialPositions, buildIndices,
  buildCapsulesData, writeSimParams, writeCollideParams,
  type Cloth3DConfig, type Cloth3DMaterialParams,
} from '../src/renderer/sim/cloth3d/cloth3d.builders';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('KIND values are distinct integers', () => {
    const kinds = [KIND_H, KIND_V, KIND_SHEAR, KIND_BEND, KIND_SEAM];
    expect(new Set(kinds).size).toBe(5);
    kinds.forEach(k => expect(Number.isInteger(k)).toBe(true));
  });

  it('SUB_STEPS is a positive integer', () => {
    expect(SUB_STEPS).toBeGreaterThan(0);
    expect(Number.isInteger(SUB_STEPS)).toBe(true);
  });

  it('NUM_CAPSULES matches BODY_CAPSULES array length', () => {
    expect(NUM_CAPSULES).toBe(BODY_CAPSULES.length);
    expect(NUM_CAPSULES).toBe(13);
  });

  it('CAPSULE_JOINT_MAP length matches BODY_CAPSULES', () => {
    expect(CAPSULE_JOINT_MAP.length).toBe(BODY_CAPSULES.length);
  });

  it('BODY_CAPSULES have positive radii and valid positions', () => {
    BODY_CAPSULES.forEach((cap, i) => {
      expect(cap.r).toBeGreaterThan(0);
      expect(cap.a).toHaveLength(3);
      expect(cap.b).toHaveLength(3);
      cap.a.forEach(v => expect(typeof v).toBe('number'));
      cap.b.forEach(v => expect(typeof v).toBe('number'));
      // Capsules should be within a ~2m bounding box
      cap.a.forEach(v => expect(Math.abs(v)).toBeLessThan(3));
      cap.b.forEach(v => expect(Math.abs(v)).toBeLessThan(3));
    });
  });

  it('CAPSULE_JOINT_MAP contains valid joint indices', () => {
    CAPSULE_JOINT_MAP.forEach(m => {
      expect(m.ai).toBeGreaterThanOrEqual(0);
      expect(m.bi).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildConstraints — flat (single panel, no wrap)
// ---------------------------------------------------------------------------

describe('buildConstraints — flat (single panel)', () => {
  const rows = 4, cols = 3, spacing = 0.03;

  it('returns Uint8Array with 16 bytes per constraint', () => {
    const { data, total } = buildConstraints(rows, cols, spacing);
    expect(data.byteLength).toBe(total * 16);
  });

  it('produces 12 standard color groups', () => {
    const { groups } = buildConstraints(rows, cols, spacing);
    expect(groups.length).toBe(12);
  });

  it('each group has valid count (>=0), correct wg, and non-negative offset', () => {
    const { groups } = buildConstraints(rows, cols, spacing);
    groups.forEach(g => {
      expect(g.count).toBeGreaterThanOrEqual(0);
      expect(g.wg).toBe(Math.ceil(g.count / 64));
      expect(g.offset).toBeGreaterThanOrEqual(0);
    });
    // At least some groups must be non-empty
    expect(groups.some(g => g.count > 0)).toBe(true);
  });

  it('groups are contiguous (offset + count = next offset)', () => {
    const { groups } = buildConstraints(rows, cols, spacing);
    for (let i = 0; i < groups.length - 1; i++) {
      expect(groups[i].offset + groups[i].count).toBe(groups[i + 1].offset);
    }
  });

  it('horizontal constraints have correct rest length and KIND_H', () => {
    const { data, total } = buildConstraints(rows, cols, spacing);
    const f32 = new Float32Array(data.buffer);
    const u32 = new Uint32Array(data.buffer);
    // Groups 0 and 1 are horizontal
    let found = false;
    for (let i = 0; i < total; i++) {
      if (u32[i*4 + 3] === KIND_H) {
        expect(f32[i*4 + 2]).toBeCloseTo(spacing, 6);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('vertical constraints have correct rest length and KIND_V', () => {
    const { data, total } = buildConstraints(rows, cols, spacing);
    const f32 = new Float32Array(data.buffer);
    const u32 = new Uint32Array(data.buffer);
    let found = false;
    for (let i = 0; i < total; i++) {
      if (u32[i*4 + 3] === KIND_V) {
        expect(f32[i*4 + 2]).toBeCloseTo(spacing, 6);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('shear constraints have diagonal rest length and KIND_SHEAR', () => {
    const { data, total } = buildConstraints(rows, cols, spacing);
    const f32 = new Float32Array(data.buffer);
    const u32 = new Uint32Array(data.buffer);
    let found = false;
    for (let i = 0; i < total; i++) {
      if (u32[i*4 + 3] === KIND_SHEAR) {
        expect(f32[i*4 + 2]).toBeCloseTo(spacing * Math.SQRT2, 5);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('bend constraints have 2× rest length and KIND_BEND', () => {
    const { data, total } = buildConstraints(rows, cols, spacing);
    const f32 = new Float32Array(data.buffer);
    const u32 = new Uint32Array(data.buffer);
    let found = false;
    for (let i = 0; i < total; i++) {
      if (u32[i*4 + 3] === KIND_BEND) {
        expect(f32[i*4 + 2]).toBeCloseTo(spacing * 2, 5);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('total constraint count is correct for 4×3 grid', () => {
    // H: rows*(cols-1) = 4*2 = 8
    // V: (rows-1)*cols = 3*3 = 9
    // Shear: (rows-1)*(cols-1)*2 = 3*2*2 = 12
    // Bend-H: rows*(cols-2) = 4*1 = 4
    // Bend-V: (rows-2)*cols = 2*3 = 6
    // Total = 8+9+12+4+6 = 39
    const { total } = buildConstraints(rows, cols, spacing);
    expect(total).toBe(39);
  });

  it('all constraint particle indices are within bounds', () => {
    const N = rows * cols;
    const { data, total } = buildConstraints(rows, cols, spacing);
    const u32 = new Uint32Array(data.buffer);
    for (let i = 0; i < total; i++) {
      expect(u32[i*4]).toBeLessThan(N);
      expect(u32[i*4 + 1]).toBeLessThan(N);
    }
  });
});

// ---------------------------------------------------------------------------
// buildConstraints — twoPanel
// ---------------------------------------------------------------------------

describe('buildConstraints — twoPanel', () => {
  const rows = 3, cols = 4, spacing = 0.03;

  it('produces 14 color groups (12 panel + 2 seam)', () => {
    const { groups } = buildConstraints(rows, cols, spacing, true);
    expect(groups.length).toBe(14);
  });

  it('seam group 12 (right seam) contains KIND_SEAM with restLen=0', () => {
    const { data, groups } = buildConstraints(rows, cols, spacing, true);
    const u32 = new Uint32Array(data.buffer);
    const f32 = new Float32Array(data.buffer);
    const g12 = groups[12];
    expect(g12.count).toBe(rows);
    for (let i = g12.offset; i < g12.offset + g12.count; i++) {
      expect(u32[i*4 + 3]).toBe(KIND_SEAM);
      expect(f32[i*4 + 2]).toBe(0);
    }
  });

  it('seam group 13 (left seam) contains KIND_SEAM with restLen=0', () => {
    const { data, groups } = buildConstraints(rows, cols, spacing, true);
    const u32 = new Uint32Array(data.buffer);
    const f32 = new Float32Array(data.buffer);
    const g13 = groups[13];
    expect(g13.count).toBe(rows);
    for (let i = g13.offset; i < g13.offset + g13.count; i++) {
      expect(u32[i*4 + 3]).toBe(KIND_SEAM);
      expect(f32[i*4 + 2]).toBe(0);
    }
  });

  it('right seam connects front last col to back first col', () => {
    // Right seam: front col=cols-1 ↔ back col=0
    const N = rows * cols;
    const { data, groups } = buildConstraints(rows, cols, spacing, true);
    const u32 = new Uint32Array(data.buffer);
    const g12 = groups[12];
    for (let r = 0; r < rows; r++) {
      const i = g12.offset + r;
      const a = u32[i*4];
      const b = u32[i*4 + 1];
      expect(a).toBe(r * cols + (cols - 1)); // front last col
      expect(b).toBe(N + r * cols);           // back first col
    }
  });

  it('left seam connects front first col to back last col', () => {
    const N = rows * cols;
    const { data, groups } = buildConstraints(rows, cols, spacing, true);
    const u32 = new Uint32Array(data.buffer);
    const g13 = groups[13];
    for (let r = 0; r < rows; r++) {
      const i = g13.offset + r;
      const a = u32[i*4];
      const b = u32[i*4 + 1];
      expect(a).toBe(r * cols);               // front first col
      expect(b).toBe(N + r * cols + (cols-1));// back last col
    }
  });

  it('has approximately 2× flat constraint count + 2×rows seam constraints', () => {
    const flat = buildConstraints(rows, cols, spacing);
    const two  = buildConstraints(rows, cols, spacing, true);
    expect(two.total).toBe(flat.total * 2 + rows * 2);
  });

  it('all indices are within 2N bounds', () => {
    const N = rows * cols;
    const { data, total } = buildConstraints(rows, cols, spacing, true);
    const u32 = new Uint32Array(data.buffer);
    for (let i = 0; i < total; i++) {
      expect(u32[i*4]).toBeLessThan(N * 2);
      expect(u32[i*4 + 1]).toBeLessThan(N * 2);
    }
  });
});

// ---------------------------------------------------------------------------
// buildInitialPositions — twoPanel
// ---------------------------------------------------------------------------

describe('buildInitialPositions — twoPanel', () => {
  const base: Cloth3DConfig = {
    rows: 3, cols: 4, spacing: 0.03, pinned: 'topRow',
    origin: [0, 1.42, 0], radius: 0.22, twoPanel: true,
  };

  it('allocates 2 × rows × cols particles', () => {
    const { posData, pinnedData } = buildInitialPositions(base);
    const N = base.rows * base.cols * 2;
    expect(posData.length).toBe(N * 3);
    expect(pinnedData.length).toBe(N);
  });

  it('front panel col=0 starts at angle –π/2 (negative X, positive Z)', () => {
    const { posData } = buildInitialPositions(base);
    // Front col=0: angle = –π/2 → sin(-π/2)=-1, cos(-π/2)=0
    const R = base.radius!;
    expect(posData[0]).toBeCloseTo(0 + R * Math.sin(-Math.PI / 2), 4); // x ≈ -R
    expect(posData[2]).toBeCloseTo(0 + R * Math.cos(-Math.PI / 2), 4); // z ≈ 0
  });

  it('front panel col=cols-1 ends at angle +π/2 (positive X, near-zero Z)', () => {
    const R = base.radius!;
    const { posData } = buildInitialPositions(base);
    const lastFrontIdx = base.cols - 1; // row=0, col=cols-1
    expect(posData[lastFrontIdx * 3]).toBeCloseTo(R * Math.sin(Math.PI / 2), 4);  // x ≈ +R
    expect(posData[lastFrontIdx * 3 + 2]).toBeCloseTo(R * Math.cos(Math.PI / 2), 4); // z ≈ 0
  });

  it('back panel starts at angle +π/2 — co-located with front last col', () => {
    const { posData } = buildInitialPositions(base);
    const panelN = base.rows * base.cols;
    // Back panel col=0 angle = +π/2 — same as front col=cols-1
    const frontLastX = posData[(base.cols - 1) * 3];
    const frontLastZ = posData[(base.cols - 1) * 3 + 2];
    const backFirstX = posData[panelN * 3];
    const backFirstZ = posData[panelN * 3 + 2];
    expect(backFirstX).toBeCloseTo(frontLastX, 4);
    expect(backFirstZ).toBeCloseTo(frontLastZ, 4);
  });

  it('back panel last col ends at angle +3π/2 — co-located with front first col', () => {
    const { posData } = buildInitialPositions(base);
    const panelN = base.rows * base.cols;
    // Front col=0: angle=-π/2; back last col: angle=+π/2 + π = +3π/2
    // sin(3π/2) = -1 → same as sin(-π/2)
    const frontFirstX = posData[0];
    const frontFirstZ = posData[2];
    const backLastX = posData[(panelN + base.cols - 1) * 3];
    const backLastZ = posData[(panelN + base.cols - 1) * 3 + 2];
    expect(backLastX).toBeCloseTo(frontFirstX, 4);
    expect(backLastZ).toBeCloseTo(frontFirstZ, 4);
  });

  it('topRow pinning pins all cols in both panels', () => {
    const { pinnedData } = buildInitialPositions(base);
    const panelN = base.rows * base.cols;
    for (let c = 0; c < base.cols; c++) {
      expect(pinnedData[c]).toBe(1);           // front row 0
      expect(pinnedData[panelN + c]).toBe(1);  // back row 0
    }
    // Non-top rows should NOT be pinned
    expect(pinnedData[base.cols]).toBe(0);
  });

  it('topCorners pinning pins only 4 corners', () => {
    const cfg = { ...base, pinned: 'topCorners' as const };
    const { pinnedData } = buildInitialPositions(cfg);
    const panelN = base.rows * base.cols;
    expect(pinnedData[0]).toBe(1);
    expect(pinnedData[base.cols - 1]).toBe(1);
    expect(pinnedData[panelN]).toBe(1);
    expect(pinnedData[panelN + base.cols - 1]).toBe(1);
    // Others not pinned
    expect(pinnedData[1]).toBe(0);
    expect(pinnedData[panelN + 1]).toBe(0);
  });

  it('none pinning leaves all particles free', () => {
    const cfg = { ...base, pinned: 'none' as const };
    const { pinnedData } = buildInitialPositions(cfg);
    expect(pinnedData.every(v => v === 0)).toBe(true);
  });

  it('Y position decreases with row index at spacing interval', () => {
    const { posData } = buildInitialPositions(base);
    const [, topY] = base.origin;
    for (let r = 0; r < base.rows; r++) {
      const y = posData[r * base.cols * 3 + 1];
      expect(y).toBeCloseTo(topY - r * base.spacing, 5);
    }
  });

  it('uses default radius 0.22 when not specified', () => {
    const cfg: Cloth3DConfig = { ...base, radius: undefined };
    const { posData } = buildInitialPositions(cfg);
    // With R=0.22, col=0 X = origin[0] + 0.22 * sin(-π/2) = -0.22
    expect(posData[0]).toBeCloseTo(-0.22, 4);
  });
});

// ---------------------------------------------------------------------------
// buildInitialPositions — half-cylinder (flat)
// ---------------------------------------------------------------------------

describe('buildInitialPositions — half-cylinder', () => {
  const cfg: Cloth3DConfig = {
    rows: 3, cols: 4, spacing: 0.03, pinned: 'none',
    origin: [0, 1.42, 0], radius: 0.2,
  };

  it('particles lie approximately on a cylinder surface', () => {
    const { posData } = buildInitialPositions(cfg);
    const R = cfg.radius!;
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        const idx = r * cfg.cols + c;
        const x = posData[idx * 3];
        const z = posData[idx * 3 + 2];
        const dist = Math.sqrt(x*x + z*z);
        expect(dist).toBeCloseTo(R, 5);
      }
    }
  });

  it('none pinning leaves all unpinned', () => {
    const { pinnedData } = buildInitialPositions(cfg);
    expect(pinnedData.every(v => v === 0)).toBe(true);
  });

  it('origin offset is applied correctly', () => {
    const cfg2: Cloth3DConfig = { ...cfg, origin: [1, 2, 3] };
    const { posData } = buildInitialPositions(cfg2);
    // All Y at row=0 should be topY = 2
    expect(posData[1]).toBeCloseTo(2, 5);
    // X and Z offset by origin
    const R = cfg.radius!;
    const totalAngle = (cfg.cols - 1) * cfg.spacing / R;
    const startAngle = -totalAngle / 2;
    expect(posData[0]).toBeCloseTo(1 + R * Math.sin(startAngle), 4);
    expect(posData[2]).toBeCloseTo(3 + R * Math.cos(startAngle), 4);
  });
});

// ---------------------------------------------------------------------------
// buildIndices — flat
// ---------------------------------------------------------------------------

describe('buildIndices — flat', () => {
  const rows = 4, cols = 3;

  it('correct number of indices for flat grid', () => {
    const { numIndices } = buildIndices(rows, cols);
    // (rows-1)*(cols-1)*2 tris, each with 3 indices
    const expectedTris = (rows - 1) * (cols - 1);
    expect(numIndices).toBe(expectedTris * 6);
  });

  it('all indices are within bounds', () => {
    const N = rows * cols;
    const { indexData, numIndices } = buildIndices(rows, cols);
    for (let i = 0; i < numIndices; i++) {
      expect(indexData[i]).toBeGreaterThanOrEqual(0);
      expect(indexData[i]).toBeLessThan(N);
    }
  });

  it('indices form valid triangles (no degenerate tris)', () => {
    const { indexData, numIndices } = buildIndices(rows, cols);
    for (let i = 0; i < numIndices; i += 3) {
      const a = indexData[i], b = indexData[i+1], c = indexData[i+2];
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(a).not.toBe(c);
    }
  });
});

// ---------------------------------------------------------------------------
// buildIndices — twoPanel
// ---------------------------------------------------------------------------

describe('buildIndices — twoPanel', () => {
  const rows = 3, cols = 4;

  it('total indices = 2 panels × (rows-1)×(cols-1)×6', () => {
    const { numIndices } = buildIndices(rows, cols, true);
    expect(numIndices).toBe(2 * (rows - 1) * (cols - 1) * 6);
  });

  it('back panel indices are offset by N = rows*cols', () => {
    const N = rows * cols;
    const { indexData, numIndices } = buildIndices(rows, cols, true);
    // Second half of indices should all be ≥ N
    const half = numIndices / 2;
    let backCount = 0;
    for (let i = half; i < numIndices; i++) {
      if (indexData[i] >= N) backCount++;
    }
    expect(backCount).toBe(half); // all back-panel indices are ≥ N
  });

  it('all indices within 2N bounds', () => {
    const N = rows * cols;
    const { indexData, numIndices } = buildIndices(rows, cols, true);
    for (let i = 0; i < numIndices; i++) {
      expect(indexData[i]).toBeLessThan(N * 2);
    }
  });

  it('indices form valid non-degenerate triangles', () => {
    const { indexData, numIndices } = buildIndices(rows, cols, true);
    for (let i = 0; i < numIndices; i += 3) {
      const a = indexData[i], b = indexData[i+1], c = indexData[i+2];
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(a).not.toBe(c);
    }
  });
});

// ---------------------------------------------------------------------------
// buildCapsulesData
// ---------------------------------------------------------------------------

describe('buildCapsulesData', () => {
  it('returns Float32Array of length BODY_CAPSULES.length * 8', () => {
    const data = buildCapsulesData();
    expect(data.length).toBe(BODY_CAPSULES.length * 8);
  });

  it('encodes each capsule: [ax, ay, az, r, bx, by, bz, 0]', () => {
    const data = buildCapsulesData();
    BODY_CAPSULES.forEach((cap, i) => {
      expect(data[i*8    ]).toBeCloseTo(cap.a[0], 5);
      expect(data[i*8 + 1]).toBeCloseTo(cap.a[1], 5);
      expect(data[i*8 + 2]).toBeCloseTo(cap.a[2], 5);
      expect(data[i*8 + 3]).toBeCloseTo(cap.r,    5);
      expect(data[i*8 + 4]).toBeCloseTo(cap.b[0], 5);
      expect(data[i*8 + 5]).toBeCloseTo(cap.b[1], 5);
      expect(data[i*8 + 6]).toBeCloseTo(cap.b[2], 5);
      expect(data[i*8 + 7]).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// writeSimParams
// ---------------------------------------------------------------------------

describe('writeSimParams', () => {
  const mat: Cloth3DMaterialParams = {
    albedo:        [1, 1, 1],
    roughness:     0.5,
    metallic:      0.0,
    opacity:       1.0,
    density:       300,
    stretchWarp:   50,
    stretchWeft:   50,
    bendStiffness: 0.3,
    drape:         0.5,
  };

  function makeBuffers(): { f32: Float32Array; u32: Uint32Array } {
    const ab  = new ArrayBuffer(96);  // 96 bytes = 24 × f32 (extended for XPBD alphaTilde fields)
    return { f32: new Float32Array(ab), u32: new Uint32Array(ab) };
  }

  it('writes dt = (1/60) / SUB_STEPS at slot 0', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    expect(f32[0]).toBeCloseTo((1 / 60) / SUB_STEPS, 8);
  });

  it('writes gravity scaled by density at slot 1', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    const expectedGravity = 9.8 * (0.2 + (mat.density / 600) * 0.8);
    expect(f32[1]).toBeCloseTo(expectedGravity, 4);
  });

  it('writes damping = 0.95 + drape*0.03 at slot 2', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    expect(f32[2]).toBeCloseTo(0.95 + mat.drape * 0.03, 5);
  });

  it('writes stiffH and stiffV at slots 3–4', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    const expectedH = 1 - (mat.stretchWeft / 100) * 0.7;
    const expectedV = 1 - (mat.stretchWarp / 100) * 0.7;
    expect(f32[3]).toBeCloseTo(expectedH, 5);
    expect(f32[4]).toBeCloseTo(expectedV, 5);
  });

  it('writes bendStiffness at slot 5', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    expect(f32[5]).toBeCloseTo(mat.bendStiffness, 5);
  });

  it('writes numParticles, cols, rows, groupCount, groupOffset at u32 slots 6–10', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 7, 3, 10, 20, 200);
    expect(u32[6]).toBe(200);  // numParticles
    expect(u32[7]).toBe(20);   // cols
    expect(u32[8]).toBe(10);   // rows
    expect(u32[9]).toBe(7);    // groupCount
    expect(u32[10]).toBe(3);   // groupOffset
    expect(u32[11]).toBe(0);   // pad
  });

  it('writes wind direction and strength at slots 12–15', () => {
    const { f32, u32 } = makeBuffers();
    const wind: [number, number, number] = [0.5, 0, 0.866];
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200, wind, 15);
    expect(f32[12]).toBeCloseTo(0.5,   5);
    expect(f32[13]).toBeCloseTo(0,     5);
    expect(f32[14]).toBeCloseTo(0.866, 5);
    expect(f32[15]).toBeCloseTo(15,    5);
  });

  it('defaults wind to zero when omitted', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    expect(f32[12]).toBe(0);
    expect(f32[13]).toBe(0);
    expect(f32[14]).toBe(0);
    expect(f32[15]).toBe(0);
  });

  it('gravity is larger for denser material', () => {
    const heavy: Cloth3DMaterialParams = { ...mat, density: 600 };
    const light: Cloth3DMaterialParams = { ...mat, density: 100 };
    const bh = makeBuffers(), bl = makeBuffers();
    writeSimParams(bh.f32, bh.u32, heavy, 1, 0, 4, 4, 16);
    writeSimParams(bl.f32, bl.u32, light, 1, 0, 4, 4, 16);
    expect(bh.f32[1]).toBeGreaterThan(bl.f32[1]);
  });

  it('stiffness is lower for stretchier material', () => {
    const stretchy: Cloth3DMaterialParams = { ...mat, stretchWeft: 100 };
    const stiff: Cloth3DMaterialParams    = { ...mat, stretchWeft: 0   };
    const bs = makeBuffers(), bst = makeBuffers();
    writeSimParams(bs.f32, bs.u32, stretchy, 1, 0, 4, 4, 16);
    writeSimParams(bst.f32, bst.u32, stiff,  1, 0, 4, 4, 16);
    expect(bs.f32[3]).toBeLessThan(bst.f32[3]);
  });

  it('writes alphaTildeH/V/Shear/Bend/Seam at slots 16–20', () => {
    const { f32, u32 } = makeBuffers();
    writeSimParams(f32, u32, mat, 12, 0, 10, 20, 200);
    // alphaTildeH = max(0, 1/(stiffH*0.5) - 2); stiffH = 1 - (50/100)*0.7 = 0.65
    const stiffH = 1 - (mat.stretchWeft / 100) * 0.7;
    const expectedATildeH = Math.max(0, 1 / (stiffH * 0.5) - 2);
    expect(f32[16]).toBeCloseTo(expectedATildeH, 4);
    // seam is always rigid (0)
    expect(f32[20]).toBe(0);
    // stretchy material → larger alphaTilde than stiff
    const stretchy: Cloth3DMaterialParams = { ...mat, stretchWeft: 90 };
    const rigid:    Cloth3DMaterialParams = { ...mat, stretchWeft: 5  };
    const bs = makeBuffers(), br = makeBuffers();
    writeSimParams(bs.f32, bs.u32, stretchy, 1, 0, 4, 4, 16);
    writeSimParams(br.f32, br.u32, rigid,    1, 0, 4, 4, 16);
    expect(bs.f32[16]).toBeGreaterThan(br.f32[16]);
  });
});

// ---------------------------------------------------------------------------
// writeCollideParams
// ---------------------------------------------------------------------------

describe('writeCollideParams', () => {
  function makeBuffers(): { u32: Uint32Array; f32: Float32Array } {
    const ab = new ArrayBuffer(16);
    return { u32: new Uint32Array(ab), f32: new Float32Array(ab) };
  }

  it('writes numParticles at u32[0]', () => {
    const { u32, f32 } = makeBuffers();
    writeCollideParams(u32, f32, 500);
    expect(u32[0]).toBe(500);
  });

  it('writes 0 (pad) at u32[1]', () => {
    const { u32, f32 } = makeBuffers();
    writeCollideParams(u32, f32, 100);
    expect(u32[1]).toBe(0);
  });

  it('writes floor Y = 0.01 at f32[2]', () => {
    const { u32, f32 } = makeBuffers();
    writeCollideParams(u32, f32, 100);
    expect(f32[2]).toBeCloseTo(0.01, 6);
  });

  it('writes 0 at f32[3]', () => {
    const { u32, f32 } = makeBuffers();
    writeCollideParams(u32, f32, 100);
    expect(f32[3]).toBe(0);
  });

  it('handles numParticles = 0', () => {
    const { u32, f32 } = makeBuffers();
    writeCollideParams(u32, f32, 0);
    expect(u32[0]).toBe(0);
  });
});
