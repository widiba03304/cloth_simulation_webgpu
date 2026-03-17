// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createGimbalElement, updateGimbal } from '../src/renderer/ui/gimbal';
import { createOrbitCamera, updateCamera } from '../src/renderer/render/camera';

describe('createGimbalElement', () => {
  it('returns an HTMLCanvasElement', () => {
    const el = createGimbalElement();
    expect(el).toBeInstanceOf(HTMLCanvasElement);
  });

  it('has fixed size 80x80', () => {
    const el = createGimbalElement();
    expect(el.width).toBe(80);
    expect(el.height).toBe(80);
  });
});

describe('updateGimbal', () => {
  it('runs without error with null camera', () => {
    const canvas = createGimbalElement();
    canvas.width = 80;
    canvas.height = 80;
    expect(() => updateGimbal(canvas, null)).not.toThrow();
  });

  it('runs without error with a valid camera', () => {
    const canvas = createGimbalElement();
    canvas.width = 80;
    canvas.height = 80;
    const cam = createOrbitCamera();
    updateCamera(cam);
    expect(() => updateGimbal(canvas, cam)).not.toThrow();
  });

  it('draws with various camera angles', () => {
    const canvas = createGimbalElement();
    canvas.width = 80;
    canvas.height = 80;
    const cam = createOrbitCamera();
    for (const theta of [0, Math.PI/4, Math.PI/2, Math.PI]) {
      cam.theta = theta;
      updateCamera(cam);
      expect(() => updateGimbal(canvas, cam)).not.toThrow();
    }
  });
});
