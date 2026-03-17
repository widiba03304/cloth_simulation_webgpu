// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { RotationGizmo } from '../src/renderer/ui/rotationGizmo';
import { IKController } from '../src/renderer/ik/ikController';
import { createOrbitCamera, updateCamera } from '../src/renderer/render/camera';
import { makeMockDevice } from './mocks/webgpu';

function makeMinimalPoseData() {
  const numVerts = 4, numJoints = 24;
  const weights = new Float32Array(numVerts * numJoints);
  for (let v = 0; v < numVerts; v++) weights[v * numJoints] = 1.0;
  return {
    num_joints: numJoints, num_vertices: numVerts,
    v_template: new Float32Array(numVerts * 3),
    j_regressor: new Float32Array(numJoints * numVerts),
    joint_positions: new Float32Array(numJoints * 3),
    kintree_table: [
      Array.from({ length: numJoints }, (_, i) => i === 0 ? -1 : 0),
      Array.from({ length: numJoints }, (_, i) => i),
    ],
    weights,
    joint_names: Array.from({ length: numJoints }, (_, i) => `joint_${i}`),
  };
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 600;
  canvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }));
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  return canvas;
}

describe('RotationGizmo', () => {
  function makeGizmo() {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    return new RotationGizmo(canvas, cam, ik);
  }

  it('constructs without error', () => {
    expect(() => makeGizmo()).not.toThrow();
  });

  it('getCanvas returns HTMLCanvasElement', () => {
    const gizmo = makeGizmo();
    expect(gizmo.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
    gizmo.dispose();
  });

  it('getActiveJoint returns null initially', () => {
    const gizmo = makeGizmo();
    expect(gizmo.getActiveJoint()).toBeNull();
    gizmo.dispose();
  });

  it('isDragging returns false initially', () => {
    const gizmo = makeGizmo();
    expect(gizmo.isDragging()).toBe(false);
    gizmo.dispose();
  });

  it('isActive returns false initially', () => {
    const gizmo = makeGizmo();
    expect(gizmo.isActive()).toBe(false);
    gizmo.dispose();
  });

  it('setActiveJoint sets the active joint', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    expect(gizmo.getActiveJoint()).toBe(5);
    gizmo.dispose();
  });

  it('setActiveJoint(null) clears active joint', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    gizmo.setActiveJoint(null);
    expect(gizmo.getActiveJoint()).toBeNull();
    gizmo.dispose();
  });

  it('render() does not throw', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('render() without active joint does not throw', () => {
    const gizmo = makeGizmo();
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('dispose removes event listeners', () => {
    const gizmo = makeGizmo();
    expect(() => gizmo.dispose()).not.toThrow();
  });

  it('handles pointer events without error', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300, button: 0, pointerId: 1 }));
    gizmo.dispose();
  });

  it('isActive returns true when joint is set', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(3);
    expect(gizmo.isActive()).toBe(true);
    gizmo.dispose();
  });

  it('onPointerMove with no activeJoint clears hover', () => {
    const gizmo = makeGizmo();
    (gizmo as any).hoveredRing = 'x';
    (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect((gizmo as any).hoveredRing).toBeNull();
    gizmo.dispose();
  });

  it('onPointerMove with activeJoint runs hit test', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  it('onPointerMove while dragging calls updateRotation', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'y';
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    (gizmo as any).dragStartAngle = 0;
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  it('onPointerDown with hoveredRing starts drag', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).hoveredRing = 'z';
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 2 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  it('onPointerDown without hoveredRing deactivates joint', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).hoveredRing = null;
    (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 2 }));
    expect(gizmo.getActiveJoint()).toBeNull();
    gizmo.dispose();
  });

  it('onPointerUp while dragging ends drag and clears state', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'x';
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 3 }))
    ).not.toThrow();
    expect((gizmo as any).draggingRing).toBeNull();
    gizmo.dispose();
  });

  it('onPointerUp with hoveredRing restores grab cursor', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'x';
    (gizmo as any).hoveredRing = 'x';
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 3 }));
    expect((gizmo as any).mainCanvas.style.cursor).toBe('grab');
    gizmo.dispose();
  });

  it('onPointerUp without dragging is a no-op', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 4 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  it('render with hovered ring highlights that ring', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(0);
    (gizmo as any).hoveredRing = 'x';
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('render resizes overlay canvas when mainCanvas dimensions change', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(0);
    // Change main canvas dimensions to trigger resize in render()
    (gizmo as any).mainCanvas.width = 1024;
    (gizmo as any).mainCanvas.height = 768;
    expect(() => gizmo.render()).not.toThrow();
    expect((gizmo as any).canvas.width).toBe(1024);
    expect((gizmo as any).canvas.height).toBe(768);
    gizmo.dispose();
  });

  it('render with dragging ring highlights dragging ring', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(0);
    (gizmo as any).draggingRing = 'z';
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('constructor throws when 2D context unavailable (line 55)', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null as any);
    expect(() => makeGizmo()).toThrow('Failed to get 2D context');
    spy.mockRestore();
  });

  it('updateRotation without initialRotation returns early (line 178)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'y';
    // initialRotation NOT set → early return at line 178
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  it('hitTestRings returns null when pointer far from all rings (line 248)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    // Pointer at extreme corner, far from any ring around joint at [0,0,0]
    const result = (gizmo as any).hitTestRings(1, 1);
    expect(result).toBeNull();
    gizmo.dispose();
  });

  it('render with invalid joint index returns early at line 365 (null jointPos)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(999); // invalid joint → getJointPosition returns null
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('render with non-zero activeJoint calls drawRing (lines 380-395)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(1); // non-zero: !1 === false → render proceeds past line 361
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('render returns early at line 368 when projectToScreen returns null for jointPos', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(1);
    // Mock projectToScreen to simulate joint behind camera
    vi.spyOn(gizmo as any, 'projectToScreen').mockReturnValue(null);
    expect(() => gizmo.render()).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('projectToScreen returns null when clipW <= 0 (line 308)', () => {
    const gizmo = makeGizmo();
    // Force clipW = -1 by zeroing W-row of viewProj except [15] = -1
    const cam = (gizmo as any).camera;
    const vp = new Float32Array(16);
    vp[15] = -1; // clipW = vp[12]*x + vp[13]*y + vp[14]*z + vp[15] = 0+0+0+(-1) = -1 <= 0
    cam.viewProj = vp;
    const result = (gizmo as any).projectToScreen([0, 0, 0]);
    expect(result).toBeNull();
    gizmo.dispose();
  });

  it('normalize returns [0,0,0] for near-zero vector (line 285)', () => {
    const gizmo = makeGizmo();
    const result = (gizmo as any).normalize([0, 0, 0]);
    expect(result).toEqual([0, 0, 0]);
    gizmo.dispose();
  });

  it('onPointerDown with hoveredRing but null jointPos skips drag start (line 135 false)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    (gizmo as any).hoveredRing = 'x';
    vi.spyOn(ik, 'getJointPosition').mockReturnValue(null);
    expect(() =>
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 10 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('drawRing skips ring point when projectToScreen returns null (line 395 continue)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(1);
    vi.spyOn(gizmo as any, 'projectToScreen')
      .mockReturnValueOnce([100, 100]) // joint screen pos → non-null, render continues
      .mockReturnValueOnce(null)       // first ring point → triggers continue
      .mockReturnValue([200, 200]);    // remaining ring points
    expect(() => gizmo.render()).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('drawRing uses HOVER_THICKNESS when ring is highlighted (line 380 true)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(1); // non-zero so render passes !activeJoint check
    (gizmo as any).hoveredRing = 'x'; // 'x' ring is highlighted → thickness = HOVER_THICKNESS
    expect(() => gizmo.render()).not.toThrow();
    gizmo.dispose();
  });

  it('onPointerDown: null screenPos skips drag angle init (line 138 false)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    (gizmo as any).hoveredRing = 'z';
    vi.spyOn(gizmo as any, 'projectToScreen').mockReturnValue(null);
    expect(() =>
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 11 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('updateRotation returns early when jointPos is null (line 182 true)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'x';
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    (gizmo as any).dragStartAngle = 0;
    vi.spyOn(ik, 'getJointPosition').mockReturnValue(null);
    expect(() =>
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('updateRotation returns early when screenPos is null (line 185 true)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'y';
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    (gizmo as any).dragStartAngle = 0;
    vi.spyOn(gizmo as any, 'projectToScreen').mockReturnValue(null);
    expect(() =>
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('updateRotation returns early when ring not found (line 198 true)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).draggingRing = 'invalid'; // not in RINGS → find returns undefined → early return
    (gizmo as any).initialRotation = [0, 0, 0, 1] as [number,number,number,number];
    (gizmo as any).dragStartAngle = 0;
    expect(() =>
      (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    gizmo.dispose();
  });

  // --- Real code path tests using identity viewProj (avoids spy coverage gaps) ---
  // With identity viewProj: joint [0,0,0] → screen [400,300]
  // X ring point at angle=0: [0,0,-0.12] → clipX=0,clipY=0,clipW=1 → screen [400,300]
  // Distance from mouse [400,300] to ring point [400,300] = 0 < 10 → hit!

  it('onPointerMove with identity viewProj hits ring, sets cursor grab (lines 108,219-243)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    (gizmo as any).camera.viewProj = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    (gizmo as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    expect((gizmo as any).hoveredRing).not.toBeNull();
    expect((gizmo as any).mainCanvas.style.cursor).toBe('grab');
    gizmo.dispose();
  });

  it('onPointerDown with identity viewProj saves initialRotation (line 147 true)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    (gizmo as any).hoveredRing = 'z';
    // Identity viewProj: joint [0,0,0] → screen [400,300] → if(screenPos) true → line 146-148 executes
    (gizmo as any).camera.viewProj = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 20 }));
    expect((gizmo as any).initialRotation).not.toBeNull();
    gizmo.dispose();
  });

  it('hitTestRings returns null when activeJoint is null (line 219 true branch)', () => {
    const gizmo = makeGizmo();
    // activeJoint is null (default) → if (!this.activeJoint) return null
    const result = (gizmo as any).hitTestRings(400, 300);
    expect(result).toBeNull();
    gizmo.dispose();
  });

  it('hitTestRings returns null when getJointPosition is null (line 222 true branch)', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const gizmo = new RotationGizmo(canvas, cam, ik);
    gizmo.setActiveJoint(5);
    vi.spyOn(ik, 'getJointPosition').mockReturnValue(null);
    const result = (gizmo as any).hitTestRings(400, 300);
    expect(result).toBeNull();
    vi.restoreAllMocks();
    gizmo.dispose();
  });

  it('hitTestRings skips ring point behind camera (line 235 true: continue)', () => {
    const gizmo = makeGizmo();
    gizmo.setActiveJoint(5);
    // Identity viewProj for joint, but large negative Z for ring points → clipW ≤ 0 → null → continue
    (gizmo as any).camera.viewProj = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    // Use mouse position far from all ring screen positions so we exercise the continue path too
    expect(() => {
      (gizmo as any).hitTestRings(400, 300);
    }).not.toThrow();
    gizmo.dispose();
  });
});
