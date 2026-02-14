/**
 * Gimbal widget: shows camera orientation (right / up / forward) in the top-right corner.
 */

import type { OrbitCamera } from '../render/camera';
import { getCameraBasis } from '../render/camera';

const SIZE = 80;
const PAD = 8;
const ARROW_LEN = 28;
const STROKE = 2.5;
const LABEL_OFFSET = 10;

/** Project 3D unit vector to 2D for gimbal (isometric-like view from (1,1,1)). */
function project(v: [number, number, number]): { x: number; y: number } {
  const sr2 = 1 / Math.sqrt(2);
  const sr6 = 1 / Math.sqrt(6);
  const viewRight = [sr2, -sr2, 0];
  const viewUp = [sr6, sr6, -2 * sr6];
  return {
    x: v[0] * viewRight[0] + v[1] * viewRight[1] + v[2] * viewRight[2],
    y: v[0] * viewUp[0] + v[1] * viewUp[1] + v[2] * viewUp[2],
  };
}

export function createGimbalElement(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = `
    position: absolute;
    top: ${PAD}px;
    right: ${PAD}px;
    width: ${SIZE}px;
    height: ${SIZE}px;
    background: rgba(20,20,24,0.85);
    border: 1px solid rgba(80,80,90,0.6);
    border-radius: 6px;
    pointer-events: none;
  `;
  return canvas;
}

export function updateGimbal(canvas: HTMLCanvasElement, cam: OrbitCamera | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !cam) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = ARROW_LEN;

  ctx.clearRect(0, 0, w, h);

  const { right, up, forward } = getCameraBasis(cam);

  const drawAxis = (v: [number, number, number], color: string, label: string) => {
    const p = project(v);
    const ex = cx + p.x * scale;
    const ey = cy - p.y * scale; // flip Y for screen
    ctx.strokeStyle = color;
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tx = cx + p.x * (scale + LABEL_OFFSET);
    const ty = cy - p.y * (scale + LABEL_OFFSET);
    ctx.fillText(label, tx, ty);
  };

  drawAxis(right, '#e74c3c', 'X');
  drawAxis(up, '#2ecc71', 'Y');
  drawAxis(forward, '#3498db', 'Z');
}
