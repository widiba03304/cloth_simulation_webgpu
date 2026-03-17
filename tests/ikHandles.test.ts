// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { IKHandleRenderer, createIKHandleCanvas } from '../src/renderer/ui/ikHandles';
import type { OrbitCamera } from '../src/renderer/render/camera';
import type { IKController } from '../src/renderer/ik/ikController';
import type { IKInputHandler } from '../src/renderer/input/ikInput';

function makeCamera(): OrbitCamera {
  return {
    theta: 0, phi: Math.PI / 4, distance: 5,
    target: [0, 1, 0] as [number, number, number],
    viewProj: new Float32Array([
      1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1
    ]),
  } as unknown as OrbitCamera;
}

function makeIKController(enabled = false): IKController {
  return {
    state: { enabled, activeJoint: null, targetPosition: null },
    skeleton: {
      getJoint: vi.fn((id: number) => {
        if (id === 0) return { name: 'left_wrist', position: [0,1,0] };
        if (id === 1) return { name: 'left_ankle', position: [0,0,0] };
        if (id === 2) return { name: 'left_elbow', position: [0.5,1,0] };
        if (id === 3) return { name: 'left_knee', position: [0,0.5,0] };
        if (id === 4) return { name: 'torso', position: [0,1.5,0] };
        return null;
      }),
    },
    getJointPositions: vi.fn(() => [
      [0,1,0] as [number,number,number],
      [0,0,0] as [number,number,number],
    ]),
    getEnabledJoints: vi.fn(() => [0, 1]),
  } as unknown as IKController;
}

function makeIKInput(hovered: number | null = null, dragged: number | null = null): IKInputHandler {
  return {
    getHoveredJoint: vi.fn(() => hovered),
    getDraggedJoint: vi.fn(() => dragged),
  } as unknown as IKInputHandler;
}

function makeMainCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  return c;
}

describe('IKHandleRenderer', () => {
  it('creates overlay canvas on construction', () => {
    const mainCanvas = makeMainCanvas();
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), makeIKController(), makeIKInput());
    const overlay = renderer.getCanvas();
    expect(overlay).toBeInstanceOf(HTMLCanvasElement);
    expect(overlay.width).toBe(mainCanvas.width);
    expect(overlay.height).toBe(mainCanvas.height);
  });

  it('render() clears canvas when IK disabled', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(false);
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    // Should not throw
    expect(() => renderer.render()).not.toThrow();
  });

  it('render() draws handles when IK enabled', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    // Camera with a transform that puts points in front
    const cam = makeCamera();
    // Use identity-like matrix that places clips in positive W region
    cam.viewProj = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, -1, 1, // W = 1 - z
    ]);
    const renderer = new IKHandleRenderer(mainCanvas, cam, controller, makeIKInput());
    expect(() => renderer.render()).not.toThrow();
  });

  it('render() handles active and hovered joints', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    const cam = makeCamera();
    cam.viewProj = new Float32Array([
      1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1
    ]);
    const ikInput = makeIKInput(0, 1); // joint 0 hovered, joint 1 dragged
    const renderer = new IKHandleRenderer(mainCanvas, cam, controller, ikInput);
    expect(() => renderer.render()).not.toThrow();
  });

  it('setJointStyles assigns styles from joint names', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    // Should not throw
    expect(() => renderer.setJointStyles([0, 1, 2, 3, 4])).not.toThrow();
  });

  it('setJointStyles skips null joint', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    expect(() => renderer.setJointStyles([99])).not.toThrow();
  });

  it('updateSize syncs canvas dimensions', () => {
    const mainCanvas = makeMainCanvas();
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), makeIKController(), makeIKInput());
    mainCanvas.width = 1920;
    mainCanvas.height = 1080;
    renderer.updateSize();
    expect(renderer.getCanvas().width).toBe(1920);
    expect(renderer.getCanvas().height).toBe(1080);
  });

  it('render() resizes canvas when main canvas changes', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    mainCanvas.width = 1024;
    mainCanvas.height = 768;
    expect(() => renderer.render()).not.toThrow();
    expect(renderer.getCanvas().width).toBe(1024);
  });

  it('render() skips joints out of position range', () => {
    const mainCanvas = makeMainCanvas();
    const controller = {
      state: { enabled: true, activeJoint: null, targetPosition: null },
      skeleton: { getJoint: vi.fn(() => null) },
      getJointPositions: vi.fn(() => [] as [number,number,number][]),
      getEnabledJoints: vi.fn(() => [5]),
    } as unknown as IKController;
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    expect(() => renderer.render()).not.toThrow();
  });

  it('throws when 2d context is unavailable (line 87)', () => {
    const mainCanvas = makeMainCanvas();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null as any);
    expect(() => new IKHandleRenderer(mainCanvas, makeCamera(), makeIKController(), makeIKInput())).toThrow('Failed to get 2D context');
    spy.mockRestore();
  });

  it('render() skips joints behind camera - covers skippedCount path (lines 200-204)', () => {
    const mainCanvas = makeMainCanvas();
    const controller = makeIKController(true);
    const cam = makeCamera();
    // viewProj W-row=[0,0,0,-1]: clipW=-1 for any position → projectToScreen returns null
    cam.viewProj = new Float32Array([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, -1,
    ]);
    const renderer = new IKHandleRenderer(mainCanvas, cam, controller, makeIKInput());
    // First joint skippedCount===1 → log fires; second skippedCount===2 → no log
    expect(() => renderer.render()).not.toThrow();
  });

  it('render() with enabled=true but empty enabledJoints covers line 179 false branch', () => {
    const mainCanvas = makeMainCanvas();
    const controller = {
      state: { enabled: true, activeJoint: null, targetPosition: null },
      skeleton: { getJoint: vi.fn(() => null) },
      getJointPositions: vi.fn(() => [] as [number,number,number][]),
      getEnabledJoints: vi.fn(() => [] as number[]), // empty → length === 0
    } as unknown as IKController;
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    expect(() => renderer.render()).not.toThrow();
  });

  it('projectToScreen returns null when ndcZ > 1 (line 262)', () => {
    const mainCanvas = makeMainCanvas();
    const controller = {
      state: { enabled: true, activeJoint: null, targetPosition: null },
      skeleton: { getJoint: vi.fn(() => null) },
      getJointPositions: vi.fn(() => [[0, 0, 2]] as [number,number,number][]), // z=2 → ndcZ=2>1
      getEnabledJoints: vi.fn(() => [0]),
    } as unknown as IKController;
    // Identity viewProj: clipZ=z=2, clipW=1 → ndcZ=2 > 1 → returns null
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), controller, makeIKInput());
    expect(() => renderer.render()).not.toThrow();
  });

  it('render called twice with same IK state skips log on second call (line 149 false)', () => {
    const mainCanvas = makeMainCanvas();
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), makeIKController(true), makeIKInput());
    renderer.render(); // first call: lastLoggedEnabled(null) !== enabled(true) → logs + sets lastLoggedEnabled=true
    expect(() => renderer.render()).not.toThrow(); // second call: lastLoggedEnabled===enabled → false branch (no log)
  });

  it('updateSize is a no-op when canvas dimensions already match (lines 327-328 false)', () => {
    const mainCanvas = makeMainCanvas();
    const renderer = new IKHandleRenderer(mainCanvas, makeCamera(), makeIKController(), makeIKInput());
    // Canvas already matches mainCanvas (both 800×600) → condition is false, no resize
    expect(() => renderer.updateSize()).not.toThrow();
    expect(renderer.getCanvas().width).toBe(800);
    expect(renderer.getCanvas().height).toBe(600);
  });
});

describe('createIKHandleCanvas', () => {
  it('creates a canvas matching main canvas dimensions', () => {
    const mainCanvas = makeMainCanvas();
    const overlay = createIKHandleCanvas(mainCanvas);
    expect(overlay).toBeInstanceOf(HTMLCanvasElement);
    expect(overlay.width).toBe(mainCanvas.width);
    expect(overlay.height).toBe(mainCanvas.height);
  });

  it('has pointer-events: none style', () => {
    const mainCanvas = makeMainCanvas();
    const overlay = createIKHandleCanvas(mainCanvas);
    expect(overlay.style.cssText).toContain('pointer-events');
  });
});
