/**
 * Unit tests for cloth grid building (TS fallback).
 */

import { describe, it, expect } from 'vitest';
import { buildGridClothTS } from '../src/renderer/simulation/cloth';

describe('cloth', () => {
  it('buildGridClothTS produces correct vertex count', () => {
    const cloth = buildGridClothTS(10, 10, 1);
    expect(cloth.mesh.numVertices).toBe(100);
    expect(cloth.mesh.positions.length).toBe(300);
  });

  it('buildGridClothTS produces correct triangle count', () => {
    const cloth = buildGridClothTS(5, 4, 1);
    const quads = (5 - 1) * (4 - 1);
    expect(cloth.mesh.numTriangles).toBe(quads * 2);
    expect(cloth.mesh.indices.length).toBe(quads * 6);
  });

  it('buildGridClothTS structural constraint count', () => {
    const cloth = buildGridClothTS(4, 4, 1);
    const nx = 4;
    const ny = 4;
    const expectedStructural = (nx - 1) * ny + nx * (ny - 1);
    expect(cloth.constraints.numStructural).toBe(expectedStructural);
  });

  it('buildGridClothTS clamps nx,ny to at least 2', () => {
    const cloth = buildGridClothTS(1, 1, 1);
    expect(cloth.mesh.numVertices).toBeGreaterThanOrEqual(4);
  });
});
