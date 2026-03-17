/**
 * IK system lifecycle manager.
 * Encapsulates create / reinit / cleanup of IK controller + gizmos + handle renderer.
 */
import { IKController } from '../ik/ikController';
import { IKInputHandler } from '../input/ikInput';
import { IKHandleRenderer } from '../ui/ikHandles';
import { TranslationGizmo } from '../ui/translationGizmo';
import { RotationGizmo } from '../ui/rotationGizmo';
import { getPoseData, getIKJointIndices } from '../render/smplPoseData';
import type { OrbitCamera } from '../render/camera';
import type { BodyMesh } from '../render/bodyMesh';

export interface IKResources {
  controller: IKController;
  inputHandler: IKInputHandler;
  handleRenderer: IKHandleRenderer;
  handleCanvas: HTMLCanvasElement;
  translationGizmo: TranslationGizmo;
  translationGizmoCanvas: HTMLCanvasElement;
  rotationGizmo: RotationGizmo;
  rotationGizmoCanvas: HTMLCanvasElement;
}

function buildIKResources(
  device: GPUDevice,
  bodyMesh: BodyMesh,
  unscaledMesh: Float32Array | undefined,
  avatarIndex: number,
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  appEl: HTMLElement,
): IKResources | null {
  const poseData = getPoseData(avatarIndex === 0 ? 'male' : 'female');
  if (!poseData) return null;

  const controller = new IKController(poseData, bodyMesh, device, unscaledMesh);
  const enabledJoints = getIKJointIndices();
  controller.setEnabledJoints(enabledJoints);

  const inputHandler = new IKInputHandler(controller, camera, canvas);

  const tGizmo = new TranslationGizmo(canvas, camera, controller);
  const tCanvas = tGizmo.getCanvas();
  appEl.appendChild(tCanvas);

  const rGizmo = new RotationGizmo(canvas, camera, controller);
  const rCanvas = rGizmo.getCanvas();
  appEl.appendChild(rCanvas);

  inputHandler.setCallbacks({
    onDragStart: (jointId: number) => {
      tGizmo.setActiveJoint(jointId);
      rGizmo.setActiveJoint(jointId);
    },
    onDragEnd: () => {},
  });

  const handleRenderer = new IKHandleRenderer(canvas, camera, controller, inputHandler);
  handleRenderer.setJointStyles(enabledJoints);
  const handleCanvas = handleRenderer.getCanvas();
  appEl.appendChild(handleCanvas);

  return {
    controller,
    inputHandler,
    handleRenderer,
    handleCanvas,
    translationGizmo: tGizmo,
    translationGizmoCanvas: tCanvas,
    rotationGizmo: rGizmo,
    rotationGizmoCanvas: rCanvas,
  };
}

/** Create IK system from scratch (called during initEditor). */
export function initIK(
  device: GPUDevice,
  bodyMesh: BodyMesh,
  unscaledMesh: Float32Array | undefined,
  avatarIndex: number,
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  appEl: HTMLElement,
): IKResources | null {
  return buildIKResources(device, bodyMesh, unscaledMesh, avatarIndex, canvas, camera, appEl);
}

/** Reinitialize IK for a new avatar (disposes old canvases first). */
export function reinitIK(
  old: IKResources,
  device: GPUDevice,
  bodyMesh: BodyMesh,
  unscaledMesh: Float32Array,
  avatarIndex: number,
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  appEl: HTMLElement,
): IKResources | null {
  old.translationGizmo.dispose();
  old.translationGizmoCanvas.remove();
  old.rotationGizmo.dispose();
  old.rotationGizmoCanvas.remove();
  old.handleCanvas.remove();
  return buildIKResources(device, bodyMesh, unscaledMesh, avatarIndex, canvas, camera, appEl);
}

/** Dispose all IK canvases and gizmos. */
export function cleanupIK(ik: IKResources | null): void {
  if (!ik) return;
  ik.handleCanvas.remove();
  ik.translationGizmoCanvas.remove();
  ik.rotationGizmoCanvas.remove();
  ik.translationGizmo.dispose();
  ik.rotationGizmo.dispose();
}
