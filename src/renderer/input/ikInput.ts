/**
 * IK input handler for dragging joint handles.
 * Manages mouse/pointer events for interactive IK manipulation.
 */

import type { OrbitCamera } from '../render/camera';
import type { IKController } from '../ik/ikController';
import { screenToRay, pickJointHandle, projectToDragPlane } from './raycast';

export interface IKInputState {
  active: boolean; // Is IK input currently handling events
  draggedJoint: number | null; // Joint ID being dragged
  hoveredJoint: number | null; // Joint ID under cursor
  dragStartPos: [number, number] | null; // Screen position where drag started
  dragCurrentPos: [number, number] | null; // Current screen position during drag
  handleRadius: number; // Screen-space radius for handle picking (pixels)
}

/**
 * IK input handler manages pointer events for dragging joint handles.
 */
export class IKInputHandler {
  private ikController: IKController;
  private camera: OrbitCamera;
  private canvas: HTMLCanvasElement;

  state: IKInputState;

  // Callbacks
  private onDragStart?: (jointId: number) => void;
  private onDragEnd?: (jointId: number) => void;

  constructor(
    ikController: IKController,
    camera: OrbitCamera,
    canvas: HTMLCanvasElement
  ) {
    this.ikController = ikController;
    this.camera = camera;
    this.canvas = canvas;

    this.state = {
      active: false,
      draggedJoint: null,
      hoveredJoint: null,
      dragStartPos: null,
      dragCurrentPos: null,
      handleRadius: 20, // 20 pixels
    };
  }

  /**
   * Set drag callbacks.
   */
  setCallbacks(callbacks: {
    onDragStart?: (jointId: number) => void;
    onDragEnd?: (jointId: number) => void;
  }): void {
    this.onDragStart = callbacks.onDragStart;
    this.onDragEnd = callbacks.onDragEnd;
  }

  /**
   * Handle pointer down event (try to pick joint handle).
   * @returns true if IK handled the event (should block camera input)
   */
  onPointerDown(e: PointerEvent): boolean {
    if (!this.ikController.state.enabled) return false;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert screen to canvas coordinates
    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;

    // Create ray from screen position
    const ray = screenToRay(canvasX, canvasY, this.camera, this.canvas);

    // Get joint positions and enabled joints
    const jointPositions = this.ikController.getJointPositions();
    const enabledJoints = this.ikController.getEnabledJoints();

    // Calculate world-space handle radius based on screen-space radius
    // Approximate: convert screen pixels to world units using distance from camera
    const distToTarget = 2.0; // Approximate distance (could be calculated from camera)
    const worldHandleRadius = (this.state.handleRadius / this.canvas.height) * distToTarget;

    // Pick joint handle
    const hit = pickJointHandle(ray, jointPositions, worldHandleRadius, enabledJoints);

    if (hit && hit.objectId !== undefined) {
      // Start dragging this joint
      this.state.active = true;
      this.state.draggedJoint = hit.objectId;
      this.state.dragStartPos = [canvasX, canvasY];
      this.state.dragCurrentPos = [canvasX, canvasY];

      // Get initial target position (current joint position)
      const jointPos = this.ikController.getJointPosition(hit.objectId);
      if (jointPos) {
        this.ikController.startDrag(hit.objectId, jointPos);
      }

      // Callback
      if (this.onDragStart) {
        this.onDragStart(hit.objectId);
      }

      console.log(`Picked joint ${hit.objectId} (${this.ikController.skeleton.getJoint(hit.objectId)?.name})`);
      return true; // Block camera input
    }

    return false; // Allow camera input
  }

  /**
   * Handle pointer move event (update drag or hover).
   */
  onPointerMove(e: PointerEvent): void {
    if (!this.ikController.state.enabled) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert to canvas coordinates
    const canvasX = (screenX / rect.width) * this.canvas.width;
    const canvasY = (screenY / rect.height) * this.canvas.height;

    // Update drag current position
    this.state.dragCurrentPos = [canvasX, canvasY];

    if (this.state.draggedJoint !== null) {
      // Continue dragging
      const jointPos = this.ikController.getJointPosition(this.state.draggedJoint);
      if (jointPos) {
        // Project screen position to 3D drag plane
        const newTargetPos = projectToDragPlane(
          canvasX,
          canvasY,
          jointPos,
          this.camera,
          this.canvas
        );

        // Update IK target
        this.ikController.updateDrag(newTargetPos);
      }
    } else {
      // Update hover state
      const ray = screenToRay(canvasX, canvasY, this.camera, this.canvas);
      const jointPositions = this.ikController.getJointPositions();
      const enabledJoints = this.ikController.getEnabledJoints();

      const distToTarget = 2.0;
      const worldHandleRadius = (this.state.handleRadius / this.canvas.height) * distToTarget;

      const hit = pickJointHandle(ray, jointPositions, worldHandleRadius, enabledJoints);
      this.state.hoveredJoint = hit ? hit.objectId ?? null : null;
    }
  }

  /**
   * Handle pointer up event (end drag).
   */
  onPointerUp(e: PointerEvent): void {
    if (!this.state.active) return;

    const draggedJoint = this.state.draggedJoint;

    // End drag
    this.ikController.endDrag();

    this.state.active = false;
    this.state.draggedJoint = null;
    this.state.dragStartPos = null;

    // Callback
    if (draggedJoint !== null && this.onDragEnd) {
      this.onDragEnd(draggedJoint);
    }

    console.log('Released IK drag');
  }

  /**
   * Check if IK is currently active (should block camera input).
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Check if currently dragging a joint.
   */
  isDragging(): boolean {
    return this.state.draggedJoint !== null;
  }

  /**
   * Get currently hovered joint ID.
   */
  getHoveredJoint(): number | null {
    return this.state.hoveredJoint;
  }

  /**
   * Get currently dragged joint ID.
   */
  getDraggedJoint(): number | null {
    return this.state.draggedJoint;
  }

  /**
   * Set handle radius (screen-space pixels).
   */
  setHandleRadius(radius: number): void {
    this.state.handleRadius = radius;
  }
}
