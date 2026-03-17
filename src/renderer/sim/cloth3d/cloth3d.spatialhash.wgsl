// Spatial-hash self-collision — four-pass approach.
//
// PASS 0 (clear):        zero cell counts
// PASS 1 (count):        atomically count particles per cell
// PASS 2 (prefix sum):   exclusive prefix-sum on counts → cell starts
// PASS 3 (scatter):      write particle indices into sorted order
// PASS 4 (collide):      for each particle, query 3×3×3 neighbourhood
//
// Cell size = CELL (0.032 m).  Grid extends from origin by (gridW, gridH, gridD) cells.
// Cell index = ix + iy*gridW + iz*gridW*gridH.
//
// SH = spatial-hash params uniform (binding 3 in every pass).

struct SHParams {
  numParticles: u32,  //  0
  numCells:     u32,  //  4
  gridW:        u32,  //  8
  gridH:        u32,  // 12
  gridD:        u32,  // 16
  pad0:         u32,  // 20
  pad1:         u32,  // 24
  pad2:         u32,  // 28
  originX: f32,       // 32
  originY: f32,       // 36
  originZ: f32,       // 40
  cellSize: f32,      // 44
  thickness: f32,     // 48
  pad3: f32,          // 52
  pad4: f32,          // 56
  pad5: f32,          // 60
}

// ── Pass 0: clear cell counts ────────────────────────────────────────────────
//   binding 0: cellCount  (read_write)
//   binding 3: SHParams

@group(0) @binding(0) var<storage, read_write> cellCount0: array<atomic<u32>>;
@group(0) @binding(3) var<uniform>             shParams0:  SHParams;

@compute @workgroup_size(64)
fn clearCounts(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= shParams0.numCells) { return; }
  atomicStore(&cellCount0[i], 0u);
}

// ── Pass 1: count particles per cell ─────────────────────────────────────────
//   binding 0: pos         (read)
//   binding 1: cellCount   (read_write atomic)
//   binding 2: particleCell (write)
//   binding 3: SHParams

@group(0) @binding(0) var<storage, read>       pos1:         array<f32>;
@group(0) @binding(1) var<storage, read_write> cellCount1:   array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> particleCell1: array<u32>;
@group(0) @binding(3) var<uniform>             shParams1:    SHParams;

fn cellOf(px: f32, py: f32, pz: f32, p: SHParams) -> u32 {
  let ix = clamp(u32((px - p.originX) / p.cellSize), 0u, p.gridW - 1u);
  let iy = clamp(u32((py - p.originY) / p.cellSize), 0u, p.gridH - 1u);
  let iz = clamp(u32((pz - p.originZ) / p.cellSize), 0u, p.gridD - 1u);
  return ix + iy * p.gridW + iz * p.gridW * p.gridH;
}

@compute @workgroup_size(64)
fn countParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= shParams1.numParticles) { return; }
  let b = i * 3u;
  let cell = cellOf(pos1[b], pos1[b+1u], pos1[b+2u], shParams1);
  particleCell1[i] = cell;
  atomicAdd(&cellCount1[cell], 1u);
}

// ── Pass 2: exclusive prefix sum (single workgroup, ≤ 65536 cells) ───────────
//   binding 0: cellCount (read → becomes cell start after this pass)
//   binding 1: cellStart (write)
//   binding 3: SHParams
//
// Uses a simple sequential scan within a single workgroup.
// Works for numCells ≤ 65536.  For larger grids use two-level scan.

@group(0) @binding(0) var<storage, read>       cellCountR: array<u32>;
@group(0) @binding(1) var<storage, read_write> cellStart2: array<u32>;
@group(0) @binding(3) var<uniform>             shParams2:  SHParams;

@compute @workgroup_size(1)
fn prefixSum(@builtin(global_invocation_id) gid: vec3<u32>) {
  var acc = 0u;
  for (var i = 0u; i < shParams2.numCells; i++) {
    cellStart2[i] = acc;
    acc += cellCountR[i];
  }
}

// ── Pass 3: scatter particles into sorted array ───────────────────────────────
//   binding 0: particleCell  (read)
//   binding 1: cellStart     (read_write — atomic bump per cell)
//   binding 2: sortedParticles (write)
//   binding 3: SHParams

@group(0) @binding(0) var<storage, read>       particleCell3:   array<u32>;
@group(0) @binding(1) var<storage, read_write> cellStart3:      array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> sortedParticles: array<u32>;
@group(0) @binding(3) var<uniform>             shParams3:       SHParams;

@compute @workgroup_size(64)
fn scatterParticles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= shParams3.numParticles) { return; }
  let cell  = particleCell3[i];
  let slot  = atomicAdd(&cellStart3[cell], 1u);
  sortedParticles[slot] = i;
}

// ── Pass 4: self-collision query ──────────────────────────────────────────────
//   binding 0: pos            (read_write)
//   binding 1: pinned         (read)
//   binding 2: particleCell   (read)
//   binding 3: SHParams
//   binding 4: cellCount      (read) — number of particles per cell
//   binding 5: cellStart      (read) — start index per cell in sortedParticles
//   binding 6: sortedParticles (read)

@group(0) @binding(0) var<storage, read_write> pos4:            array<f32>;
@group(0) @binding(1) var<storage, read>       pinned4:         array<u32>;
@group(0) @binding(2) var<storage, read>       particleCell4:   array<u32>;
@group(0) @binding(3) var<uniform>             shParams4:       SHParams;
@group(0) @binding(4) var<storage, read>       cellCount4:      array<u32>;
@group(0) @binding(5) var<storage, read>       cellStart4:      array<u32>;
@group(0) @binding(6) var<storage, read>       sortedParticles4: array<u32>;

@compute @workgroup_size(64)
fn selfCollide(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= shParams4.numParticles) { return; }
  if (pinned4[i] != 0u) { return; }

  let bi = i * 3u;
  let pi = vec3<f32>(pos4[bi], pos4[bi+1u], pos4[bi+2u]);

  let p = shParams4;
  let ix = i32(clamp(u32((pi.x - p.originX) / p.cellSize), 0u, p.gridW - 1u));
  let iy = i32(clamp(u32((pi.y - p.originY) / p.cellSize), 0u, p.gridH - 1u));
  let iz = i32(clamp(u32((pi.z - p.originZ) / p.cellSize), 0u, p.gridD - 1u));

  var delta = vec3<f32>(0.0);

  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx2 = -1; dx2 <= 1; dx2++) {
        let nx = ix + dx2;
        let ny = iy + dy;
        let nz = iz + dz;
        if (nx < 0 || ny < 0 || nz < 0 ||
            u32(nx) >= p.gridW || u32(ny) >= p.gridH || u32(nz) >= p.gridD) {
          continue;
        }
        let cell = u32(nx) + u32(ny) * p.gridW + u32(nz) * p.gridW * p.gridH;
        let cnt  = cellCount4[cell];
        let start = cellStart4[cell];
        for (var k = 0u; k < cnt; k++) {
          let j = sortedParticles4[start + k];
          if (j == i) { continue; }
          let bj = j * 3u;
          let pj = vec3<f32>(pos4[bj], pos4[bj+1u], pos4[bj+2u]);
          let d    = pi - pj;
          let dist = length(d);
          if (dist < p.thickness && dist > 0.0001) {
            delta += (d / dist) * (p.thickness - dist) * 0.5;
          }
        }
      }
    }
  }

  pos4[bi]      = pi.x + delta.x;
  pos4[bi+1u]   = pi.y + delta.y;
  pos4[bi+2u]   = pi.z + delta.z;
}
