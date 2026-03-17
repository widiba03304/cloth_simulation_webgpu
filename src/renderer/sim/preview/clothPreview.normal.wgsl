// Per-vertex normal computation from 2D positions.
// SimParams struct prepended at build time.

@group(0) @binding(0) var<storage, read> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> normals: array<f32>;
@group(0) @binding(2) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numParticles) { return; }

  let cols = params.cols;
  let rows = params.numParticles / cols;
  let r = idx / cols;
  let c = idx % cols;

  let px = pos[idx * 2u];
  let py = pos[idx * 2u + 1u];

  var lx = px; var ly = py;
  if (c > 0u) { let li = r * cols + c - 1u; lx = pos[li * 2u]; ly = pos[li * 2u + 1u]; }

  var rx = px; var ry = py;
  if (c < cols - 1u) { let ri = r * cols + c + 1u; rx = pos[ri * 2u]; ry = pos[ri * 2u + 1u]; }

  var ux = px; var uy = py;
  if (r > 0u) { let ui = (r - 1u) * cols + c; ux = pos[ui * 2u]; uy = pos[ui * 2u + 1u]; }

  var ddownx = px; var ddowny = py;
  if (r < rows - 1u) { let di = (r + 1u) * cols + c; ddownx = pos[di * 2u]; ddowny = pos[di * 2u + 1u]; }

  let tanUx = rx - lx;
  let tanUy = ry - ly;
  let tanVx = ddownx - ux;
  let tanVy = ddowny - uy;

  let crossZ = tanUx * tanVy - tanUy * tanVx;
  let lenU = sqrt(tanUx * tanUx + tanUy * tanUy) + 0.001;
  let lenV = sqrt(tanVx * tanVx + tanVy * tanVy) + 0.001;
  let avgLen = (lenU + lenV) * 0.5;

  let nz = clamp(abs(crossZ) / (avgLen * avgLen), 0.0, 1.0);
  let nx = -(tanUy + tanVy) / (avgLen * 4.0);
  let ny = (tanUx + tanVx) / (avgLen * 4.0);

  let len = sqrt(nx * nx + ny * ny + nz * nz);
  let outIdx = idx * 3u;
  if (len > 0.001) {
    normals[outIdx] = nx / len;
    normals[outIdx + 1u] = ny / len;
    normals[outIdx + 2u] = nz / len;
  } else {
    normals[outIdx] = 0.0;
    normals[outIdx + 1u] = 0.0;
    normals[outIdx + 2u] = 1.0;
  }
}
