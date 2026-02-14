/**
 * Body Collision Shader (SDF-based)
 *
 * Detects and resolves collisions between cloth particles and body mesh
 * using a precomputed Signed Distance Field (SDF) texture.
 *
 * Convention: SDF negative = inside body, positive = outside, zero = on surface
 */

struct CollisionParams {
  friction: f32,        // Tangential velocity damping (0.0 - 1.0)
  restitution: f32,     // Normal velocity reflection (0.0 = no bounce, 1.0 = full bounce)
  thickness: f32,       // Cloth thickness offset (prevents z-fighting)
  _pad: f32,
}

struct BoundingBox {
  minPos: vec3f,        // Minimum corner of body mesh
  _pad0: f32,
  maxPos: vec3f,        // Maximum corner of body mesh
  _pad1: f32,
  invSize: vec3f,       // 1 / (max - min) for coordinate mapping
  _pad2: f32,
}

// Uniforms
@group(0) @binding(0) var<uniform> params: CollisionParams;
@group(0) @binding(1) var<uniform> bounds: BoundingBox;

// SDF texture (no sampler needed for textureLoad)
@group(0) @binding(2) var sdfTexture: texture_3d<f32>;

// Cloth particle data
@group(0) @binding(3) var<storage, read_write> position: array<vec3f>;
@group(0) @binding(4) var<storage, read_write> prevPosition: array<vec3f>;
@group(0) @binding(5) var<storage, read> pinned: array<u32>;

/**
 * Sample SDF at given UVW coordinates [0,1]³ using textureLoad.
 */
fn sampleSDF(uvw: vec3f, resolution: f32) -> f32 {
  // Convert UVW [0,1] to integer coordinates
  let coords = vec3i(uvw * resolution);

  // Clamp to valid range
  let maxCoord = i32(resolution) - 1;
  let clampedCoords = clamp(coords, vec3i(0), vec3i(maxCoord));

  return textureLoad(sdfTexture, clampedCoords, 0).r;
}

/**
 * Sample SDF gradient via central differences to get collision normal.
 */
fn sampleSDFGradient(uvw: vec3f, resolution: f32) -> vec3f {
  let eps = 1.0 / resolution;

  let dx = sampleSDF(uvw + vec3f(eps, 0.0, 0.0), resolution)
         - sampleSDF(uvw - vec3f(eps, 0.0, 0.0), resolution);

  let dy = sampleSDF(uvw + vec3f(0.0, eps, 0.0), resolution)
         - sampleSDF(uvw - vec3f(0.0, eps, 0.0), resolution);

  let dz = sampleSDF(uvw + vec3f(0.0, 0.0, eps), resolution)
         - sampleSDF(uvw - vec3f(0.0, 0.0, eps), resolution);

  return normalize(vec3f(dx, dy, dz));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;

  // Bounds check
  if (i >= arrayLength(&position)) {
    return;
  }

  // Skip pinned vertices
  if (pinned[i] != 0u) {
    return;
  }

  let pos = position[i];

  // Map world position to SDF texture coordinates [0, 1]³
  let uvw = (pos - bounds.minPos) * bounds.invSize;

  // Clamp to valid range (outside bounding box = no collision)
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return;
  }

  // Sample SDF (negative = inside body, positive = outside)
  let sdfValue = sampleSDF(uvw, 64.0);

  // Check penetration (particle within thickness distance of surface)
  let penetration = params.thickness - sdfValue;

  if (penetration > 0.0) {
    // Compute collision normal via SDF gradient
    // Gradient points in direction of increasing SDF (outward from body)
    let normal = sampleSDFGradient(uvw, 64.0);

    // Push particle out along normal
    let correction = normal * penetration;
    let newPos = pos + correction;

    // Compute Verlet velocity (velocity = current_pos - previous_pos)
    let vel = pos - prevPosition[i];

    // Decompose velocity into normal and tangential components
    let velNormal = dot(vel, normal) * normal;
    let velTangent = vel - velNormal;

    // Apply collision response
    // - Tangential velocity: reduced by friction
    // - Normal velocity: reflected and scaled by restitution
    let newVelTangent = velTangent * (1.0 - params.friction);
    let newVelNormal = -velNormal * params.restitution;
    let newVel = newVelTangent + newVelNormal;

    // Write back position and velocity (Verlet: prev = pos - vel)
    position[i] = newPos;
    prevPosition[i] = newPos - newVel;
  }
}
