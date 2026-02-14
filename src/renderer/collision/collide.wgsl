// Cloth-body collision: ground plane (y=0). Push particles above y=0, zero normal velocity.
// For now no body mesh; only ground. Dispatch: 1D over numVertices.

struct CollideParams {
  groundY: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: CollideParams;
@group(0) @binding(1) var<storage, read_write> position: array<vec3f>;
@group(0) @binding(2) var<storage, read_write> prevPosition: array<vec3f>;
@group(0) @binding(3) var<storage, read> pinned: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&position)) { return; }
  if (pinned[i] != 0u) { return; }
  var pos = position[i];
  if (pos.y < params.groundY) {
    pos.y = params.groundY;
    let prev = prevPosition[i];
    let vel = pos - prev;
    let velYClamped = min(vel.y, 0.0); // remove downward component
    prevPosition[i] = pos - vec3f(vel.x, velYClamped, vel.z);
    position[i] = pos;
  }
}
