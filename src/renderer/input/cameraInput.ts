/**
 * Camera input: attach to canvas, resolve actions from keymap, call camera APIs.
 */

import type { OrbitCamera } from '../render/camera';
import { orbitDrag, orbitPan, orbitZoom, orbitRoll, updateCamera } from '../render/camera';
import type { CameraKeymap } from './keymap';
import {
  getModifiersFromEvent,
  resolveMouseAction,
  resolveWheelAction,
  resolveKeyAction,
} from './keymap';
import type { IKInputHandler } from './ikInput';
import type { TranslationGizmo } from '../ui/translationGizmo';
import type { RotationGizmo } from '../ui/rotationGizmo';

export function attachCameraInput(
  canvas: HTMLCanvasElement,
  keymap: CameraKeymap,
  camera: OrbitCamera,
  ikHandler?: IKInputHandler,
  translationGizmo?: TranslationGizmo,
  rotationGizmo?: RotationGizmo
): () => void {
  let dragAction: 'orbit' | 'pan' | null = null;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    const translationDragging = translationGizmo && translationGizmo.isDragging();
    const rotationDragging = rotationGizmo && rotationGizmo.isDragging();

    console.log('[CameraInput] onPointerDown - translation dragging:', translationDragging, 'rotation dragging:', rotationDragging);

    // Priority 1: Check if gizmos are handling this event
    if (translationDragging || rotationDragging) {
      console.log('[CameraInput] Gizmo is dragging, blocking camera');
      // Gizmo is active, don't start camera drag
      return;
    }

    // Priority 2: Check if IK handler wants to handle this event
    const ikHandling = ikHandler && ikHandler.onPointerDown(e);
    console.log('[CameraInput] IK handler result:', ikHandling);
    if (ikHandling) {
      console.log('[CameraInput] IK is handling, blocking camera');
      // IK is handling this event, don't start camera drag
      return;
    }

    // Priority 3: Camera input
    console.log('[CameraInput] Attempting camera input - button:', e.button);
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) {
      console.log('[CameraInput] Invalid button, ignoring');
      return;
    }
    const mods = getModifiersFromEvent(e);
    const action = resolveMouseAction(e.button as 0 | 1 | 2, mods, keymap);
    console.log('[CameraInput] Resolved action:', action, 'mods:', mods);
    if (action === 'orbit' || action === 'pan') {
      console.log('[CameraInput] Starting camera drag:', action);
      e.preventDefault();
      e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      dragAction = action;
      lastX = e.clientX;
      lastY = e.clientY;
      if (action === 'orbit') {
        camera.orbitPivot = [camera.target[0], camera.target[1], camera.target[2]];
      } else {
        camera.orbitPivot = null;
      }
    } else {
      console.log('[CameraInput] No valid action for camera');
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    // Always update IK handler on move (for hover states)
    if (ikHandler) {
      ikHandler.onPointerMove(e);
    }

    // If gizmo is being dragged, don't do camera movement
    if ((translationGizmo && translationGizmo.isDragging()) || (rotationGizmo && rotationGizmo.isDragging())) {
      return;
    }

    // If IK is active, don't do camera movement
    if (ikHandler && ikHandler.isActive()) {
      return;
    }

    if (dragAction === null) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dragAction === 'orbit') orbitDrag(camera, dx, dy);
    else orbitPan(camera, dx, dy);
    updateCamera(camera);
  };

  const onPointerUp = (e: PointerEvent) => {
    // Notify IK handler
    if (ikHandler) {
      ikHandler.onPointerUp(e);
    }

    if (e.button === 0 || e.button === 1 || e.button === 2) {
      if (dragAction === 'orbit' && camera.orbitPivot) {
        camera.target[0] = camera.orbitPivot[0];
        camera.target[1] = camera.orbitPivot[1];
        camera.target[2] = camera.orbitPivot[2];
      }
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragAction = null;
      camera.orbitPivot = null;
    }
  };

  const onPointerLeave = () => {
    if (dragAction === 'orbit' && camera.orbitPivot) {
      camera.target[0] = camera.orbitPivot[0];
      camera.target[1] = camera.orbitPivot[1];
      camera.target[2] = camera.orbitPivot[2];
    }
    dragAction = null;
    camera.orbitPivot = null;
  };

  const onContextMenu = (e: MouseEvent) => {
    if (keymap.orbit.button === 2 || keymap.pan.button === 2) e.preventDefault();
  };

  const onWheel = (e: WheelEvent) => {
    const mods = getModifiersFromEvent(e);
    const action = resolveWheelAction(mods, keymap);
    if (action === 'zoom') {
      e.preventDefault();
      orbitZoom(camera, e.deltaY);
      updateCamera(camera);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const mods = getModifiersFromEvent(e);
    const action = resolveKeyAction(e.code, mods, keymap);
    if (action === 'roll_left') {
      e.preventDefault();
      orbitRoll(camera, -1);
      updateCamera(camera);
    } else if (action === 'roll_right') {
      e.preventDefault();
      orbitRoll(camera, 1);
      updateCamera(camera);
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
  };
}
