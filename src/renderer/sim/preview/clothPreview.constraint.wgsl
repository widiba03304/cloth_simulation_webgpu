// PBD distance constraint solver with graph-colored group dispatch.
// SimParams struct prepended at build time.

struct Constraint {
  a: u32,
  b: u32,
  restLen: f32,
  kind: u32,
}

@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read> pinned: array<u32>;
@group(0) @binding(2) var<storage, read> constraints: array<Constraint>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numConstraints) { return; }

  let cIdx = idx + params.constraintOffset;
  let c = constraints[cIdx];
  let ax = c.a * 2u;
  let ay = c.a * 2u + 1u;
  let bx = c.b * 2u;
  let by = c.b * 2u + 1u;

  let dx = pos[bx] - pos[ax];
  let dy = pos[by] - pos[ay];
  let dist = sqrt(dx * dx + dy * dy);
  if (dist < 0.0001) { return; }

  var stiff: f32;
  if (c.kind == 0u) {
    stiff = params.stretchStiffH;
  } else if (c.kind == 1u) {
    stiff = params.stretchStiffV;
  } else if (c.kind == 2u) {
    stiff = 0.8;
  } else {
    stiff = params.bendStiffness * 0.6;
  }

  let diff = (dist - c.restLen) / dist;
  let corrX = dx * diff * stiff * 0.45;
  let corrY = dy * diff * stiff * 0.45;

  let pinnedA = pinned[c.a] != 0u;
  let pinnedB = pinned[c.b] != 0u;
  let dragA = i32(c.a) == params.dragIndex;
  let dragB = i32(c.b) == params.dragIndex;

  if (!pinnedA && !dragA) {
    pos[ax] = pos[ax] + corrX;
    pos[ay] = pos[ay] + corrY;
  }
  if (!pinnedB && !dragB) {
    pos[bx] = pos[bx] - corrX;
    pos[by] = pos[by] - corrY;
  }
}
