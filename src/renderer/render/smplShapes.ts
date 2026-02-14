/**
 * Simple SMPL-inspired shape parameters.
 * Uses basic morphing instead of full SMPL blend shapes.
 *
 * For full SMPL blend shapes, pre-generate meshes with different betas
 * using the Python script in smpl/generate_shape_presets.py
 */

import type { BodyMesh } from './bodyMesh';

export interface SMPLBetas {
  weight: number;   // -2 (thin) to +2 (heavy)
  height: number;   // -2 (short) to +2 (tall)
  muscle: number;   // -2 (slim) to +2 (muscular)
  chest: number;    // -2 (narrow) to +2 (broad)
}

/**
 * Apply simple shape transformations to approximate SMPL blend shapes.
 * This is a simplified version - for accurate results, use pre-generated SMPL meshes.
 */
export function applySMPLBetas(mesh: BodyMesh, betas: SMPLBetas): BodyMesh {
  const scaledPositions = new Float32Array(mesh.positions.length);

  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!;
    const y = mesh.positions[i + 1]!;
    const z = mesh.positions[i + 2]!;

    // Normalize y to [0, 1] assuming feet at y=0, top of head at y≈1.2
    const normalizedY = y / 1.2;

    // Weight: affects X and Z more in torso region
    const weightFactorX = 1 + betas.weight * 0.15 * (1 - Math.abs(normalizedY - 0.5) * 0.5);
    const weightFactorZ = 1 + betas.weight * 0.12 * (1 - Math.abs(normalizedY - 0.5) * 0.5);

    // Height: affects Y uniformly
    const heightFactor = 1 + betas.height * 0.12;

    // Muscle: affects limbs and torso width/depth
    const distFromCenter = Math.hypot(x, z);
    const muscleFactor = 1 + betas.muscle * 0.08 * Math.min(distFromCenter / 0.3, 1);

    // Chest: affects upper body width (y > 0.5)
    const chestFactor = normalizedY > 0.4 ? 1 + betas.chest * 0.1 * (normalizedY - 0.4) : 1;

    scaledPositions[i] = x * weightFactorX * muscleFactor * chestFactor;
    scaledPositions[i + 1] = y * heightFactor;
    scaledPositions[i + 2] = z * weightFactorZ * muscleFactor;
  }

  return {
    positions: scaledPositions,
    indices: mesh.indices,
  };
}

/**
 * Convert SMPLBetas to a readable string for UI display.
 */
export function betasToString(betas: SMPLBetas): string {
  const parts: string[] = [];
  if (Math.abs(betas.weight) > 0.1) parts.push(`Weight: ${betas.weight > 0 ? 'heavy' : 'thin'}`);
  if (Math.abs(betas.height) > 0.1) parts.push(`Height: ${betas.height > 0 ? 'tall' : 'short'}`);
  if (Math.abs(betas.muscle) > 0.1) parts.push(`Muscle: ${betas.muscle > 0 ? 'muscular' : 'slim'}`);
  if (Math.abs(betas.chest) > 0.1) parts.push(`Chest: ${betas.chest > 0 ? 'broad' : 'narrow'}`);
  return parts.length > 0 ? parts.join(', ') : 'Neutral';
}

/**
 * Predefined shape presets.
 */
export const SHAPE_PRESETS: Record<string, SMPLBetas> = {
  neutral: { weight: 0, height: 0, muscle: 0, chest: 0 },
  thin: { weight: -1.5, height: 0, muscle: -0.5, chest: -0.5 },
  athletic: { weight: 0, height: 0.5, muscle: 1.5, chest: 1.0 },
  heavy: { weight: 2.0, height: 0, muscle: 0.5, chest: 1.0 },
  tall: { weight: 0, height: 2.0, muscle: 0, chest: 0 },
  short: { weight: 0, height: -1.5, muscle: 0, chest: 0 },
  muscular: { weight: 0.5, height: 0.5, muscle: 2.0, chest: 1.5 },
};
