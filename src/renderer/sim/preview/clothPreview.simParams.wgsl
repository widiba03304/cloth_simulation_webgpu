struct SimParams {
  dt: f32,
  gravity: f32,
  damping: f32,
  stretchStiffH: f32,

  stretchStiffV: f32,
  bendStiffness: f32,
  dragIndex: i32,
  dragTargetX: f32,

  dragTargetY: f32,
  numParticles: u32,
  numConstraints: u32,
  cols: u32,

  floorY: f32,
  constraintOffset: u32,
  pad2: f32,
  pad3: f32,
}
