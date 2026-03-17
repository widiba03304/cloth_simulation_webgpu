// Per-vertex normal computation from 3D cloth positions.
// Uses cross product of neighbor tangent vectors.
// SimParams struct prepended at build time.
// pos/normals: flat f32 arrays, stride 3.

@group(0) @binding(0) var<storage, read>       pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> normals: array<f32>;
@group(0) @binding(2) var<uniform>             params: SimParams;

fn readPos3(i: u32) -> vec3<f32> {
  let b = i * 3u;
  return vec3<f32>(pos[b], pos[b + 1u], pos[b + 2u]);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numParticles) { return; }

  let cols = params.cols;
  let rows = params.rows;
  // For two-panel mode, compute row/col within this panel so boundary checks
  // don't accidentally sample across the panel boundary.
  let panelSize  = rows * cols;
  let localIdx   = idx % panelSize;
  let panelStart = idx - localIdx;
  let r = localIdx / cols;
  let c = localIdx % cols;

  let p = readPos3(idx);

  let left  = select(p, readPos3(panelStart + r * cols + (c - 1u)), c > 0u);
  let right = select(p, readPos3(panelStart + r * cols + (c + 1u)), c < cols - 1u);
  let up    = select(p, readPos3(panelStart + (r - 1u) * cols + c), r > 0u);
  let down  = select(p, readPos3(panelStart + (r + 1u) * cols + c), r < rows - 1u);

  let tanU = right - left;   // d(pos)/d(col) ≈ +X direction
  let tanV = down  - up;     // d(pos)/d(row) ≈ -Y direction (rows increase downward)

  // cross(tanV, tanU) = +Z when cloth is flat in XY, pointing toward camera
  let n = normalize(cross(tanV, tanU));

  let ob = idx * 3u;
  normals[ob]      = n.x;
  normals[ob + 1u] = n.y;
  normals[ob + 2u] = n.z;
}
