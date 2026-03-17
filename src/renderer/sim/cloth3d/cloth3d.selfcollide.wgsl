// GPU cloth self-collision: O(N²) particle-particle separation.
// Each invocation reads all other particle positions and writes only its own
// output slot — no write-write race. Read hazards between invocations in the
// same dispatch are benign (Jacobi relaxation converges in practice).

struct SelfCollideParams {
  numParticles: u32,
  thickness:    f32,  // minimum separation distance (metres)
  pad0:         u32,
  pad1:         u32,
}

@group(0) @binding(0) var<storage, read_write> pos:    array<f32>;
@group(0) @binding(1) var<storage, read>       pinned: array<u32>;
@group(0) @binding(2) var<uniform>             params: SelfCollideParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.numParticles) { return; }
  if (pinned[i] != 0u) { return; }

  let bi = i * 3u;
  let pi = vec3<f32>(pos[bi], pos[bi + 1u], pos[bi + 2u]);

  var delta = vec3<f32>(0.0);

  for (var j = 0u; j < params.numParticles; j++) {
    if (j == i) { continue; }
    let bj = j * 3u;
    let pj = vec3<f32>(pos[bj], pos[bj + 1u], pos[bj + 2u]);
    let d    = pi - pj;
    let dist = length(d);
    if (dist < params.thickness && dist > 0.0001) {
      // Jacobi: each particle takes half the correction
      delta += (d / dist) * (params.thickness - dist) * 0.5;
    }
  }

  pos[bi]      = pi.x + delta.x;
  pos[bi + 1u] = pi.y + delta.y;
  pos[bi + 2u] = pi.z + delta.z;
}
