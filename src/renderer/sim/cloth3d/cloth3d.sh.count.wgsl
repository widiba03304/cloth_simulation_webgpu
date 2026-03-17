// Spatial hash — Pass 1: count particles per cell.
//   binding 0: pos         (read)
//   binding 1: cellCount   (read_write atomic)
//   binding 2: particleCell (write)
//   binding 3: SHParams    (uniform)

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

@group(0) @binding(0) var<storage, read>       pos:         array<f32>;
@group(0) @binding(1) var<storage, read_write> cellCount:   array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> particleCell: array<u32>;
@group(0) @binding(3) var<uniform>             sh:          SHParams;

fn cellOf(px: f32, py: f32, pz: f32) -> u32 {
  let ix = clamp(u32((px - sh.originX) / sh.cellSize), 0u, sh.gridW - 1u);
  let iy = clamp(u32((py - sh.originY) / sh.cellSize), 0u, sh.gridH - 1u);
  let iz = clamp(u32((pz - sh.originZ) / sh.cellSize), 0u, sh.gridD - 1u);
  return ix + iy * sh.gridW + iz * sh.gridW * sh.gridH;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sh.numParticles) { return; }
  let b = i * 3u;
  let cell = cellOf(pos[b], pos[b + 1u], pos[b + 2u]);
  particleCell[i] = cell;
  atomicAdd(&cellCount[cell], 1u);
}
