/**
 * Unit tests for patternEditor.utils.ts — pure math/SVG utility functions.
 * No DOM / i18n / GPU dependencies required.
 * Target: 100% branch + statement coverage of patternEditor.utils.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  gToC, cToG, bezierPt, smoothOutline, offsetPath, buildPatternSVG, mirrorOutlineX,
  type PathNode, type PatternData, type PatternLayer,
} from '../src/renderer/ui/patternEditor.utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a PathNode with all control offsets zero. */
function node(x: number, y: number): PathNode {
  return { x, y, cp1dx: 0, cp1dy: 0, cp2dx: 0, cp2dy: 0 };
}

const BASE_DATA: PatternData = {
  id: 'p1',
  name: 'Test Pattern',
  createdAt: 0,
  updatedAt: 0,
  grid: { rows: 5, cols: 4, spacing: 0.03 },
  pinned: 'topRow',
};
// spacing=0.03 → sMM=30, wMM=(4-1)*30=90, hMM=(5-1)*30=120, margin=20
// svgW=130, svgH=160

// ---------------------------------------------------------------------------
// gToC
// ---------------------------------------------------------------------------

describe('gToC', () => {
  it('returns [ox, oy] for grid origin (0, 0)', () => {
    expect(gToC(0, 0, 10, 20, 5)).toEqual([10, 20]);
  });

  it('scales grid coords by cs', () => {
    expect(gToC(3, 4, 0, 0, 10)).toEqual([30, 40]);
  });

  it('combines offset and scale', () => {
    expect(gToC(2, 3, 5, 5, 10)).toEqual([25, 35]);
  });

  it('handles negative grid coords', () => {
    expect(gToC(-1, -2, 50, 50, 10)).toEqual([40, 30]);
  });

  it('identity for cs=1 and zero offset', () => {
    expect(gToC(7.5, 2.3, 0, 0, 1)).toEqual([7.5, 2.3]);
  });
});

// ---------------------------------------------------------------------------
// cToG
// ---------------------------------------------------------------------------

describe('cToG', () => {
  const ox = 10, oy = 20, cs = 5, cols = 8, rows = 6;

  it('maps canvas origin to [0, 0]', () => {
    expect(cToG(ox, oy, ox, oy, cs, cols, rows)).toEqual([0, 0]);
  });

  it('converts canvas coords to exact grid units', () => {
    expect(cToG(ox + 3 * cs, oy + 2 * cs, ox, oy, cs, cols, rows)).toEqual([3, 2]);
  });

  it('allows fractional grid positions', () => {
    const [gx, gy] = cToG(ox + 1.5 * cs, oy + 2.5 * cs, ox, oy, cs, cols, rows);
    expect(gx).toBeCloseTo(1.5);
    expect(gy).toBeCloseTo(2.5);
  });

  it('clamps x below 0 when cx < ox', () => {
    expect(cToG(0, oy, ox, oy, cs, cols, rows)[0]).toBe(0);
  });

  it('clamps x to cols-1 when cx is far above the grid', () => {
    expect(cToG(ox + (cols + 10) * cs, oy, ox, oy, cs, cols, rows)[0]).toBe(cols - 1);
  });

  it('clamps y below 0 when cy < oy', () => {
    expect(cToG(ox, 0, ox, oy, cs, cols, rows)[1]).toBe(0);
  });

  it('clamps y to rows-1 when cy is far below the grid', () => {
    expect(cToG(ox, oy + (rows + 10) * cs, ox, oy, cs, cols, rows)[1]).toBe(rows - 1);
  });

  it('gToC and cToG are inverses for in-range grid positions', () => {
    const gx = 3, gy = 2;
    const [cx, cy] = gToC(gx, gy, ox, oy, cs);
    const [rx, ry] = cToG(cx, cy, ox, oy, cs, cols, rows);
    expect(rx).toBeCloseTo(gx);
    expect(ry).toBeCloseTo(gy);
  });
});

// ---------------------------------------------------------------------------
// bezierPt
// ---------------------------------------------------------------------------

describe('bezierPt', () => {
  it('returns p0 at t=0', () => {
    const [x, y] = bezierPt([0, 0], [0.1, 0.2], [0.8, 0.9], [1, 1], 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it('returns p3 at t=1', () => {
    const [x, y] = bezierPt([0, 0], [0.1, 0.2], [0.8, 0.9], [1, 1], 1);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(1);
  });

  it('midpoint of canonical straight line at t=0.5', () => {
    // p0=[0,0], p1=[1/3,0], p2=[2/3,0], p3=[1,0] → Bézier is a straight line
    const [x, y] = bezierPt([0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0], 0.5);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0);
  });

  it('symmetric curve at t=0.5 (quarter circle approx)', () => {
    // p0=[0,0], p1=[0,1], p2=[1,1], p3=[1,0]
    // x at t=0.5: 0.125*0 + 3*0.25*0.5*0 + 3*0.5*0.25*1 + 0.125*1 = 0.5
    // y at t=0.5: 0.125*0 + 3*0.25*0.5*1 + 3*0.5*0.25*1 + 0.125*0 = 0.75
    const [x, y] = bezierPt([0, 0], [0, 1], [1, 1], [1, 0], 0.5);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(0.75);
  });

  it('evaluates correctly at t=0.25', () => {
    // Straight line; expected x = 0.25
    const [x, y] = bezierPt([0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0], 0.25);
    expect(x).toBeCloseTo(0.25);
    expect(y).toBeCloseTo(0);
  });

  it('both x and y components are computed independently', () => {
    // Diagonal line p0=[0,2], p1=[1/3,2], p2=[2/3,2], p3=[1,2]
    const [x, y] = bezierPt([0, 2], [1 / 3, 2], [2 / 3, 2], [1, 2], 0.5);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(2);
  });
});

// ---------------------------------------------------------------------------
// smoothOutline
// ---------------------------------------------------------------------------

describe('smoothOutline', () => {
  it('is a no-op for 0 nodes', () => {
    const outline: PathNode[] = [];
    smoothOutline(outline);
    expect(outline).toHaveLength(0);
  });

  it('is a no-op for 1 node (all control offsets stay 0)', () => {
    const n = node(1, 2);
    smoothOutline([n]);
    expect(n.cp2dx).toBe(0);
    expect(n.cp2dy).toBe(0);
    expect(n.cp1dx).toBe(0);
    expect(n.cp1dy).toBe(0);
  });

  it('with 2 nodes: prev===next, so tx=ty=0 → offsets remain 0', () => {
    const a = node(0, 0), b = node(4, 2);
    smoothOutline([a, b]);
    // node a (i=0): prev=b, next=b → tx=(4-4)/6=0, ty=(2-2)/6=0
    expect(a.cp2dx).toBeCloseTo(0);
    expect(a.cp2dy).toBeCloseTo(0);
    expect(a.cp1dx).toBeCloseTo(0);
    expect(a.cp1dy).toBeCloseTo(0);
    // node b (i=1): prev=a, next=a → tx=(0-0)/6=0, ty=(0-0)/6=0
    expect(b.cp2dx).toBeCloseTo(0);
    expect(b.cp2dy).toBeCloseTo(0);
  });

  it('sets correct Catmull-Rom control points for 3 nodes', () => {
    // nodes at [0,0], [6,0], [3,6]
    const a = node(0, 0), b = node(6, 0), c = node(3, 6);
    smoothOutline([a, b, c]);

    // a (i=0): prev=c(3,6), cur=a(0,0), next=b(6,0)
    //   tx = (6-3)/6 = 0.5,  ty = (0-6)/6 = -1
    expect(a.cp2dx).toBeCloseTo(0.5);
    expect(a.cp2dy).toBeCloseTo(-1);
    expect(a.cp1dx).toBeCloseTo(-0.5);
    expect(a.cp1dy).toBeCloseTo(1);

    // b (i=1): prev=a(0,0), cur=b(6,0), next=c(3,6)
    //   tx = (3-0)/6 = 0.5,  ty = (6-0)/6 = 1
    expect(b.cp2dx).toBeCloseTo(0.5);
    expect(b.cp2dy).toBeCloseTo(1);
    expect(b.cp1dx).toBeCloseTo(-0.5);
    expect(b.cp1dy).toBeCloseTo(-1);

    // c (i=2): prev=b(6,0), cur=c(3,6), next=a(0,0)
    //   tx = (0-6)/6 = -1,  ty = (0-0)/6 = 0
    expect(c.cp2dx).toBeCloseTo(-1);
    expect(c.cp2dy).toBeCloseTo(0);
    expect(c.cp1dx).toBeCloseTo(1);
    expect(c.cp1dy).toBeCloseTo(0);
  });

  it('cp1dx = -cp2dx and cp1dy = -cp2dy (mirrored tangents) for 5-node outline', () => {
    const nodes = [
      node(0, 0), node(3, 0), node(4, 2), node(2, 4), node(0, 3),
    ];
    smoothOutline(nodes);
    for (const nd of nodes) {
      expect(nd.cp1dx).toBeCloseTo(-nd.cp2dx, 10);
      expect(nd.cp1dy).toBeCloseTo(-nd.cp2dy, 10);
    }
  });

  it('mutates nodes in place (does not return a new array)', () => {
    const orig = [node(0, 0), node(1, 0), node(0.5, 1)];
    const ref = orig;
    smoothOutline(orig);
    expect(orig).toBe(ref);
  });
});

// ---------------------------------------------------------------------------
// offsetPath
// ---------------------------------------------------------------------------

describe('offsetPath', () => {
  it('returns [] for 0 nodes', () => {
    expect(offsetPath([], 5, 0, 0, 1)).toEqual([]);
  });

  it('returns [] for 1 node', () => {
    expect(offsetPath([node(0, 0)], 5, 0, 0, 1)).toEqual([]);
  });

  it('returns n*12 points for n nodes (SEGS=12 per segment)', () => {
    const nodes = [node(0, 0), node(4, 0), node(4, 4)];
    const pts = offsetPath(nodes, 0, 0, 0, 1);
    expect(pts).toHaveLength(3 * 12);
  });

  it('returns 24 points for 2 nodes (closed wrap: 2 segments × 12 samples)', () => {
    expect(offsetPath([node(0, 0), node(4, 0)], 0, 0, 0, 1)).toHaveLength(24);
  });

  it('d=0 keeps points on the curve (all y≈0 for horizontal line)', () => {
    // Horizontal straight line: cp offsets=0, cs=1, ox=oy=0
    const nodes = [node(0, 0), node(4, 0)];
    const pts = offsetPath(nodes, 0, 0, 0, 1);
    for (const [, py] of pts) {
      expect(py).toBeCloseTo(0, 5);
    }
  });

  it('d>0 offsets first segment points perpendicularly to the curve', () => {
    // Horizontal straight line: tangent=(1,0) → normal=(0,-1) in canvas coords.
    // With d=3: all first-segment y-values shift to -3.
    const nodes = [node(0, 0), node(4, 0)];
    const pts = offsetPath(nodes, 3, 0, 0, 1);
    // First 12 pts belong to segment i=0 (left→right; normal pushes y downward)
    for (const [, py] of pts.slice(0, 12)) {
      expect(py).toBeCloseTo(-3, 4);
    }
  });

  it('applies ox, oy, cs offsets — first point at canvas position of first node', () => {
    // node(0,0) at ox=100, oy=200, cs=10 → canvas position [100, 200]
    const nodes = [node(0, 0), node(1, 0)];
    const pts = offsetPath(nodes, 0, 100, 200, 10);
    expect(pts).toHaveLength(24);
    // s=0, t=0: bezierPt at start = [100, 200]
    expect(pts[0][0]).toBeCloseTo(100, 3);
    expect(pts[0][1]).toBeCloseTo(200, 3);
  });

  it('each point is a [number, number] tuple', () => {
    const nodes = [node(0, 0), node(2, 0), node(2, 2)];
    const pts = offsetPath(nodes, 1, 0, 0, 1);
    for (const pt of pts) {
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe('number');
      expect(typeof pt[1]).toBe('number');
    }
  });

  it('handles degenerate zero-length tangent (both nodes at same position) — len=0 fallback', () => {
    // Both nodes at [0,0] with zero cp offsets → all bezierPt calls return [0,0]
    // tx2=0, ty2=0 → len=sqrt(0)||1=1 → pts = [0 + 0*d, 0 - 0*d] = [0, 0]
    const nodes = [node(0, 0), node(0, 0)];
    const pts = offsetPath(nodes, 5, 0, 0, 1);
    expect(pts).toHaveLength(24);
    for (const [px, py] of pts) {
      expect(px).toBeCloseTo(0);
      expect(py).toBeCloseTo(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildPatternSVG — structure
// ---------------------------------------------------------------------------

describe('buildPatternSVG — SVG structure', () => {
  it('returns a string starting with <svg and ending with </svg>', () => {
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('embeds the pattern name in <title>', () => {
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('<title>Test Pattern</title>');
  });

  it('sets correct SVG width and height from grid dimensions', () => {
    // rows=5, cols=4, spacing=0.03 → sMM=30, wMM=90, hMM=120, margin=20
    // svgW=130, svgH=160
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('width="130mm"');
    expect(svg).toContain('height="160mm"');
  });

  it('includes correct number of grid lines (rows + cols + 1 grain line)', () => {
    const svg = buildPatternSVG(BASE_DATA);
    const lineMatches = svg.match(/<line /g)!;
    // 5 horizontal + 4 vertical + 1 grain line = 10
    expect(lineMatches.length).toBe(10);
  });

  it('renders a dashed grain line (stroke-dasharray="3,3")', () => {
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('stroke-dasharray="3,3"');
  });

  it('renders a dashed grid border rect (stroke-dasharray="2,2")', () => {
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('stroke-dasharray="2,2"');
  });

  it('renders info text with correct cm dimensions', () => {
    const svg = buildPatternSVG(BASE_DATA);
    // wMM=90→9.0cm, hMM=120→12.0cm
    expect(svg).toContain('W: 9.0cm');
    expect(svg).toContain('H: 12.0cm');
  });

  it('renders info text with rows×cols and spacing', () => {
    const svg = buildPatternSVG(BASE_DATA);
    expect(svg).toContain('5×4');
    expect(svg).toContain('30mm spacing');
  });
});

// ---------------------------------------------------------------------------
// buildPatternSVG — layers / outline
// ---------------------------------------------------------------------------

describe('buildPatternSVG — layers', () => {
  it('renders no <path> when data.layers is undefined', () => {
    const svg = buildPatternSVG({ ...BASE_DATA, layers: undefined });
    expect(svg).not.toContain('<path');
  });

  it('renders no <path> for an empty layers array', () => {
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [] });
    expect(svg).not.toContain('<path');
  });

  it('skips a layer whose outline has 0 nodes (n < 2)', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).not.toContain('<path');
  });

  it('skips a layer whose outline has 1 node (n < 2)', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1)],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).not.toContain('<path');
  });

  it('renders open outline — path does NOT end with Z', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    // The main outline path (stroke="#000")
    const m = svg.match(/<path d="([^"]+)" fill="none" stroke="#000"/);
    expect(m).not.toBeNull();
    expect(m![1].trim()).not.toMatch(/Z$/);
  });

  it('renders closed outline — path ends with Z', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    const m = svg.match(/<path d="([^"]+)" fill="none" stroke="#000"/);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toMatch(/Z$/);
  });

  it('renders the layer name in a comment', () => {
    const layer: PatternLayer = {
      id: 'back', name: 'My Back Panel',
      outline: [node(0, 0), node(4, 0)],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('<!-- Layer: My Back Panel -->');
  });

  it('uses Bézier C commands (cubic curves) in the path', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain(' C ');
  });

  it('renders multiple layers independently', () => {
    const front: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(0, 0), node(4, 0), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0,
    };
    const back: PatternLayer = {
      id: 'back', name: 'Back',
      outline: [node(1, 1), node(3, 1)],
      outlineClosed: false, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [front, back] });
    expect(svg).toContain('<!-- Layer: Front -->');
    expect(svg).toContain('<!-- Layer: Back -->');
  });
});

// ---------------------------------------------------------------------------
// buildPatternSVG — seam allowance
// ---------------------------------------------------------------------------

describe('buildPatternSVG — seam allowance', () => {
  it('does NOT render SA path when seamAllowance=0', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).not.toContain('stroke-dasharray="3,2"');
    expect(svg).not.toContain('SA:');
  });

  it('does NOT render SA path for open outline even when seamAllowance>0', () => {
    // Condition: outlineClosed && seamAllowance > 0
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: false, darts: [], seamAllowance: 0.01,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).not.toContain('SA:');
  });

  it('renders SA path with dashed orange stroke for closed outline and seamAllowance>0', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0.015,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('stroke-dasharray="3,2"');
    expect(svg).toContain('stroke="#f39c12"');
  });

  it('renders SA text with correct cm value', () => {
    // seamAllowance=0.015 → saMM=15 → 15/10=1.5 cm
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0.015,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('SA: 1.5 cm');
  });

  it('SA path also ends with Z (closed)', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(0, 0), node(4, 0), node(4, 4), node(0, 4)],
      outlineClosed: true, darts: [], seamAllowance: 0.01,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    // SA path: stroke="#f39c12"
    const m = svg.match(/<path d="([^"]+)" fill="none" stroke="#f39c12"/);
    expect(m).not.toBeNull();
    expect(m![1].trim()).toMatch(/Z$/);
  });

  it('renders SA for 1cm correctly', () => {
    // seamAllowance = 0.01 → saMM=10 → 10/10=1.0 cm
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(1, 1), node(3, 1), node(2, 3)],
      outlineClosed: true, darts: [], seamAllowance: 0.01,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('SA: 1.0 cm');
  });
});

// ---------------------------------------------------------------------------
// buildPatternSVG — darts
// ---------------------------------------------------------------------------

describe('buildPatternSVG — darts', () => {
  const outline = [node(0, 0), node(4, 0), node(4, 4), node(0, 4)];

  it('renders no <polygon> when darts array is empty', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline,
      outlineClosed: true, darts: [], seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).not.toContain('<polygon');
  });

  it('renders one <polygon> per dart', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline,
      outlineClosed: true,
      darts: [
        { x: 2, y: 1, width: 0.5, depth: 0.3, angle: 0 },
        { x: 2, y: 3, width: 0.4, depth: 0.2, angle: Math.PI / 4 },
      ],
      seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    const polygons = svg.match(/<polygon /g);
    expect(polygons).toHaveLength(2);
  });

  it('dart polygon has correct fill and stroke colors', () => {
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline,
      outlineClosed: true,
      darts: [{ x: 2, y: 2, width: 0.5, depth: 0.3, angle: 0 }],
      seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('fill="rgba(155,89,182,0.15)"');
    expect(svg).toContain('stroke="#9b59b6"');
  });

  it('dart at angle=0 produces correct tip point coordinates', () => {
    // angle=0: baseX = dax - sin(0)*dep = dax, baseY = day + cos(0)*dep = day + dep
    const dart = { x: 2, y: 2, width: 0, depth: 0.5, angle: 0 };
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline,
      outlineClosed: true,
      darts: [dart],
      seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    // g2s(2,2) = [margin+2*sMM, margin+2*sMM] = [20+60, 20+60] = [80, 80]
    // tip = [80, 80]
    expect(svg).toContain('<polygon');
    // The polygon points string should include the tip (dart position)
    const m = svg.match(/points="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/80\.00,80\.00/);
  });

  it('darts render in layers without outline (n < 2 check skips, not reached)', () => {
    // Darts only render inside the layer loop body after the n<2 guard.
    // With enough outline nodes (n≥2), darts in that layer should appear.
    const layer: PatternLayer = {
      id: 'front', name: 'Front',
      outline: [node(0, 0), node(4, 0)],
      outlineClosed: false,
      darts: [{ x: 2, y: 1, width: 0.3, depth: 0.2, angle: 0 }],
      seamAllowance: 0,
    };
    const svg = buildPatternSVG({ ...BASE_DATA, layers: [layer] });
    expect(svg).toContain('<polygon');
  });
});

// ---------------------------------------------------------------------------
// mirrorOutlineX
// ---------------------------------------------------------------------------

describe('mirrorOutlineX', () => {
  it('returns the same number of nodes as input', () => {
    const nodes = [node(1, 0), node(2, 1), node(3, 2)];
    const result = mirrorOutlineX(nodes, 5);
    expect(result).toHaveLength(3);
  });

  it('flips x-coordinates around centerX', () => {
    const nodes = [node(2, 0), node(4, 1)];
    const result = mirrorOutlineX(nodes, 5);
    // node at x=2 → mirrored to x=8; node at x=4 → mirrored to x=6
    // reversed order: [mirrored(4,1), mirrored(2,0)]
    expect(result[0].x).toBeCloseTo(6);
    expect(result[0].y).toBeCloseTo(1);
    expect(result[1].x).toBeCloseTo(8);
    expect(result[1].y).toBeCloseTo(0);
  });

  it('preserves y-coordinates', () => {
    const nodes = [node(1, 3), node(2, 7)];
    const result = mirrorOutlineX(nodes, 5);
    // reversed: [mirrored(2,7), mirrored(1,3)]
    expect(result[0].y).toBeCloseTo(7);
    expect(result[1].y).toBeCloseTo(3);
  });

  it('reverses node order', () => {
    const a = node(1, 0);
    const b = node(2, 1);
    const c = node(3, 2);
    const result = mirrorOutlineX([a, b, c], 5);
    // reversed input: [c, b, a], then mirror x
    expect(result[0].x).toBeCloseTo(2 * 5 - 3); // c mirrored → x=7
    expect(result[1].x).toBeCloseTo(2 * 5 - 2); // b mirrored → x=8
    expect(result[2].x).toBeCloseTo(2 * 5 - 1); // a mirrored → x=9
  });

  it('swaps and negates control point handles', () => {
    const n = { x: 2, y: 1, cp1dx: 0.5, cp1dy: 0.3, cp2dx: -0.2, cp2dy: 0.1 };
    const result = mirrorOutlineX([n], 5);
    // Only one node: reversed is [n], then mapped
    // cp1dx = -n.cp2dx = -(-0.2) = 0.2
    // cp1dy = -n.cp2dy = -(0.1) = -0.1
    // cp2dx = -n.cp1dx = -(0.5) = -0.5
    // cp2dy = -n.cp1dy = -(0.3) = -0.3
    expect(result[0].cp1dx).toBeCloseTo(0.2);
    expect(result[0].cp1dy).toBeCloseTo(-0.1);
    expect(result[0].cp2dx).toBeCloseTo(-0.5);
    expect(result[0].cp2dy).toBeCloseTo(-0.3);
  });

  it('does not mutate the input array', () => {
    const original = [node(1, 0), node(3, 2)];
    const before = original.map(n => ({ ...n }));
    mirrorOutlineX(original, 5);
    original.forEach((n, i) => {
      expect(n.x).toBeCloseTo(before[i].x);
      expect(n.y).toBeCloseTo(before[i].y);
    });
  });

  it('handles single node', () => {
    const result = mirrorOutlineX([node(3, 1)], 5);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBeCloseTo(7); // 2*5 - 3 = 7
    expect(result[0].y).toBeCloseTo(1);
  });

  it('handles empty outline', () => {
    const result = mirrorOutlineX([], 5);
    expect(result).toHaveLength(0);
  });

  it('mirrors around center correctly for symmetric node', () => {
    // A node exactly on the center axis mirrors to itself
    const result = mirrorOutlineX([node(5, 2)], 5);
    expect(result[0].x).toBeCloseTo(5);
    expect(result[0].y).toBeCloseTo(2);
  });
});
