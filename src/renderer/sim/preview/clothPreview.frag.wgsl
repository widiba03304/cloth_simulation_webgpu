// PBR-lite cloth fragment shader with procedural fabric textures.
// RenderParams struct prepended at build time.

@group(0) @binding(0) var<uniform> rp: RenderParams;

// ── Procedural pattern functions ─────────────────────────

// Smooth step for anti-aliased edges
fn aa(edge: f32, x: f32, w: f32) -> f32 {
  return smoothstep(edge - w, edge + w, x);
}

// Plain weave: checkerboard with thread structure
fn plainWeave(uv: vec2<f32>, scale: f32) -> f32 {
  let g = uv * scale;
  let gx = fract(g.x);
  let gy = fract(g.y);
  // Thread crossing pattern
  let warpOver = aa(0.5, gx, 0.08);
  let weftOver = aa(0.5, gy, 0.08);
  // Alternating: warp on top or weft on top
  let cell = (floor(g.x) + floor(g.y)) % 2.0;
  let isWarp = select(1.0 - warpOver, warpOver, cell > 0.5);
  let isWeft = select(1.0 - weftOver, weftOver, cell > 0.5);
  // Brightness variation between warp and weft threads
  return mix(0.85, 1.0, isWarp * 0.5 + isWeft * 0.5);
}

// Twill weave: diagonal pattern (denim-like)
fn twillWeave(uv: vec2<f32>, scale: f32) -> f32 {
  let g = uv * scale;
  let diag = fract((g.x + g.y) * 0.5);
  let thread = fract(g.x);
  // 2/1 twill: warp floats over 2, under 1
  let twillLine = aa(0.33, diag, 0.06);
  let threadVar = aa(0.5, thread, 0.1) * 0.15;
  return mix(0.78, 1.0, twillLine) + threadVar * 0.3;
}

// Satin weave: smooth with sparse interlacings
fn satinWeave(uv: vec2<f32>, scale: f32) -> f32 {
  let g = uv * scale;
  // Satin has few visible cross points, shifted by 2 each row
  let col = floor(g.x);
  let row = floor(g.y);
  let shift = row * 2.0;
  let crossX = fract(g.x) - 0.5;
  let crossY = fract(g.y) - 0.5;
  // Sparse intersection points
  let spotX = fract((col + shift) / 5.0) * 5.0;
  let isDot = select(0.0, 1.0, spotX < 1.0);
  let dotBright = isDot * exp(-(crossX * crossX + crossY * crossY) * 12.0);
  return mix(0.95, 1.0, 1.0 - dotBright * 0.3);
}

// Knit pattern: V-shaped loops
fn knitPattern(uv: vec2<f32>, scale: f32) -> f32 {
  let g = uv * scale;
  let gx = fract(g.x);
  let gy = fract(g.y);
  let col = floor(g.x);
  // Offset every other column for knit stagger
  var adjY = gy;
  if (col % 2.0 > 0.5) {
    adjY = fract(gy + 0.5);
  }
  // V-shape legs
  let centerX = gx - 0.5;
  let leftLeg = abs(centerX + adjY * 0.35 - 0.175);
  let rightLeg = abs(centerX - adjY * 0.35 + 0.175);
  let vShape = min(leftLeg, rightLeg);
  let loopBright = 1.0 - smoothstep(0.02, 0.12, vShape);
  // Row separation
  let rowLine = smoothstep(0.0, 0.08, adjY) * smoothstep(1.0, 0.92, adjY);
  return mix(0.82, 1.0, loopBright * rowLine);
}

// Herringbone: zigzag twill
fn herringbonePattern(uv: vec2<f32>, scale: f32) -> f32 {
  let g = uv * scale;
  let blockY = floor(g.y * 0.5);
  let flip = (blockY % 2.0) * 2.0 - 1.0;
  let diag = fract((g.x * flip + g.y) * 0.5);
  let thread = fract(g.x);
  let hbLine = aa(0.33, diag, 0.06);
  let threadVar = aa(0.5, thread, 0.1) * 0.1;
  return mix(0.80, 1.0, hbLine) + threadVar * 0.2;
}

// Get pattern value based on pattern type
fn getPattern(uv: vec2<f32>, patternType: u32, scale: f32) -> f32 {
  if (patternType == 1u) {
    return plainWeave(uv, scale);
  } else if (patternType == 2u) {
    return twillWeave(uv, scale);
  } else if (patternType == 3u) {
    return satinWeave(uv, scale);
  } else if (patternType == 4u) {
    return knitPattern(uv, scale);
  } else if (patternType == 5u) {
    return herringbonePattern(uv, scale);
  }
  return 1.0;
}

// ── Main fragment shader ─────────────────────────────────

@fragment
fn main(@location(0) normal: vec3<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let n = normalize(normal);
  var albedo = vec3<f32>(rp.albedoR, rp.albedoG, rp.albedoB);

  // Apply procedural texture pattern
  if (rp.texturePattern > 0u) {
    let patternVal = getPattern(uv, rp.texturePattern, rp.textureScale);
    let texColor = mix(vec3<f32>(1.0), vec3<f32>(patternVal), rp.textureIntensity);
    albedo = albedo * texColor;
  }

  // Light direction (top-right-front)
  let lightDir = normalize(vec3<f32>(0.4, -0.7, 0.6));

  // Diffuse (Lambert)
  let NdotL = max(dot(n, lightDir), 0.0);

  // Subsurface wrap lighting
  let diffuse = NdotL * (1.0 - rp.subsurface) + rp.subsurface * (NdotL * 0.5 + 0.5);

  // Specular (Blinn-Phong)
  let viewDir = vec3<f32>(0.0, 0.0, 1.0);
  let halfVec = normalize(lightDir + viewDir);
  let NdotH = max(dot(n, halfVec), 0.0);
  let shininess = pow(2.0, (1.0 - rp.roughness) * 8.0);
  let spec = pow(NdotH, shininess) * (1.0 - rp.roughness * 0.6) * 0.4;

  // Sheen at grazing angle (Fresnel-like)
  let fresnel = pow(1.0 - max(n.z, 0.0), 2.0);
  let sheenColor = mix(vec3<f32>(1.0), albedo, rp.sheenTint);
  let sheenContrib = fresnel * rp.sheen * 0.5 * sheenColor;

  // Ambient
  let ambient = 0.15 + rp.subsurface * 0.1;

  // Combine
  var color = albedo * (ambient + diffuse * 0.8) + vec3<f32>(spec) + sheenContrib;
  color = mix(color, albedo * (ambient + diffuse * 0.8 + spec), rp.metallic);
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(color, rp.opacity);
}
