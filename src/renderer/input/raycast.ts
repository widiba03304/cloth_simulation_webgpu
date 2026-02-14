/**
 * Raycasting utilities for 3D picking and interaction.
 * Converts screen coordinates to world rays and performs intersection tests.
 */

import type { OrbitCamera } from '../render/camera';
import type { Vec3 } from '../ik/skeleton';

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface RaycastHit {
  point: Vec3;
  distance: number;
  objectId?: number; // Joint ID or object ID
}

/**
 * Convert screen coordinates to world-space ray.
 * @param screenX - Screen X coordinate (0 to canvas.width)
 * @param screenY - Screen Y coordinate (0 to canvas.height)
 * @param camera - Camera with viewProj matrix
 * @param canvas - Canvas element
 * @returns Ray in world space
 */
export function screenToRay(
  screenX: number,
  screenY: number,
  camera: OrbitCamera,
  canvas: HTMLCanvasElement
): Ray {
  const w = canvas.width;
  const h = canvas.height;

  // Convert screen coordinates to NDC [-1, 1]
  const ndcX = (screenX / w) * 2 - 1;
  const ndcY = 1 - (screenY / h) * 2; // Flip Y axis

  // Unproject to world space using inverse view-projection matrix
  const invViewProj = invertMat4(camera.viewProj);

  // Near plane point (NDC z = 0)
  const nearNDC: Vec4 = [ndcX, ndcY, 0, 1];
  const near = transformVec4(invViewProj, nearNDC);

  // Far plane point (NDC z = 1)
  const farNDC: Vec4 = [ndcX, ndcY, 1, 1];
  const far = transformVec4(invViewProj, farNDC);

  // Perspective divide
  const nearWorld: Vec3 = [
    near[0] / near[3],
    near[1] / near[3],
    near[2] / near[3],
  ];

  const farWorld: Vec3 = [
    far[0] / far[3],
    far[1] / far[3],
    far[2] / far[3],
  ];

  // Ray direction
  const direction = vec3Normalize(vec3Subtract(farWorld, nearWorld));

  return {
    origin: nearWorld,
    direction,
  };
}

/**
 * Ray-sphere intersection test.
 * @param ray - Ray in world space
 * @param center - Sphere center in world space
 * @param radius - Sphere radius
 * @returns Hit information or null if no intersection
 */
export function raySphereIntersect(
  ray: Ray,
  center: Vec3,
  radius: number
): RaycastHit | null {
  // Vector from ray origin to sphere center
  const oc = vec3Subtract(center, ray.origin);

  // Project onto ray direction
  const tca = vec3Dot(oc, ray.direction);

  // Sphere is behind ray
  if (tca < 0) return null;

  // Distance from sphere center to ray
  const d2 = vec3Dot(oc, oc) - tca * tca;
  const radius2 = radius * radius;

  // Ray misses sphere
  if (d2 > radius2) return null;

  // Distance along ray to intersection point
  const thc = Math.sqrt(radius2 - d2);
  const t = tca - thc; // Use near intersection

  // Intersection point
  const point: Vec3 = [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];

  return {
    point,
    distance: t,
  };
}

/**
 * Find closest joint handle to ray.
 * @param ray - Ray in world space
 * @param jointPositions - Array of joint world positions
 * @param handleRadius - Radius for handle picking
 * @param allowedJoints - Optional array of joint IDs to test
 * @returns Hit with joint ID or null
 */
export function pickJointHandle(
  ray: Ray,
  jointPositions: Vec3[],
  handleRadius: number,
  allowedJoints?: number[]
): RaycastHit | null {
  let closestHit: RaycastHit | null = null;
  let closestDist = Infinity;

  const jointsToTest = allowedJoints || jointPositions.map((_, i) => i);

  for (const jointId of jointsToTest) {
    if (jointId < 0 || jointId >= jointPositions.length) continue;

    const center = jointPositions[jointId];
    const hit = raySphereIntersect(ray, center, handleRadius);

    if (hit && hit.distance < closestDist) {
      closestHit = hit;
      closestDist = hit.distance;
      closestHit.objectId = jointId;
    }
  }

  return closestHit;
}

/**
 * Project 3D point onto a plane perpendicular to camera view direction.
 * Used for dragging handles in screen space.
 * @param screenX - Current screen X
 * @param screenY - Current screen Y
 * @param planePoint - Point on the drag plane (e.g., joint position)
 * @param camera - Camera
 * @param canvas - Canvas element
 * @returns 3D point on drag plane
 */
export function projectToDragPlane(
  screenX: number,
  screenY: number,
  planePoint: Vec3,
  camera: OrbitCamera,
  canvas: HTMLCanvasElement
): Vec3 {
  const ray = screenToRay(screenX, screenY, camera, canvas);

  // Plane normal is camera forward direction
  const forward = getCameraForward(camera);

  // Intersect ray with plane
  const denom = vec3Dot(forward, ray.direction);

  // Ray is parallel to plane
  if (Math.abs(denom) < 0.0001) {
    return planePoint;
  }

  // Distance along ray to plane intersection
  const toPlane = vec3Subtract(planePoint, ray.origin);
  const t = vec3Dot(toPlane, forward) / denom;

  // Point on plane
  return [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];
}

// ============================================================================
// Math Utilities
// ============================================================================

type Vec4 = [number, number, number, number];

/**
 * Invert 4x4 matrix (row-major).
 */
function invertMat4(m: Float32Array): Float32Array {
  const out = new Float32Array(16);

  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (Math.abs(det) < 0.0001) {
    // Singular matrix, return identity
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
  }

  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/**
 * Transform 4D vector by 4x4 matrix.
 */
function transformVec4(m: Float32Array, v: Vec4): Vec4 {
  const [x, y, z, w] = v;
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3] * w,
    m[4] * x + m[5] * y + m[6] * z + m[7] * w,
    m[8] * x + m[9] * y + m[10] * z + m[11] * w,
    m[12] * x + m[13] * y + m[14] * z + m[15] * w,
  ];
}

/**
 * Normalize 3D vector.
 */
function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 0.0001) return [0, 0, 1]; // Default forward
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Subtract two 3D vectors.
 */
function vec3Subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Dot product of two 3D vectors.
 */
function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Get camera forward direction from viewProj matrix.
 */
function getCameraForward(camera: OrbitCamera): Vec3 {
  // Camera forward is -Z axis of view matrix
  // Extract from inverse view-projection (approximate)
  const invViewProj = invertMat4(camera.viewProj);

  // Forward vector is third column of inverse view matrix
  const forward: Vec3 = [
    invViewProj[8],
    invViewProj[9],
    invViewProj[10],
  ];

  return vec3Normalize(forward);
}
