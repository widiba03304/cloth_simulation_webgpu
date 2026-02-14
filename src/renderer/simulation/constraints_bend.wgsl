// Bend constraints: same as structural but typically lower stiffness.
// Reuse same layout: constraints = (i, j, restLength).

struct ConstraintParams {
  stiffness: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: ConstraintParams;
@group(0) @binding(1) var<storage, read_write> position: array<vec3f>;
@group(0) @binding(2) var<storage, read> constraints: array<vec3f>;
@group(0) @binding(3) var<storage, read> pinned: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let c = id.x;
  if (c >= arrayLength(&constraints)) { return; }
  let con = constraints[c];
  let i = u32(con.x);
  let j = u32(con.y);
  let rest = con.z;
  let pi = position[i];
  let pj = position[j];
  let diff = pi - pj;
  let d = length(diff);
  if (d < 1e-6) { return; }
  let n = diff / d;
  let delta = (d - rest) * params.stiffness;
  let half = delta * 0.5;
  if (pinned[i] == 0u) {
    position[i] = pi - n * half;
  }
  if (pinned[j] == 0u) {
    position[j] = pj + n * half;
  }
}
