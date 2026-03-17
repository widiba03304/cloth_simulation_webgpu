// Spatial hash — Pass 2: exclusive prefix sum (single workgroup, ≤ 65536 cells).
//   binding 0: cellCount (read)
//   binding 1: cellStart (write)
//   binding 2: SHParams  (uniform)
//
// Sequential scan in one thread. Fast enough for ≤ 65536 cells.

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

@group(0) @binding(0) var<storage, read>       cellCount: array<u32>;
@group(0) @binding(1) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(2) var<uniform>             sh:        SHParams;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  var acc = 0u;
  for (var i = 0u; i < sh.numCells; i++) {
    cellStart[i] = acc;
    acc += cellCount[i];
  }
}
