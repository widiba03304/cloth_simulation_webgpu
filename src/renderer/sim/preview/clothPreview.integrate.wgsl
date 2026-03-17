// Verlet integration: gravity, damping, drag, floor constraint.
// SimParams struct prepended at build time.

@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> prevPos: array<f32>;
@group(0) @binding(2) var<storage, read> pinned: array<u32>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.numParticles) { return; }
  if (pinned[i] != 0u) { return; }

  let ix = i * 2u;
  let iy = i * 2u + 1u;

  // Dragged particle: do not integrate (position applied once per frame; self-collision may move it)
  if (i32(i) == params.dragIndex) { return; }

  let px = pos[ix];
  let py = pos[iy];
  var vx = (px - prevPos[ix]) * params.damping;
  var vy = (py - prevPos[iy]) * params.damping;

  // Clamp velocity
  let maxVel = 8.0;
  let vLen = sqrt(vx * vx + vy * vy);
  if (vLen > maxVel) {
    let scale = maxVel / vLen;
    vx = vx * scale;
    vy = vy * scale;
  }

  prevPos[ix] = px;
  prevPos[iy] = py;

  let newX = px + vx;
  var newY = py + vy + params.gravity * params.dt * params.dt * 50.0;
  if (newY > params.floorY) { newY = params.floorY; }

  pos[ix] = newX;
  pos[iy] = newY;
}
