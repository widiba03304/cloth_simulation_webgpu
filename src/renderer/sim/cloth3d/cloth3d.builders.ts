/**
 * Pure CPU data-building functions for the 3D cloth simulation.
 * No GPU / WebGPU dependencies — safe to import in Node test environments.
 *
 * Extracted from cloth3d.ts so unit tests can import without the ?raw WGSL
 * imports that Vite resolves but Node cannot.
 */

// ── Constraint kinds (must match WGSL cloth3d.constraint.wgsl) ────────────────
export const KIND_H     = 0;  // horizontal (weft)
export const KIND_V     = 1;  // vertical (warp)
export const KIND_SHEAR = 2;  // diagonal shear
export const KIND_BEND  = 3;  // 2-apart bend
export const KIND_SEAM  = 4;  // cross-panel seam (stiffness always = 1.0)

// ── Shared simulation constants ───────────────────────────────────────────────
/** Physics substeps per animation frame. */
export const SUB_STEPS = 4;
/**
 * Extra Z-distance (metres) beyond body radius used to place flat panels
 * before play starts. Must be identical in buildConstraints + buildInitialPositions.
 */
export const FLAT_PANEL_Z_OFFSET = 0.12;
/** Number of body capsule colliders. */
export const NUM_CAPSULES = 13;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Cloth3DConfig {
  rows:       number;
  cols:       number;
  spacing:    number;
  pinned:     'topRow' | 'topCorners' | 'none';
  origin:     [number, number, number];
  radius?:    number;
  twoPanel?:  boolean;
  /**
   * Marvelous Designer–style draping: start panels flat (spread apart in Z)
   * and progressively tighten seam constraints until panels sew together.
   * Only meaningful when twoPanel=true.
   */
  flatPanel?: boolean;
  /**
   * Optional per-cell activity mask (rows×cols). 0 = masked out (no mesh, pinned).
   * Used to cut necklines/armholes from a pattern outline.
   */
  activeMask?: Uint8Array;
}

export interface Cloth3DMaterialParams {
  albedo:        [number, number, number];
  roughness:     number;
  metallic:      number;
  opacity:       number;
  density:       number;
  stretchWarp:   number;
  stretchWeft:   number;
  bendStiffness: number;
  drape:         number;
}

export interface ConstraintGroup { offset: number; count: number; wg: number; }

export interface CapsuleDef {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
}

// ── Body capsule colliders (T-pose SMPL approximation) ───────────────────────

export const BODY_CAPSULES: CapsuleDef[] = [
  { a: [ 0.00, 1.62,  0.03], b: [ 0.00, 1.62,  0.03], r: 0.110 }, // head (sphere)
  { a: [ 0.00, 1.49,  0.01], b: [ 0.00, 1.58,  0.01], r: 0.058 }, // neck
  { a: [ 0.00, 1.15,  0.00], b: [ 0.00, 1.42,  0.00], r: 0.190 }, // upper torso
  { a: [ 0.00, 0.85,  0.00], b: [ 0.00, 1.15,  0.00], r: 0.175 }, // lower torso
  { a: [ 0.00, 0.62,  0.00], b: [ 0.00, 0.87,  0.00], r: 0.200 }, // hips
  { a: [-0.18, 1.37,  0.00], b: [-0.42, 1.18,  0.00], r: 0.066 }, // left upper arm
  { a: [ 0.18, 1.37,  0.00], b: [ 0.42, 1.18,  0.00], r: 0.066 }, // right upper arm
  { a: [-0.42, 1.18,  0.00], b: [-0.60, 0.95,  0.00], r: 0.053 }, // left forearm
  { a: [ 0.42, 1.18,  0.00], b: [ 0.60, 0.95,  0.00], r: 0.053 }, // right forearm
  { a: [-0.09, 0.62,  0.00], b: [-0.09, 0.34,  0.00], r: 0.108 }, // left thigh
  { a: [ 0.09, 0.62,  0.00], b: [ 0.09, 0.34,  0.00], r: 0.108 }, // right thigh
  { a: [-0.09, 0.34,  0.00], b: [-0.09, 0.04,  0.00], r: 0.075 }, // left shin
  { a: [ 0.09, 0.34,  0.00], b: [ 0.09, 0.04,  0.00], r: 0.075 }, // right shin
];

export const CAPSULE_JOINT_MAP: Array<{ ai: number; bi: number }> = [
  { ai: 15, bi: 15 }, // head
  { ai: 12, bi: 15 }, // neck
  { ai:  9, bi: 12 }, // upper torso
  { ai:  6, bi:  9 }, // lower torso
  { ai:  0, bi:  6 }, // hips
  { ai: 16, bi: 18 }, // left upper arm
  { ai: 17, bi: 19 }, // right upper arm
  { ai: 18, bi: 20 }, // left forearm
  { ai: 19, bi: 21 }, // right forearm
  { ai:  1, bi:  4 }, // left thigh
  { ai:  2, bi:  5 }, // right thigh
  { ai:  4, bi:  7 }, // left shin
  { ai:  5, bi:  8 }, // right shin
];

// ── Data builders ─────────────────────────────────────────────────────────────

export function buildConstraints(
  rows: number, cols: number, spacing: number,
  twoPanel = false, flatPanel = false, radius = 0.22,
  activeMask?: Uint8Array,
): { data: Uint8Array; total: number; groups: ConstraintGroup[]; initialSeamRestLen: number } {
  type C = { a: number; b: number; restLen: number; kind: number };
  const colorGroups: C[][] = [];
  const add = (gi: number, c: C) => {
    while (colorGroups.length <= gi) colorGroups.push([]);
    colorGroups[gi].push(c);
  };

  // active(r,c) returns true when no mask set OR when cell is active in mask
  const active = activeMask
    ? (r: number, c: number) => activeMask[r * cols + c] !== 0
    : () => true;

  // For twoPanel non-flatPanel (body arc init): adjacent columns sit on an arc,
  // so the actual H-distance is the chord length, NOT spacing.
  // Using spacing as H-restLen causes compression → cloth inflates outward (cylinder look).
  // Chord = 2*R*sin(π / (2*(cols-1))).  For flatPanel (flat grid), chord = spacing.
  const hRestLen = (twoPanel && !flatPanel)
    ? 2 * radius * Math.sin(Math.PI / (2 * (cols - 1)))
    : spacing;

  const addPanelConstraints = (off: number) => {
    // Horizontal (weft) — 2 color groups
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols - 1; c++)
        if (active(r, c) && active(r, c+1))
          add(c % 2, { a: off+r*cols+c, b: off+r*cols+c+1, restLen: hRestLen, kind: KIND_H });

    // Vertical (warp) — 2 color groups
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        if (active(r, c) && active(r+1, c))
          add(2 + (r%2), { a: off+r*cols+c, b: off+(r+1)*cols+c, restLen: spacing, kind: KIND_V });

    // Shear (diagonal) — 4 color groups
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const i = off + r * cols + c;
        const shearLen = Math.sqrt(hRestLen * hRestLen + spacing * spacing);
        if (active(r, c) && active(r+1, c+1))
          add(4 + (r%2)*2,     { a: i,   b: i+cols+1, restLen: shearLen, kind: KIND_SHEAR });
        if (active(r, c+1) && active(r+1, c))
          add(4 + (r%2)*2 + 1, { a: i+1, b: i+cols,   restLen: shearLen, kind: KIND_SHEAR });
      }

    // Bend horizontal — 2 color groups
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols - 2; c++)
        if (active(r, c) && active(r, c+2))
          add(8 + (c%2), { a: off+r*cols+c, b: off+r*cols+c+2, restLen: hRestLen*2, kind: KIND_BEND });

    // Bend vertical — 2 color groups
    for (let r = 0; r < rows - 2; r++)
      for (let c = 0; c < cols; c++)
        if (active(r, c) && active(r+2, c))
          add(10 + (r%2), { a: off+r*cols+c, b: off+(r+2)*cols+c, restLen: spacing*2, kind: KIND_BEND });
  };

  // Seam rest length for flatPanel: set to the actual initial distance between seam
  // particles so the seam applies ZERO force before play.  progressSeams() in
  // cloth3d.ts reduces this to 0 by ×0.975/step → ~4 s sewing animation.
  // The flat seam particles sit at z = ±(R + FLAT_PANEL_Z_OFFSET), same X → pure Z gap.
  // For non-flatPanel (body-arc init), panels are already wrapped so restLen=0 is fine.
  const seamRestLen = flatPanel ? 2 * (radius + FLAT_PANEL_Z_OFFSET) : 0;

  if (twoPanel) {
    const N = rows * cols;
    addPanelConstraints(0);
    addPanelConstraints(N);
    // Seam constraints on all rows (row 0 seam edges are pinned so it's a no-op there).
    const seamRowStart = 0;
    // Right seam: front col=cols-1 ↔ back col=0
    for (let r = seamRowStart; r < rows; r++)
      add(12, { a: r*cols+(cols-1), b: N+r*cols+0, restLen: seamRestLen, kind: KIND_SEAM });
    // Left seam: front col=0 ↔ back col=cols-1
    for (let r = seamRowStart; r < rows; r++)
      add(13, { a: r*cols+0, b: N+r*cols+(cols-1), restLen: seamRestLen, kind: KIND_SEAM });
  } else {
    addPanelConstraints(0);
  }

  const all: C[] = [];
  const groups: ConstraintGroup[] = [];
  for (const g of colorGroups) {
    groups.push({ offset: all.length, count: g.length, wg: Math.ceil(g.length / 64) });
    for (const c of g) all.push(c);
  }

  const total = all.length;
  const rawBuf = new ArrayBuffer(total * 16);
  const u32    = new Uint32Array(rawBuf);
  const f32    = new Float32Array(rawBuf);
  for (let i = 0; i < total; i++) {
    const c = all[i];
    u32[i*4]     = c.a;
    u32[i*4 + 1] = c.b;
    f32[i*4 + 2] = c.restLen;
    u32[i*4 + 3] = c.kind;
  }
  return { data: new Uint8Array(rawBuf), total, groups, initialSeamRestLen: seamRestLen };
}

export function buildInitialPositions(
  cfg: Cloth3DConfig
): { posData: Float32Array; pinnedData: Uint32Array } {
  const { rows, cols, spacing, pinned, twoPanel, activeMask } = cfg;
  const R      = cfg.radius ?? 0.22;
  const [cx, topY, cz] = cfg.origin;
  const panelN = rows * cols;
  const N      = twoPanel ? panelN * 2 : panelN;
  const posData    = new Float32Array(N * 3);
  const pinnedData = new Uint32Array(N);

  if (twoPanel) {
    if (cfg.flatPanel) {
      // Mixed init: row 0 on body arc (pinned anchor), rows 1..N flat.
      // Row 0 on body arc provides correct V-constraint pull directions: near seam
      // edges the V violation is large and points toward z=0, so V-constraints
      // HELP the seam wrap the lower flat rows around the body.  Near the front
      // center the V is already satisfied, so the center stays flat against the body.
      const step = Math.PI / (cols - 1);
      // Row 0: body-arc positions (same formula as non-flatPanel branch)
      for (let c = 0; c < cols; c++) {
        const frontAngle = -Math.PI / 2 + c * step;
        const backAngle  =  Math.PI / 2 + c * step;
        posData[c*3]              = cx + R * Math.sin(frontAngle);
        posData[c*3 + 1]          = topY;
        posData[c*3 + 2]          = cz + R * Math.cos(frontAngle);
        posData[(panelN+c)*3]     = cx + R * Math.sin(backAngle);
        posData[(panelN+c)*3 + 1] = topY;
        posData[(panelN+c)*3 + 2] = cz + R * Math.cos(backAngle);
      }
      // Rows 1..N: flat 2D panels placed FLAT_PANEL_Z_OFFSET beyond the body surface
      // so they appear as clearly separate flat pattern pieces before simulation starts.
      // V-constraints from body-arc row 0 will pull these rows toward the wrapped shape
      // once play begins.
      const flatZ = R + FLAT_PANEL_Z_OFFSET;
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const fi = r * cols + c;
          const bi = panelN + fi;
          const y  = topY - r * spacing;
          const xF =  (c - (cols-1)/2) * spacing;
          const xB = -xF;
          posData[fi*3]   = cx + xF; posData[fi*3+1] = y; posData[fi*3+2] = cz + flatZ;
          posData[bi*3]   = cx + xB; posData[bi*3+1] = y; posData[bi*3+2] = cz - flatZ;
        }
      }
    } else {
      const step = Math.PI / (cols - 1);
      // Front panel: –π/2 → +π/2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx   = r * cols + c;
          const angle = -Math.PI / 2 + c * step;
          posData[idx*3]     = cx + R * Math.sin(angle);
          posData[idx*3 + 1] = topY - r * spacing;
          posData[idx*3 + 2] = cz  + R * Math.cos(angle);
        }
      }
      // Back panel: +π/2 → +3π/2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx   = panelN + r * cols + c;
          const angle = Math.PI / 2 + c * step;
          posData[idx*3]     = cx + R * Math.sin(angle);
          posData[idx*3 + 1] = topY - r * spacing;
          posData[idx*3 + 2] = cz  + R * Math.cos(angle);
        }
      }
    }
    if (pinned === 'topRow') {
      for (let c = 0; c < cols; c++) {
        pinnedData[c]        = 1;
        pinnedData[panelN+c] = 1;
      }
    } else if (pinned === 'topCorners') {
      pinnedData[0] = 1; pinnedData[cols-1] = 1;
      pinnedData[panelN] = 1; pinnedData[panelN+cols-1] = 1;
    }
    if (activeMask) {
      for (let i = 0; i < panelN; i++) if (!activeMask[i]) { pinnedData[i] = 1; pinnedData[panelN+i] = 1; }
    }
    return { posData, pinnedData };
  }

  const totalAngle = (cols - 1) * spacing / R;
  const startAngle = -totalAngle / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx   = r * cols + c;
      const angle = startAngle + c * (spacing / R);
      posData[idx*3]     = cx + R * Math.sin(angle);
      posData[idx*3 + 1] = topY - r * spacing;
      posData[idx*3 + 2] = cz  + R * Math.cos(angle);
    }
  }

  if (pinned === 'topRow') {
    for (let c = 0; c < cols; c++) pinnedData[c] = 1;
  } else if (pinned === 'topCorners') {
    pinnedData[0] = 1; pinnedData[cols-1] = 1;
  }
  if (activeMask) {
    for (let i = 0; i < rows * cols; i++) if (!activeMask[i]) pinnedData[i] = 1;
  }
  return { posData, pinnedData };
}

export function buildIndices(
  rows: number, cols: number, twoPanel = false,
  activeMask?: Uint8Array,
): { indexData: Uint32Array; numIndices: number } {
  const active = activeMask
    ? (r: number, c: number) => activeMask[r * cols + c] !== 0
    : () => true;

  if (twoPanel) {
    const totalTris = 2 * (cols - 1) * (rows - 1);
    const indexData = new Uint32Array(totalTris * 6);
    let idx = 0;
    const N = rows * cols;
    for (let panel = 0; panel < 2; panel++) {
      const off = panel * N;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!active(r,c) || !active(r,c+1) || !active(r+1,c) || !active(r+1,c+1)) continue;
          const i0 = off + r * cols + c;
          indexData[idx++] = i0;     indexData[idx++] = i0+1;      indexData[idx++] = i0+cols;
          indexData[idx++] = i0+1;   indexData[idx++] = i0+cols+1; indexData[idx++] = i0+cols;
        }
      }
    }
    return { indexData, numIndices: idx };
  }

  const totalTris = (cols - 1) * (rows - 1);
  const indexData = new Uint32Array(totalTris * 6);
  let idx = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!active(r,c) || !active(r,c+1) || !active(r+1,c) || !active(r+1,c+1)) continue;
      const i0 = r * cols + c;
      indexData[idx++] = i0;   indexData[idx++] = i0+1;        indexData[idx++] = i0+cols;
      indexData[idx++] = i0+1; indexData[idx++] = i0+cols+1;   indexData[idx++] = i0+cols;
    }
  }
  return { indexData, numIndices: idx };
}

export function buildCapsulesData(): Float32Array {
  const buf = new Float32Array(BODY_CAPSULES.length * 8);
  for (let i = 0; i < BODY_CAPSULES.length; i++) {
    const c = BODY_CAPSULES[i];
    buf[i*8]     = c.a[0]; buf[i*8+1] = c.a[1]; buf[i*8+2] = c.a[2]; buf[i*8+3] = c.r;
    buf[i*8+4]   = c.b[0]; buf[i*8+5] = c.b[1]; buf[i*8+6] = c.b[2]; buf[i*8+7] = 0;
  }
  return buf;
}

export function writeSimParams(
  f32Buf: Float32Array, u32Buf: Uint32Array,
  d: Cloth3DMaterialParams,
  groupCount: number, groupOffset: number,
  rows: number, cols: number, numParticles: number,
  wind: [number, number, number] = [0, 0, 0],
  windStrength = 0,
): void {
  const dt      = (1 / 60) / SUB_STEPS;
  const gravity = 9.8 * (0.2 + (d.density / 600) * 0.8);
  const damping = 0.95 + d.drape * 0.03;
  const stiffH  = 1 - (d.stretchWeft / 100) * 0.7;
  const stiffV  = 1 - (d.stretchWarp / 100) * 0.7;

  // XPBD alpha_tilde = (1 / (stiff × 0.5)) − 2, clamped to ≥ 0.
  // Maps PBD stiffness [0.3..1.0] → alpha_tilde [0..4.67].
  // alpha_tilde = 0  → rigid (fully corrected in one iteration)
  // alpha_tilde = 4  → compliant (silky/drapey material)
  const aTildeH     = Math.max(0, 1 / (stiffH             * 0.5) - 2);
  const aTildeV     = Math.max(0, 1 / (stiffV             * 0.5) - 2);
  const aTildeShear = Math.max(0, 1 / (0.8                * 0.5) - 2);  // fixed shear stiffness
  const aTildeBend  = Math.max(0, 1 / (d.bendStiffness    * 0.5 * 0.6) - 2);
  const aTildeSeam  = 0;  // seam always rigid

  f32Buf[0]  = dt;           f32Buf[1]  = gravity;      f32Buf[2]  = damping;
  f32Buf[3]  = stiffH;       f32Buf[4]  = stiffV;       f32Buf[5]  = d.bendStiffness;
  u32Buf[6]  = numParticles; u32Buf[7]  = cols;
  u32Buf[8]  = rows;         u32Buf[9]  = groupCount;   u32Buf[10] = groupOffset;
  u32Buf[11] = 0;
  f32Buf[12] = wind[0];      f32Buf[13] = wind[1];      f32Buf[14] = wind[2]; f32Buf[15] = windStrength;
  // XPBD fields (bytes 64–95)
  f32Buf[16] = aTildeH;      f32Buf[17] = aTildeV;      f32Buf[18] = aTildeShear;
  f32Buf[19] = aTildeBend;   f32Buf[20] = aTildeSeam;
  f32Buf[21] = 0;            f32Buf[22] = 0;            f32Buf[23] = 0;
}

export interface SDFBounds {
  minX: number; minY: number; minZ: number;
  extX: number; extY: number; extZ: number;
}

/**
 * Write the CollideParams uniform buffer (48 bytes = 12 × f32/u32).
 * Layout must match the struct in cloth3d.collide.wgsl.
 *
 * @param sdf  Optional SDF bounds.  When null/undefined the SDF extent is
 *             set to zero so every sampleSDF() call returns 1.0 (no collision).
 */
export function writeCollideParams(
  buf: Uint32Array, fBuf: Float32Array,
  numParticles: number,
  sdf?: SDFBounds | null,
): void {
  buf[0]  = numParticles;
  buf[1]  = 0;        // pad0
  fBuf[2] = 0.01;     // floorY
  fBuf[3] = 0;        // pad1
  if (sdf) {
    fBuf[4]  = sdf.minX; fBuf[5]  = sdf.minY; fBuf[6]  = sdf.minZ; fBuf[7]  = 0;
    fBuf[8]  = sdf.extX; fBuf[9]  = sdf.extY; fBuf[10] = sdf.extZ; fBuf[11] = 0;
  } else {
    // Zero extent → sampleSDF always returns 1.0 (outside) → no collision
    fBuf[4]  = 0; fBuf[5]  = 0; fBuf[6]  = 0; fBuf[7]  = 0;
    fBuf[8]  = 0; fBuf[9]  = 0; fBuf[10] = 0; fBuf[11] = 0;
  }
}
