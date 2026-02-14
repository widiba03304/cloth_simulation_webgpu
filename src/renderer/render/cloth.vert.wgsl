// Cloth vertex: position from vertex buffer (copied from sim each frame).
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@group(0) @binding(0) var<uniform> viewProj: mat4x4f;

struct VertexInput {
  @location(0) position: vec3f,
}

@vertex
fn main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = viewProj * vec4f(in.position, 1.0);
  out.worldPos = in.position;
  out.normal = vec3f(0.0, 1.0, 0.0); // placeholder
  return out;
}
