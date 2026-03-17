// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createTargetIndicatorElement, updateTargetIndicator } from '../src/renderer/ui/targetIndicator';
import { createOrbitCamera, updateCamera } from '../src/renderer/render/camera';

describe('createTargetIndicatorElement', () => {
  it('creates an HTMLCanvasElement', () => {
    const mainCanvas = document.createElement('canvas');
    const wrapper = document.createElement('div');
    wrapper.appendChild(mainCanvas);
    document.body.appendChild(wrapper);
    const overlay = createTargetIndicatorElement(mainCanvas);
    expect(overlay).toBeInstanceOf(HTMLCanvasElement);
    document.body.removeChild(wrapper);
  });

  it('appends overlay to parent element', () => {
    const mainCanvas = document.createElement('canvas');
    const parent = document.createElement('div');
    parent.appendChild(mainCanvas);
    document.body.appendChild(parent);
    createTargetIndicatorElement(mainCanvas);
    expect(parent.children.length).toBe(2);
    document.body.removeChild(parent);
  });

  it('handles canvas without parent (no error)', () => {
    const mainCanvas = document.createElement('canvas');
    expect(() => createTargetIndicatorElement(mainCanvas)).not.toThrow();
  });
});

describe('updateTargetIndicator', () => {
  it('does nothing when ctx is null', () => {
    const overlay = document.createElement('canvas');
    overlay.getContext = () => null;
    const main = document.createElement('canvas');
    const cam = createOrbitCamera();
    updateCamera(cam);
    expect(() => updateTargetIndicator(overlay, main, cam)).not.toThrow();
  });

  it('does nothing when cam is null', () => {
    const overlay = document.createElement('canvas');
    overlay.width = 100;
    overlay.height = 100;
    const main = document.createElement('canvas');
    expect(() => updateTargetIndicator(overlay, main, null)).not.toThrow();
  });

  it('draws on overlay canvas with valid camera', () => {
    const overlay = document.createElement('canvas');
    overlay.width = 100;
    overlay.height = 100;
    const main = document.createElement('canvas');
    main.width = 100;
    main.height = 100;
    const cam = createOrbitCamera();
    updateCamera(cam);
    expect(() => updateTargetIndicator(overlay, main, cam)).not.toThrow();
  });

  it('resizes overlay to match main canvas', () => {
    const overlay = document.createElement('canvas');
    overlay.width = 50;
    overlay.height = 50;
    const main = document.createElement('canvas');
    main.width = 200;
    main.height = 150;
    const cam = createOrbitCamera();
    updateCamera(cam);
    updateTargetIndicator(overlay, main, cam);
    expect(overlay.width).toBe(200);
    expect(overlay.height).toBe(150);
  });

  it('handles projected point behind camera (not visible)', () => {
    const overlay = document.createElement('canvas');
    overlay.width = 100;
    overlay.height = 100;
    const main = document.createElement('canvas');
    main.width = 100;
    main.height = 100;
    const cam = createOrbitCamera();
    // Zero viewProj → all clips to 0 → invisible
    cam.viewProj.fill(0);
    expect(() => updateTargetIndicator(overlay, main, cam)).not.toThrow();
  });

  it('draws indicator when point is visible', () => {
    const overlay = document.createElement('canvas');
    overlay.width = 400;
    overlay.height = 400;
    const main = document.createElement('canvas');
    main.width = 400;
    main.height = 400;
    const cam = createOrbitCamera(3, [0, 0, 0]);
    updateCamera(cam);
    // viewProj is set by updateCamera, so the origin should be visible
    expect(() => updateTargetIndicator(overlay, main, cam)).not.toThrow();
  });
});
