/**
 * Real SMPL blend shapes using actual shapedirs from SMPL models.
 * Formula: v = v_template + Σ(beta_i × shapedirs[:,:,i])
 */

import type { BodyMesh } from './bodyMesh';
import { calculateSmoothNormals } from './bodyMesh';

export interface SMPLBetas {
  beta0: number;  // Body weight/build
  beta1: number;  // Body proportions
  beta2: number;  // Height
  beta3: number;  // Body shape
  beta4: number;  // Shoulder width
  beta5: number;  // Hip width
  beta6: number;  // Chest depth
  beta7: number;  // Neck length
  beta8: number;  // Arm length
  beta9: number;  // Leg length
}

export interface SMPLShapeData {
  num_vertices: number;
  num_faces: number;
  num_betas: number;
  v_template: number[];     // Flattened (num_vertices * 3)
  faces: number[];          // Flattened (num_faces * 3)
  shapedirs: number[][];    // [num_betas][num_vertices * 3]
}

let maleShapeData: SMPLShapeData | null = null;
let femaleShapeData: SMPLShapeData | null = null;

const MALE_SHAPEDIRS_URL = new URL('../assets/samples/avatars/smpl_male_shapedirs.json', import.meta.url).href;
const FEMALE_SHAPEDIRS_URL = new URL('../assets/samples/avatars/smpl_female_shapedirs.json', import.meta.url).href;

/**
 * Load SMPL shape blend shape data for both genders.
 */
export async function loadSMPLShapeData(): Promise<{ male: SMPLShapeData | null; female: SMPLShapeData | null }> {
  const [male, female] = await Promise.all([
    fetch(MALE_SHAPEDIRS_URL)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null),
    fetch(FEMALE_SHAPEDIRS_URL)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null),
  ]);

  maleShapeData = male;
  femaleShapeData = female;

  return { male, female };
}

/**
 * Apply SMPL blend shapes using the real shapedirs.
 * Formula: v = v_template + Σ(beta_i × shapedirs[:,:,i])
 */
export function applySMPLBlendShapes(
  shapeData: SMPLShapeData,
  betas: number[]
): BodyMesh {
  const numVertices = shapeData.num_vertices;
  const numBetas = Math.min(betas.length, shapeData.num_betas);

  // Start with base template
  const positions = new Float32Array(shapeData.v_template);

  // Add weighted blend shapes
  for (let beta_i = 0; beta_i < numBetas; beta_i++) {
    const weight = betas[beta_i]!;
    if (Math.abs(weight) < 0.001) continue; // Skip near-zero weights

    const shapedir = shapeData.shapedirs[beta_i]!;

    for (let v = 0; v < numVertices; v++) {
      const idx = v * 3;
      positions[idx] += weight * shapedir[idx]!;       // x
      positions[idx + 1] += weight * shapedir[idx + 1]!; // y
      positions[idx + 2] += weight * shapedir[idx + 2]!; // z
    }
  }

  return {
    positions,
    indices: new Uint32Array(shapeData.faces),
  };
}

/**
 * Apply SMPL blend shapes with normalization and scaling to match renderer scale.
 * SMPL meshes need to be scaled so feet are at y=0, height ≈ 1.2, centered in XZ.
 */
export function applySMPLBlendShapesScaled(
  shapeData: SMPLShapeData,
  betas: number[],
  smoothingSigma: number = 10.0
): BodyMesh {
  const mesh = applySMPLBlendShapes(shapeData, betas);

  // Normalize to renderer coordinate system
  const positions = scaleAndCenterSMPL(mesh.positions);

  // Calculate smooth vertex normals with configurable smoothing
  const normals = calculateSmoothNormals(positions, mesh.indices, smoothingSigma);

  return {
    positions,
    indices: mesh.indices,
    normals,
  };
}

/**
 * Compute scaling parameters for SMPL mesh normalization.
 */
export function computeSMPLScaleParams(positions: Float32Array): {
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
} {
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

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

  return {
    scale,
    offsetX: cx,
    offsetY: minY,
    offsetZ: cz,
  };
}

/**
 * Scale SMPL mesh so feet are at origin (0,0,0), height ~1.2, centered in XZ.
 * Same normalization as bodyMesh.ts uses for OBJ loading.
 */
function scaleAndCenterSMPL(positions: Float32Array): Float32Array {
  const { scale, offsetX, offsetY, offsetZ } = computeSMPLScaleParams(positions);

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i]! - offsetX) * scale;
    out[i + 1] = (positions[i + 1]! - offsetY) * scale;
    out[i + 2] = (positions[i + 2]! - offsetZ) * scale;
  }

  return out;
}

/**
 * Convert SMPLBetas object to array for blend shape application.
 */
export function betasToArray(betas: SMPLBetas): number[] {
  return [
    betas.beta0,
    betas.beta1,
    betas.beta2,
    betas.beta3,
    betas.beta4,
    betas.beta5,
    betas.beta6,
    betas.beta7,
    betas.beta8,
    betas.beta9,
  ];
}

/**
 * Predefined shape presets using real SMPL betas.
 * These values are based on SMPL literature and empirical testing.
 */
export const SMPL_SHAPE_PRESETS: Record<string, SMPLBetas> = {
  neutral: {
    beta0: 0, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  thin: {
    beta0: -2.0, beta1: -1.5, beta2: 0, beta3: 0, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  heavy: {
    beta0: 2.5, beta1: 2.0, beta2: 0, beta3: 0, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  muscular: {
    beta0: 1.0, beta1: 2.0, beta2: 0.5, beta3: 0, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  tall: {
    beta0: 0, beta1: 0, beta2: 2.0, beta3: 1.5, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  short: {
    beta0: 0, beta1: 0, beta2: -2.0, beta3: -1.5, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
  athletic: {
    beta0: 0.5, beta1: 1.5, beta2: 0.5, beta3: 0, beta4: 1.0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  },
};

/**
 * Get loaded shape data for a given gender.
 */
export function getShapeData(gender: 'male' | 'female'): SMPLShapeData | null {
  return gender === 'male' ? maleShapeData : femaleShapeData;
}

/**
 * Convert betas to a readable string for UI display.
 */
export function betasToString(betas: SMPLBetas): string {
  const values = betasToArray(betas);
  const nonZero = values.filter(v => Math.abs(v) > 0.1);
  if (nonZero.length === 0) return 'Neutral';

  return values
    .map((v, i) => Math.abs(v) > 0.1 ? `β${i}:${v.toFixed(1)}` : null)
    .filter(Boolean)
    .join(', ');
}

/**
 * Apply SMPL blend shapes and return both unscaled and scaled meshes.
 * The unscaled mesh is needed for IK joint position computation.
 */
export function applySMPLBlendShapesWithUnscaled(
  shapeData: SMPLShapeData,
  betas: number[],
  smoothingSigma: number = 10.0
): { scaled: BodyMesh; unscaled: Float32Array } {
  const mesh = applySMPLBlendShapes(shapeData, betas);
  const unscaled = new Float32Array(mesh.positions); // Copy unscaled positions

  // Normalize to renderer coordinate system
  const positions = scaleAndCenterSMPL(mesh.positions);

  // Calculate smooth vertex normals with configurable smoothing
  const normals = calculateSmoothNormals(positions, mesh.indices, smoothingSigma);

  return {
    scaled: {
      positions,
      indices: mesh.indices,
      normals,
    },
    unscaled,
  };
}
