// Spatial hash — Pass 4: self-collision query.
// For each non-pinned particle, query 3×3×3 neighbourhood and push apart
// any pair closer than `thickness`.
//
// After the scatter pass, scatterSlot[cell] = originalStart[cell] + cellCount[cell].
// We recover start = scatterSlot[cell] - cellCount[cell] without a separate cellStart buffer.
//
//   binding 0: pos             (read_write)
//   binding 1: pinned          (read)
//   binding 3: SHParams        (uniform)
//   binding 4: cellCount       (read)
//   binding 5: scatterSlot     (read — end-of-cell pointer; start = slot - count)
//   binding 6: sortedParticles (read)

struct SHParams {
  numParticles: u32,
  numCells:     u32,
  gridW:        u32,
  gridH:        u32,
  gridD:        u32,
  pad0:         u32,
  pad1:         u32,
  pad2:         u32,
  originX:   f32,
  originY:   f32,
  originZ:   f32,
  cellSize:  f32,
  thickness: f32,
  pad3:      f32,
  pad4:      f32,
  pad5:      f32,
}

@group(0) @binding(0) var<storage, read_write> pos:            array<f32>;
@group(0) @binding(1) var<storage, read>       pinned:         array<u32>;
@group(0) @binding(3) var<uniform>             sh:             SHParams;
@group(0) @binding(4) var<storage, read>       cellCount:      array<u32>;
@group(0) @binding(5) var<storage, read>       scatterSlot:    array<u32>;
@group(0) @binding(6) var<storage, read>       sortedParticles: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sh.numParticles) { return; }
  if (pinned[i] != 0u) { return; }

  let bi = i * 3u;
  let pi = vec3<f32>(pos[bi], pos[bi + 1u], pos[bi + 2u]);

  let ix = i32(clamp(u32((pi.x - sh.originX) / sh.cellSize), 0u, sh.gridW - 1u));
  let iy = i32(clamp(u32((pi.y - sh.originY) / sh.cellSize), 0u, sh.gridH - 1u));
  let iz = i32(clamp(u32((pi.z - sh.originZ) / sh.cellSize), 0u, sh.gridD - 1u));

  var delta = vec3<f32>(0.0);

  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let nx = ix + dx;
        let ny = iy + dy;
        let nz = iz + dz;
        if (nx < 0 || ny < 0 || nz < 0 ||
            u32(nx) >= sh.gridW || u32(ny) >= sh.gridH || u32(nz) >= sh.gridD) {
          continue;
        }
        let cell  = u32(nx) + u32(ny) * sh.gridW + u32(nz) * sh.gridW * sh.gridH;
        let cnt   = cellCount[cell];
        // After scatter: scatterSlot[cell] = originalStart + cnt
        // Recover originalStart:
        let start = scatterSlot[cell] - cnt;
        for (var k = 0u; k < cnt; k++) {
          let j = sortedParticles[start + k];
          if (j == i) { continue; }
          let bj = j * 3u;
          let pj = vec3<f32>(pos[bj], pos[bj + 1u], pos[bj + 2u]);
          let d    = pi - pj;
          let dist = length(d);
          if (dist < sh.thickness && dist > 0.0001) {
            delta += (d / dist) * (sh.thickness - dist) * 0.5;
          }
        }
      }
    }
  }

  pos[bi]      = pi.x + delta.x;
  pos[bi + 1u] = pi.y + delta.y;
  pos[bi + 2u] = pi.z + delta.z;
}
