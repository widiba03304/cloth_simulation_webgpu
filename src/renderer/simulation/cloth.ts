/**
 * Cloth mesh and constraint data. Uses WASM when available; otherwise fallback grid in TS.
 * Does not depend on render or collision; only types and WASM loader.
 */

import type { ClothData, ClothMesh, ClothConstraints } from '../types/simulation';
import type { GridClothBuffers } from '../wasm/loadSimModule';
import type { SamplePattern } from '../samples/patterns';
import {
  loadClothSimModule,
  buildGridClothCounts,
  buildGridCloth,
} from '../wasm/loadSimModule';

/**
 * Build grid cloth via WASM. Returns null if WASM not loaded.
 */
export async function buildGridClothFromWasm(
  nx: number,
  ny: number,
  scale: number,
  wasmBasePath?: string
): Promise<ClothData | null> {
  try {
    const mod = await loadClothSimModule(wasmBasePath);
    const counts = buildGridClothCounts(mod, nx, ny);
    const positions = new Float32Array(counts.numVertices * 3);
    const indices = new Uint32Array(counts.numIndices);
    const structural = new Float32Array(counts.numStructural * 3);
    const shear = new Float32Array(counts.numShear * 3);
    const bend = new Float32Array(counts.numBend * 3);
    buildGridCloth(mod, nx, ny, scale, counts, positions, indices, structural, shear, bend);
    return clothDataFromBuffers({
      positions,
      indices,
      structural,
      shear,
      bend,
    });
  } catch {
    return null;
  }
}

/**
 * Build grid cloth in TS when WASM is unavailable. Same layout as C++ output.
 * nx = columns (width), ny = rows (height). spacing is distance between adjacent particles;
 * physical size is (nx-1)*spacing wide by (ny-1)*spacing tall.
 */
export function buildGridClothTS(nx: number, ny: number, spacing: number): ClothData {
  if (nx < 2) nx = 2;
  if (ny < 2) ny = 2;
  const nv = nx * ny;
  const nq = (nx - 1) * (ny - 1);
  const numIndices = nq * 6;
  const numStructural = (nx - 1) * ny + nx * (ny - 1);
  const numShear = nq * 2;
  const bendH = ny * (nx > 2 ? nx - 2 : 0);
  const bendV = (ny > 2 ? ny - 2 : 0) * nx;
  const numBend = bendH + bendV;

  const scaleX = (nx - 1) * spacing;
  const scaleY = (ny - 1) * spacing;
  const dx = scaleX / (nx - 1);
  const dy = scaleY / (ny - 1);
  const positions = new Float32Array(nv * 3);
  // Start cloth ABOVE the mannequin so it falls down
  // Offset upward to start at mannequin shoulder height + margin
  const yOffset = 0.8; // Start high above mannequin
  const zOffset = 0.3; // Start 30cm in front of body
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = (j * nx + i) * 3;
      positions[idx] = i * dx - scaleX * 0.5;
      positions[idx + 1] = j * dy + yOffset;
      positions[idx + 2] = zOffset;
    }
  }

  const indices = new Uint32Array(numIndices);
  let triIdx = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = j * nx + i;
      const v10 = j * nx + (i + 1);
      const v01 = (j + 1) * nx + i;
      const v11 = (j + 1) * nx + (i + 1);
      indices[triIdx++] = v00;
      indices[triIdx++] = v01;
      indices[triIdx++] = v10;
      indices[triIdx++] = v10;
      indices[triIdx++] = v01;
      indices[triIdx++] = v11;
    }
  }

  const dist = (a: number, b: number) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    return Math.hypot(ax - bx, ay - by, az - bz);
  };

  const structural = new Float32Array(numStructural * 3);
  let sIdx = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = j * nx + (i + 1);
      structural[sIdx++] = a;
      structural[sIdx++] = b;
      structural[sIdx++] = dist(a, b);
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      const b = (j + 1) * nx + i;
      structural[sIdx++] = a;
      structural[sIdx++] = b;
      structural[sIdx++] = dist(a, b);
    }
  }

  const shear = new Float32Array(numShear * 3);
  let shIdx = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = j * nx + i;
      const v11 = (j + 1) * nx + (i + 1);
      const v10 = j * nx + (i + 1);
      const v01 = (j + 1) * nx + i;
      shear[shIdx++] = v00;
      shear[shIdx++] = v11;
      shear[shIdx++] = dist(v00, v11);
      shear[shIdx++] = v10;
      shear[shIdx++] = v01;
      shear[shIdx++] = dist(v10, v01);
    }
  }

  const bend = new Float32Array(numBend * 3);
  let bIdx = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx - 2; i++) {
      const a = j * nx + i;
      const b = j * nx + (i + 2);
      bend[bIdx++] = a;
      bend[bIdx++] = b;
      bend[bIdx++] = dist(a, b);
    }
  }
  for (let j = 0; j < ny - 2; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      const b = (j + 2) * nx + i;
      bend[bIdx++] = a;
      bend[bIdx++] = b;
      bend[bIdx++] = dist(a, b);
    }
  }

  return clothDataFromBuffers({
    positions,
    indices,
    structural,
    shear,
    bend,
  });
}

/**
 * Build cloth and pinned array from a sample pattern. Uses WASM when available.
 */
export async function buildClothFromSamplePattern(
  pattern: SamplePattern,
  wasmBasePath?: string
): Promise<{ cloth: ClothData; pinned: Uint32Array }> {
  const { rows, cols, spacing } = pattern.grid;
  let cloth = await buildGridClothFromWasm(rows, cols, spacing, wasmBasePath);
  if (!cloth) cloth = buildGridClothTS(cols, rows, spacing);
  const nv = cloth.mesh.numVertices;
  const pinned = new Uint32Array(nv);
  if (pattern.pinned === 'topRow') {
    for (let i = 0; i < cols; i++) pinned[i] = 1;
  }
  return { cloth, pinned };
}

function clothDataFromBuffers(b: GridClothBuffers): ClothData {
  const mesh: ClothMesh = {
    positions: b.positions,
    indices: b.indices,
    numVertices: b.positions.length / 3,
    numTriangles: b.indices.length / 3,
  };
  const constraints: ClothConstraints = {
    structural: b.structural,
    shear: b.shear,
    bend: b.bend,
    numStructural: b.structural.length / 3,
    numShear: b.shear.length / 3,
    numBend: b.bend.length / 3,
  };
  return { mesh, constraints };
}
