/**
 * Unit tests for simulation params and material presets.
 */

import { describe, it, expect } from 'vitest';
import { getParamsForPreset, DEFAULT_PARAMS } from '../src/renderer/simulation/params';

describe('params', () => {
  it('getParamsForPreset returns object with gravity, stiffness, dt, iterations', () => {
    const p = getParamsForPreset('materials.cotton');
    expect(p).toBeDefined();
    expect(Array.isArray(p.gravity)).toBe(true);
    expect(p.gravity.length).toBe(3);
    expect(typeof p.stiffness).toBe('number');
    expect(typeof p.dt).toBe('number');
    expect(typeof p.iterations).toBe('number');
  });

  it('getParamsForPreset with unknown key returns default params', () => {
    const p = getParamsForPreset('unknown');
    expect(p.gravity).toEqual(DEFAULT_PARAMS.gravity);
    expect(p.stiffness).toBe(DEFAULT_PARAMS.stiffness);
  });

  it('preset cotton has lower stiffness than denim', () => {
    const cotton = getParamsForPreset('materials.cotton');
    const denim = getParamsForPreset('materials.denim');
    expect(cotton.stiffness).toBeLessThan(denim.stiffness);
  });
});
