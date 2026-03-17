/**
 * Sample pattern cloth configs and size scale data.
 * Extracted from main.ts to keep orchestration thin.
 */
import { buildOutlineMask, type MaskPatternLayer } from '../sim/cloth3d/cloth3d.mask';
import type { Cloth3DConfig } from '../sim/cloth3d/cloth3d';

export const SIZE_SCALE: Record<string, number> = {
  XS: 0.82, S: 0.91, M: 1.0, L: 1.09, XL: 1.18, XXL: 1.27,
};

/** Approximate body origin + radius per sample pattern.
 *  flatPanel=true → mixed init: row 0 on body arc (V-constraint anchors), rows 1..N flat.
 *  V-constraints from body-arc row 0 guide flat lower rows toward wrapped shape naturally.
 *  Outer garments (vest/jacket): body-arc init at larger R for loose over-shirt fit. */
export const SAMPLE_PATTERN_CLOTH_CONFIGS: Record<string, Pick<Cloth3DConfig, 'rows' | 'cols' | 'spacing' | 'pinned' | 'origin' | 'radius' | 'twoPanel' | 'flatPanel'>> = {
  tshirt:    { rows: 16, cols: 14, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.19,  twoPanel: true, flatPanel: true },
  tank:      { rows: 13, cols: 14, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.19,  twoPanel: true, flatPanel: true },
  skirt:     { rows: 22, cols: 13, spacing: 0.03,  pinned: 'topRow', origin: [0, 0.92, 0], radius: 0.175, twoPanel: true, flatPanel: true },
  dress:     { rows: 45, cols: 14, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.19,  twoPanel: true, flatPanel: true },
  mini_dress:{ rows: 28, cols: 14, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.19,  twoPanel: true, flatPanel: true },
  culottes:  { rows: 22, cols: 13, spacing: 0.03,  pinned: 'topRow', origin: [0, 0.92, 0], radius: 0.175, twoPanel: true, flatPanel: true },
  // Open panel garments — pinned at top corners to hang correctly
  hood:      { rows: 18, cols: 20, spacing: 0.035, pinned: 'topCorners', origin: [0, 1.58, 0], radius: 0.28 },
  scarf:     { rows:  6, cols: 40, spacing: 0.03,  pinned: 'topCorners', origin: [0, 1.50, 0], radius: 0.35 },
  // Outer garments (over shirt) — R > capsule so they sit over the shirt
  vest:      { rows: 24, cols: 16, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.22,  twoPanel: true },
  jacket:    { rows: 30, cols: 17, spacing: 0.03,  pinned: 'topRow', origin: [0, 1.42, 0], radius: 0.24,  twoPanel: true },
};

export const DEFAULT_CLOTH_CONFIG: Pick<Cloth3DConfig, 'rows' | 'cols' | 'spacing' | 'pinned' | 'origin' | 'radius'> =
  { rows: 20, cols: 14, spacing: 0.03, pinned: 'topRow', origin: [0, 1.40, 0], radius: 0.22 };

/**
 * Stepped armhole mask for chest-level twoPanel garments.
 * Values = outer columns to mask per row (both left and right sides).
 */
const ARMHOLE_MASK_STEPS: Record<string, number[]> = {
  tshirt:    [3, 2, 1, 1],
  tank:      [4, 3, 2, 1],
  dress:     [2, 1, 1],
  mini_dress:[2, 1, 1],
};

function makeArmholeMask(rows: number, cols: number, steps: number[]): Uint8Array {
  const mask = new Uint8Array(rows * cols).fill(1);
  for (let r = 0; r < steps.length && r < rows; r++) {
    const m = steps[r];
    for (let c = 0; c < m; c++) {
      mask[r * cols + c] = 0;
      mask[r * cols + (cols - 1 - c)] = 0;
    }
  }
  return mask;
}

export function getClothConfig(
  patternId: string,
  size: string,
  activePatternGrid?: { rows: number; cols: number; spacing: number; pinned?: string } | null,
  activePatternLayer?: MaskPatternLayer | null,
): Cloth3DConfig {
  const cfg = SAMPLE_PATTERN_CLOTH_CONFIGS[patternId] ?? DEFAULT_CLOTH_CONFIG;
  const scale = SIZE_SCALE[size] ?? 1.0;
  const base = { ...cfg, radius: (cfg.radius ?? 0.22) * scale };
  let resolved: Cloth3DConfig = base;
  if (activePatternGrid) {
    resolved = {
      ...base,
      rows:    activePatternGrid.rows,
      cols:    activePatternGrid.cols,
      spacing: activePatternGrid.spacing,
      pinned:  (activePatternGrid.pinned as Cloth3DConfig['pinned']) ?? base.pinned,
    };
  }
  const armholeSteps = ARMHOLE_MASK_STEPS[patternId];
  if (!activePatternLayer && armholeSteps) {
    resolved = { ...resolved, activeMask: makeArmholeMask(resolved.rows, resolved.cols, armholeSteps) };
  }
  if (activePatternLayer && activePatternLayer.outline.length >= 3) {
    const mask = buildOutlineMask(activePatternLayer, resolved.cols, resolved.rows);
    if (mask.some(v => v)) resolved = { ...resolved, activeMask: mask };
  }
  return resolved;
}
