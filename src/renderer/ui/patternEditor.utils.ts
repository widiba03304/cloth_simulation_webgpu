/**
 * Pure utility functions for the Pattern Editor.
 * No DOM / i18n / GPU dependencies — importable in Node test environments.
 */

export interface PathNode {
  x: number; y: number;
  cp1dx: number; cp1dy: number;  // in-control offset
  cp2dx: number; cp2dy: number;  // out-control offset
}

export interface DartDef {
  x: number; y: number;
  width: number;
  depth: number;
  angle: number;
}

export interface PatternLayer {
  id: string;
  name: string;
  outline: PathNode[];
  outlineClosed: boolean;
  darts: DartDef[];
  seamAllowance: number;
}

export interface PatternData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  grid: { rows: number; cols: number; spacing: number };
  pinned: string;
  thumbnail?: string;
  layers?: PatternLayer[];
  activeLayerId?: string;
}

// ── Coordinate helpers ─────────────────────────────────────────────────────────

/** Grid units → canvas pixels. */
export function gToC(
  gx: number, gy: number,
  ox: number, oy: number, cs: number
): [number, number] {
  return [ox + gx * cs, oy + gy * cs];
}

/** Canvas pixels → grid units (clamped to [0, cols-1] × [0, rows-1]). */
export function cToG(
  cx: number, cy: number,
  ox: number, oy: number, cs: number,
  cols: number, rows: number
): [number, number] {
  return [
    Math.max(0, Math.min(cols - 1, (cx - ox) / cs)),
    Math.max(0, Math.min(rows - 1, (cy - oy) / cs)),
  ];
}

// ── Cubic Bezier ───────────────────────────────────────────────────────────────

/** Evaluate a cubic Bézier curve at parameter t ∈ [0,1]. */
export function bezierPt(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const mt = 1 - t;
  return [
    mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0],
    mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1],
  ];
}

// ── Path operations ────────────────────────────────────────────────────────────

/**
 * Smooth all control points in the outline using Catmull-Rom → cubic Bézier.
 * Mutates the nodes in place.
 */
export function smoothOutline(outline: PathNode[]): void {
  const n = outline.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n];
    const cur  = outline[i];
    const next = outline[(i + 1) % n];
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    cur.cp2dx =  tx; cur.cp2dy =  ty;
    cur.cp1dx = -tx; cur.cp1dy = -ty;
  }
}

/**
 * Mirror an outline horizontally around x = centerX (grid units).
 * Flips all x-coordinates and reverses node order so the winding stays consistent.
 * Control point handles are swapped (in↔out) and x-components negated.
 * Use this to create a symmetric pattern half or to flip an entire outline.
 */
export function mirrorOutlineX(nodes: PathNode[], centerX: number): PathNode[] {
  return [...nodes].reverse().map(n => ({
    x:     2 * centerX - n.x,
    y:     n.y,
    cp1dx: -n.cp2dx,  // reversed node order: in-handle ← old out-handle (x-negated)
    cp1dy: -n.cp2dy,
    cp2dx: -n.cp1dx,  // out-handle ← old in-handle (x-negated)
    cp2dy: -n.cp1dy,
  }));
}

/**
 * Approximate outward parallel offset of a closed cubic Bézier path by d canvas pixels.
 * Returns a polyline of offset sample points (no Bézier fitting).
 */
export function offsetPath(
  nodes: PathNode[],
  d: number,
  ox: number, oy: number, cs: number
): [number, number][] {
  if (nodes.length < 2) return [];
  const n = nodes.length;
  const pts: [number, number][] = [];
  const SEGS = 12;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    const [ax, ay] = gToC(a.x, a.y, ox, oy, cs);
    const [bx, by] = gToC(b.x, b.y, ox, oy, cs);
    const [c1x, c1y] = gToC(a.x + a.cp2dx, a.y + a.cp2dy, ox, oy, cs);
    const [c2x, c2y] = gToC(b.x + b.cp1dx, b.y + b.cp1dy, ox, oy, cs);
    for (let s = 0; s < SEGS; s++) {
      const t  = s / SEGS;
      const [px, py] = bezierPt([ax,ay],[c1x,c1y],[c2x,c2y],[bx,by], t);
      const [qx, qy] = bezierPt([ax,ay],[c1x,c1y],[c2x,c2y],[bx,by], t + 0.01);
      const tx2 = qx - px; const ty2 = qy - py;
      const len = Math.sqrt(tx2*tx2 + ty2*ty2) || 1;
      pts.push([px + ty2/len * d, py - tx2/len * d]);
    }
  }
  return pts;
}

// ── SVG export ─────────────────────────────────────────────────────────────────

/** Generate an SVG string for the pattern at 1 unit = 1 mm. */
export function buildPatternSVG(data: PatternData): string {
  const { rows, cols, spacing } = data.grid;
  const sMM    = spacing * 1000;
  const wMM    = (cols - 1) * sMM;
  const hMM    = (rows - 1) * sMM;
  const margin = 20;
  const svgW   = wMM + margin * 2;
  const svgH   = hMM + margin * 2;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}mm" height="${svgH}mm" viewBox="0 0 ${svgW} ${svgH}">`,
    `  <title>${data.name}</title>`,
    `  <rect width="${svgW}" height="${svgH}" fill="white"/>`,
    `  <g stroke="#ddd" stroke-width="0.3">`,
  ];
  for (let r = 0; r < rows; r++) {
    const y = margin + r * sMM;
    lines.push(`    <line x1="${margin}" y1="${y}" x2="${margin + wMM}" y2="${y}"/>`);
  }
  for (let c = 0; c < cols; c++) {
    const x = margin + c * sMM;
    lines.push(`    <line x1="${x}" y1="${margin}" x2="${x}" y2="${margin + hMM}"/>`);
  }
  lines.push(`  </g>`);
  lines.push(`  <rect x="${margin}" y="${margin}" width="${wMM}" height="${hMM}" fill="none" stroke="#ccc" stroke-width="0.4" stroke-dasharray="2,2"/>`);

  const cx = margin + wMM / 2;
  lines.push(`  <line x1="${cx}" y1="${margin+8}" x2="${cx}" y2="${margin+hMM-8}" stroke="#999" stroke-width="0.5" stroke-dasharray="3,3"/>`);

  const g2s = (gx: number, gy: number): [number, number] => [margin + gx * sMM, margin + gy * sMM];

  (data.layers ?? []).forEach(layer => {
    const nodes = layer.outline;
    const n     = nodes.length;
    if (n < 2) return;

    // Main outline
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % n];
      if (i === 0) {
        const [sx, sy] = g2s(a.x, a.y);
        d += `M ${sx.toFixed(2)} ${sy.toFixed(2)} `;
      }
      if (i < n - 1 || layer.outlineClosed) {
        const [c1x, c1y] = g2s(a.x + a.cp2dx, a.y + a.cp2dy);
        const [c2x, c2y] = g2s(b.x + b.cp1dx, b.y + b.cp1dy);
        const [bx, by]   = g2s(b.x, b.y);
        d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)} `;
      }
    }
    if (layer.outlineClosed) d += 'Z';
    lines.push(`  <!-- Layer: ${layer.name} -->`);
    lines.push(`  <path d="${d}" fill="none" stroke="#000" stroke-width="0.8"/>`);

    // Seam allowance offset
    if (layer.outlineClosed && layer.seamAllowance > 0) {
      const saMM   = layer.seamAllowance * 1000;
      const centX  = nodes.reduce((s, nd) => s + nd.x, 0) / n;
      const centY  = nodes.reduce((s, nd) => s + nd.y, 0) / n;
      const scaleX = (gx: number) => { const dx = gx - centX; return centX + dx + (dx >= 0 ? saMM/sMM : -saMM/sMM); };
      const scaleY = (gy: number) => { const dy = gy - centY; return centY + dy + (dy >= 0 ? saMM/sMM : -saMM/sMM); };
      let dSA = '';
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        const b = nodes[(i + 1) % n];
        if (i === 0) {
          const [sx, sy] = g2s(scaleX(a.x), scaleY(a.y));
          dSA += `M ${sx.toFixed(2)} ${sy.toFixed(2)} `;
        }
        // outlineClosed is always true here (guarded by outer `if`), so always draw the segment
        {
          const [c1x, c1y] = g2s(scaleX(a.x + a.cp2dx), scaleY(a.y + a.cp2dy));
          const [c2x, c2y] = g2s(scaleX(b.x + b.cp1dx), scaleY(b.y + b.cp1dy));
          const [bx, by]   = g2s(scaleX(b.x), scaleY(b.y));
          dSA += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)} `;
        }
      }
      dSA += 'Z';
      lines.push(`  <path d="${dSA}" fill="none" stroke="#f39c12" stroke-width="0.5" stroke-dasharray="3,2"/>`);
      lines.push(`  <text x="${margin}" y="${margin + hMM + 15}" font-family="sans-serif" font-size="3" fill="#f39c12">SA: ${(saMM/10).toFixed(1)} cm</text>`);
    }

    // Darts
    layer.darts.forEach(dart => {
      const [dax, day] = g2s(dart.x, dart.y);
      const hw  = (dart.width / 2) * sMM;
      const dep = dart.depth * sMM;
      const ang = dart.angle;
      const baseX = dax - Math.sin(ang) * dep;
      const baseY = day + Math.cos(ang) * dep;
      const perpX = Math.cos(ang) * hw;
      const perpY = Math.sin(ang) * hw;
      lines.push(`  <polygon points="${dax.toFixed(2)},${day.toFixed(2)} ${(baseX-perpX).toFixed(2)},${(baseY-perpY).toFixed(2)} ${(baseX+perpX).toFixed(2)},${(baseY+perpY).toFixed(2)}" fill="rgba(155,89,182,0.15)" stroke="#9b59b6" stroke-width="0.5"/>`);
    });
  });

  const infoText = `W: ${(wMM/10).toFixed(1)}cm × H: ${(hMM/10).toFixed(1)}cm  |  ${rows}×${cols}  |  ${sMM.toFixed(0)}mm spacing`;
  lines.push(`  <text x="${margin}" y="${margin-5}" font-family="sans-serif" font-size="5" fill="#333">${data.name}</text>`);
  lines.push(`  <text x="${margin}" y="${margin+hMM+10}" font-family="sans-serif" font-size="3.5" fill="#666">${infoText}</text>`);
  lines.push(`</svg>`);
  return lines.join('\n');
}
