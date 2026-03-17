// Spatial hash — Pass 0: clear cell counts.
//   binding 0: cellCount (read_write atomic)
//   binding 1: SHParams  (uniform)

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

@group(0) @binding(0) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(1) var<uniform>             sh:        SHParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sh.numCells) { return; }
  atomicStore(&cellCount[i], 0u);
}
