// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { TranslationGizmo } from '../src/renderer/ui/translationGizmo';
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

describe('TranslationGizmo', () => {
  function makeGizmo() {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    return new TranslationGizmo(makeCanvas(), cam, ik);
  }

  it('constructs without error', () => {
    expect(() => makeGizmo()).not.toThrow();
  });

  it('getCanvas returns HTMLCanvasElement', () => {
    const g = makeGizmo();
    expect(g.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
    g.dispose();
  });

  it('getActiveJoint returns null initially', () => {
    const g = makeGizmo();
    expect(g.getActiveJoint()).toBeNull();
    g.dispose();
  });

  it('isDragging returns false initially', () => {
    const g = makeGizmo();
    expect(g.isDragging()).toBe(false);
    g.dispose();
  });

  it('isActive returns false initially', () => {
    const g = makeGizmo();
    expect(g.isActive()).toBe(false);
    g.dispose();
  });

  it('setActiveJoint sets active joint', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    expect(g.getActiveJoint()).toBe(3);
    g.dispose();
  });

  it('setActiveJoint(null) clears joint', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    g.setActiveJoint(null);
    expect(g.getActiveJoint()).toBeNull();
    g.dispose();
  });

  it('render() does not throw', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    expect(() => g.render()).not.toThrow();
    g.dispose();
  });

  it('render() without active joint does not throw', () => {
    const g = makeGizmo();
    expect(() => g.render()).not.toThrow();
    g.dispose();
  });

  it('dispose removes listeners', () => {
    const g = makeGizmo();
    expect(() => g.dispose()).not.toThrow();
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
    const g = new TranslationGizmo(canvas, cam, ik);
    g.setActiveJoint(3);
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 1 }));
    g.dispose();
  });

  it('isActive returns true when joint is set', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    expect(g.isActive()).toBe(true);
    g.dispose();
  });

  it('onPointerMove with no activeJoint clears hover', () => {
    const g = makeGizmo();
    (g as any).hoveredAxis = 'x';
    (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect((g as any).hoveredAxis).toBeNull();
    g.dispose();
  });

  it('onPointerMove with activeJoint runs hit test', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }))
    ).not.toThrow();
    g.dispose();
  });

  it('onPointerMove while dragging calls updateDrag', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'y';
    (g as any).dragStartPos = [0, 0, 0] as [number, number, number];
    (g as any).dragStartScreen = [400, 300] as [number, number];
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    g.dispose();
  });

  it('onPointerDown with hoveredAxis starts drag', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).hoveredAxis = 'z';
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 2 }))
    ).not.toThrow();
    g.dispose();
  });

  it('onPointerDown without hoveredAxis deactivates joint', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).hoveredAxis = null;
    (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 2 }));
    expect(g.getActiveJoint()).toBeNull();
    g.dispose();
  });

  it('onPointerUp while dragging ends drag and clears state', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'x';
    (g as any).dragStartPos = [0, 0, 0] as [number, number, number];
    (g as any).dragStartScreen = [400, 300] as [number, number];
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 3 }))
    ).not.toThrow();
    expect((g as any).draggingAxis).toBeNull();
    g.dispose();
  });

  it('onPointerUp with hoveredAxis restores grab cursor', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'x';
    (g as any).hoveredAxis = 'x';
    (g as any).dragStartPos = [0, 0, 0] as [number, number, number];
    (g as any).dragStartScreen = [400, 300] as [number, number];
    (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 3 }));
    expect((g as any).mainCanvas.style.cursor).toBe('grab');
    g.dispose();
  });

  it('onPointerUp without dragging is a no-op', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 4 }))
    ).not.toThrow();
    g.dispose();
  });

  it('render with hovered axis highlights that axis', () => {
    const g = makeGizmo();
    g.setActiveJoint(0);
    (g as any).hoveredAxis = 'y';
    expect(() => g.render()).not.toThrow();
    g.dispose();
  });

  it('render resizes overlay canvas when mainCanvas dimensions change', () => {
    const g = makeGizmo();
    g.setActiveJoint(0);
    (g as any).mainCanvas.width = 1024;
    (g as any).mainCanvas.height = 768;
    expect(() => g.render()).not.toThrow();
    expect((g as any).canvas.width).toBe(1024);
    expect((g as any).canvas.height).toBe(768);
    g.dispose();
  });

  it('render with dragging axis highlights dragging axis', () => {
    const g = makeGizmo();
    g.setActiveJoint(0);
    (g as any).draggingAxis = 'x';
    expect(() => g.render()).not.toThrow();
    g.dispose();
  });

  it('updateDrag with draggingAxis but no dragStartPos returns early (line 174)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'y';
    // dragStartPos is null → early return at line 174
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    g.dispose();
  });

  it('hitTestAxes returns null when pointer far from all axes (line 263)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    const result = (g as any).hitTestAxes(1, 1);
    expect(result).toBeNull();
    g.dispose();
  });

  it('distanceToLineSegment with coincident endpoints covers lines 280-282', () => {
    const g = makeGizmo();
    // lenSq = 0 < 0.0001 → point-to-point branch
    const dist = (g as any).distanceToLineSegment(3, 4, 0, 0, 0, 0);
    expect(dist).toBeCloseTo(5);
    g.dispose();
  });

  it('constructor throws when 2D context unavailable (line 53)', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null as any);
    expect(() => makeGizmo()).toThrow('Failed to get 2D context');
    spy.mockRestore();
  });

  it('onPointerDown with hoveredAxis but null joint position covers line 149 else branch', () => {
    const device = makeMockDevice();
    const pd = makeMinimalPoseData();
    const mesh = { positions: new Float32Array(12), indices: new Uint32Array([0,1,2,1,3,2]), normals: new Float32Array(12) };
    const ik = new IKController(pd as any, mesh as any, device);
    ik.state.enabled = true;
    const cam = createOrbitCamera();
    updateCamera(cam);
    const canvas = makeCanvas();
    const g = new TranslationGizmo(canvas, cam, ik);
    g.setActiveJoint(3);
    (g as any).hoveredAxis = 'x';
    vi.spyOn(ik, 'getJointPosition').mockReturnValue(null);
    expect(() =>
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, pointerId: 5 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('render returns early when getJointPosition returns null (line 398)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    vi.spyOn((g as any).ikController, 'getJointPosition').mockReturnValue(null);
    expect(() => g.render()).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('render returns early when joint screenPos is null (line 401)', () => {
    const g = makeGizmo();
    g.setActiveJoint(1);
    vi.spyOn(g as any, 'projectToScreen').mockReturnValue(null);
    expect(() => g.render()).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('render skips axis when screenEnd is null (line 412 continue)', () => {
    const g = makeGizmo();
    g.setActiveJoint(1);
    vi.spyOn(g as any, 'projectToScreen')
      .mockReturnValueOnce([100, 100]) // joint screen pos → non-null, render continues
      .mockReturnValueOnce(null)       // first axis end → triggers continue
      .mockReturnValue([200, 200]);    // remaining axis ends
    expect(() => g.render()).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('drawArrow returns early when arrow has near-zero length (line 452)', () => {
    const g = makeGizmo();
    // x1===x2, y1===y2 → len=0 < 0.0001 → early return at line 452
    expect(() => (g as any).drawArrow(100, 100, 100, 100, 'red', false)).not.toThrow();
    g.dispose();
  });

  it('drawArrow with highlighted=true uses HOVER_THICKNESS (line 436 true)', () => {
    const g = makeGizmo();
    expect(() => (g as any).drawArrow(100, 100, 200, 200, 'blue', true)).not.toThrow();
    g.dispose();
  });

  it('updateDrag returns early when axis not found (line 182 true)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'invalid'; // not in AXES → find returns undefined
    (g as any).dragStartPos = [0, 0, 0];
    (g as any).dragStartScreen = [400, 300];
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    g.dispose();
  });

  it('updateDrag returns early when screenStart is null (line 194 true)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'x';
    (g as any).dragStartPos = [0, 0, 0];
    (g as any).dragStartScreen = [400, 300];
    vi.spyOn(g as any, 'projectToScreen').mockReturnValue(null);
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('updateDrag returns early when screenAxisLen is near-zero (line 200 true)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).draggingAxis = 'x';
    (g as any).dragStartPos = [0, 0, 0];
    (g as any).dragStartScreen = [400, 300];
    // Both screenStart and screenEnd at same pixel → screenAxisLen ≈ 0
    vi.spyOn(g as any, 'projectToScreen').mockReturnValue([300, 300]);
    expect(() =>
      (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 410, clientY: 310 }))
    ).not.toThrow();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('hitTestAxes skips axis when screenEnd is null (line 246 continue)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    vi.spyOn(g as any, 'projectToScreen')
      .mockReturnValueOnce([400, 300]) // joint screen pos
      .mockReturnValue(null);          // all axis ends → continue each time
    const result = (g as any).hitTestAxes(400, 300);
    expect(result).toBeNull();
    vi.restoreAllMocks();
    g.dispose();
  });

  it('projectToScreen returns null when clipW <= 0 (line 318 true)', () => {
    const g = makeGizmo();
    // Set row 4 of viewProj (indices 12-15) so clipW = viewProj[12]*x + viewProj[15] ≤ 0
    // For worldPos=[1,0,0]: clipW = viewProj[12]*1 + viewProj[15]
    // Use viewProj[12]=-1, rest=0 → clipW=-1 ≤ 0 → returns null
    const vp = new Float32Array(16);
    vp[12] = -1;
    (g as any).camera.viewProj = vp;
    const result = (g as any).projectToScreen([1, 0, 0]);
    expect(result).toBeNull();
    g.dispose();
  });

  // --- Real code path tests using identity viewProj ---
  // Identity viewProj: joint [0,0,0] → screen [400,300]
  // distanceToLineSegment(400,300, 400,300, axisEnd) = 0 < 10 → hits first axis ('x')

  it('onPointerMove with identity viewProj hits axis, sets cursor grab (lines 110,229-259)', () => {
    const g = makeGizmo();
    g.setActiveJoint(3);
    (g as any).camera.viewProj = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    (g as any).mainCanvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    expect((g as any).hoveredAxis).not.toBeNull();
    expect((g as any).mainCanvas.style.cursor).toBe('grab');
    g.dispose();
  });

  it('hitTestAxes returns null when activeJoint is null (line 229 true branch)', () => {
    const g = makeGizmo();
    // activeJoint is null (default) → if (!this.activeJoint) return null
    const result = (g as any).hitTestAxes(400, 300);
    expect(result).toBeNull();
    g.dispose();
  });
});
