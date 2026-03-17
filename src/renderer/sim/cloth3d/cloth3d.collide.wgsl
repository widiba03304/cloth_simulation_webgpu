// Body SDF collision + floor constraint for 3D cloth.
// Replaces capsule-based collision with an accurate signed-distance field
// sampled from the actual SMPL body mesh.

struct CollideParams {
  numParticles: u32,
  pad0:         u32,
  floorY:       f32,
  pad1:         f32,
  // World-space origin and extent of the SDF grid
  sdfMinX: f32, sdfMinY: f32, sdfMinZ: f32, pad2: f32,
  sdfExtX: f32, sdfExtY: f32, sdfExtZ: f32, pad3: f32,
}

@group(0) @binding(0) var<storage, read_write> pos:       array<f32>;
@group(0) @binding(1) var<storage, read>       pinned:    array<u32>;
@group(0) @binding(2) var                      sdfTex:    texture_3d<f32>;
@group(0) @binding(3) var<uniform>             params:    CollideParams;

// ── Trilinear SDF sample (8 textureLoad calls) ────────────────────────────────

fn sampleSDF(p: vec3<f32>) -> f32 {
  let sdfMin = vec3<f32>(params.sdfMinX, params.sdfMinY, params.sdfMinZ);
  let sdfExt = vec3<f32>(params.sdfExtX, params.sdfExtY, params.sdfExtZ);

  // Normalise to [0,1]^3
  let uvw = (p - sdfMin) / sdfExt;
  // Outside the grid → definitely outside body
  if (uvw.x < 0.0 || uvw.x > 1.0 ||
      uvw.y < 0.0 || uvw.y > 1.0 ||
      uvw.z < 0.0 || uvw.z > 1.0) {
    return 1.0;
  }

  let dim  = vec3<f32>(textureDimensions(sdfTex));
  let dmax = vec3<i32>(dim) - vec3<i32>(1);
  let fc   = uvw * (dim - vec3<f32>(1.0));
  let ic   = vec3<i32>(floor(fc));
  let fr   = fc - floor(fc);

  let c000 = textureLoad(sdfTex, clamp(ic,                       vec3<i32>(0), dmax), 0).r;
  let c100 = textureLoad(sdfTex, clamp(ic + vec3<i32>(1,0,0),   vec3<i32>(0), dmax), 0).r;
  let c010 = textureLoad(sdfTex, clamp(ic + vec3<i32>(0,1,0),   vec3<i32>(0), dmax), 0).r;
  let c110 = textureLoad(sdfTex, clamp(ic + vec3<i32>(1,1,0),   vec3<i32>(0), dmax), 0).r;
  let c001 = textureLoad(sdfTex, clamp(ic + vec3<i32>(0,0,1),   vec3<i32>(0), dmax), 0).r;
  let c101 = textureLoad(sdfTex, clamp(ic + vec3<i32>(1,0,1),   vec3<i32>(0), dmax), 0).r;
  let c011 = textureLoad(sdfTex, clamp(ic + vec3<i32>(0,1,1),   vec3<i32>(0), dmax), 0).r;
  let c111 = textureLoad(sdfTex, clamp(ic + vec3<i32>(1,1,1),   vec3<i32>(0), dmax), 0).r;

  let x0 = mix(c000, c100, fr.x);
  let x1 = mix(c010, c110, fr.x);
  let x2 = mix(c001, c101, fr.x);
  let x3 = mix(c011, c111, fr.x);
  return mix(mix(x0, x1, fr.y), mix(x2, x3, fr.y), fr.z);
}

// ── Gradient direction via nearest-neighbour finite difference (6 loads) ─────
// Returns the outward-pointing unit normal of the SDF at p.

fn sdfGradient(p: vec3<f32>) -> vec3<f32> {
  let sdfMin = vec3<f32>(params.sdfMinX, params.sdfMinY, params.sdfMinZ);
  let sdfExt = vec3<f32>(params.sdfExtX, params.sdfExtY, params.sdfExtZ);
  let dim    = vec3<f32>(textureDimensions(sdfTex));
  let dmax   = vec3<i32>(dim) - vec3<i32>(1);

  let uvw = (p - sdfMin) / sdfExt;
  let fc  = uvw * (dim - vec3<f32>(1.0));
  let ic  = vec3<i32>(round(fc));

  let gx = textureLoad(sdfTex, clamp(ic + vec3<i32>( 1,0,0), vec3<i32>(0), dmax), 0).r
          - textureLoad(sdfTex, clamp(ic + vec3<i32>(-1,0,0), vec3<i32>(0), dmax), 0).r;
  let gy = textureLoad(sdfTex, clamp(ic + vec3<i32>(0, 1,0), vec3<i32>(0), dmax), 0).r
          - textureLoad(sdfTex, clamp(ic + vec3<i32>(0,-1,0), vec3<i32>(0), dmax), 0).r;
  let gz = textureLoad(sdfTex, clamp(ic + vec3<i32>(0,0, 1), vec3<i32>(0), dmax), 0).r
          - textureLoad(sdfTex, clamp(ic + vec3<i32>(0,0,-1), vec3<i32>(0), dmax), 0).r;

  let g = vec3<f32>(gx, gy, gz);
  let gl = length(g);
  if (gl < 1e-6) { return vec3<f32>(0.0, 1.0, 0.0); }
  return g / gl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.numParticles) { return; }

  // Pinned particles are fixed at their initial positions — skip all collision.
  if (pinned[i] != 0u) { return; }

  let b = i * 3u;
  var p = vec3<f32>(pos[b], pos[b + 1u], pos[b + 2u]);

  // ── Body SDF collision ────────────────────────────────────────────────────
  // cloth_offset: keep cloth slightly above body surface for visual separation
  let cloth_offset = 0.007;
  let dist = sampleSDF(p);
  if (dist < cloth_offset) {
    let grad = sdfGradient(p);
    p = p + (cloth_offset - dist) * grad;
  }

  // ── Floor collision ───────────────────────────────────────────────────────
  if (p.y < params.floorY) {
    p.y = params.floorY;
  }

  pos[b]      = p.x;
  pos[b + 1u] = p.y;
  pos[b + 2u] = p.z;
}
