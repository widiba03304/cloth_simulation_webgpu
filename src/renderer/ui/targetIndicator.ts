/**
 * Target indicator: shows the orbit center point (target) on screen.
 */

import type { OrbitCamera } from '../render/camera';

const CROSSHAIR_SIZE = 12;
const CIRCLE_RADIUS = 6;
const STROKE = 2;

/** Project 3D world point to 2D screen space using camera's view-projection matrix. */
function projectToScreen(
  worldPos: [number, number, number],
  viewProj: Float32Array,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; visible: boolean } {
  const [wx, wy, wz] = worldPos;

  // Apply view-projection matrix (row-major)
  const clipX = viewProj[0] * wx + viewProj[1] * wy + viewProj[2] * wz + viewProj[3];
  const clipY = viewProj[4] * wx + viewProj[5] * wy + viewProj[6] * wz + viewProj[7];
  const clipZ = viewProj[8] * wx + viewProj[9] * wy + viewProj[10] * wz + viewProj[11];
  const clipW = viewProj[12] * wx + viewProj[13] * wy + viewProj[14] * wz + viewProj[15];

  // Check if point is behind camera or outside clip space
  if (clipW <= 0 || Math.abs(clipX) > Math.abs(clipW) || Math.abs(clipY) > Math.abs(clipW)) {
    return { x: 0, y: 0, visible: false };
  }

  // Normalize to NDC [-1, 1]
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;

  // Convert to screen space [0, width] x [0, height]
  // WebGPU NDC: Y+ is down in NDC, but we want screen Y+ down too
  const screenX = (ndcX + 1) * 0.5 * canvasWidth;
  const screenY = (1 - ndcY) * 0.5 * canvasHeight; // Flip Y for screen space

  return { x: screenX, y: screenY, visible: true };
}

export function createTargetIndicatorElement(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const overlay = document.createElement('canvas');
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  `;
  canvas.parentElement?.appendChild(overlay);
  return overlay;
}

export function updateTargetIndicator(
  overlay: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  cam: OrbitCamera | null
): void {
  const ctx = overlay.getContext('2d');
  if (!ctx || !cam) return;

  // Match overlay size to main canvas
  if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = canvas.style.width || `${canvas.clientWidth}px`;
    overlay.style.height = canvas.style.height || `${canvas.clientHeight}px`;
  }

  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Project pivot (orbit center) or target to screen space
  const pivot = cam.orbitPivot ?? cam.target;
  const projected = projectToScreen(pivot, cam.viewProj, overlay.width, overlay.height);

  if (!projected.visible) return;

  const { x, y } = projected;

  // Draw crosshair + circle at target position
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)'; // Yellow/orange
  ctx.lineWidth = STROKE;
  ctx.lineCap = 'round';

  // Draw circle
  ctx.beginPath();
  ctx.arc(x, y, CIRCLE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Draw crosshair lines
  ctx.beginPath();
  ctx.moveTo(x - CROSSHAIR_SIZE, y);
  ctx.lineTo(x - CIRCLE_RADIUS - 2, y);
  ctx.moveTo(x + CIRCLE_RADIUS + 2, y);
  ctx.lineTo(x + CROSSHAIR_SIZE, y);
  ctx.moveTo(x, y - CROSSHAIR_SIZE);
  ctx.lineTo(x, y - CIRCLE_RADIUS - 2);
  ctx.moveTo(x, y + CIRCLE_RADIUS + 2);
  ctx.lineTo(x, y + CROSSHAIR_SIZE);
  ctx.stroke();

  ctx.restore();
}
