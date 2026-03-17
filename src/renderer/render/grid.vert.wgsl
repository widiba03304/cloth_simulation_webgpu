// 3D ground-plane grid. Large quad projected by viewProj.

@group(0) @binding(0) var<uniform> viewProj: mat4x4f;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
}

@vertex
fn main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  let groundY = -0.05;
  let size = 100.0;

  // Two triangles: TL, TR, BL, BL, TR, BR
  let corners = array<vec2f, 6>(
    vec2f(-size, -size), vec2f( size, -size), vec2f( size,  size),
    vec2f(-size, -size), vec2f( size,  size), vec2f(-size,  size)
  );
  let p = corners[vi];
  let worldPos = vec3f(p.x, groundY, p.y);

  var out: VertexOutput;
  out.position = viewProj * vec4f(worldPos, 1.0);
  out.worldPos = worldPos;
  return out;
}
