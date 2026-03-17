// 3D Verlet integration: apply velocity + gravity, update positions.
// SimParams struct prepended at build time.
// pos/prevPos: flat f32 arrays with stride 3 (x, y, z per particle).

@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> prevPos: array<f32>;
@group(0) @binding(2) var<storage, read>       pinned: array<u32>;
@group(0) @binding(3) var<uniform>             params: SimParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.numParticles || pinned[i] != 0u) { return; }

  let b = i * 3u;
  let px = pos[b];
  let py = pos[b + 1u];
  let pz = pos[b + 2u];

  let ox = prevPos[b];
  let oy = prevPos[b + 1u];
  let oz = prevPos[b + 2u];

  // Verlet: vel = (pos - prevPos) × damping; new_pos = pos + vel + accel*dt²
  let velX = (px - ox) * params.damping;
  let velY = (py - oy) * params.damping;
  let velZ = (pz - oz) * params.damping;

  prevPos[b]      = px;
  prevPos[b + 1u] = py;
  prevPos[b + 2u] = pz;

  // Wind: spatial turbulence via two overlapping sine waves keyed to particle index
  let turbulence = 1.0 + sin(f32(i) * 0.97) * sin(f32(i) * 0.37 + 1.1) * 0.35;
  let windScale  = params.windStrength * turbulence * params.dt * params.dt;

  pos[b]      = px + velX + params.windX * windScale;
  pos[b + 1u] = py + velY - params.gravity * params.dt * params.dt + params.windY * windScale;
  pos[b + 2u] = pz + velZ + params.windZ * windScale;
}
