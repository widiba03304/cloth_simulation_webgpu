// Body shading with IBL (Image-Based Lighting) only.
// Diffuse = multi-sample irradiance; Specular = roughness-blended; energy-conserving.
@group(0) @binding(1) var<uniform> color: vec4f;

@group(1) @binding(0) var envCubemap: texture_cube<f32>;
@group(1) @binding(1) var envSampler: sampler;
struct PBRParams {
  roughness: f32,
  metallic: f32,
  ambientStrength: f32,
  reflectionStrength: f32,
  cameraPos: vec3f,
}
@group(1) @binding(2) var<uniform> pbr: PBRParams;

struct FragmentInput {
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let viewDir = normalize(pbr.cameraPos - in.worldPos);
  let diffuseK = 1.0 - pbr.metallic;

  let vdn = max(dot(viewDir, n), 0.0);
  let f0 = mix(vec3f(0.04), color.rgb, pbr.metallic);
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - vdn, 5.0);
  let reflectDir = reflect(-viewDir, n);

  let dirs = array<vec3f, 10>(
    vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
    vec3f(0.0, 1.0, 0.0), vec3f(0.0, -1.0, 0.0),
    vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
    vec3f(0.577, 0.577, 0.577), vec3f(-0.577, 0.577, 0.577),
    vec3f(0.577, -0.577, 0.577), vec3f(0.577, 0.577, -0.577)
  );
  var irradiance = vec3f(0.0);
  var totalWeight = 0.0;
  for (var i = 0u; i < 10u; i++) {
    let w = max(0.0, dot(n, dirs[i]));
    irradiance += textureSample(envCubemap, envSampler, dirs[i]).rgb * w;
    totalWeight += w;
  }
  irradiance /= (totalWeight + 1e-6);

  let envSpecular = textureSample(envCubemap, envSampler, reflectDir).rgb;
  let r2 = pbr.roughness * pbr.roughness;
  let envSpec = mix(envSpecular, irradiance, r2);

  let kD = (1.0 - fresnel) * diffuseK;
  let diffuse = irradiance * color.rgb * pbr.ambientStrength * kD;
  let specContrib = select(
    vec3f(0.0),
    envSpec * pbr.reflectionStrength * fresnel,
    pbr.reflectionStrength > 0.001
  );

  let finalColor = diffuse + specContrib;
  let finalColorScaled = finalColor * 1.4;

  return vec4f(finalColorScaled, color.a);
}
