/**
 * Mannequin body: load SMPL mesh (OBJ) when available, else fallback to simple cylinder + sphere.
 * SMPL OBJ can be exported from smpl/smpl_webuser/hello_world (neutral pose) to
 * src/renderer/assets/samples/avatars/mannequin.obj.
 */

import { parseObj } from './loadObj';

export interface BodyMesh {
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array; // Optional smooth vertex normals
}

export interface BodyScale {
  height: number;  // Y-axis scale (1.0 = normal)
  width: number;   // X-axis scale (1.0 = normal)
  depth: number;   // Z-axis scale (1.0 = normal)
}

const SMPL_MALE_OBJ_URL = new URL('../assets/samples/avatars/mannequin_male.obj', import.meta.url).href;
const SMPL_FEMALE_OBJ_URL = new URL('../assets/samples/avatars/mannequin_female.obj', import.meta.url).href;

/** Scale SMPL mesh so feet are at origin (0,0,0), height ~1.2, centered in XZ. */
function scaleAndCenterSMPL(positions: Float32Array): Float32Array {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const spanY = maxY - minY || 1;
  const targetHeight = 1.2;
  const scale = targetHeight / spanY;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i]! - cx) * scale;
    out[i + 1] = (positions[i + 1]! - minY) * scale;
    out[i + 2] = (positions[i + 2]! - cz) * scale;
  }
  return out;
}

async function loadOneSMPL(url: string): Promise<BodyMesh | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const mesh = parseObj(text);
    if (mesh.positions.length < 9 || mesh.indices.length < 3) return null;
    mesh.positions = scaleAndCenterSMPL(mesh.positions);

    // Use OBJ normals if available, otherwise calculate them
    if (!mesh.normals) {
      console.log('OBJ has no normals, calculating smooth normals');
      mesh.normals = calculateSmoothNormals(mesh.positions, mesh.indices);
    } else {
      console.log('Using OBJ normals directly (no modification)');
      // Normals from OBJ are already correct - don't modify them
      // (uniform scaling doesn't affect normalized normals)
    }

    return mesh;
  } catch {
    return null;
  }
}

/**
 * Load both male and female SMPL mannequins from OBJ. Missing ones are replaced with fallback mesh.
 */
export async function loadSMPLMannequins(): Promise<{ male: BodyMesh; female: BodyMesh }> {
  const [male, female] = await Promise.all([
    loadOneSMPL(SMPL_MALE_OBJ_URL),
    loadOneSMPL(SMPL_FEMALE_OBJ_URL),
  ]);
  const fallback = buildMannequinMesh();
  return {
    male: male ?? fallback,
    female: female ?? fallback,
  };
}

/**
 * Try to load a single SMPL mannequin from OBJ (legacy). Returns null on failure.
 */
export async function loadSMPLMannequin(): Promise<BodyMesh | null> {
  return loadOneSMPL(SMPL_MALE_OBJ_URL);
}

/**
 * Simple fallback mannequin: cylinder (torso) + sphere (head).
 * Feet at origin (0, 0, 0); torso Y in [0, 1], head on top.
 */
export function buildMannequinMesh(): BodyMesh {
  const torsoRadius = 0.35;
  const torsoY0 = 0;
  const torsoY1 = 1.0;
  const headCenterY = 1.2;
  const headRadius = 0.22;
  const torsoSegments = 16;
  const headSegments = 12;

  const positions: number[] = [];
  const indices: number[] = [];

  // Cylinder torso: two rings at y0 and y1
  for (let ring = 0; ring <= 1; ring++) {
    const y = ring === 0 ? torsoY0 : torsoY1;
    for (let i = 0; i < torsoSegments; i++) {
      const t = (i / torsoSegments) * Math.PI * 2;
      positions.push(Math.cos(t) * torsoRadius, y, Math.sin(t) * torsoRadius);
    }
  }
  for (let i = 0; i < torsoSegments; i++) {
    const i2 = (i + 1) % torsoSegments;
    const a = i;
    const b = i + torsoSegments;
    const c = i2;
    const d = i2 + torsoSegments;
    indices.push(a, b, c, c, b, d);
  }

  const torsoVertices = positions.length / 3;

  // Sphere head
  const cx = 0;
  const cy = headCenterY;
  const cz = 0;
  for (let j = 0; j <= headSegments; j++) {
    const v = j / headSegments;
    const phi = v * Math.PI;
    const y = cy + headRadius * Math.cos(phi);
    const r = headRadius * Math.sin(phi);
    for (let i = 0; i <= headSegments; i++) {
      const u = i / headSegments;
      const theta = u * Math.PI * 2;
      positions.push(cx + r * Math.cos(theta), y, cz + r * Math.sin(theta));
    }
  }
  const headRingSize = headSegments + 1;
  for (let j = 0; j < headSegments; j++) {
    for (let i = 0; i < headSegments; i++) {
      const a = torsoVertices + j * headRingSize + i;
      const b = torsoVertices + (j + 1) * headRingSize + i;
      const c = torsoVertices + j * headRingSize + (i + 1);
      const d = torsoVertices + (j + 1) * headRingSize + (i + 1);
      indices.push(a, b, c, c, b, d);
    }
  }

  const positionsArray = new Float32Array(positions);
  const indicesArray = new Uint32Array(indices);
  const normals = calculateSmoothNormals(positionsArray, indicesArray);

  return {
    positions: positionsArray,
    indices: indicesArray,
    normals,
  } as BodyMesh;
}

/**
 * Apply body scale parameters to a mesh. Returns a new mesh with scaled positions.
 * Scale is applied from the origin (feet at 0,0,0).
 */
export function applyBodyScale(mesh: BodyMesh, scale: BodyScale): BodyMesh {
  const scaledPositions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    scaledPositions[i] = mesh.positions[i]! * scale.width;      // X
    scaledPositions[i + 1] = mesh.positions[i + 1]! * scale.height; // Y
    scaledPositions[i + 2] = mesh.positions[i + 2]! * scale.depth;  // Z
  }
  return {
    positions: scaledPositions,
    indices: mesh.indices, // Indices don't change
    normals: mesh.normals, // Normals don't change with uniform scaling
  };
}

/**
 * Calculate smooth vertex normals: area-weighted average of face normals (no flip by centroid).
 * Degenerate sum: use equal-weight average of adjacent face normals. One pass of neighbor smoothing applied.
 */
export function calculateSmoothNormals(
  positions: Float32Array,
  indices: Uint32Array,
  _sigmaRange?: number
): Float32Array {
  const numVertices = positions.length / 3;
  const numFaces = indices.length / 3;

  const faceNormals = new Float32Array(numFaces * 3);
  const faceAreas = new Float32Array(numFaces);
  for (let i = 0; i < numFaces; i++) {
    const i0 = indices[i * 3]!;
    const i1 = indices[i * 3 + 1]!;
    const i2 = indices[i * 3 + 2]!;

    const v0x = positions[i0 * 3]!;
    const v0y = positions[i0 * 3 + 1]!;
    const v0z = positions[i0 * 3 + 2]!;
    const v1x = positions[i1 * 3]!;
    const v1y = positions[i1 * 3 + 1]!;
    const v1z = positions[i1 * 3 + 2]!;
    const v2x = positions[i2 * 3]!;
    const v2y = positions[i2 * 3 + 1]!;
    const v2z = positions[i2 * 3 + 2]!;

    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;
    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const area = Math.max(0, len * 0.5);
    faceAreas[i] = area;
    if (len > 1e-10) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    faceNormals[i * 3] = nx;
    faceNormals[i * 3 + 1] = ny;
    faceNormals[i * 3 + 2] = nz;
  }

  const vertexFaces: number[][] = Array.from({ length: numVertices }, () => []);
  for (let i = 0; i < numFaces; i++) {
    vertexFaces[indices[i * 3]!]!.push(i);
    vertexFaces[indices[i * 3 + 1]!]!.push(i);
    vertexFaces[indices[i * 3 + 2]!]!.push(i);
  }

  const normals = new Float32Array(positions.length);
  const eps = 1e-10;
  for (let v = 0; v < numVertices; v++) {
    normals[v * 3] = 0;
    normals[v * 3 + 1] = 1;
    normals[v * 3 + 2] = 0;
  }

  for (let v = 0; v < numVertices; v++) {
    const faces = vertexFaces[v]!;
    if (faces.length === 0) continue;

    let accNx = 0, accNy = 0, accNz = 0;
    let eqNx = 0, eqNy = 0, eqNz = 0;
    let eqCount = 0;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i]!;
      const a = faceAreas[f]!;
      const fnx = faceNormals[f * 3]!;
      const fny = faceNormals[f * 3 + 1]!;
      const fnz = faceNormals[f * 3 + 2]!;
      if (a > eps) {
        accNx += fnx * a;
        accNy += fny * a;
        accNz += fnz * a;
      }
      eqNx += fnx;
      eqNy += fny;
      eqNz += fnz;
      eqCount++;
    }

    let len = Math.sqrt(accNx * accNx + accNy * accNy + accNz * accNz);
    if (len <= 0.0001 && eqCount > 0) {
      len = Math.sqrt(eqNx * eqNx + eqNy * eqNy + eqNz * eqNz);
      if (len > 0.0001) {
        accNx = eqNx;
        accNy = eqNy;
        accNz = eqNz;
      }
    }
    if (len > 0.0001) {
      normals[v * 3] = accNx / len;
      normals[v * 3 + 1] = accNy / len;
      normals[v * 3 + 2] = accNz / len;
    }
  }

  // One pass of neighbor smoothing to soften jagged boundaries between patches
  const vertexNeighbors: number[][] = Array.from({ length: numVertices }, () => []);
  for (let i = 0; i < numFaces; i++) {
    const a = indices[i * 3]!;
    const b = indices[i * 3 + 1]!;
    const c = indices[i * 3 + 2]!;
    const add = (u: number, v: number) => {
      if (!vertexNeighbors[u]!.includes(v)) vertexNeighbors[u]!.push(v);
    };
    add(a, b); add(a, c);
    add(b, a); add(b, c);
    add(c, a); add(c, b);
  }
  const smoothed = new Float32Array(normals.length);
  smoothed.set(normals);
  for (let v = 0; v < numVertices; v++) {
    const nb = vertexNeighbors[v]!;
    let sx = normals[v * 3]!;
    let sy = normals[v * 3 + 1]!;
    let sz = normals[v * 3 + 2]!;
    for (let i = 0; i < nb.length; i++) {
      const u = nb[i]!;
      sx += normals[u * 3]!;
      sy += normals[u * 3 + 1]!;
      sz += normals[u * 3 + 2]!;
    }
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len > 0.0001) {
      smoothed[v * 3] = sx / len;
      smoothed[v * 3 + 1] = sy / len;
      smoothed[v * 3 + 2] = sz / len;
    }
  }
  return smoothed;
}
