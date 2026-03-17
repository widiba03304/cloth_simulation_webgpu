// 3D ground grid with anti-aliased lines and distance fade.

struct FragmentInput {
  @location(0) worldPos: vec3f,
}

@fragment
fn main(in: FragmentInput, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  // Transparent when viewed from below
  if (!frontFacing) { discard; }

  let bgColor = vec3f(0.55, 0.55, 0.55);
  let lineColor = vec3f(0.45, 0.45, 0.45);
  let axisColorX = vec3f(0.7, 0.25, 0.25);
  let axisColorZ = vec3f(0.25, 0.25, 0.7);

  let cellSize = 0.5;
  let subCellSize = 0.1;

  let x = in.worldPos.x;
  let z = in.worldPos.z;

  // --- Anti-aliased grid lines ---
  let dxw = fwidth(x);
  let dzw = fwidth(z);

  let gx = abs(fract(x / cellSize - 0.5) - 0.5) * cellSize;
  let gz = abs(fract(z / cellSize - 0.5) - 0.5) * cellSize;
  let majorX = 1.0 - smoothstep(0.0, dxw * 1.5, gx);
  let majorZ = 1.0 - smoothstep(0.0, dzw * 1.5, gz);
  let major = max(majorX, majorZ);

  let sgx = abs(fract(x / subCellSize - 0.5) - 0.5) * subCellSize;
  let sgz = abs(fract(z / subCellSize - 0.5) - 0.5) * subCellSize;
  let subX = 1.0 - smoothstep(0.0, dxw * 1.2, sgx);
  let subZ = 1.0 - smoothstep(0.0, dzw * 1.2, sgz);
  let sub = max(subX, subZ) * 0.3;

  let line = max(major, sub);

  // --- Distance fade ---
  let dist = length(in.worldPos.xz);
  let fade = 1.0 - smoothstep(5.0, 25.0, dist);

  // --- Axis highlights ---
  let axisWidth = max(dxw, dzw) * 2.0;
  let onAxisX = 1.0 - smoothstep(0.0, axisWidth, abs(z));
  let onAxisZ = 1.0 - smoothstep(0.0, axisWidth, abs(x));

  // Compose: grid on gray background, blended by fade
  var color = mix(bgColor, lineColor, line * fade);
  color = mix(color, axisColorX, onAxisX * fade * 0.8);
  color = mix(color, axisColorZ, onAxisZ * fade * 0.8);

  // Where fade is 0, use the clear color (gray sky) by discarding
  let skyColor = vec3f(0.45, 0.45, 0.45);
  color = mix(skyColor, color, fade);

  return vec4f(color, 1.0);
}
