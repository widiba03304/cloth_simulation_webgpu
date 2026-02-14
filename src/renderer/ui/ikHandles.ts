/**
 * IK handle visualization overlay.
 * Renders joint handles as circles on a 2D canvas overlay.
 */

import type { OrbitCamera } from '../render/camera';
import type { IKController } from '../ik/ikController';
import type { IKInputHandler } from '../input/ikInput';
import type { Vec3 } from '../ik/skeleton';

export interface HandleStyle {
  radius: number; // Screen-space radius (pixels)
  color: string; // Base color
  hoverColor: string; // Color when hovered
  activeColor: string; // Color when dragging
  strokeWidth: number; // Outline width
  strokeColor: string; // Outline color
}

/**
 * Default handle styles by joint type.
 */
const DEFAULT_STYLES: Record<string, HandleStyle> = {
  wrist: {
    radius: 12,
    color: '#3498db', // Blue
    hoverColor: '#5dade2',
    activeColor: '#2980b9',
    strokeWidth: 2,
    strokeColor: '#ffffff',
  },
  ankle: {
    radius: 12,
    color: '#2ecc71', // Green
    hoverColor: '#58d68d',
    activeColor: '#27ae60',
    strokeWidth: 2,
    strokeColor: '#ffffff',
  },
  elbow: {
    radius: 10,
    color: '#f39c12', // Yellow/Orange
    hoverColor: '#f5b041',
    activeColor: '#d68910',
    strokeWidth: 2,
    strokeColor: '#ffffff',
  },
  knee: {
    radius: 10,
    color: '#e67e22', // Orange
    hoverColor: '#eb984e',
    activeColor: '#ca6f1e',
    strokeWidth: 2,
    strokeColor: '#ffffff',
  },
};

/**
 * IK handle renderer for canvas overlay.
 */
export class IKHandleRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mainCanvas: HTMLCanvasElement;
  private camera: OrbitCamera;
  private ikController: IKController;
  private ikInput: IKInputHandler;

  // Joint ID -> style mapping
  private handleStyles: Map<number, HandleStyle>;

  constructor(
    mainCanvas: HTMLCanvasElement,
    camera: OrbitCamera,
    ikController: IKController,
    ikInput: IKInputHandler
  ) {
    this.mainCanvas = mainCanvas;
    this.camera = camera;
    this.ikController = ikController;
    this.ikInput = ikInput;

    // Create overlay canvas
    this.canvas = this.createOverlayCanvas();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for IK handle overlay');
    }
    this.ctx = ctx;

    this.handleStyles = new Map();

    console.log('IK handle renderer initialized');
  }

  /**
   * Create transparent overlay canvas.
   */
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
      z-index: 10;
    `;
    return canvas;
  }

  /**
   * Set styles for specific joints.
   */
  setJointStyles(jointIds: number[]): void {
    // Assign styles based on joint names
    for (const jointId of jointIds) {
      const joint = this.ikController.skeleton.getJoint(jointId);
      if (!joint) continue;

      let style: HandleStyle;
      if (joint.name.includes('wrist')) {
        style = { ...DEFAULT_STYLES.wrist };
      } else if (joint.name.includes('ankle')) {
        style = { ...DEFAULT_STYLES.ankle };
      } else if (joint.name.includes('elbow')) {
        style = { ...DEFAULT_STYLES.elbow };
      } else if (joint.name.includes('knee')) {
        style = { ...DEFAULT_STYLES.knee };
      } else {
        // Default style
        style = { ...DEFAULT_STYLES.wrist };
      }

      this.handleStyles.set(jointId, style);
    }
  }

  /**
   * Render all IK handles.
   */
  private lastLoggedEnabled: boolean | null = null;

  render(): void {
    // Debug logging when state changes
    if (this.lastLoggedEnabled !== this.ikController.state.enabled) {
      console.log(`[IKHandles] IK state changed: ${this.lastLoggedEnabled} → ${this.ikController.state.enabled}`);
      this.lastLoggedEnabled = this.ikController.state.enabled;
    }

    if (!this.ikController.state.enabled) {
      // Clear canvas if IK is disabled
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

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

    // Get joint positions
    const jointPositions = this.ikController.getJointPositions();
    const enabledJoints = this.ikController.getEnabledJoints();
    const hoveredJoint = this.ikInput.getHoveredJoint();
    const draggedJoint = this.ikInput.getDraggedJoint();

    // Debug first render
    if (this.lastLoggedEnabled === true && enabledJoints.length > 0) {
      console.log(`[IKHandles] Rendering ${enabledJoints.length} joint handles`);
      console.log(`[IKHandles] Enabled joint IDs:`, enabledJoints);
      console.log(`[IKHandles] Total joint positions:`, jointPositions.length);
      this.lastLoggedEnabled = null; // Only log once
    }

    // Render each enabled joint
    let visibleCount = 0;
    let skippedCount = 0;
    for (const jointId of enabledJoints) {
      if (jointId < 0 || jointId >= jointPositions.length) {
        console.warn(`[IKHandles] Joint ${jointId} out of range (0-${jointPositions.length - 1})`);
        continue;
      }

      const worldPos = jointPositions[jointId];
      const screenPos = this.projectToScreen(worldPos);

      // Skip if behind camera or off-screen
      if (!screenPos) {
        skippedCount++;
        if (enabledJoints.length > 0 && skippedCount === 1) {
          console.log(`[IKHandles] Joint ${jointId} skipped - worldPos:`, worldPos, 'screenPos:', screenPos);
        }
        continue;
      }

      visibleCount++;

      // Get style
      const style = this.handleStyles.get(jointId) || DEFAULT_STYLES.wrist;

      // Determine state
      const isActive = draggedJoint === jointId;
      const isHovered = hoveredJoint === jointId;

      // Draw handle
      this.drawHandle(screenPos, style, isActive, isHovered);
    }

    if (enabledJoints.length > 0 && (visibleCount + skippedCount) > 0) {
      console.log(`[IKHandles] Rendered ${visibleCount} handles, skipped ${skippedCount}`);
    }
  }

  /**
   * Project 3D world position to 2D screen position.
   */
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
    const clipZ =
      viewProj[8] * worldPos[0] +
      viewProj[9] * worldPos[1] +
      viewProj[10] * worldPos[2] +
      viewProj[11];
    const clipW =
      viewProj[12] * worldPos[0] +
      viewProj[13] * worldPos[1] +
      viewProj[14] * worldPos[2] +
      viewProj[15];

    // Behind camera
    if (clipW <= 0) return null;

    // Perspective divide
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    const ndcZ = clipZ / clipW;

    // Behind far plane
    if (ndcZ < 0 || ndcZ > 1) return null;

    // NDC to screen space
    const screenX = (ndcX + 1) * 0.5 * this.canvas.width;
    const screenY = (1 - ndcY) * 0.5 * this.canvas.height;

    return [screenX, screenY];
  }

  /**
   * Draw a single handle at screen position.
   */
  private drawHandle(
    screenPos: [number, number],
    style: HandleStyle,
    isActive: boolean,
    isHovered: boolean
  ): void {
    const [x, y] = screenPos;

    // Choose color based on state
    let fillColor = style.color;
    let radius = style.radius;

    if (isActive) {
      fillColor = style.activeColor;
      radius *= 1.2; // Scale up when dragging
    } else if (isHovered) {
      fillColor = style.hoverColor;
      radius *= 1.1; // Scale up when hovering
    }

    // Draw filled circle
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();

    // Draw stroke
    this.ctx.strokeStyle = style.strokeColor;
    this.ctx.lineWidth = style.strokeWidth;
    this.ctx.stroke();

    // Add glow effect for active handle
    if (isActive) {
      this.ctx.shadowColor = fillColor;
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
  }

  /**
   * Get the overlay canvas element (for appending to DOM).
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Update canvas size if main canvas resized.
   */
  updateSize(): void {
    if (
      this.canvas.width !== this.mainCanvas.width ||
      this.canvas.height !== this.mainCanvas.height
    ) {
      this.canvas.width = this.mainCanvas.width;
      this.canvas.height = this.mainCanvas.height;
    }
  }
}

/**
 * Create IK handle overlay canvas.
 */
export function createIKHandleCanvas(mainCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mainCanvas.width;
  canvas.height = mainCanvas.height;
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  `;
  return canvas;
}
