// Self collision: spatial hash (uniform grid) + PBD-style push-apart.
// SelfCollisionParams struct is prepended at build time.

struct SelfCollisionParams {
  collisionRadius: f32,
  cellSize: f32,
  gridNumX: u32,
  gridNumY: u32,
  numParticles: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

const MAX_PER_CELL: u32 = 32u;

fn getCell(px: f32, py: f32, p: SelfCollisionParams) -> vec2<u32> {
  let cx = u32(max(0.0, floor(px / p.cellSize)));
  let cy = u32(max(0.0, floor(py / p.cellSize)));
  return vec2<u32>(min(cx, p.gridNumX - 1u), min(cy, p.gridNumY - 1u));
}

fn cellIndex(cx: u32, cy: u32, p: SelfCollisionParams) -> u32 {
  return cy * p.gridNumX + cx;
}

// ── Pass 1: Clear grid counts ─────────────────────────────────
@group(0) @binding(0) var<storage, read_write> gridCount: array<atomic<u32>>;
@group(0) @binding(1) var<uniform> params: SelfCollisionParams;

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let numCells = params.gridNumX * params.gridNumY;
  if (gid.x >= numCells) { return; }
  atomicStore(&gridCount[gid.x], 0u);
}

// ── Pass 2: Scatter particles into grid ───────────────────────
@group(0) @binding(0) var<storage, read_write> gridCountScatter: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> gridData: array<u32>;
@group(0) @binding(2) var<storage, read> posScatter: array<f32>;
@group(0) @binding(3) var<uniform> paramsScatter: SelfCollisionParams;

@compute @workgroup_size(64)
fn scatter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= paramsScatter.numParticles) { return; }
  let px = posScatter[i * 2u];
  let py = posScatter[i * 2u + 1u];
  let cell = getCell(px, py, paramsScatter);
  let cidx = cellIndex(cell.x, cell.y, paramsScatter);
  let slot = atomicAdd(&gridCountScatter[cidx], 1u);
  if (slot < MAX_PER_CELL) {
    gridData[cidx * MAX_PER_CELL + slot] = i;
  }
}

// ── Pass 3: Resolve — push apart pairs closer than 2*collisionRadius ──
// Read from posRead (snapshot) and write to posWrite to avoid data race when many pairs overlap.
// Atomics must be read_write in WGSL even when only loading.
@group(0) @binding(0) var<storage, read_write> gridCountResolve: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read> gridDataResolve: array<u32>;
@group(0) @binding(2) var<storage, read> posRead: array<f32>;
@group(0) @binding(3) var<storage, read_write> posWrite: array<f32>;
@group(0) @binding(4) var<storage, read> pinned: array<u32>;
@group(0) @binding(5) var<uniform> paramsResolve: SelfCollisionParams;

@compute @workgroup_size(64)
fn resolve(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= paramsResolve.numParticles) { return; }
  if (pinned[i] != 0u) { return; }

  let ix = i * 2u;
  let iy = i * 2u + 1u;
  let px = posRead[ix];
  let py = posRead[iy];
  let cell = getCell(px, py, paramsResolve);
  let radius = paramsResolve.collisionRadius * 2.0;

  var totalDx = 0.0;
  var totalDy = 0.0;

  for (var dy = 0u; dy <= 2u; dy++) {
    for (var dx = 0u; dx <= 2u; dx++) {
      let cxi = i32(cell.x) + i32(dx) - 1;
      let cyi = i32(cell.y) + i32(dy) - 1;
      if (cxi < 0 || cxi >= i32(paramsResolve.gridNumX) || cyi < 0 || cyi >= i32(paramsResolve.gridNumY)) { continue; }
      let cx = u32(cxi);
      let cy = u32(cyi);
      let cidx = cellIndex(cx, cy, paramsResolve);
      let n = min(atomicLoad(&gridCountResolve[cidx]), MAX_PER_CELL);
      for (var k = 0u; k < n; k++) {
        let j = gridDataResolve[cidx * MAX_PER_CELL + k];
        if (j == i) { continue; }
        if (pinned[j] != 0u) { continue; }
        let jx = j * 2u;
        let jy = j * 2u + 1u;
        let qx = posRead[jx];
        let qy = posRead[jy];
        let ddx = px - qx;
        let ddy = py - qy;
        let distSq = ddx * ddx + ddy * ddy;
        if (distSq < radius * radius && distSq > 0.0001) {
          let dist = sqrt(distSq);
          let pen = radius - dist;
          let nx = ddx / dist;
          let ny = ddy / dist;
          totalDx += nx * pen * 0.5;
          totalDy += ny * pen * 0.5;
        }
      }
    }
  }

  if (totalDx != 0.0 || totalDy != 0.0) {
    posWrite[ix] = px + totalDx;
    posWrite[iy] = py + totalDy;
  }
}
