// Integrate: apply gravity and Verlet step. Reads pos/prev, writes new pos/prev.
// Dispatch: 1D over numVertices (workgroup size 64).

struct Params {
  gravity: vec3f,
  dt: f32,
  damping: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positionIn: array<vec3f>;
@group(0) @binding(2) var<storage, read> prevPositionIn: array<vec3f>;
@group(0) @binding(3) var<storage, read_write> positionOut: array<vec3f>;
@group(0) @binding(4) var<storage, read_write> prevPositionOut: array<vec3f>;
@group(0) @binding(5) var<storage, read> pinned: array<u32>; // 1 = pinned

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&positionIn)) { return; }
  if (pinned[i] != 0u) {
    positionOut[i] = positionIn[i];
    prevPositionOut[i] = prevPositionIn[i];
    return;
  }
  let pos = positionIn[i];
  let prev = prevPositionIn[i];
  let vel = pos - prev;
  let damped = vel * (1.0 - params.damping);
  let acc = params.gravity;
  let newPos = pos + damped + acc * params.dt * params.dt;
  prevPositionOut[i] = pos;
  positionOut[i] = newPos;
}
