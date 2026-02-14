/**
 * Rotation Gizmo for IK joints.
 * Displays X/Y/Z rotation circles that can be dragged to rotate joints.
 */

import type { OrbitCamera } from '../render/camera';
import type { IKController } from '../ik/ikController';
import type { Vec3, Quat } from '../ik/skeleton';
import { quatFromAxisAngle, quatMultiply } from '../ik/skeleton';

interface RotationRing {
  name: 'x' | 'y' | 'z';
  color: string;
  axis: Vec3;
}

const RINGS: RotationRing[] = [
  { name: 'x', color: '#ff0000', axis: [1, 0, 0] },  // Red - rotate around X
  { name: 'y', color: '#00ff00', axis: [0, 1, 0] },  // Green - rotate around Y
  { name: 'z', color: '#0000ff', axis: [0, 0, 1] },  // Blue - rotate around Z
];

const RING_RADIUS = 0.12;  // Radius in world units
const RING_SEGMENTS = 32;  // Number of segments to draw circle
const RING_THICKNESS = 3;
const HOVER_THICKNESS = 5;

export class RotationGizmo {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mainCanvas: HTMLCanvasElement;
  private camera: OrbitCamera;
  private ikController: IKController;

  private activeJoint: number | null = null;
  private hoveredRing: 'x' | 'y' | 'z' | null = null;
  private draggingRing: 'x' | 'y' | 'z' | null = null;
  private dragStartAngle: number = 0;
  private dragCurrentAngle: number = 0;
  private initialRotation: Quat | null = null;

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
      throw new Error('Failed to get 2D context for rotation gizmo');
    }
    this.ctx = ctx;

    // Set up event listeners
    this.setupEventListeners();

    console.log('Rotation gizmo initialized');
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
      z-index: 16;
    `;
    return canvas;
  }

  private setupEventListeners(): void {
    this.mainCanvas.addEventListener('pointermove', this.onPointerMove);
    this.mainCanvas.addEventListener('pointerdown', this.onPointerDown);
    this.mainCanvas.addEventListener('pointerup', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activeJoint || !this.ikController.state.enabled) {
      this.hoveredRing = null;
      // Don't touch cursor - let camera controls handle it
      return;
    }

    const rect = this.mainCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;

    if (this.draggingRing) {
      // Update rotation
      this.updateRotation(canvasX, canvasY);
    } else {
      // Check hover
      this.hoveredRing = this.hitTestRings(canvasX, canvasY);
      // Only set cursor if we're hovering over a ring
      if (this.hoveredRing) {
        this.mainCanvas.style.cursor = 'grab';
      }
      // Don't set to 'auto' - let other systems handle cursor when we're not hovering
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.hoveredRing || !this.activeJoint) {
      this.setActiveJoint(null);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.draggingRing = this.hoveredRing;
    this.mainCanvas.style.cursor = 'grabbing';
    this.mainCanvas.setPointerCapture(e.pointerId);

    const rect = this.mainCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;

    // Get initial angle
    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (jointPos) {
      const screenPos = this.projectToScreen(jointPos);
      if (screenPos) {
        this.dragStartAngle = Math.atan2(
          canvasY - screenPos[1],
          canvasX - screenPos[0]
        );
        this.dragCurrentAngle = this.dragStartAngle;

        // Save initial joint rotation
        const joint = this.ikController.skeleton.getJoint(this.activeJoint);
        if (joint) {
          this.initialRotation = [...joint.localRotation] as Quat;
        }

        console.log('[RotationGizmo] Starting rotation - joint:', this.activeJoint, 'ring:', this.draggingRing);
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.draggingRing) {
      try {
        this.mainCanvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.draggingRing = null;
      this.initialRotation = null;
      // Only set cursor if we're still hovering, otherwise leave it alone
      if (this.hoveredRing) {
        this.mainCanvas.style.cursor = 'grab';
      }

      // Trigger FK update
      this.ikController.skeleton.updateWorldTransforms();
      console.log('[RotationGizmo] Rotation complete');
    }
  };

  private updateRotation(screenX: number, screenY: number): void {
    if (!this.draggingRing || !this.activeJoint || !this.initialRotation) {
      return;
    }

    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (!jointPos) return;

    const screenPos = this.projectToScreen(jointPos);
    if (!screenPos) return;

    // Calculate current angle
    const currentAngle = Math.atan2(
      screenY - screenPos[1],
      screenX - screenPos[0]
    );

    // Calculate delta angle
    let deltaAngle = currentAngle - this.dragStartAngle;

    // Apply rotation to joint
    const ring = RINGS.find((r) => r.name === this.draggingRing);
    if (!ring) return;

    // Create rotation quaternion from axis-angle
    const rotationQuat = quatFromAxisAngle(ring.axis, deltaAngle);

    // Combine with initial rotation: newRot = deltaRot * initialRot
    const newRotation = quatMultiply(rotationQuat, this.initialRotation);

    // Apply to joint
    this.ikController.skeleton.setJointRotation(this.activeJoint, newRotation);

    // Update world transforms to propagate changes
    this.ikController.skeleton.updateWorldTransforms();

    // Mark skeleton as dirty to trigger GPU skinning
    this.ikController.markSkeletonDirty();

    console.log('[RotationGizmo] Rotation angle:', (deltaAngle * 180 / Math.PI).toFixed(1), '°');
  }

  private hitTestRings(screenX: number, screenY: number): 'x' | 'y' | 'z' | null {
    if (!this.activeJoint) return null;

    const jointPos = this.ikController.getJointPosition(this.activeJoint);
    if (!jointPos) return null;

    const screenPos = this.projectToScreen(jointPos);
    if (!screenPos) return null;

    // Test each ring
    for (const ring of RINGS) {
      // Sample points on the ring
      const numSamples = 32;
      for (let i = 0; i < numSamples; i++) {
        const angle = (i / numSamples) * Math.PI * 2;
        const ringPoint = this.getRingPoint(jointPos, ring, angle);
        const screenRingPos = this.projectToScreen(ringPoint);
        if (!screenRingPos) continue;

        const dist = Math.sqrt(
          Math.pow(screenX - screenRingPos[0], 2) +
          Math.pow(screenY - screenRingPos[1], 2)
        );

        if (dist < 10) {
          return ring.name;
        }
      }
    }

    return null;
  }

  private getRingPoint(center: Vec3, ring: RotationRing, angle: number): Vec3 {
    // Create a point on a circle perpendicular to the ring's axis
    const [ax, ay, az] = ring.axis;

    // Find two perpendicular vectors to the axis
    let u: Vec3, v: Vec3;
    if (Math.abs(ax) < 0.9) {
      u = this.normalize(this.cross([1, 0, 0], ring.axis));
    } else {
      u = this.normalize(this.cross([0, 1, 0], ring.axis));
    }
    v = this.normalize(this.cross(ring.axis, u));

    // Point on circle
    const cos = Math.cos(angle) * RING_RADIUS;
    const sin = Math.sin(angle) * RING_RADIUS;

    return [
      center[0] + u[0] * cos + v[0] * sin,
      center[1] + u[1] * cos + v[1] * sin,
      center[2] + u[2] * cos + v[2] * sin,
    ];
  }

  private cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  private normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 0.0001) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private projectToScreen(worldPos: Vec3): [number, number] | null {
    const viewProj = this.camera.viewProj;

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

    if (clipW <= 0) return null;

    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;

    const screenX = ((ndcX + 1) * 0.5) * this.canvas.width;
    const screenY = ((1 - ndcY) * 0.5) * this.canvas.height;

    return [screenX, screenY];
  }

  setActiveJoint(jointId: number | null): void {
    this.activeJoint = jointId;
    this.hoveredRing = null;
    this.draggingRing = null;

    // Reset cursor when deactivating
    if (!jointId) {
      this.mainCanvas.style.cursor = '';
    }
  }

  getActiveJoint(): number | null {
    return this.activeJoint;
  }

  isDragging(): boolean {
    return this.draggingRing !== null;
  }

  isActive(): boolean {
    return this.activeJoint !== null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

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

    // Render each rotation ring
    for (const ring of RINGS) {
      const isHovered = this.hoveredRing === ring.name;
      const isDragging = this.draggingRing === ring.name;

      this.drawRing(jointPos, ring, isHovered || isDragging);
    }
  }

  private drawRing(center: Vec3, ring: RotationRing, highlighted: boolean): void {
    const thickness = highlighted ? HOVER_THICKNESS : RING_THICKNESS;

    this.ctx.strokeStyle = ring.color;
    this.ctx.lineWidth = thickness;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();

    let firstPoint = true;
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2;
      const ringPoint = this.getRingPoint(center, ring, angle);
      const screenPoint = this.projectToScreen(ringPoint);

      if (!screenPoint) continue;

      if (firstPoint) {
        this.ctx.moveTo(screenPoint[0], screenPoint[1]);
        firstPoint = false;
      } else {
        this.ctx.lineTo(screenPoint[0], screenPoint[1]);
      }
    }

    this.ctx.stroke();
  }

  dispose(): void {
    this.mainCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.mainCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.mainCanvas.removeEventListener('pointerup', this.onPointerUp);
  }
}
