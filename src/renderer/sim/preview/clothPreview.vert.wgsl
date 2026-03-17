// Cloth vertex shader: pixel positions → clip space, pass normal + UV.
// RenderParams struct prepended at build time.

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> rp: RenderParams;

@vertex
fn main(@location(0) position: vec2<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VertexOutput {
  var out: VertexOutput;
  out.pos = vec4<f32>(
    position.x / (rp.canvasW * 0.5) - 1.0,
    -(position.y / (rp.canvasH * 0.5) - 1.0),
    0.0, 1.0
  );
  out.normal = normal;
  out.uv = uv;
  return out;
}
