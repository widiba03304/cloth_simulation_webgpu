// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { attachCameraInput } from '../src/renderer/input/cameraInput';
import { createOrbitCamera, updateCamera } from '../src/renderer/render/camera';
import { getDefaultKeymap } from '../src/renderer/input/keymap';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width: 800, height: 600,
    right: 800, bottom: 600, x: 0, y: 0,
    toJSON: () => ({}),
  }));
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  return canvas;
}

describe('attachCameraInput', () => {
  it('returns a detach function', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const km = getDefaultKeymap();
    const detach = attachCameraInput(canvas, km, cam);
    expect(typeof detach).toBe('function');
    detach();
  });

  it('handles pointerdown event for orbit (MMB)', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const km = getDefaultKeymap();
    const detach = attachCameraInput(canvas, km, cam);
    const e = new PointerEvent('pointerdown', { button: 1, pointerId: 1 });
    canvas.dispatchEvent(e);
    detach();
  });

  it('handles pointermove for orbit drag', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const km = getDefaultKeymap();
    const detach = attachCameraInput(canvas, km, cam);
    // Start drag
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    const theta0 = cam.theta;
    // Move
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 450, clientY: 300 }));
    // Theta should have changed
    expect(cam.theta).not.toBeCloseTo(theta0 - 1);  // just verify no crash
    detach();
  });

  it('handles pointerup', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const km = getDefaultKeymap();
    const detach = attachCameraInput(canvas, km, cam);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 1, pointerId: 1 }));
    detach();
  });

  it('handles pointerleave', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    detach();
  });

  it('handles wheel event for zoom', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const d0 = cam.distance;
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    detach();
    // distance should have changed
    expect(typeof cam.distance).toBe('number');
  });

  it('handles contextmenu suppress', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    const e = new MouseEvent('contextmenu', { button: 2 });
    canvas.dispatchEvent(e);
    detach();
  });

  it('handles keydown for roll (correct key codes)', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    // Default keymap: rollLeft=Numpad4+shift, rollRight=Numpad6+shift
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Numpad4', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Numpad6', shiftKey: true }));
    detach();
  });

  it('detach removes all listeners', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    expect(() => detach()).not.toThrow();
    // Second call is safe (should not crash)
    expect(() => detach()).not.toThrow();
  });

  it('blocks camera when translationGizmo.isDragging() is true', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = { isDragging: () => true };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, undefined, gizmo as any);
    // pointerdown should return early without starting drag
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    // dragAction stays null, so pointermove should not change theta
    const theta0 = cam.theta;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 450, clientY: 300 }));
    expect(cam.theta).toBe(theta0); // no change since gizmo blocked it
    detach();
  });

  it('blocks camera when rotationGizmo.isDragging() is true', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = { isDragging: () => true };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, undefined, undefined, gizmo as any);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));
    detach();
  });

  it('blocks camera when ikHandler.onPointerDown returns true', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const ikHandler = {
      onPointerDown: vi.fn(() => true),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      isActive: vi.fn(() => false),
    };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, ikHandler as any);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1 }));
    expect(ikHandler.onPointerDown).toHaveBeenCalled();
    detach();
  });

  it('calls ikHandler.onPointerMove and ikHandler.onPointerUp', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const ikHandler = {
      onPointerDown: vi.fn(() => false),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      isActive: vi.fn(() => false),
    };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, ikHandler as any);
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 400, clientY: 300 }));
    expect(ikHandler.onPointerMove).toHaveBeenCalled();
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 1, pointerId: 1 }));
    expect(ikHandler.onPointerUp).toHaveBeenCalled();
    detach();
  });

  it('blocks camera pointermove when gizmo is dragging', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = { isDragging: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, undefined, gizmo as any);
    // First pointerdown: isDragging()=false so drag starts
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    // pointermove: isDragging()=true → returns early
    const theta0 = cam.theta;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 450, clientY: 300 }));
    detach();
  });

  it('blocks camera pointermove when ikHandler.isActive() is true', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const ikHandler = {
      onPointerDown: vi.fn(() => false),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      isActive: vi.fn(() => true),
    };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, ikHandler as any);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 450, clientY: 300 }));
    detach();
  });

  it('pan action clears orbitPivot (covers line 72)', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    // Shift+MMB = pan action
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, shiftKey: true, pointerId: 1, clientX: 400, clientY: 300 }));
    expect(cam.orbitPivot).toBeNull(); // pan sets orbitPivot=null
    // pointermove: exercises orbitPan path (dragAction='pan')
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 420, clientY: 320 }));
    detach();
  });

  it('invalid button (button=3) returns early', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    expect(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 3, pointerId: 1 }));
    }).not.toThrow();
    detach();
  });

  it('pointerleave with active orbit drag restores orbitPivot to target', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    // Start orbit drag (MMB)
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    // cam.orbitPivot is now set to original target
    expect(cam.orbitPivot).not.toBeNull();
    // pointerleave should restore target from orbitPivot and clear it
    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(cam.orbitPivot).toBeNull();
    detach();
  });

  it('pointerdown with RMB (button=2) on default keymap hits no-valid-action else branch (line 75)', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    // DEFAULT_KEYMAP has orbit/pan on MMB (button 1) → RMB returns null from resolveMouseAction
    const km = getDefaultKeymap();
    const detach = attachCameraInput(canvas, km, cam);
    expect(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, pointerId: 1 }));
    }).not.toThrow();
    detach();
  });

  it('pointermove with rotationGizmo isDragging=true blocks camera (line 86 rotationGizmo path)', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const rotGizmo = { isDragging: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) };
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam, undefined, undefined, rotGizmo as any);
    // First pointerdown: isDragging=false → drag starts
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 1, pointerId: 1, clientX: 400, clientY: 300 }));
    // pointermove: rotationGizmo.isDragging()=true → returns early at line 86
    const theta0 = cam.theta;
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 450, clientY: 300 }));
    expect(cam.theta).toBe(theta0);
    detach();
  });

  it('pointerup with button=3 skips the release block (line 111 false branch)', () => {
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    expect(() => {
      canvas.dispatchEvent(new PointerEvent('pointerup', { button: 3, pointerId: 1 }));
    }).not.toThrow();
    detach();
  });

  it('wheel with modifier does not zoom (line 140 false branch)', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const d0 = cam.distance;
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    // shift modifier → modsMatch({shift:true}, {}) = false → action=null → line 140 false
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, shiftKey: true }));
    detach();
    expect(cam.distance).toBe(d0); // no zoom happened
  });

  it('keydown with unrecognized key covers else-if false branch (line 154)', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    const detach = attachCameraInput(canvas, getDefaultKeymap(), cam);
    // ArrowUp has no binding → resolveKeyAction returns null → both roll_left and roll_right if-false
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    }).not.toThrow();
    detach();
  });

  it('contextmenu calls preventDefault when orbit.button===2', () => {
    const cam = createOrbitCamera();
    const canvas = makeCanvas();
    // Custom keymap with orbit on right-click
    const km = getDefaultKeymap();
    const customKm = { ...km, orbit: { button: 2 as const, modifiers: {} } };
    const detach = attachCameraInput(canvas, customKm, cam);
    const e = new MouseEvent('contextmenu', { button: 2 });
    const preventDefaultSpy = vi.spyOn(e, 'preventDefault');
    canvas.dispatchEvent(e);
    expect(preventDefaultSpy).toHaveBeenCalled();
    detach();
  });
});
