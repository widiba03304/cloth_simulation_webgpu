struct RenderParams {
  canvasW: f32,
  canvasH: f32,
  albedoR: f32,
  albedoG: f32,

  albedoB: f32,
  roughness: f32,
  metallic: f32,
  sheen: f32,

  sheenTint: f32,
  subsurface: f32,
  opacity: f32,
  fuzziness: f32,

  texturePattern: u32,
  textureScale: f32,
  textureIntensity: f32,
  pad: f32,
}
