/**
 * Pattern Editor: 2D garment pattern designer.
 * Phase 2-A: bezier outline editing, dart tool, seam allowance, layer tabs.
 * Grid mode: original rows×cols slice editor.
 */

import { t } from '../i18n';
import {
  gToC, cToG, bezierPt, offsetPath, smoothOutline, mirrorOutlineX, buildPatternSVG,
  type PathNode, type DartDef, type PatternLayer, type PatternData,
} from './patternEditor.utils';

export type { PathNode, DartDef, PatternLayer, PatternData };

export interface PatternEditorCallbacks {
  onSave: (data: PatternData) => void;
  onChange?: (data: PatternData) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIN_MODES    = ['topRow', 'topCorners', 'none'] as const;
const LAYER_IDS    = ['front', 'back', 'sleeve'] as const;
const TOOL_MODES   = ['grid', 'pen', 'move', 'dart'] as const;
type ToolMode      = typeof TOOL_MODES[number];
const SNAP_RADIUS  = 12;   // px — snap-to-first-node threshold for pen close
const HANDLE_R     = 5;    // px — control point handle radius
const NODE_R       = 7;    // px — node radius
const DART_MIN_W   = 0.5;  // grid units

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayer(id: string): PatternLayer {
  return { id, name: t(`pattern.layer_${id}`), outline: [], outlineClosed: false, darts: [], seamAllowance: 0.01 };
}

function getActiveLayer(data: PatternData): PatternLayer {
  const id = data.activeLayerId ?? 'front';
  return data.layers!.find(l => l.id === id) ?? data.layers![0];
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

export function createPatternEditor(
  data: PatternData,
  callbacks: PatternEditorCallbacks,
): HTMLElement {
  // Defaults
  if (!data.grid)   data.grid   = { rows: 20, cols: 12, spacing: 0.03 };
  if (!data.pinned) data.pinned = 'topRow';
  if (!data.layers) data.layers = LAYER_IDS.map(makeLayer);
  if (!data.activeLayerId) data.activeLayerId = 'front';

  let toolMode: ToolMode = 'grid';
  let symmetryMode = false;   // When true, pen/move edits are mirrored around centerX
  let pendingDart: { x: number; y: number } | null = null;  // dart placement state

  // Active drag state
  let dragging: { nodeIdx: number; part: 'node'|'cp1'|'cp2' } | null = null;
  let dragStart: [number, number] = [0, 0];

  // Canvas geometry (set in drawAll)
  let canvasOffsetX = 0, canvasOffsetY = 0, cellSize = 0;

  // ---------------------------------------------------------------------------
  // Root
  // ---------------------------------------------------------------------------
  const root = document.createElement('div');
  root.className = 'editor-root';

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  const header = document.createElement('div');
  header.className = 'editor-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'editor-back-btn';
  backBtn.innerHTML = `&larr; ${t('dash.patterns')}`;
  backBtn.addEventListener('click', () => callbacks.onBack());

  const titleInput = document.createElement('input');
  titleInput.className = 'editor-title';
  titleInput.type = 'text';
  titleInput.value = data.name;
  titleInput.addEventListener('change', () => {
    data.name = titleInput.value.trim() || data.name;
    save();
  });
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save-btn';
  saveBtn.textContent = t('ui.save');
  saveBtn.addEventListener('click', () => save());

  header.appendChild(backBtn);
  header.appendChild(titleInput);
  header.appendChild(saveBtn);

  // ---------------------------------------------------------------------------
  // Body layout
  // ---------------------------------------------------------------------------
  const body = document.createElement('div');
  body.className = 'editor-body';

  const sidebar = document.createElement('div');
  sidebar.className = 'editor-sidebar';

  // --- Layer tabs ---
  const layerTabRow = document.createElement('div');
  layerTabRow.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;';
  function refreshLayerTabs(): void {
    layerTabRow.innerHTML = '';
    data.layers!.forEach(layer => {
      const btn = document.createElement('button');
      btn.textContent = layer.name;
      btn.style.cssText = `flex:1;padding:5px 4px;font-size:11px;border-radius:4px;border:1px solid #555;cursor:pointer;background:${layer.id === data.activeLayerId ? '#3a7bd5' : '#2a2a2a'};color:#fff;`;
      btn.addEventListener('click', () => {
        data.activeLayerId = layer.id;
        refreshLayerTabs();
        drawAll();
      });
      layerTabRow.appendChild(btn);
    });
  }
  refreshLayerTabs();
  sidebar.appendChild(layerTabRow);

  // --- Tool bar ---
  const toolLabel = document.createElement('div');
  toolLabel.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;';
  toolLabel.textContent = 'Tool';
  sidebar.appendChild(toolLabel);

  const toolRow = document.createElement('div');
  toolRow.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;';
  const toolBtns: Record<string, HTMLButtonElement> = {};

  TOOL_MODES.forEach(mode => {
    const btn = document.createElement('button');
    btn.textContent = t(`pattern.tool${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    btn.style.cssText = 'flex:1;padding:5px 2px;font-size:11px;border-radius:4px;border:1px solid #555;cursor:pointer;background:#2a2a2a;color:#fff;';
    btn.addEventListener('click', () => setTool(mode));
    toolRow.appendChild(btn);
    toolBtns[mode] = btn;
  });

  function setTool(mode: ToolMode): void {
    toolMode = mode;
    pendingDart = null;
    Object.entries(toolBtns).forEach(([m, btn]) => {
      btn.style.background = m === mode ? '#3a7bd5' : '#2a2a2a';
    });
    // Show/hide grid controls
    gridSection.style.display = mode === 'grid' ? '' : 'none';
    hintDiv.style.display     = mode === 'pen'  ? '' : 'none';
    canvas.style.cursor       = mode === 'move' ? 'default' : mode === 'pen' ? 'crosshair' : mode === 'dart' ? 'cell' : 'default';
    drawAll();
  }

  sidebar.appendChild(toolRow);

  // Hint text for pen tool
  const hintDiv = document.createElement('div');
  hintDiv.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:8px;line-height:1.4;display:none;';
  hintDiv.textContent = t('pattern.outlineHint');
  sidebar.appendChild(hintDiv);

  // --- Grid section (shown in grid mode only) ---
  const gridSection = document.createElement('div');

  const rowsGroup = createSliderGroup(t('pattern.rows'), data.grid.rows, 4, 60, 1, (v) => {
    data.grid.rows = v; save(); drawAll();
  });
  const colsGroup = createSliderGroup(t('pattern.cols'), data.grid.cols, 4, 40, 1, (v) => {
    data.grid.cols = v; save(); drawAll();
  });
  const spacingGroup = createSliderGroup(t('pattern.spacing'), data.grid.spacing, 0.01, 0.1, 0.005, (v) => {
    data.grid.spacing = Math.round(v * 1000) / 1000; save(); drawAll();
  });

  const pinGroup = document.createElement('div');
  pinGroup.className = 'editor-field';
  const pinLabel = document.createElement('label');
  pinLabel.textContent = t('pattern.pinMode');
  const pinSelect = document.createElement('select');
  PIN_MODES.forEach(mode => {
    const opt = document.createElement('option');
    opt.value = mode; opt.textContent = t(`pattern.pin_${mode}`);
    pinSelect.appendChild(opt);
  });
  pinSelect.value = data.pinned;
  pinSelect.addEventListener('change', () => { data.pinned = pinSelect.value; save(); drawAll(); });
  pinGroup.appendChild(pinLabel);
  pinGroup.appendChild(pinSelect);

  const infoDiv = document.createElement('div');
  infoDiv.className = 'editor-info';

  function updateInfo(): void {
    const total    = data.grid.rows * data.grid.cols;
    const wCm      = ((data.grid.cols - 1) * data.grid.spacing * 100).toFixed(1);
    const hCm      = ((data.grid.rows - 1) * data.grid.spacing * 100).toFixed(1);
    infoDiv.innerHTML = `
      <div>${t('pattern.totalParticles')}: <strong>${total}</strong></div>
      <div>${t('pattern.dimensions')}: <strong>${wCm} x ${hCm} cm</strong></div>
    `;
  }

  gridSection.appendChild(rowsGroup);
  gridSection.appendChild(colsGroup);
  gridSection.appendChild(spacingGroup);
  gridSection.appendChild(pinGroup);
  gridSection.appendChild(infoDiv);
  sidebar.appendChild(gridSection);

  // --- Seam allowance (shown in pen/move mode) ---
  const seamSection = document.createElement('div');
  seamSection.style.display = 'none';

  const seamGroup = createSliderGroup(
    `${t('pattern.seamAllowance')} (cm)`,
    (getActiveLayer(data).seamAllowance * 100),
    0, 5, 0.5,
    (v) => {
      getActiveLayer(data).seamAllowance = v / 100;
      save(); drawAll();
    }
  );
  seamSection.appendChild(seamGroup);

  // Clear outline button
  const clearOutlineBtn = document.createElement('button');
  clearOutlineBtn.style.cssText = 'margin-top:6px;width:100%;padding:5px;font-size:11px;border-radius:4px;border:1px solid #c0392b;background:#2a1a1a;color:#e74c3c;cursor:pointer;';
  clearOutlineBtn.textContent = t('pattern.clearOutline');
  clearOutlineBtn.addEventListener('click', () => {
    const layer = getActiveLayer(data);
    layer.outline = []; layer.outlineClosed = false; layer.darts = [];
    save(); drawAll();
  });
  seamSection.appendChild(clearOutlineBtn);

  // Mirror button — flip outline around horizontal center
  const mirrorBtn = document.createElement('button');
  mirrorBtn.title = t('pattern.mirrorXHint');
  mirrorBtn.style.cssText = 'margin-top:6px;width:100%;padding:5px;font-size:11px;border-radius:4px;border:1px solid #2980b9;background:#1a2230;color:#5dade2;cursor:pointer;';
  mirrorBtn.textContent = t('pattern.mirrorX');
  mirrorBtn.addEventListener('click', () => {
    const layer = getActiveLayer(data);
    if (layer.outline.length < 2) return;
    const centerX = (data.grid.cols - 1) / 2;
    layer.outline = mirrorOutlineX(layer.outline, centerX);
    save(); drawAll();
  });
  seamSection.appendChild(mirrorBtn);

  // Symmetry Mode toggle — mirror pen/move edits in real-time
  const symBtn = document.createElement('button');
  symBtn.style.cssText = 'margin-top:4px;width:100%;padding:5px;font-size:11px;border-radius:4px;border:1px solid #8e44ad;background:#1e1a2a;color:#a569bd;cursor:pointer;';
  const updateSymBtn = () => {
    symBtn.textContent = `${t('pattern.symmetryMode')}: ${symmetryMode ? 'ON' : 'OFF'}`;
    symBtn.style.background = symmetryMode ? '#4a235a' : '#1e1a2a';
    symBtn.style.color       = symmetryMode ? '#e8c7f7' : '#a569bd';
  };
  updateSymBtn();
  symBtn.addEventListener('click', () => {
    symmetryMode = !symmetryMode;
    updateSymBtn();
  });
  seamSection.appendChild(symBtn);

  sidebar.appendChild(seamSection);

  // --- SVG Export ---
  const exportSvgBtn = document.createElement('button');
  exportSvgBtn.className = 'editor-save-btn';
  exportSvgBtn.style.cssText = 'margin-top:12px;width:100%;font-size:12px;';
  exportSvgBtn.textContent = t('pattern.exportSVG');
  exportSvgBtn.addEventListener('click', () => {
    const svg = buildPatternSVG(data);
    const fileName = `${data.name.replace(/[^a-z0-9_-]/gi, '_')}_pattern.svg`;
    const el = (window as unknown as { electron?: { saveFile: (p: string, d: string) => Promise<string | null> } }).electron;
    if (el?.saveFile) {
      el.saveFile(fileName, svg);
    } else {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    }
  });
  sidebar.appendChild(exportSvgBtn);

  // ---------------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------------
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'editor-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'editor-canvas';
  canvas.width = 500; canvas.height = 600;
  canvasWrap.appendChild(canvas);

  body.appendChild(sidebar);
  body.appendChild(canvasWrap);
  root.appendChild(header);
  root.appendChild(body);

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function computeLayout(): { ox: number; oy: number; cs: number; gridW: number; gridH: number } {
    const { rows, cols } = data.grid;
    const w = canvas.width; const h = canvas.height;
    const padding = 40;
    const cellW = (w - padding * 2) / Math.max(cols - 1, 1);
    const cellH = (h - padding * 2) / Math.max(rows - 1, 1);
    const cs = Math.min(cellW, cellH, 20);
    const gridW = (cols - 1) * cs;
    const gridH = (rows - 1) * cs;
    const ox = (w - gridW) / 2;
    const oy = (h - gridH) / 2;
    return { ox, oy, cs, gridW, gridH };
  }

  function drawAll(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { ox, oy, cs, gridW, gridH } = computeLayout();
    canvasOffsetX = ox; canvasOffsetY = oy; cellSize = cs;

    const w = canvas.width; const h = canvas.height;
    const { rows, cols } = data.grid;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    for (let r = 0; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cs); ctx.lineTo(ox + gridW, oy + r * cs); ctx.stroke();
    }
    for (let c = 0; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cs, oy); ctx.lineTo(ox + c * cs, oy + gridH); ctx.stroke();
    }

    // Particles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = ox + c * cs; const py = oy + r * cs;
        let pinned = false;
        if (data.pinned === 'topRow'     && r === 0)                         pinned = true;
        if (data.pinned === 'topCorners' && r === 0 && (c === 0 || c === cols-1)) pinned = true;
        ctx.beginPath();
        ctx.arc(px, py, pinned ? 3.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = pinned ? '#e74c3c' : '#3a7bd5';
        ctx.fill();
      }
    }

    // Pin legend (grid mode only)
    if (toolMode === 'grid') {
      ctx.fillStyle = '#888'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
      ctx.beginPath(); ctx.arc(ox, oy + gridH + 24, 3.5, 0, Math.PI*2);
      ctx.fillStyle = '#e74c3c'; ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillText(t('pattern.pinned'), ox + 10, oy + gridH + 28);
      ctx.beginPath(); ctx.arc(ox + 100, oy + gridH + 24, 1.5, 0, Math.PI*2);
      ctx.fillStyle = '#3a7bd5'; ctx.fill();
      ctx.fillStyle = '#888'; ctx.fillText(t('pattern.free'), ox + 110, oy + gridH + 28);
    }

    // Symmetry center-axis guide line
    if (symmetryMode) {
      const cxPx = ox + (cols - 1) / 2 * cs;
      ctx.save();
      ctx.strokeStyle = '#8e44ad';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cxPx, oy - 8);
      ctx.lineTo(cxPx, oy + gridH + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw all layers (dim inactive)
    data.layers!.forEach(layer => {
      const isActive = layer.id === data.activeLayerId;
      const alpha = isActive ? 1.0 : 0.25;
      drawLayerOutline(ctx, layer, ox, oy, cs, alpha, isActive && (toolMode === 'pen' || toolMode === 'move'));
      drawLayerDarts(ctx, layer, ox, oy, cs, alpha);
    });

    // Active layer badge (top-right of canvas)
    const activeLayer = getActiveLayer(data);
    const badge = activeLayer.name;
    ctx.font = 'bold 12px system-ui';
    const bw = ctx.measureText(badge).width + 16;
    const bx = w - bw - 8; const by = 8;
    ctx.fillStyle = 'rgba(58,123,213,0.85)';
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect?: (x:number,y:number,w:number,h:number,r:number) => void }).roundRect?.(bx, by, bw, 22, 4)
      ?? ctx.rect(bx, by, bw, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(badge, bx + bw / 2, by + 15);
    ctx.textAlign = 'left';
  }

  function drawLayerOutline(
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    ox: number, oy: number, cs: number,
    alpha: number,
    showHandles: boolean,
  ): void {
    const nodes = layer.outline;
    if (nodes.length === 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Seam allowance (offset path)
    if (layer.outlineClosed && layer.seamAllowance > 0) {
      const saPixels = (layer.seamAllowance / data.grid.spacing) * cs;
      const pts = offsetPath(nodes, saPixels, ox, oy, cs);
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.closePath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Bezier outline
    ctx.beginPath();
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % n];
      if (i === 0) {
        const [sx, sy] = gToC(a.x, a.y, ox, oy, cs);
        ctx.moveTo(sx, sy);
      }
      if (i < n - 1 || layer.outlineClosed) {
        const [ax, ay] = gToC(a.x, a.y, ox, oy, cs);
        const [bx, by] = gToC(b.x, b.y, ox, oy, cs);
        const [c1x, c1y] = gToC(a.x + a.cp2dx, a.y + a.cp2dy, ox, oy, cs);
        const [c2x, c2y] = gToC(b.x + b.cp1dx, b.y + b.cp1dy, ox, oy, cs);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by);
      }
    }
    if (layer.outlineClosed) ctx.closePath();
    ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 1.5;
    ctx.stroke();

    // Control point handles
    if (showHandles) {
      nodes.forEach((node, i) => {
        const [nx, ny] = gToC(node.x, node.y, ox, oy, cs);
        // In-control
        const [i1x, i1y] = gToC(node.x + node.cp1dx, node.y + node.cp1dy, ox, oy, cs);
        // Out-control
        const [o1x, o1y] = gToC(node.x + node.cp2dx, node.y + node.cp2dy, ox, oy, cs);

        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8;
        if (i > 0 || layer.outlineClosed) {
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(i1x, i1y); ctx.stroke();
        }
        if (i < nodes.length - 1 || layer.outlineClosed) {
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(o1x, o1y); ctx.stroke();
        }

        // Handle dots
        [[i1x,i1y],[o1x,o1y]].forEach(([hx,hy]) => {
          ctx.beginPath(); ctx.arc(hx, hy, HANDLE_R-2, 0, Math.PI*2);
          ctx.fillStyle = '#888'; ctx.fill();
        });

        // Node
        ctx.beginPath(); ctx.arc(nx, ny, NODE_R-2, 0, Math.PI*2);
        ctx.fillStyle = i === 0 ? '#e74c3c' : '#2ecc71'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      });
    } else {
      // Show just nodes (no handles)
      nodes.forEach((node, i) => {
        const [nx, ny] = gToC(node.x, node.y, ox, oy, cs);
        ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI*2);
        ctx.fillStyle = i === 0 ? '#e74c3c' : '#2ecc71'; ctx.fill();
      });
    }

    ctx.restore();
  }

  function drawLayerDarts(
    ctx: CanvasRenderingContext2D,
    layer: PatternLayer,
    ox: number, oy: number, cs: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    layer.darts.forEach(dart => {
      const [ax, ay] = gToC(dart.x, dart.y, ox, oy, cs);
      const hw = (dart.width / 2) * cs;
      const depth = dart.depth * cs;
      const ang = dart.angle;
      // Dart triangle: apex at (ax,ay), two base points at depth along -angle, ±hw perpendicular
      const baseX = ax - Math.sin(ang) * depth;
      const baseY = ay + Math.cos(ang) * depth;  // note: +Y is down in canvas
      const perpX = Math.cos(ang) * hw;
      const perpY = Math.sin(ang) * hw;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(baseX - perpX, baseY - perpY);
      ctx.lineTo(baseX + perpX, baseY + perpY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(155, 89, 182, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#9b59b6'; ctx.lineWidth = 1.2;
      ctx.stroke();
      // Apex dot
      ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI*2);
      ctx.fillStyle = '#9b59b6'; ctx.fill();
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Canvas mouse interaction
  // ---------------------------------------------------------------------------
  function hitTestNode(cx: number, cy: number, nodes: PathNode[]): { nodeIdx: number; part: 'node'|'cp1'|'cp2' } | null {
    const THRESH = (NODE_R + 2) * (NODE_R + 2);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const [nx, ny] = gToC(node.x, node.y, canvasOffsetX, canvasOffsetY, cellSize);
      if ((cx-nx)**2 + (cy-ny)**2 <= THRESH) return { nodeIdx: i, part: 'node' };
      // Check control points
      const [i1x, i1y] = gToC(node.x + node.cp1dx, node.y + node.cp1dy, canvasOffsetX, canvasOffsetY, cellSize);
      const [o1x, o1y] = gToC(node.x + node.cp2dx, node.y + node.cp2dy, canvasOffsetX, canvasOffsetY, cellSize);
      if ((cx-i1x)**2 + (cy-i1y)**2 <= THRESH) return { nodeIdx: i, part: 'cp1' };
      if ((cx-o1x)**2 + (cy-o1y)**2 <= THRESH) return { nodeIdx: i, part: 'cp2' };
    }
    return null;
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const layer = getActiveLayer(data);
    const { rows, cols } = data.grid;

    if (toolMode === 'pen') {
      if (layer.outlineClosed) return;
      const nodes = layer.outline;
      // Check snap-to-close
      if (nodes.length >= 3) {
        const [fx, fy] = gToC(nodes[0].x, nodes[0].y, canvasOffsetX, canvasOffsetY, cellSize);
        if ((cx-fx)**2 + (cy-fy)**2 <= SNAP_RADIUS**2) {
          layer.outlineClosed = true;
          smoothOutline(nodes);
          save(); drawAll();
          return;
        }
      }
      // Add new node
      const [gx, gy] = cToG(cx, cy, canvasOffsetX, canvasOffsetY, cellSize, cols, rows);
      const centerX   = (cols - 1) / 2;
      const newNode: PathNode = { x: gx, y: gy, cp1dx: 0, cp1dy: 0, cp2dx: 0, cp2dy: 0 };
      nodes.push(newNode);
      if (symmetryMode) {
        // Also add the mirrored node (only when not on center axis)
        const mx = 2 * centerX - gx;
        if (Math.abs(mx - gx) > 0.01) {
          nodes.push({ x: mx, y: gy, cp1dx: 0, cp1dy: 0, cp2dx: 0, cp2dy: 0 });
        }
      }
      smoothOutline(nodes);
      save(); drawAll();

    } else if (toolMode === 'move') {
      const hit = hitTestNode(cx, cy, layer.outline);
      if (hit) {
        dragging = hit;
        dragStart = [cx, cy];
        e.preventDefault();
      }

    } else if (toolMode === 'dart') {
      const [gx, gy] = cToG(cx, cy, canvasOffsetX, canvasOffsetY, cellSize, cols, rows);
      if (!pendingDart) {
        pendingDart = { x: gx, y: gy };
      } else {
        // Second click: determine dart width from distance
        const dx = gx - pendingDart.x;
        const dy = gy - pendingDart.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dx, -dy);
        const dart: DartDef = {
          x: pendingDart.x, y: pendingDart.y,
          width: Math.max(DART_MIN_W, dist * 0.6),
          depth: Math.max(DART_MIN_W, dist * 0.8),
          angle,
        };
        layer.darts.push(dart);
        pendingDart = null;
        save(); drawAll();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const layer = getActiveLayer(data);
    const nodes = layer.outline;
    const { rows, cols } = data.grid;
    const node = nodes[dragging.nodeIdx];
    const [gx, gy] = cToG(cx, cy, canvasOffsetX, canvasOffsetY, cellSize, cols, rows);

    const centerX = (cols - 1) / 2;
    if (dragging.part === 'node') {
      const oldX = node.x;
      node.x = gx; node.y = gy;
      if (symmetryMode) {
        // Find the mirrored counterpart (node closest to the expected mirror position)
        const mirX = 2 * centerX - oldX;
        const mirNew = 2 * centerX - gx;
        const mirIdx = nodes.findIndex((n, i) => i !== dragging!.nodeIdx && Math.abs(n.x - mirX) < 0.5 && Math.abs(n.y - node.y) < 1);
        if (mirIdx >= 0) { nodes[mirIdx].x = mirNew; nodes[mirIdx].y = gy; }
      }
    } else if (dragging.part === 'cp1') {
      node.cp1dx = gx - node.x; node.cp1dy = gy - node.y;
      // Mirror cp2 for smooth tangent
      node.cp2dx = -(gx - node.x); node.cp2dy = -(gy - node.y);
    } else if (dragging.part === 'cp2') {
      node.cp2dx = gx - node.x; node.cp2dy = gy - node.y;
      node.cp1dx = -(gx - node.x); node.cp1dy = -(gy - node.y);
    }
    drawAll();
  });

  canvas.addEventListener('mouseup', () => {
    if (dragging) { dragging = null; save(); }
  });

  canvas.addEventListener('mouseleave', () => {
    if (dragging) { dragging = null; save(); }
  });

  // Right-click: delete last node in pen mode, or hit-test-delete in move mode
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const layer = getActiveLayer(data);
    const rect  = canvas.getBoundingClientRect();
    const cx    = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy    = (e.clientY - rect.top)  * (canvas.height / rect.height);

    if (toolMode === 'pen' && layer.outline.length > 0 && !layer.outlineClosed) {
      layer.outline.pop();
      if (layer.outline.length >= 2) smoothOutline(layer.outline);
      save(); drawAll();
    } else if (toolMode === 'move') {
      const hit = hitTestNode(cx, cy, layer.outline);
      if (hit && hit.part === 'node') {
        layer.outline.splice(hit.nodeIdx, 1);
        if (layer.outline.length < 3) layer.outlineClosed = false;
        if (layer.outline.length >= 2) smoothOutline(layer.outline);
        save(); drawAll();
      }
      // Also allow deleting darts
      const dartHit = hitTestDart(cx, cy, layer.darts);
      if (dartHit >= 0) { layer.darts.splice(dartHit, 1); save(); drawAll(); }
    }
  });

  function hitTestDart(cx: number, cy: number, darts: DartDef[]): number {
    for (let i = 0; i < darts.length; i++) {
      const [dx, dy] = gToC(darts[i].x, darts[i].y, canvasOffsetX, canvasOffsetY, cellSize);
      if ((cx-dx)**2 + (cy-dy)**2 <= 64) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Tool mode wiring (show/hide sections)
  // ---------------------------------------------------------------------------
  function applyToolMode(): void {
    gridSection.style.display  = toolMode === 'grid'  ? '' : 'none';
    seamSection.style.display  = '';  // always visible — seam/clear/mirror apply to active layer
    hintDiv.style.display      = toolMode === 'pen'   ? '' : 'none';
  }

  // Initial: Grid mode
  setTool('grid');

  // ---------------------------------------------------------------------------
  // Save + thumbnail
  // ---------------------------------------------------------------------------
  let saveTimer = 0;
  function save(): void {
    updateInfo();
    callbacks.onChange?.(data);
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      data.thumbnail = captureThumbnail(canvas);
      callbacks.onSave(data);
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
    if (e.key === 'Escape') {
      if (toolMode === 'pen' && !getActiveLayer(data).outlineClosed) {
        getActiveLayer(data).outline.pop();
        drawAll();
      } else {
        callbacks.onBack();
      }
    }
    // Shortcut keys: G=grid, P=pen, M=move, D=dart
    if (!e.metaKey && !e.ctrlKey) {
      if (e.key === 'g' || e.key === 'G') setTool('grid');
      if (e.key === 'p' || e.key === 'P') setTool('pen');
      if (e.key === 'm' || e.key === 'M') setTool('move');
      if (e.key === 'd' || e.key === 'D') setTool('dart');
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const origOnBack = callbacks.onBack;
  callbacks.onBack = () => {
    window.removeEventListener('keydown', onKeyDown);
    origOnBack();
  };

  // Initial render
  updateInfo();
  applyToolMode();
  requestAnimationFrame(drawAll);

  return root;
}

// ---------------------------------------------------------------------------
// Helpers (module-level)
// ---------------------------------------------------------------------------

function createSliderGroup(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'editor-field';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const row = document.createElement('div');
  row.className = 'editor-slider-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min); slider.max = String(max); slider.step = String(step);
  slider.value = String(value);

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.min = String(min); numInput.max = String(max); numInput.step = String(step);
  numInput.value = String(value);
  numInput.className = 'editor-num-input';

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    numInput.value = String(v);
    onChange(v);
  });
  numInput.addEventListener('change', () => {
    let v = parseFloat(numInput.value);
    v = Math.max(min, Math.min(max, v));
    numInput.value = String(v); slider.value = String(v);
    onChange(v);
  });

  row.appendChild(slider);
  row.appendChild(numInput);
  group.appendChild(lbl);
  group.appendChild(row);
  return group;
}

function captureThumbnail(source: HTMLCanvasElement): string {
  const tw = 480; const th = 240;
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  const ctx = tmp.getContext('2d')!;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, tw, th);
  const srcA = source.width / source.height;
  const dstA = tw / th;
  let sw = source.width, sh = source.height, sx = 0, sy = 0;
  if (srcA < dstA) { sh = source.width / dstA; sy = (source.height - sh) / 2; }
  else             { sw = source.height * dstA; sx = (source.width  - sw) / 2; }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
  return tmp.toDataURL('image/jpeg', 0.85);
}
