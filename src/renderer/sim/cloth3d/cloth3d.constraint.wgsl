// 3D XPBD distance constraint solver — graph-colored group dispatch.
// SimParams struct prepended at build time.
// pos: flat f32 array, stride 3 (x, y, z per particle).
// lambda: per-constraint Lagrange multiplier, reset to 0 at start of each substep.

struct Constraint {
  a: u32,
  b: u32,
  restLen: f32,
  kind: u32,  // 0=H(weft), 1=V(warp), 2=shear, 3=bend, 4=seam
}

@group(0) @binding(0) var<storage, read_write> pos:         array<f32>;
@group(0) @binding(1) var<storage, read>       pinned:      array<u32>;
@group(0) @binding(2) var<storage, read>       constraints: array<Constraint>;
@group(0) @binding(3) var<uniform>             params:      SimParams;
@group(0) @binding(4) var<storage, read_write> lambda:      array<f32>;

fn alphaTildeForKind(kind: u32) -> f32 {
  if      (kind == 0u) { return params.alphaTildeH;     }  // weft  (horizontal)
  else if (kind == 1u) { return params.alphaTildeV;     }  // warp  (vertical)
  else if (kind == 2u) { return params.alphaTildeShear; }  // shear diagonal
  else if (kind == 4u) { return params.alphaTildeSeam;  }  // cross-panel seam
  else                 { return params.alphaTildeBend;  }  // bend (kind == 3)
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numConstraints) { return; }

  let cIdx = idx + params.constraintOffset;
  let c = constraints[cIdx];

  let ab = c.a * 3u;
  let bb = c.b * 3u;

  let dx = pos[bb]      - pos[ab];
  let dy = pos[bb + 1u] - pos[ab + 1u];
  let dz = pos[bb + 2u] - pos[ab + 2u];
  let dist = sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.0001) { return; }

  let C       = dist - c.restLen;
  let aTilde  = alphaTildeForKind(c.kind);
  let w_a     = select(1.0, 0.0, pinned[c.a] != 0u);
  let w_b     = select(1.0, 0.0, pinned[c.b] != 0u);
  let denom   = w_a + w_b + aTilde;
  if (denom < 1e-6) { return; }

  // XPBD: accumulate lambda across iterations within the same substep
  let lam     = lambda[cIdx];
  let dLambda = -(C + aTilde * lam) / denom;
  lambda[cIdx] = lam + dLambda;

  let nx = dx / dist;
  let ny = dy / dist;
  let nz = dz / dist;

  // Δxa = (1/m_a) * ∇_{xa}C * dLambda = (-n) * dLambda   (∇_{xa}C = -n for dist constraint)
  // Δxb = (1/m_b) * ∇_{xb}C * dLambda = (+n) * dLambda   (∇_{xb}C = +n)
  if (w_a > 0.0) {
    pos[ab]      = pos[ab]      - nx * dLambda * w_a;
    pos[ab + 1u] = pos[ab + 1u] - ny * dLambda * w_a;
    pos[ab + 2u] = pos[ab + 2u] - nz * dLambda * w_a;
  }
  if (w_b > 0.0) {
    pos[bb]      = pos[bb]      + nx * dLambda * w_b;
    pos[bb + 1u] = pos[bb + 1u] + ny * dLambda * w_b;
    pos[bb + 2u] = pos[bb + 2u] + nz * dLambda * w_b;
  }
}
