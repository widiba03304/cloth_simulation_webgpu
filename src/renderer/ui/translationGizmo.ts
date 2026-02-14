/**
 * Translation Gizmo for IK joints.
 * Displays X/Y/Z axis arrows that can be dragged to move joints.
 */

import type { OrbitCamera } from '../render/camera';
import type { IKController } from '../ik/ikController';
import type { Vec3 } from '../ik/skeleton';

interface GizmoAxis {
  name: 'x' | 'y' | 'z';
  color: string;
  direction: Vec3;
}

const AXES: GizmoAxis[] = [
  { name: 'x', color: '#ff0000', direction: [1, 0, 0] },  // Red
  { name: 'y', color: '#00ff00', direction: [0, 1, 0] },  // Green
  { name: 'z', color: '#0000ff', direction: [0, 0, 1] },  // Blue
];

const ARROW_LENGTH = 0.15;  // Length in world units
const ARROW_HEAD_SIZE = 0.02;
const ARROW_THICKNESS = 3;
const HOVER_THICKNESS = 5;

export class TranslationGizmo {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mainCanvas: HTMLCanvasElement;
  private camera: OrbitCamera;
  private ikController: IKController;

  private activeJoint: number | null = null;
  private hoveredAxis: 'x' | 'y' | 'z' | null = null;
  private draggingAxis: 'x' | 'y' | 'z' | null = null;
  private dragStartPos: Vec3 | null = null;
  private dragStartScreen: [number, number] | null = null;

  constructor(
    mainCanvas: HTMLCanvasElement,
    camera: OrbitCamera,
    ikController: IKController
  ) {
    this.mainCanvas = mainCanvas;
    this.camera = camera;
    this.ikController = ikController;

    // Create overlay canvas
    this.canvas = this.createOverlayCanvas();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for translation gizmo');
    }
    this.ctx = ctx;

    // Set up event listeners
    this.setupEventListeners();

    console.log('Translation gizmo initialized');
  }

  private createOverlayCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.mainCanvas.width;
    canvas.height = this.mainCanvas.height;
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 15;
    `;
    return canvas;
  }

  private setupEventListeners(): void {
    // Listen to main canvas events instead of gizmo canvas
    // This allows us to detect hover even with pointer-events: none on gizmo
    this.mainCanvas.addEventListener('pointermove', this.onPointerMove);
    this.mainCanvas.addEventListener('pointerdown', this.onPointerDown);
    this.mainCanvas.addEventListener('pointerup', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activeJoint || !this.ikController.state.enabled) {
      this.hoveredAxis = null;
      // Don't touch cursor - let camera controls handle it
      return;
    }

    // Use main canvas rect since events come from main canvas
    const rect = this.mainCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert to canvas coordinates
    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;

    if (this.draggingAxis) {
      // Update drag
      this.updateDrag(canvasX, canvasY);
    } else {
      // Check hover
      this.hoveredAxis = this.hitTestAxes(canvasX, canvasY);
      // Only set cursor if we're hovering over an axis
      if (this.hoveredAxis) {
        this.mainCanvas.style.cursor = 'grab';
      }
      // Don't set to 'auto' - let other systems handle cursor when we're not hovering
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    console.log('[GIZMO] onPointerDown - hoveredAxis:', this.hoveredAxis, 'activeJoint:', this.activeJoint);

    // If clicking outside the gizmo, deactivate it
    if (!this.hoveredAxis || !this.activeJoint) {
      // Deactivate gizmo to allow clicks through
      this.setActiveJoint(null);
      // Don't prevent default - let the event pass through
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.draggingAxis = this.hoveredAxis;
    this.mainCanvas.style.cursor = 'grabbing';
    this.mainCanvas.setPointerCapture(e.pointerId);

    // Use main canvas rect since events come from main canvas
    const rect = this.mainCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;
    this.dragStartScreen = [canvasX, canvasY];

    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (jointPos) {
      this.dragStartPos = [...jointPos] as Vec3;
      console.log('[GIZMO] Starting drag - joint:', this.activeJoint, 'axis:', this.draggingAxis, 'pos:', jointPos);
      this.ikController.startDrag(this.activeJoint, jointPos);
    } else {
      console.warn('[GIZMO] Could not get joint position for:', this.activeJoint);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.draggingAxis) {
      try {
        this.mainCanvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.draggingAxis = null;
      this.dragStartPos = null;
      this.dragStartScreen = null;
      // Only set cursor if we're still hovering, otherwise leave it alone
      if (this.hoveredAxis) {
        this.mainCanvas.style.cursor = 'grab';
      }

      this.ikController.endDrag();
    }
  };

  private updateDrag(screenX: number, screenY: number): void {
    if (!this.draggingAxis || !this.dragStartPos || !this.dragStartScreen || !this.activeJoint) {
      return;
    }

    const dx = screenX - this.dragStartScreen[0];
    const dy = screenY - this.dragStartScreen[1];

    // Get axis direction in world space
    const axis = AXES.find((a) => a.name === this.draggingAxis);
    if (!axis) return;

    // Project axis to screen to determine drag sensitivity
    const jointPos = this.dragStartPos;
    const axisEnd: Vec3 = [
      jointPos[0] + axis.direction[0],
      jointPos[1] + axis.direction[1],
      jointPos[2] + axis.direction[2],
    ];

    const screenStart = this.projectToScreen(jointPos);
    const screenEnd = this.projectToScreen(axisEnd);
    if (!screenStart || !screenEnd) return;

    // Compute screen-space axis direction
    const screenAxisX = screenEnd[0] - screenStart[0];
    const screenAxisY = screenEnd[1] - screenStart[1];
    const screenAxisLen = Math.sqrt(screenAxisX * screenAxisX + screenAxisY * screenAxisY);
    if (screenAxisLen < 0.0001) return;

    // Normalize
    const screenAxisNormX = screenAxisX / screenAxisLen;
    const screenAxisNormY = screenAxisY / screenAxisLen;

    // Project mouse movement onto screen-space axis
    const dragDot = dx * screenAxisNormX + dy * screenAxisNormY;

    // Convert screen drag to world movement
    // Scale factor based on camera distance
    const cameraDistance = this.camera.distance;
    const scaleFactor = cameraDistance * 0.001; // Adjust sensitivity
    const worldMovement = dragDot * scaleFactor;

    // Apply movement along axis
    const newPos: Vec3 = [
      this.dragStartPos[0] + axis.direction[0] * worldMovement,
      this.dragStartPos[1] + axis.direction[1] * worldMovement,
      this.dragStartPos[2] + axis.direction[2] * worldMovement,
    ];

    console.log('[GIZMO] updateDrag - axis:', this.draggingAxis, 'movement:', worldMovement, 'newPos:', newPos);

    // Update IK target
    this.ikController.updateDrag(newPos);
  }

  private hitTestAxes(screenX: number, screenY: number): 'x' | 'y' | 'z' | null {
    if (!this.activeJoint) return null;

    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (!jointPos) return null;

    const screenPos = this.projectToScreen(jointPos);
    if (!screenPos) return null;

    // Test each axis
    for (const axis of AXES) {
      const axisEnd: Vec3 = [
        jointPos[0] + axis.direction[0] * ARROW_LENGTH,
        jointPos[1] + axis.direction[1] * ARROW_LENGTH,
        jointPos[2] + axis.direction[2] * ARROW_LENGTH,
      ];

      const screenEnd = this.projectToScreen(axisEnd);
      if (!screenEnd) continue;

      // Check if mouse is near the line
      const dist = this.distanceToLineSegment(
        screenX,
        screenY,
        screenPos[0],
        screenPos[1],
        screenEnd[0],
        screenEnd[1]
      );

      if (dist < 10) {
        return axis.name;
      }
    }

    return null;
  }

  private distanceToLineSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 0.0001) {
      // Point to point
      const dpx = px - x1;
      const dpy = py - y1;
      return Math.sqrt(dpx * dpx + dpy * dpy);
    }

    // Project point onto line
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dpx = px - projX;
    const dpy = py - projY;

    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  private projectToScreen(worldPos: Vec3): [number, number] | null {
    const viewProj = this.camera.viewProj;

    // Transform to clip space
    const clipX =
      viewProj[0] * worldPos[0] +
      viewProj[1] * worldPos[1] +
      viewProj[2] * worldPos[2] +
      viewProj[3];
    const clipY =
      viewProj[4] * worldPos[0] +
      viewProj[5] * worldPos[1] +
      viewProj[6] * worldPos[2] +
      viewProj[7];
    const clipW =
      viewProj[12] * worldPos[0] +
      viewProj[13] * worldPos[1] +
      viewProj[14] * worldPos[2] +
      viewProj[15];

    // Behind camera
    if (clipW <= 0) return null;

    // NDC
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    // Screen coordinates
    const screenX = ((ndcX + 1) * 0.5) * this.canvas.width;
    const screenY = ((1 - ndcY) * 0.5) * this.canvas.height;

    return [screenX, screenY];
  }

  /**
   * Set the active joint to show gizmo for.
   */
  setActiveJoint(jointId: number | null): void {
    this.activeJoint = jointId;
    this.hoveredAxis = null;
    this.draggingAxis = null;

    // Reset cursor when deactivating
    if (!jointId) {
      this.mainCanvas.style.cursor = '';
    }

    // Gizmo canvas always has pointer-events: none
    // We listen to main canvas events instead
  }

  /**
   * Get the currently active joint.
   */
  getActiveJoint(): number | null {
    return this.activeJoint;
  }

  /**
   * Check if gizmo is currently being dragged.
   */
  isDragging(): boolean {
    return this.draggingAxis !== null;
  }

  /**
   * Check if gizmo is active (has a joint selected).
   */
  isActive(): boolean {
    return this.activeJoint !== null;
  }

  /**
   * Get the overlay canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Render the translation gizmo.
   */
  render(): void {
    // Resize canvas if needed
    if (
      this.canvas.width !== this.mainCanvas.width ||
      this.canvas.height !== this.mainCanvas.height
    ) {
      this.canvas.width = this.mainCanvas.width;
      this.canvas.height = this.mainCanvas.height;
    }

    // Clear previous frame
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Don't render if IK is disabled or no active joint
    if (!this.ikController.state.enabled || !this.activeJoint) {
      return;
    }

    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (!jointPos) return;

    const screenPos = this.projectToScreen(jointPos);
    if (!screenPos) return;

    // Render each axis
    for (const axis of AXES) {
      const axisEnd: Vec3 = [
        jointPos[0] + axis.direction[0] * ARROW_LENGTH,
        jointPos[1] + axis.direction[1] * ARROW_LENGTH,
        jointPos[2] + axis.direction[2] * ARROW_LENGTH,
      ];

      const screenEnd = this.projectToScreen(axisEnd);
      if (!screenEnd) continue;

      const isHovered = this.hoveredAxis === axis.name;
      const isDragging = this.draggingAxis === axis.name;

      this.drawArrow(
        screenPos[0],
        screenPos[1],
        screenEnd[0],
        screenEnd[1],
        axis.color,
        isHovered || isDragging
      );
    }
  }

  private drawArrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    highlighted: boolean
  ): void {
    const thickness = highlighted ? HOVER_THICKNESS : ARROW_THICKNESS;

    // Draw line
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = thickness;
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Draw arrowhead
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return;

    const dirX = dx / len;
    const dirY = dy / len;

    const headLength = 15;
    const headWidth = 8;

    const baseX = x2 - dirX * headLength;
    const baseY = y2 - dirY * headLength;

    const perpX = -dirY;
    const perpY = dirX;

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(baseX + perpX * headWidth, baseY + perpY * headWidth);
    this.ctx.lineTo(baseX - perpX * headWidth, baseY - perpY * headWidth);
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Clean up event listeners.
   */
  dispose(): void {
    this.mainCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.mainCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.mainCanvas.removeEventListener('pointerup', this.onPointerUp);
  }
}
