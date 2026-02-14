/**
 * Orbit camera: view and projection matrices. No dependencies on sim or UI.
 *
 * Spherical convention (right-handed, Y-up):
 *   - θ (theta) = azimuth in XZ: 0 = camera in +Z (front), π/2 = +X (right), π = -Z (behind).
 *   - φ (phi)   = elevation from XZ: 0 = horizontal, π/2 = above (top-down).
 *   - dir(θ,φ) = (cos(φ)sin(θ), sin(φ), cos(φ)cos(θ)).
 *   - Eye = target + distance * dir(θ,φ).
 *
 * Verification: theta=π (orbit right 180°), phi=π/2 (orbit up 90°) => dir=(0,1,0) => eye = target+(0,d,0) => top-down view.
 *
 * View: forward = target - eye; right = cross(worldUp, forward); up = cross(forward, right). Roll = 0 for orbit.
 * Matrices row-major here; pipeline transposes to column-major for WGSL.
 */

export interface OrbitCamera {
  /** View-projection matrix (4x4, row-major Float32Array; pipeline transposes for WGSL) */
  viewProj: Float32Array;
  /** Projection only (for skybox so it does not move with camera) */
  proj: Float32Array;
  /** Camera distance from target */
  distance: number;
  /** Horizontal angle (radians) */
  theta: number;
  /** Vertical angle (radians) */
  phi: number;
  /** Roll around view axis (radians) */
  roll: number;
  /** Target point (look-at) in world space */
  target: [number, number, number];
  /** If set (during orbit gesture), view uses this as pivot so the center does not drift. Cleared on gesture end. */
  orbitPivot: [number, number, number] | null;
  /** Aspect ratio */
  aspect: number;
  /** Vertical FOV (radians) */
  fov: number;
  near: number;
  far: number;
}


export function createOrbitCamera(
  distance: number = 3,
  target: [number, number, number] = [0, 0, 0]
): OrbitCamera {
  const viewProj = new Float32Array(16);
  const proj = new Float32Array(16);
  return {
    viewProj,
    proj,
    distance,
    theta: 0,       // start in front of mannequin (mesh faces +Z; camera at +Z sees front)
    phi: 0.25,      // slightly above horizontal so mannequin is in view
    roll: 0,
    target: [...target],
    orbitPivot: null,
    aspect: 1,
    fov: Math.PI / 4,
    near: 0.1,
    far: 100,
  };
}

/**
 * Update viewProj matrix from camera state.
 * Eye = pivot + distance * dir(θ,φ); view = lookAt(eye, pivot). Uses cam.orbitPivot when set (during orbit gesture), else cam.target.
 */
export function updateCamera(cam: OrbitCamera): void {
  const [tx, ty, tz] = cam.orbitPivot ?? cam.target;
  const sinT = Math.sin(cam.theta);
  const cosT = Math.cos(cam.theta);
  const sinP = Math.sin(cam.phi);
  const cosP = Math.cos(cam.phi);
  const eyeX = tx + cam.distance * cosP * sinT;
  const eyeY = ty + cam.distance * sinP;
  const eyeZ = tz + cam.distance * cosP * cosT;
  let view = viewMatrix(eyeX, eyeY, eyeZ, tx, ty, tz);
  if (cam.roll !== 0) {
    const r = cam.roll;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const r0 = view[0];
    const r1 = view[1];
    const r2 = view[2];
    const u0 = view[4];
    const u1 = view[5];
    const u2 = view[6];
    view = view.slice(0) as Float32Array;
    view[0] = c * r0 + s * u0;
    view[1] = c * r1 + s * u1;
    view[2] = c * r2 + s * u2;
    view[4] = -s * r0 + c * u0;
    view[5] = -s * r1 + c * u1;
    view[6] = -s * r2 + c * u2;
  }
  const aspect = Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 1;
  const projMat = projectionMatrix(aspect, cam.fov, cam.near, cam.far);
  cam.proj.set(projMat);
  const vp = viewProjFrom(view, projMat);
  cam.viewProj.set(vp);
}

/** lookAt(eye, target, worldUp). forward = target - eye; right = cross(worldUp, forward); up = cross(forward, right). View Z = -forward. */
function viewMatrix(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): Float32Array {
  const m = new Float32Array(16);
  const fx = tx - ex;
  const fy = ty - ey;
  const fz = tz - ez;
  const flen = Math.hypot(fx, fy, fz) || 1;
  const f0 = fx / flen;
  const f1 = fy / flen;
  const f2 = fz / flen;
  const worldUpX = 0;
  const worldUpY = 1;
  const worldUpZ = 0;
  // right = cross(worldUp, forward) = (fz, 0, -fx) when worldUp=(0,1,0)
  let rx = worldUpY * f2 - worldUpZ * f1;
  let ry = worldUpZ * f0 - worldUpX * f2;
  let rz = worldUpX * f1 - worldUpY * f0;
  let rlen = Math.hypot(rx, ry, rz);
  if (rlen < 1e-6) {
    // Looking straight up or down: pick right so view is stable (e.g. top-down => right = +X, up = +Z)
    if (f1 < 0) {
      rx = 1; ry = 0; rz = 0; // looking down: right = +X
    } else {
      rx = -1; ry = 0; rz = 0; // looking up: right = -X
    }
    rlen = 1;
  } else {
    rx /= rlen;
    ry /= rlen;
    rz /= rlen;
  }
  // up = cross(forward, right)
  let u0 = ry * f2 - rz * f1;
  let u1 = rz * f0 - rx * f2;
  let u2 = rx * f1 - ry * f0;
  const ulen = Math.hypot(u0, u1, u2) || 1;
  u0 /= ulen;
  u1 /= ulen;
  u2 /= ulen;
  const ax = -f0;
  const ay = -f1;
  const az = -f2;
  // Rows must be (right, 0), (up, 0), (-forward, 0) so that view * p = (right.(p-eye), up.(p-eye), -forward.(p-eye), 1)
  m[0] = rx;
  m[1] = ry;
  m[2] = rz;
  m[3] = -(rx * ex + ry * ey + rz * ez);
  m[4] = u0;
  m[5] = u1;
  m[6] = u2;
  m[7] = -(u0 * ex + u1 * ey + u2 * ez);
  m[8] = ax;
  m[9] = ay;
  m[10] = az;
  m[11] = -(ax * ex + ay * ey + az * ez);
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 1;
  return m;
}

/** WebGPU/Vulkan NDC: z in [0, 1], Y+ down. Maps view z in [-near,-far] to NDC z in [0, 1]. */
function projectionMatrix(aspect: number, fov: number, near: number, far: number): Float32Array {
  const m = new Float32Array(16);
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  m[0] = f / aspect;
  m[5] = -f;                  // NDC Y+ down (WebGPU/Vulkan); negate so world +Y (up) maps to screen up
  m[10] = far * nf;           // NDC z in [0,1]
  m[11] = far * near * nf;
  m[14] = -1;                 // w_clip = -z_eye
  m[15] = 0;
  return m;
}

function viewProjFrom(view: Float32Array, proj: Float32Array): Float32Array {
  const out = new Float32Array(16);
  multiplyMat4(out, proj, view);
  return out;
}

function multiplyMat4(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        a[i * 4] * b[j] +
        a[i * 4 + 1] * b[4 + j] +
        a[i * 4 + 2] * b[8 + j] +
        a[i * 4 + 3] * b[12 + j];
    }
  }
}

const ORBIT_SENSITIVITY = 0.012; // radians per pixel: 180° = π rad ≈ 262 px, 90° = π/2 rad ≈ 131 px (tuned from debug logs: 0.005 required ~628px for 180°)
const PAN_SENSITIVITY = 0.002;   // world units per pixel, scaled by distance
const ZOOM_SENSITIVITY = 0.001;
const ROLL_SENSITIVITY = 0.01;

const PHI_EPS = 1e-5; // Allow nearly ±90° so theta=π, phi=π/2 gives true top-down view.

export function orbitDrag(cam: OrbitCamera, deltaX: number, deltaY: number): void {
  cam.roll = 0;
  const sens = ORBIT_SENSITIVITY;
  // Strict spherical orbit: only theta and phi change. Target is never moved; eye = target + distance * dir(θ, φ).
  cam.theta += deltaX * sens;
  cam.phi += deltaY * sens;
  cam.phi = Math.max(-Math.PI / 2 + PHI_EPS, Math.min(Math.PI / 2 - PHI_EPS, cam.phi));
}

/** Pan: move target in view plane (Blender-style: drag right → view pans right). No-op while orbit pivot is set (orbit gesture active). */
export function orbitPan(cam: OrbitCamera, deltaX: number, deltaY: number): void {
  if (cam.orbitPivot) return; // never move target during orbit gesture
  const { right, up } = getCameraBasis(cam);
  const k = PAN_SENSITIVITY * cam.distance;
  cam.target[0] -= right[0] * k * deltaX + up[0] * k * deltaY;
  cam.target[1] += right[1] * k * deltaX + up[1] * k * deltaY;
  cam.target[2] -= right[2] * k * deltaX + up[2] * k * deltaY;
}

export function orbitZoom(cam: OrbitCamera, delta: number): void {
  // positive delta = scroll down → zoom out (increase distance)
  cam.distance = Math.max(0.5, Math.min(20, cam.distance * (1 + delta * ZOOM_SENSITIVITY)));
}

export function orbitRoll(cam: OrbitCamera, deltaAngle: number): void {
  cam.roll += deltaAngle * ROLL_SENSITIVITY;
}

/** Camera basis in world space: right, up, forward (unit vectors). Includes roll. */
export function getCameraBasis(cam: OrbitCamera): {
  right: [number, number, number];
  up: [number, number, number];
  forward: [number, number, number];
} {
  const sinT = Math.sin(cam.theta);
  const cosT = Math.cos(cam.theta);
  const sinP = Math.sin(cam.phi);
  const cosP = Math.cos(cam.phi);
  const ex = cam.distance * cosP * sinT;
  const ey = cam.distance * sinP;
  const ez = cam.distance * cosP * cosT;
  const f0 = -ex;
  const f1 = -ey;
  const f2 = -ez;
  const flen = Math.hypot(f0, f1, f2) || 1;
  const fx = f0 / flen;
  const fy = f1 / flen;
  const fz = f2 / flen;
  // right = cross(worldUp, forward) = (0,1,0) × (fx,fy,fz) = (fz, 0, -fx)
  let rx = fz;
  let ry = 0;
  let rz = -fx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  rz /= rlen;
  // up = cross(forward, right)
  let u0 = fy * rz - fz * ry;
  let u1 = fz * rx - fx * rz;
  let u2 = fx * ry - fy * rx;
  const ulen = Math.hypot(u0, u1, u2) || 1;
  u0 /= ulen;
  u1 /= ulen;
  u2 /= ulen;

  // Apply roll rotation around forward axis
  if (cam.roll !== 0) {
    const c = Math.cos(cam.roll);
    const s = Math.sin(cam.roll);
    const rx2 = c * rx + s * u0;
    const ry2 = c * ry + s * u1;
    const rz2 = c * rz + s * u2;
    const u02 = -s * rx + c * u0;
    const u12 = -s * ry + c * u1;
    const u22 = -s * rz + c * u2;
    return {
      right: [rx2, ry2, rz2],
      up: [u02, u12, u22],
      forward: [fx, fy, fz],
    };
  }

  return {
    right: [rx, ry, rz],
    up: [u0, u1, u2],
    forward: [fx, fy, fz],
  };
}
