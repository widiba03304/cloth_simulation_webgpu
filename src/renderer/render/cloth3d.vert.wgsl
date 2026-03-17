// Cloth vertex shader.
// viewProj at group(0) binding(0); color at group(0) binding(1);
// gridInfo at group(0) binding(2) — provides cols/rows for UV computation from vertex_index.

@group(0) @binding(0) var<uniform> viewProj:  mat4x4<f32>;

struct GridInfo {
  cols: u32,
  rows: u32,
  pad0: u32,
  pad1: u32,
}
@group(0) @binding(2) var<uniform> gridInfo: GridInfo;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal:   vec3<f32>,
}

struct VertexOutput {
  @builtin(position) clipPos:   vec4<f32>,
  @location(0)       worldPos:  vec3<f32>,
  @location(1)       normal:    vec3<f32>,
  @location(2)       uv:        vec2<f32>,
}

// Normal-offset bias (1 mm) pushed into clip space to prevent z-fighting
// with the body mesh.  worldPos and normal stay at the original simulation
// position so lighting is unaffected.
const Z_BIAS = 0.001;

@vertex
fn main(@builtin(vertex_index) vid: u32, in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let biasedPos = in.position + normalize(in.normal) * Z_BIAS;
  out.clipPos  = viewProj * vec4<f32>(biasedPos, 1.0);
  out.worldPos = in.position;
  out.normal   = in.normal;

  // Compute per-panel UV (works for single-panel and two-panel modes).
  // localVid wraps per panel so each panel gets UV ∈ [0,1]².
  let panelSize = gridInfo.cols * gridInfo.rows;
  let localVid  = vid % panelSize;
  let col = localVid % gridInfo.cols;
  let row = localVid / gridInfo.cols;
  out.uv = vec2<f32>(
    f32(col) / f32(max(gridInfo.cols, 2u) - 1u),
    f32(row) / f32(max(gridInfo.rows, 2u) - 1u),
  );
  return out;
}
