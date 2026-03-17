// Apply drag target once per frame so self-collision can push the point during sub-steps.
// SimParams struct prepended at build time.

@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read_write> prevPos: array<f32>;
@group(0) @binding(2) var<uniform> params: SimParams;

@compute @workgroup_size(1)
fn main() {
  if (params.dragIndex < 0) { return; }
  let i = u32(params.dragIndex);
  let ix = i * 2u;
  let iy = i * 2u + 1u;
  pos[ix] = params.dragTargetX;
  pos[iy] = params.dragTargetY;
  prevPos[ix] = params.dragTargetX;
  prevPos[iy] = params.dragTargetY;
}
