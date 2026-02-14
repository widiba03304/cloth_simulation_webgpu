// Cloth shading with IBL (Image-Based Lighting) only.
// Diffuse = multi-sample irradiance (hemisphere approximation).
// Specular = sharp reflection blended toward irradiance by roughness; energy-conserving (Fresnel).
struct FragmentInput {
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

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

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
  let dpdx = dpdx(in.worldPos);
  let dpdy = dpdy(in.worldPos);
  var n = normalize(cross(dpdy, dpdx));
  if (dot(n, pbr.cameraPos - in.worldPos) > 0.0) {
    n = -n;
  }
  let viewDir = normalize(pbr.cameraPos - in.worldPos);
  let diffuseK = 1.0 - pbr.metallic;

  // Fresnel (Schlick) — used for energy conservation and specular
  let vdn = max(dot(viewDir, n), 0.0);
  let f0 = vec3f(mix(0.04, 0.8, pbr.metallic));
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - vdn, 5.0);
  let reflectDir = reflect(-viewDir, n);

  // ——— Irradiance: multi-sample over hemisphere (cosine-weighted) ———
  // 6 axis-aligned + 4 diagonal directions for smoother matte
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

  // Sharp specular sample (single direction)
  let envSpecular = textureSample(envCubemap, envSampler, reflectDir).rgb;
  let r2 = pbr.roughness * pbr.roughness;
  // High roughness = blend toward irradiance (soft reflection), not same single sample
  let envSpec = mix(envSpecular, irradiance, r2);

  // Energy conservation: diffuse uses (1 - F), specular uses F
  let kD = (1.0 - fresnel) * diffuseK;
  let diffuse = irradiance * pbr.ambientStrength * kD;
  let specContrib = select(
    vec3f(0.0),
    envSpec * pbr.reflectionStrength * fresnel,
    pbr.reflectionStrength > 0.001
  );

  let finalColor = diffuse + specContrib;
  let finalColorScaled = finalColor * 1.4;

  return vec4f(finalColorScaled, 1.0);
}
