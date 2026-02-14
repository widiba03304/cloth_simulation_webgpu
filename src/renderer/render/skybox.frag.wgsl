// Skybox fragment shader: sample cubemap using direction from vertex.

@group(1) @binding(0) var cubemap        : texture_cube<f32>;
@group(1) @binding(1) var cubemapSampler : sampler;

struct FragmentInput {
  @location(0) dir : vec3f,
}

@fragment
fn main(in : FragmentInput) -> @location(0) vec4f {
  let d = normalize(in.dir);
  return textureSample(cubemap, cubemapSampler, d);
}
