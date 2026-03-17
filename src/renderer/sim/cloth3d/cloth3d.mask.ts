/**
 * Pattern outline → cloth mesh mask.
 *
 * Takes a PatternLayer (bezier outline in grid units) and produces a per-cell
 * Uint8Array mask (1 = active, 0 = masked out).  Masked-out cells get no
 * triangles in the index buffer and their particles are pinned so they don't
 * simulate.  This lets the 2D bezier outline (neckline, armhole, hem curve)
 * shape the 3D cloth mesh — like Marvelous Designer panel outlines.
 *
 * No GPU dependencies — safe to import in Node test environments.
 */

/** Minimal shape of PathNode as used by patternEditor.ts. */
export interface MaskPathNode {
  x: number;   // grid units [0 .. cols-1]
  y: number;   // grid units [0 .. rows-1]
  cp1dx: number;  // incoming control point offset (relative to node)
  cp1dy: number;
  cp2dx: number;  // outgoing control point offset (relative to node)
  cp2dy: number;
}

/** Minimal shape of PatternLayer used for masking. */
export interface MaskPatternLayer {
  outline: MaskPathNode[];
  outlineClosed: boolean;
}

// ── Bezier sampling ───────────────────────────────────────────────────────────

/** Evaluate a cubic bezier at t ∈ [0,1]. */
function cubicBezier(
  p0: number, cp0out: number, cp1in: number, p1: number, t: number,
): number {
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*(p0+cp0out) + 3*u*t*t*(p1+cp1in) + t*t*t*p1;
}

/**
 * Sample a closed/open bezier outline described by PathNode[] into a polygon.
 * Returns array of {x, y} points in grid units.
 * @param nodes         Control nodes.
 * @param closed        Whether to close the curve (connect last→first node).
 * @param samplesPerSeg Number of sample points per bezier segment.
 */
export function sampleBezierOutline(
  nodes: MaskPathNode[],
  closed: boolean,
  samplesPerSeg = 16,
): { x: number; y: number }[] {
  if (nodes.length < 2) return nodes.map(n => ({ x: n.x, y: n.y }));

  const poly: { x: number; y: number }[] = [];
  const count = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < count; i++) {
    const n0 = nodes[i];
    const n1 = nodes[(i + 1) % nodes.length];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      poly.push({
        x: cubicBezier(n0.x, n0.cp2dx, n1.cp1dx, n1.x, t),
        y: cubicBezier(n0.y, n0.cp2dy, n1.cp1dy, n1.y, t),
      });
    }
  }
  // Add the final closing point
  if (closed) {
    poly.push({ x: nodes[0].x, y: nodes[0].y });
  } else {
    poly.push({ x: nodes[nodes.length - 1].x, y: nodes[nodes.length - 1].y });
  }
  return poly;
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (px, py) is inside the polygon.
 */
export function pointInPolygon(
  poly: { x: number; y: number }[],
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersects = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

// ── Mask builder ─────────────────────────────────────────────────────────────

/**
 * Build a per-cell activity mask from a PatternLayer outline.
 *
 * The outline nodes use grid units where (0,0) is the top-left corner of the
 * grid and (cols-1, rows-1) is the bottom-right.  A grid cell (col, row) is
 * active when its center point falls inside the bezier outline.
 *
 * @returns Uint8Array of length rows×cols. 1 = active, 0 = masked out.
 *          Returns all-ones mask if layer has no outline (< 3 nodes).
 */
export function buildOutlineMask(
  layer: MaskPatternLayer,
  cols: number,
  rows: number,
): Uint8Array {
  const mask = new Uint8Array(rows * cols).fill(1);

  // Need at least 3 nodes for a meaningful polygon
  if (!layer.outline || layer.outline.length < 3) return mask;

  const poly = sampleBezierOutline(layer.outline, layer.outlineClosed ?? true);
  if (poly.length < 3) return mask;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Test cell center at (c, r) in grid units
      mask[r * cols + c] = pointInPolygon(poly, c, r) ? 1 : 0;
    }
  }
  return mask;
}
