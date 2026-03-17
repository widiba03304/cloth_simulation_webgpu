import { describe, it, expect } from 'vitest';
import {
  createOrbitCamera,
  updateCamera,
  applyCameraPreset,
  orbitDrag,
  orbitPan,
  orbitZoom,
  orbitRoll,
  getCameraBasis,
} from '../src/renderer/render/camera';

describe('createOrbitCamera', () => {
  it('creates camera with default values', () => {
    const cam = createOrbitCamera();
    expect(cam.distance).toBe(3);
    expect(cam.target).toEqual([0, 0, 0]);
    expect(cam.theta).toBe(0);
    expect(cam.phi).toBeCloseTo(0.25);
    expect(cam.roll).toBe(0);
    expect(cam.fov).toBeCloseTo(Math.PI / 4);
    expect(cam.near).toBe(0.1);
    expect(cam.far).toBe(100);
    expect(cam.aspect).toBe(1);
    expect(cam.orbitPivot).toBeNull();
    expect(cam.viewProj).toHaveLength(16);
    expect(cam.proj).toHaveLength(16);
  });

  it('creates camera with custom distance and target', () => {
    const cam = createOrbitCamera(5, [1, 2, 3]);
    expect(cam.distance).toBe(5);
    expect(cam.target).toEqual([1, 2, 3]);
  });

  it('does not share target array', () => {
    const t: [number, number, number] = [1, 0, 0];
    const cam = createOrbitCamera(3, t);
    t[0] = 99;
    expect(cam.target[0]).toBe(1);
  });
});

describe('updateCamera', () => {
  it('fills viewProj with non-zero values', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const nonZero = cam.viewProj.some(v => v !== 0);
    expect(nonZero).toBe(true);
  });

  it('uses perspective projection by default', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    // Perspective: m[15] should be 0
    expect(cam.proj[15]).toBe(0);
  });

  it('uses orthographic projection when cam.orthographic = true', () => {
    const cam = createOrbitCamera();
    cam.orthographic = true;
    updateCamera(cam);
    // Orthographic: m[15] should be 1
    expect(cam.proj[15]).toBe(1);
  });

  it('uses custom orthoScale', () => {
    const cam = createOrbitCamera();
    cam.orthographic = true;
    cam.orthoScale = 2;
    updateCamera(cam);
    expect(cam.proj[15]).toBe(1);
  });

  it('applies roll rotation', () => {
    const cam = createOrbitCamera();
    const camNoRoll = createOrbitCamera();
    cam.roll = Math.PI / 6;
    updateCamera(cam);
    updateCamera(camNoRoll);
    // viewProj should differ when roll is applied
    let differs = false;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(cam.viewProj[i] - camNoRoll.viewProj[i]) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('handles orbitPivot as the look-at center', () => {
    const cam = createOrbitCamera();
    cam.orbitPivot = [1, 1, 1];
    updateCamera(cam);
    const nonZero = cam.viewProj.some(v => v !== 0);
    expect(nonZero).toBe(true);
  });

  it('handles invalid aspect ratio gracefully', () => {
    const cam = createOrbitCamera();
    cam.aspect = 0;
    expect(() => updateCamera(cam)).not.toThrow();
    cam.aspect = -1;
    expect(() => updateCamera(cam)).not.toThrow();
    cam.aspect = NaN;
    expect(() => updateCamera(cam)).not.toThrow();
  });

  it('top-down view (phi = π/2) does not produce NaN', () => {
    const cam = createOrbitCamera();
    cam.phi = Math.PI / 2 - 1e-5;
    cam.theta = 0;
    updateCamera(cam);
    for (const v of cam.viewProj) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('looking straight down (phi=π/2) stable right vector - f1<0 branch (lines 148-149)', () => {
    // phi=π/2 → eye=(tx, ty+d, tz) → forward=(0,-1,0) → rlen=0 → f1<0 → rx=1
    const cam = createOrbitCamera();
    cam.phi = Math.PI / 2;
    cam.theta = 0;
    updateCamera(cam);
    for (const v of cam.viewProj) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('looking straight up (phi=-π/2) stable right vector - f1>0 branch (lines 150-152)', () => {
    // phi=-π/2 → eye=(tx, ty-d, tz) → forward=(0,+1,0) → rlen=0 → f1>0 → rx=-1
    const cam = createOrbitCamera();
    cam.phi = -Math.PI / 2;
    cam.theta = 0;
    updateCamera(cam);
    for (const v of cam.viewProj) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('distance=0 (eye===target) triggers || 1 fallbacks in viewMatrix (lines 134,163)', () => {
    const cam = createOrbitCamera();
    cam.distance = 0; // eye===target → forward=(0,0,0) → flen=0 → || 1 used
    updateCamera(cam);
    for (const v of cam.viewProj) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('applyCameraPreset', () => {
  it('front preset sets theta=0, phi=0', () => {
    const cam = createOrbitCamera();
    applyCameraPreset(cam, 'front');
    expect(cam.theta).toBe(0);
    expect(cam.phi).toBe(0);
    expect(cam.roll).toBe(0);
  });

  it('back preset sets theta=π', () => {
    const cam = createOrbitCamera();
    applyCameraPreset(cam, 'back');
    expect(cam.theta).toBeCloseTo(Math.PI);
    expect(cam.phi).toBe(0);
  });

  it('left preset sets theta=-π/2', () => {
    const cam = createOrbitCamera();
    applyCameraPreset(cam, 'left');
    expect(cam.theta).toBeCloseTo(-Math.PI / 2);
  });

  it('right preset sets theta=π/2', () => {
    const cam = createOrbitCamera();
    applyCameraPreset(cam, 'right');
    expect(cam.theta).toBeCloseTo(Math.PI / 2);
  });

  it('top preset sets phi near π/2', () => {
    const cam = createOrbitCamera();
    applyCameraPreset(cam, 'top');
    expect(cam.phi).toBeGreaterThan(Math.PI / 2 - 0.01);
  });

  it('resets roll to 0 for all presets', () => {
    const presets = ['front', 'back', 'left', 'right', 'top'] as const;
    for (const p of presets) {
      const cam = createOrbitCamera();
      cam.roll = 1;
      applyCameraPreset(cam, p);
      expect(cam.roll).toBe(0);
    }
  });
});

describe('orbitDrag', () => {
  it('increases theta with positive deltaX', () => {
    const cam = createOrbitCamera();
    const initial = cam.theta;
    orbitDrag(cam, 10, 0);
    expect(cam.theta).toBeGreaterThan(initial);
  });

  it('increases phi with positive deltaY', () => {
    const cam = createOrbitCamera();
    orbitDrag(cam, 0, 10);
    expect(cam.phi).toBeGreaterThan(0.25); // initial phi is 0.25
  });

  it('clamps phi to ±(π/2 - ε)', () => {
    const cam = createOrbitCamera();
    orbitDrag(cam, 0, 100000);
    expect(cam.phi).toBeLessThan(Math.PI / 2);
    orbitDrag(cam, 0, -100000);
    expect(cam.phi).toBeGreaterThan(-Math.PI / 2);
  });

  it('resets roll to 0', () => {
    const cam = createOrbitCamera();
    cam.roll = 1;
    orbitDrag(cam, 0, 0);
    expect(cam.roll).toBe(0);
  });
});

describe('orbitPan', () => {
  it('moves target when no orbitPivot', () => {
    const cam = createOrbitCamera();
    const t0 = [...cam.target];
    orbitPan(cam, 100, 0);
    const moved = cam.target.some((v, i) => Math.abs(v - (t0[i] ?? 0)) > 1e-9);
    expect(moved).toBe(true);
  });

  it('does NOT move target when orbitPivot is set', () => {
    const cam = createOrbitCamera();
    cam.orbitPivot = [0, 0, 0];
    const t0 = [...cam.target];
    orbitPan(cam, 100, 0);
    expect(cam.target).toEqual(t0);
  });
});

describe('orbitZoom', () => {
  it('increases distance on positive delta', () => {
    const cam = createOrbitCamera();
    const d0 = cam.distance;
    orbitZoom(cam, 1000);
    expect(cam.distance).toBeGreaterThan(d0);
  });

  it('decreases distance on negative delta', () => {
    const cam = createOrbitCamera();
    const d0 = cam.distance;
    orbitZoom(cam, -1000);
    expect(cam.distance).toBeLessThan(d0);
  });

  it('clamps distance to [0.5, 20]', () => {
    const cam = createOrbitCamera();
    orbitZoom(cam, 1e9);
    expect(cam.distance).toBe(20);
    orbitZoom(cam, -1e9);
    expect(cam.distance).toBe(0.5);
  });
});

describe('orbitRoll', () => {
  it('increases roll', () => {
    const cam = createOrbitCamera();
    orbitRoll(cam, 100);
    expect(cam.roll).toBeGreaterThan(0);
  });

  it('decreases roll with negative delta', () => {
    const cam = createOrbitCamera();
    orbitRoll(cam, -100);
    expect(cam.roll).toBeLessThan(0);
  });
});

describe('getCameraBasis', () => {
  it('returns unit vectors (no roll)', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const { right, up, forward } = getCameraBasis(cam);
    const len = (v: number[]) => Math.hypot(...v);
    expect(len(right)).toBeCloseTo(1);
    expect(len(up)).toBeCloseTo(1);
    expect(len(forward)).toBeCloseTo(1);
  });

  it('returns unit vectors with roll applied', () => {
    const cam = createOrbitCamera();
    cam.roll = Math.PI / 4;
    const { right, up, forward } = getCameraBasis(cam);
    const len = (v: number[]) => Math.hypot(...v);
    expect(len(right)).toBeCloseTo(1);
    expect(len(up)).toBeCloseTo(1);
    expect(len(forward)).toBeCloseTo(1);
  });

  it('right, up, forward are mutually orthogonal', () => {
    const cam = createOrbitCamera();
    const { right, up, forward } = getCameraBasis(cam);
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(Math.abs(dot(right, up))).toBeLessThan(1e-6);
    expect(Math.abs(dot(right, forward))).toBeLessThan(1e-6);
    expect(Math.abs(dot(up, forward))).toBeLessThan(1e-6);
  });

  it('getCameraBasis with distance=0 covers || 1 fallbacks (lines 288,296,303)', () => {
    const cam = createOrbitCamera(0); // distance=0 → all forward components zero
    const { right, up, forward } = getCameraBasis(cam);
    expect(right.every(Number.isFinite)).toBe(true);
    expect(up.every(Number.isFinite)).toBe(true);
    expect(forward.every(Number.isFinite)).toBe(true);
  });
});
