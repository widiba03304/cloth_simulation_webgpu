/**
 * Simulation parameters and material presets.
 * Maps to uniform buffer and WGSL.
 */

import type { SimulationParams } from '../types/simulation';

export const DEFAULT_PARAMS: SimulationParams = {
  gravity: [0, -9.81, 0],
  stiffness: 800,
  shearStiffness: 400,
  bendStiffness: 100,
  damping: 0.02,
  mass: 0.1,
  dt: 1 / 60,
  iterations: 4,
};

/** Material presets for designer dropdown (names are i18n keys). */
export const MATERIAL_PRESETS: Record<string, Partial<SimulationParams>> = {
  'materials.cotton': {
    stiffness: 600,
    shearStiffness: 300,
    bendStiffness: 80,
    damping: 0.03,
    mass: 0.12,
  },
  'materials.silk': {
    stiffness: 400,
    shearStiffness: 200,
    bendStiffness: 40,
    damping: 0.01,
    mass: 0.05,
  },
  'materials.denim': {
    stiffness: 1200,
    shearStiffness: 600,
    bendStiffness: 150,
    damping: 0.04,
    mass: 0.2,
  },
  'materials.canvas': {
    stiffness: 1500,
    shearStiffness: 800,
    bendStiffness: 200,
    damping: 0.05,
    mass: 0.25,
  },
  'materials.chiffon': {
    stiffness: 200,
    shearStiffness: 100,
    bendStiffness: 20,
    damping: 0.005,
    mass: 0.03,
  },
};

export function getParamsForPreset(presetKey: string): SimulationParams {
  const base = { ...DEFAULT_PARAMS };
  const preset = MATERIAL_PRESETS[presetKey];
  if (preset) {
    Object.assign(base, preset);
  }
  return base;
}
