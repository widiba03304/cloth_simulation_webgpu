// Shared SimParams uniform for 3D cloth simulation.
// Prepended to integrate, constraint, and normal compute shaders at build time.
// Total size: 96 bytes (24 × 4-byte fields).
struct SimParams {
  dt: f32,               //  0: time step (seconds per substep)
  gravity: f32,          //  4: effective gravity (m/s²), scaled by density
  damping: f32,          //  8: velocity damping factor per substep (0.95–0.99)
  stretchStiffH: f32,    // 12: (legacy, unused in XPBD path)

  stretchStiffV: f32,    // 16: (legacy, unused in XPBD path)
  bendStiffness: f32,    // 20: (legacy, unused in XPBD path)
  numParticles: u32,     // 24: total particle count (rows × cols)
  cols: u32,             // 28: grid columns

  rows: u32,             // 32: grid rows
  numConstraints: u32,   // 36: constraint count in current color group
  constraintOffset: u32, // 40: offset into constraint buffer for current group
  pad0: u32,             // 44: padding

  windX: f32,            // 48: wind direction X component (world space, unit vector)
  windY: f32,            // 52: wind direction Y component
  windZ: f32,            // 56: wind direction Z component
  windStrength: f32,     // 60: wind force magnitude (m/s²); 0 = no wind

  // XPBD: per-kind compliance ÷ dt_sub² (α̃ = α / dt_sub²)
  // α̃ = 0 → fully rigid; large α̃ → compliant (stretchy/drapey)
  alphaTildeH:     f32,  // 64: weft  (horizontal) stretch compliance
  alphaTildeV:     f32,  // 68: warp  (vertical)   stretch compliance
  alphaTildeShear: f32,  // 72: shear diagonal compliance
  alphaTildeBend:  f32,  // 76: bend (2-apart) compliance

  alphaTildeSeam:  f32,  // 80: cross-panel seam compliance (0 = rigid)
  pad1: f32,             // 84
  pad2: f32,             // 88
  pad3: f32,             // 92
}
