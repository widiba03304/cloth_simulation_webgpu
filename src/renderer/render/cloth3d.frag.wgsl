// Cloth fragment shader: IBL PBR, double-sided, optional albedo texture.
@group(0) @binding(1) var<uniform> color: vec4<f32>; // base albedo.rgb + opacity

@group(1) @binding(0) var envCubemap:    texture_cube<f32>;
@group(1) @binding(1) var envSampler:    sampler;

struct PBRParams {
  roughness:          f32,
  metallic:           f32,
  ambientStrength:    f32,
  reflectionStrength: f32,
  cameraPos:          vec3<f32>,
  useTexture:         f32,  // 1.0 = modulate albedo with albedoTex, 0.0 = solid color
}
@group(1) @binding(2) var<uniform> pbr: PBRParams;

@group(1) @binding(3) var albedoTex:     texture_2d<f32>;
@group(1) @binding(4) var albedoSampler: sampler;

struct FragmentInput {
  @location(0)            worldPos:    vec3<f32>,
  @location(1)            normal:      vec3<f32>,
  @location(2)            uv:          vec2<f32>,
  @builtin(front_facing)  frontFacing: bool,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4<f32> {
  // Double-sided: flip computed normal for back faces so IBL is always correct
  let n_raw = normalize(in.normal);
  let n = select(-n_raw, n_raw, in.frontFacing);

  // Albedo: base color optionally modulated by uploaded texture
  let useTex    = pbr.useTexture > 0.5;
  let texSample = textureSample(albedoTex, albedoSampler, in.uv);
  let albedo    = select(color.rgb, color.rgb * texSample.rgb, useTex);
  let alpha     = select(color.a,   color.a  * texSample.a,   useTex);

  let viewDir  = normalize(pbr.cameraPos - in.worldPos);
  let diffuseK = 1.0 - pbr.metallic;
  let vdn      = max(dot(viewDir, n), 0.0);
  let f0       = mix(vec3<f32>(0.04), albedo, pbr.metallic);
  let fresnel  = f0 + (1.0 - f0) * pow(1.0 - vdn, 5.0);
  let reflDir  = reflect(-viewDir, n);

  // 10-sample hemisphere irradiance (same as body.frag.wgsl)
  let dirs = array<vec3<f32>, 10>(
    vec3<f32>( 1.0,  0.0,  0.0), vec3<f32>(-1.0,  0.0,  0.0),
    vec3<f32>( 0.0,  1.0,  0.0), vec3<f32>( 0.0, -1.0,  0.0),
    vec3<f32>( 0.0,  0.0,  1.0), vec3<f32>( 0.0,  0.0, -1.0),
    vec3<f32>( 0.577,  0.577,  0.577), vec3<f32>(-0.577,  0.577,  0.577),
    vec3<f32>( 0.577, -0.577,  0.577), vec3<f32>( 0.577,  0.577, -0.577)
  );
  var irradiance  = vec3<f32>(0.0);
  var totalWeight = 0.0;
  for (var i = 0u; i < 10u; i++) {
    let w = max(0.0, dot(n, dirs[i]));
    irradiance  += textureSample(envCubemap, envSampler, dirs[i]).rgb * w;
    totalWeight += w;
  }
  irradiance /= (totalWeight + 1e-6);

  let envSpecular = textureSample(envCubemap, envSampler, reflDir).rgb;
  let r2          = pbr.roughness * pbr.roughness;
  let envSpec     = mix(envSpecular, irradiance, r2);

  let kD      = (1.0 - fresnel) * diffuseK;
  let diffuse = irradiance * albedo * pbr.ambientStrength * kD;
  let spec    = select(vec3<f32>(0.0),
                       envSpec * pbr.reflectionStrength * fresnel,
                       pbr.reflectionStrength > 0.001);

  let finalColor = (diffuse + spec) * 1.4;
  return vec4<f32>(finalColor, alpha);
}
