// Skybox cube: draw cube at world positions (e.g. ±500) with full viewProj
// so perspective divide is correct. Sample cubemap with direction from origin.

@group(0) @binding(0) var<uniform> viewProj : mat4x4f;

struct VertexInput {
  @location(0) position : vec3f,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) dir           : vec3f,
}

@vertex
fn main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  out.dir = normalize(in.position);

  // Full perspective: w=1 so clip has proper w and GPU does perspective divide.
  out.position = viewProj * vec4f(in.position, 1.0);
  return out;
}
