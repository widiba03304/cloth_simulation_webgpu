// Spatial hash — Pass 3: scatter particles into sorted array.
//   binding 0: particleCell  (read)
//   binding 1: scatterSlot   (read_write atomic — copy of cellStart, bumped per slot)
//   binding 2: sortedParticles (write)
//   binding 3: SHParams      (uniform)
//
// scatterSlot is a copy of cellStart made before this pass so that cellStart
// remains intact for the query pass (Pass 4).

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

@group(0) @binding(0) var<storage, read>       particleCell:   array<u32>;
@group(0) @binding(1) var<storage, read_write> scatterSlot:    array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> sortedParticles: array<u32>;
@group(0) @binding(3) var<uniform>             sh:             SHParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sh.numParticles) { return; }
  let cell = particleCell[i];
  let slot = atomicAdd(&scatterSlot[cell], 1u);
  sortedParticles[slot] = i;
}
