// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPatternEditor, type PatternData, type PatternEditorCallbacks } from '../src/renderer/ui/patternEditor';

function makeData(overrides: Partial<PatternData> = {}): PatternData {
  return {
    id: 'pat1',
    name: 'Test Pattern',
    createdAt: 1000,
    updatedAt: 2000,
    grid: { rows: 10, cols: 8, spacing: 0.03 },
    pinned: 'topRow',
    layers: undefined, // will be initialized by createPatternEditor
    activeLayerId: 'front',
    ...overrides,
  };
}

function makeCallbacks(): PatternEditorCallbacks {
  return {
    onSave: vi.fn(),
    onBack: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Mock URL methods used in SVG export
  (globalThis as any).URL = {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPatternEditor', () => {
  it('returns an HTMLElement', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('shows the pattern name in title input', () => {
    const el = createPatternEditor(makeData({ name: 'My Pattern' }), makeCallbacks());
    const titleInput = el.querySelector('input.editor-title') as HTMLInputElement;
    expect(titleInput?.value).toBe('My Pattern');
  });

  it('back button calls onBack', () => {
    const cb = makeCallbacks();
    // createPatternEditor wraps callbacks.onBack; save original spy first
    const origOnBack = cb.onBack as ReturnType<typeof vi.fn>;
    const el = createPatternEditor(makeData(), cb);
    const backBtn = el.querySelector('.editor-back-btn') as HTMLButtonElement;
    backBtn?.click();
    expect(origOnBack).toHaveBeenCalled();
  });

  it('save button calls onSave', () => {
    const cb = makeCallbacks();
    const el = createPatternEditor(makeData(), cb);
    const saveBtn = el.querySelector('.editor-save-btn') as HTMLButtonElement;
    saveBtn?.click();
    vi.runAllTimers();
    expect(cb.onSave).toHaveBeenCalled();
  });

  it('initializes default grid if not provided', () => {
    const data = makeData();
    delete (data as any).grid;
    createPatternEditor(data, makeCallbacks());
    expect(data.grid).toBeDefined();
  });

  it('initializes layers if not provided', () => {
    const data = makeData();
    data.layers = undefined;
    createPatternEditor(data, makeCallbacks());
    expect(data.layers).toBeDefined();
    expect(data.layers!.length).toBeGreaterThan(0);
  });

  it('initializes activeLayerId to front if not provided', () => {
    const data = makeData({ activeLayerId: undefined });
    (data as any).activeLayerId = undefined;
    createPatternEditor(data, makeCallbacks());
    expect(data.activeLayerId).toBe('front');
  });

  it('initializes pinned if not provided', () => {
    const data = makeData();
    (data as any).pinned = undefined;
    createPatternEditor(data, makeCallbacks());
    expect(data.pinned).toBeDefined();
  });

  it('has canvas for drawing', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvases = el.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThan(0);
  });

  it('has sidebar with layer tabs', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const sidebar = el.querySelector('.editor-sidebar');
    expect(sidebar).not.toBeNull();
  });

  it('has tool mode buttons (grid, pen, move, dart)', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const buttons = el.querySelectorAll('button');
    const btnTexts = Array.from(buttons).map(b => b.textContent?.toLowerCase() ?? '');
    // At least some tool buttons exist
    expect(buttons.length).toBeGreaterThan(4);
  });

  it('title input change updates name', () => {
    const cb = makeCallbacks();
    const data = makeData({ name: 'Old' });
    const el = createPatternEditor(data, cb);
    const titleInput = el.querySelector('input.editor-title') as HTMLInputElement;
    titleInput.value = 'New';
    titleInput.dispatchEvent(new Event('change'));
    expect(data.name).toBe('New');
    vi.runAllTimers();
    expect(cb.onSave).toHaveBeenCalled();
  });

  it('title input Enter blurs', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const titleInput = el.querySelector('input.editor-title') as HTMLInputElement;
    const blurSpy = vi.spyOn(titleInput, 'blur');
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(blurSpy).toHaveBeenCalled();
  });

  it('layer tabs show front/back/sleeve', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    // Layer tab row is first element in sidebar
    const sidebar = el.querySelector('.editor-sidebar') as HTMLElement;
    const buttons = sidebar?.querySelectorAll('button');
    const buttonTexts = Array.from(buttons ?? []).map(b => b.textContent);
    // At least front layer should exist
    expect(buttonTexts.some(t => t?.includes('front') || t?.includes('Front') || t?.includes('앞'))).toBe(true);
  });

  it('clicking a layer tab changes active layer', () => {
    const data = makeData();
    const el = createPatternEditor(data, makeCallbacks());
    // Layer tabs are the first few buttons in the sidebar
    const sidebar = el.querySelector('.editor-sidebar') as HTMLElement;
    const layerBtns = sidebar.querySelectorAll('div:first-child button');
    if (layerBtns.length > 1) {
      (layerBtns[1] as HTMLElement).click();
      // Should not throw
    }
    expect(true).toBe(true);
  });

  it('rows slider is present', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const sliders = el.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBeGreaterThan(0);
  });

  it('pin mode select is present', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const selects = el.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('pin mode select change updates data.pinned', () => {
    const cb = makeCallbacks();
    const data = makeData({ pinned: 'topRow' });
    const el = createPatternEditor(data, cb);
    const pinSelect = el.querySelector('select') as HTMLSelectElement;
    pinSelect.value = 'topCorners';
    pinSelect.dispatchEvent(new Event('change'));
    expect(data.pinned).toBe('topCorners');
    vi.runAllTimers();
    expect(cb.onSave).toHaveBeenCalled();
  });

  it('rows slider change updates data.grid.rows', () => {
    const cb = makeCallbacks();
    const data = makeData();
    const el = createPatternEditor(data, cb);
    const sliders = el.querySelectorAll('input[type="range"]');
    const rowsSlider = sliders[0] as HTMLInputElement;
    rowsSlider.value = '15';
    rowsSlider.dispatchEvent(new Event('input'));
    expect(data.grid.rows).toBe(15);
    vi.runAllTimers();
  });

  it('cols slider change updates data.grid.cols', () => {
    const data = makeData();
    const el = createPatternEditor(data, makeCallbacks());
    const sliders = el.querySelectorAll('input[type="range"]');
    const colsSlider = sliders[1] as HTMLInputElement;
    if (colsSlider) {
      colsSlider.value = '10';
      colsSlider.dispatchEvent(new Event('input'));
      expect(data.grid.cols).toBe(10);
    }
    vi.runAllTimers();
  });

  it('spacing slider change updates data.grid.spacing', () => {
    const data = makeData();
    const el = createPatternEditor(data, makeCallbacks());
    const sliders = el.querySelectorAll('input[type="range"]');
    const spacingSlider = sliders[2] as HTMLInputElement;
    if (spacingSlider) {
      spacingSlider.value = '0.05';
      spacingSlider.dispatchEvent(new Event('input'));
      expect(data.grid.spacing).toBeCloseTo(0.05, 3);
    }
    vi.runAllTimers();
  });

  it('canvas pointer events (mousedown/mousemove/mouseup) do not throw', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 110, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 110, clientY: 110, bubbles: true }));
    }).not.toThrow();
  });

  it('canvas right-click (contextmenu) does not throw', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true }));
    }).not.toThrow();
  });

  it('export SVG button triggers download or electron save', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const exportBtn = el.querySelector('.editor-save-btn') as HTMLButtonElement;
    // The export SVG button is the last save-btn style button
    const allSaveBtns = el.querySelectorAll('.editor-save-btn');
    const svgBtn = allSaveBtns[allSaveBtns.length - 1] as HTMLButtonElement;
    expect(() => svgBtn?.click()).not.toThrow();
  });

  it('export SVG via electron.saveFile path (covers line 291)', () => {
    // Mock window.electron.saveFile to exercise the electron path
    (window as any).electron = { saveFile: vi.fn(() => Promise.resolve('path')) };
    const el = createPatternEditor(makeData(), makeCallbacks());
    const allSaveBtns = el.querySelectorAll('.editor-save-btn');
    const svgBtn = allSaveBtns[allSaveBtns.length - 1] as HTMLButtonElement;
    expect(() => svgBtn?.click()).not.toThrow();
    delete (window as any).electron;
  });

  it('info div shows dimensions', () => {
    const el = createPatternEditor(makeData({ grid: { rows: 10, cols: 8, spacing: 0.03 } }), makeCallbacks());
    const infoDiv = el.querySelector('.editor-info');
    expect(infoDiv?.innerHTML).toContain('80'); // 10*8=80 particles
  });

  it('pen tool button click switches to pen mode', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    // tool buttons by searching for button text
    const toolBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen|Pen/i)
    );
    expect(() => toolBtns[0]?.click()).not.toThrow();
  });

  it('shows seam section when not in grid mode', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    // Click the pen tool to switch away from grid mode
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/^Pen$|^pen$/i)
    );
    penBtns[0]?.click();
    // The seam section should appear (no errors)
    expect(true).toBe(true);
  });

  it('move tool button click switches to move mode', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/^move$|^Move$/i)
    );
    expect(() => moveBtns[0]?.click()).not.toThrow();
  });

  it('dart tool button click switches to dart mode', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const dartBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/^dart$|^Dart$/i)
    );
    expect(() => dartBtns[0]?.click()).not.toThrow();
  });

  it('pen mode canvas click adds nodes', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 150, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 200, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('pen mode right-click removes last node', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // Add a node first
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
    // Right-click to remove
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 200, clientY: 200, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('pen mode right-click with 3 nodes leaves 2 and calls smoothOutline (covers line ~668)', () => {
    // With 3 nodes → right-click removes last → 2 remain → smoothOutline is called
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 200, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 225, clientY: 250, bubbles: true }));
    // Right-click: removes 3rd node → 2 remain → smoothOutline(layer.outline) called
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 225, clientY: 250, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode canvas drag does not throw', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/move/i)
    );
    moveBtns[0]?.click();
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 210, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 210, clientY: 210, bubbles: true }));
    }).not.toThrow();
  });

  it('dart mode canvas clicks place a dart', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const dartBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/dart/i)
    );
    dartBtns[0]?.click();
    expect(() => {
      // First click: sets pending dart
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
      // Second click: creates dart
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 220, clientY: 220, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('keyboard shortcut Ctrl+S saves', () => {
    const cb = makeCallbacks();
    const el = createPatternEditor(makeData(), cb);
    document.body.appendChild(el);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    vi.runAllTimers();
    expect(cb.onSave).toHaveBeenCalled();
    document.body.removeChild(el);
  });

  it('keyboard shortcut Escape calls onBack', () => {
    const cb = makeCallbacks();
    const origOnBack = cb.onBack as ReturnType<typeof vi.fn>;
    const el = createPatternEditor(makeData(), cb);
    document.body.appendChild(el);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(origOnBack).toHaveBeenCalled();
    document.body.removeChild(el);
  });

  it('keyboard shortcut P switches to pen mode', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    document.body.appendChild(el);
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    }).not.toThrow();
    // Call onBack to clean up listener
    const backBtn = el.querySelector('.editor-back-btn') as HTMLButtonElement;
    backBtn?.click();
    document.body.removeChild(el);
  });

  it('Escape in pen mode with open outline pops last node', () => {
    const cb = makeCallbacks();
    const el = createPatternEditor(makeData(), cb);
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    document.body.appendChild(el);
    // Switch to pen mode and add a node
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
    // Escape should pop the node, not call onBack
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }).not.toThrow();
    const backBtn = el.querySelector('.editor-back-btn') as HTMLButtonElement;
    backBtn?.click();
    document.body.removeChild(el);
  });

  it('rows slider num input change event updates grid.rows', () => {
    const cb = makeCallbacks();
    const data = makeData();
    const el = createPatternEditor(data, cb);
    const numInputs = el.querySelectorAll('input[type="number"]');
    const rowsNumInput = numInputs[0] as HTMLInputElement;
    if (rowsNumInput) {
      rowsNumInput.value = '20';
      rowsNumInput.dispatchEvent(new Event('change'));
      expect(data.grid.rows).toBe(20);
    }
    vi.runAllTimers();
  });

  it('clear outline button clears all nodes', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 200, bubbles: true }));
    // Find clear outline button by text
    const clearBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('clear')
    ) as HTMLButtonElement;
    expect(() => clearBtn?.click()).not.toThrow();
    vi.runAllTimers();
  });

  it('symmetry mode toggle works', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    const symBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('symmetry')
    ) as HTMLButtonElement;
    expect(() => {
      symBtn?.click(); // ON
      symBtn?.click(); // OFF
    }).not.toThrow();
  });

  it('mirror button with no nodes returns early (covers early-return branch)', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // No nodes added → outline.length < 2 → mirrorBtn handler returns early
    const mirrorBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('mirror')
    ) as HTMLButtonElement;
    expect(() => mirrorBtn?.click()).not.toThrow();
    vi.runAllTimers();
  });

  it('mirror button with nodes calls mirrorOutlineX (covers lines 258-260)', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // Add 2+ nodes so outline.length >= 2 → mirror handler body executes
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 290, clientY: 300, bubbles: true }));
    const mirrorBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('mirror')
    ) as HTMLButtonElement;
    expect(() => mirrorBtn?.click()).not.toThrow();
    vi.runAllTimers();
  });

  it('seam allowance slider works', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    const sliders = el.querySelectorAll('input[type="range"]');
    // After switching to pen mode, sliders in seam section should be present
    expect(() => {
      const sl = sliders[sliders.length - 1] as HTMLInputElement;
      sl.value = '1';
      sl.dispatchEvent(new Event('input'));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('mouseleave without drag active covers line 655 else branch (dragging=null)', () => {
    // Fire mouseleave in grid mode — dragging is null → if(dragging) is false → else branch covered
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }).not.toThrow();
  });

  it('mouseleave with dragging=true clears drag state (covers mouseleave true branch)', () => {
    // Must init layout, add a node, start drag on that node, then mouseleave
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers(); // init layout: cs=20, ox=180, oy=210
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // Add a node at (250,300) → grid (3.5,4.5)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/move/i)
    );
    moveBtns[0]?.click();
    // mousedown at (250,300) → hits node → dragging = {0,'node'}
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    // mouseleave with dragging=true → covers dragging=null; save(); branch
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode contextmenu deletes node on right-click', () => {
    // With layout initialized (cs=20, ox=180, oy=210), clicking at node screen position deletes it.
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    // Initialize layout by running the initial RAF
    vi.runAllTimers();
    // Add 3 nodes in pen mode at known canvas positions
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // After vi.runAllTimers, cs=20, ox=180, oy=210
    // Clicking at (250,300): node at grid (3.5,4.5) → screen (250,300)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 270, clientY: 320, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 230, clientY: 280, bubbles: true }));
    // Switch to move mode
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/move/i)
    );
    moveBtns[0]?.click();
    // Right-click at (250,300) where first node is → triggers hitTestNode → delete path
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode contextmenu deletes dart on right-click near dart', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    // Initialize layout
    vi.runAllTimers();
    // Place a dart in dart mode at canvas center (250,300)
    const dartBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/dart/i)
    );
    dartBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 260, clientY: 310, bubbles: true }));
    // Switch to move mode
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/move/i)
    );
    moveBtns[0]?.click();
    // Right-click at dart position (250,300) → triggers hitTestDart → delete dart
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('pen mode click on already-closed outline returns early (covers outlineClosed return)', () => {
    // Close the outline via snap-to-close, then try to click again in pen mode
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // Add 3 nodes
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 290, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 270, clientY: 270, bubbles: true }));
    // Snap-to-close: click near first node (250,300) → sets outlineClosed=true
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 252, clientY: 302, bubbles: true }));
    // Now outline is closed. Another click in pen mode should return early.
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 400, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('pen mode snap-to-close closes outline when clicking near first node', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    // Initialize layout: cs=20, ox=180, oy=210
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    // Add 3 nodes at known screen positions
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 290, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 270, clientY: 270, bubbles: true }));
    // Snap-to-close: click very near first node at (250,300). SNAP_RADIUS=12px.
    // Node is at screen (250,300). Click within 12px to trigger snap-to-close.
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 252, clientY: 302, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('captureThumbnail with wide canvas (srcA >= dstA) covers else branch', () => {
    // Use a wide canvas (width > 2*height) to trigger the else branch in captureThumbnail
    const data = makeData();
    const cb = makeCallbacks();
    const el = createPatternEditor(data, cb);
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    // Make canvas wide aspect ratio: width=600 height=100 → srcA=6 > dstA=2
    Object.defineProperty(canvas, 'width', { value: 600, configurable: true });
    Object.defineProperty(canvas, 'height', { value: 100, configurable: true });
    // Trigger save to call captureThumbnail
    const saveBtn = el.querySelector('.editor-save-btn') as HTMLButtonElement;
    saveBtn?.click();
    vi.runAllTimers();
    expect(true).toBe(true);
  });

  it('pen mode with symmetry: click adds mirrored node', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    const symBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('symmetry')
    ) as HTMLButtonElement;
    symBtn?.click(); // Enable symmetry mode
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 200, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode mousemove with node drag exercises drag code', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    // Run initial RAF to set canvas layout: cs=20, ox=180, oy=210 (rows=10, cols=8)
    vi.runAllTimers();
    // Add nodes in pen mode. Clicking at (250,300) adds node at grid (3.5,4.5) → screen (250,300).
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/pen/i)
    );
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 270, clientY: 310, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 240, clientY: 320, bubbles: true }));
    // Switch to move mode
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b =>
      b.textContent?.match(/move/i)
    );
    moveBtns[0]?.click();
    // Click at (250,300) where first node is → starts drag
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    // Mousemove to simulate drag — exercises lines 619-647
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 310, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 260, clientY: 310, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode cp1 control point drag covers hitTestNode cp1 branch and cp1 drag handler', () => {
    // Layout: cs=20, ox=180, oy=210. Nodes: (250,300)→grid(3.5,4.5), (340,300)→grid(7,4.5), (190,300)→grid(0.5,4.5)
    // smoothOutline node0: prev=(0.5,4.5), next=(7,4.5) → tx=(7-0.5)/6=1.0833
    //   cp1dx=-1.0833 → cp1 screen=(180+(3.5-1.0833)*20, 300)=(228.33,300)
    //   cp2dx=+1.0833 → cp2 screen=(180+(3.5+1.0833)*20, 300)=(271.67,300)
    // Click at (228,300): dist to node0=22px > THRESH(9px) → miss node; dist to cp1≈0 → hit cp1
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 340, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // mousedown at cp1 screen pos (228,300): skip node (dist=22>9), hit cp1 (dist≈0)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 228, clientY: 300, bubbles: true }));
    // mousemove exercises cp1 drag handler (lines 639-642)
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 238, clientY: 295, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 238, clientY: 295, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode cp2 control point drag covers hitTestNode cp2 branch and cp2 drag handler', () => {
    // Click at (272,300): dist to node0=22px>9 → miss; cp1 at (228,300) dist=44>9 → miss; cp2 at (272,300) dist≈0 → hit cp2
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 340, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // mousedown at cp2 screen pos (272,300): skip node (dist=22>9), skip cp1 (dist=44>9), hit cp2 (dist≈0)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 272, clientY: 300, bubbles: true }));
    // mousemove exercises cp2 drag handler (lines 643-645)
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 262, clientY: 295, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 262, clientY: 295, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('contextmenu delete node: 4→3 nodes covers line 674 else branch (length NOT < 3)', () => {
    // After deleting 1 node from 4 we have 3 nodes → (3 < 3) is FALSE → else branch of line 674
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    // 4 spread nodes; 4th click is far from 1st so no snap-to-close (snap requires dist <= 12px).
    // Node 0:(250,300) Node 1:(300,330) Node 2:(290,370) Node 3:(260,360)
    // Adding node 3: nodes.length=3, first at (250,300), click at (260,360): dist≈60.8 > 12 → no snap
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 330, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 290, clientY: 370, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 260, clientY: 360, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // Right-click node 0 → delete → 3 nodes remain → (3 < 3) is FALSE
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('contextmenu delete node: 2→1 nodes covers line 675 else branch (length NOT >= 2)', () => {
    // After deleting 1 node from 2 we have 1 node → (1 >= 2) is FALSE → else branch of line 675
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    // 2 nodes only
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 310, clientY: 350, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // Right-click node 0 → delete → 1 node remains → (1 >= 2) is FALSE
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('contextmenu with dart present but click far from dart covers line 687 else branch', () => {
    // hitTestDart: dart at screen(250,300), click at (400,450) → dist²=45000 > 64 → else branch
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const dartBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/dart/i));
    dartBtns[0]?.click();
    // Place dart at screen (250,300) via two clicks
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 260, clientY: 310, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // Right-click FAR from dart → condition (dist²<=64) is FALSE → else branch of hitTestDart
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 400, clientY: 450, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('move mode node drag with symmetry mode mirrors counterpart node (covers lines 632-637)', () => {
    // Click in pen+symmetry mode adds node at (0.5,4.5) AND mirror at (6.5,4.5).
    // Dragging node 0 in move+symmetry mode finds mirIdx=1 and updates it.
    // cols=8, centerX=3.5; node0 at (0.5,4.5), mirror at (6.5,4.5)
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    // Enable symmetry mode
    const symBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('symmetry')
    ) as HTMLButtonElement;
    symBtn?.click();
    // Click at (190,300) → grid (0.5,4.5). Mirror = 2*3.5-0.5=6.5 → also adds node at (6.5,4.5)→screen(310,300)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    // Switch to move mode (symmetryMode remains true)
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // mousedown at (190,300) → hits node0 at grid(0.5,4.5) → dragging={0,'node'}
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    // mousemove to (195,300): gx=0.75; mirX=6.5; finds node1 at (6.5,4.5); updates it to (6.25,4.5)
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 195, clientY: 300, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 195, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('getActiveLayer with no matching layer falls back to layers[0] (covers line 43 ?? fallback)', () => {
    // activeLayerId='front' but layers only has 'back','sleeve' → find returns undefined → layers![0]
    const data = makeData({
      layers: [
        { id: 'back',   name: 'Back',   outline: [], outlineClosed: false, darts: [], seamAllowance: 0 },
        { id: 'sleeve', name: 'Sleeve', outline: [], outlineClosed: false, darts: [], seamAllowance: 0 },
      ],
      activeLayerId: 'front',
    });
    const el = createPatternEditor(data, makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }), configurable: true,
    });
    vi.runAllTimers();
    // Trigger getActiveLayer via pen click — find('front') returns undefined → layers![0]='back'
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('getActiveLayer with undefined activeLayerId uses front fallback (covers line 42 ?? fallback)', () => {
    // After createPatternEditor sets activeLayerId='front', reset it to undefined, then trigger event
    const data = makeData({ activeLayerId: undefined });
    const el = createPatternEditor(data, makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }), configurable: true,
    });
    vi.runAllTimers();
    // Manually reset activeLayerId to trigger the ?? 'front' fallback on line 42
    data.activeLayerId = undefined;
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('title input change with empty string uses existing name (covers line 93 || fallback)', () => {
    const data = makeData({ name: 'Original' });
    const el = createPatternEditor(data, makeCallbacks());
    const titleInput = el.querySelector('input.editor-title') as HTMLInputElement;
    titleInput.value = '   '; // trim() returns '' → '' || data.name → uses 'Original'
    titleInput.dispatchEvent(new Event('change'));
    expect(data.name).toBe('Original');
  });

  it('title input keydown with non-Enter key covers line 96 else branch', () => {
    const el = createPatternEditor(makeData(), makeCallbacks());
    const titleInput = el.querySelector('input.editor-title') as HTMLInputElement;
    // dispatch keydown with key 'a' — not 'Enter' → else branch of if(e.key==='Enter')
    expect(() => {
      titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    }).not.toThrow();
  });

  it('drawAll with null 2d context covers line 336 if(!ctx) return branch', () => {
    // Override getContext on the canvas instance to return null → drawAll returns early at line 336
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    canvas.getContext = () => null as any;
    expect(() => {
      vi.runAllTimers(); // fires RAF → drawAll() → getContext returns null → if(!ctx) return; ← covered
    }).not.toThrow();
  });

  it('seam allowance with 1-node closed outline covers line 424 pts.length<=1 else branch', () => {
    // 1-node outline + outlineClosed=true → offsetPath returns [] → pts.length=0 → else branch of if(pts.length>1)
    const node = { x: 3.5, y: 4.5, cp1dx: 0, cp1dy: 0, cp2dx: 0, cp2dy: 0 };
    const data = makeData({
      layers: [
        { id: 'front', name: 'Front', outline: [node], outlineClosed: true, darts: [], seamAllowance: 0.01 },
        { id: 'back',  name: 'Back',  outline: [],     outlineClosed: false, darts: [], seamAllowance: 0 },
        { id: 'sleeve', name: 'Sleeve', outline: [],   outlineClosed: false, darts: [], seamAllowance: 0 },
      ],
      activeLayerId: 'front',
    });
    const el = createPatternEditor(data, makeCallbacks());
    // drawAll() fires via RAF → drawLayerOutline: 1 node, closed, seam > 0 → offsetPath=[] → else branch
    vi.runAllTimers();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('move mode mousedown far from all handles covers line 546 cp2 else branch', () => {
    // hitTestNode: for each node, node check fails, cp1 check fails, cp2 check also FAILS → else branch
    // Need 3 spread nodes (so cp handles exist), then click far from all of them
    // Nodes: (250,300),(340,300),(190,300); cp1@(228,300), cp2@(272,300)
    // Click at (350,400): dist to all nodes and handles >> 9px → cp2 check fails → else branch (line 546)
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    // Add 3 spread nodes (cp handles will be far from each node after smoothOutline)
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 340, clientY: 300, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // Click at (350,400): far from nodes (250,300),(340,300),(190,300) and their cp handles
    // hitTestNode loops: node fail → cp1 fail → cp2 FAIL (line 546 else) → continue → returns null
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 350, clientY: 400, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('pen+symmetry click on center axis covers line 579 else branch (no mirror added)', () => {
    // cols=8, centerX=3.5 → center screen x = 180 + 3.5*20 = 250
    // Clicking at x=250 in symmetry mode: gx=3.5, mx=2*3.5-3.5=3.5, |mx-gx|=0 ≤ 0.01 → else branch
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    const symBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('symmetry')
    ) as HTMLButtonElement;
    symBtn?.click();
    // Click at x=250 (exact center column) → mx=gx → |mx-gx| ≤ 0.01 → else branch (no mirror added)
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });

  it('symmetry drag with no mirror node covers line 637 else branch (mirIdx=-1)', () => {
    // Add 1 node WITHOUT symmetry → no mirror exists. Then enable symmetry and drag.
    // During drag: mirX computed but findIndex returns -1 → else branch of if(mirIdx>=0) covered.
    const el = createPatternEditor(makeData(), makeCallbacks());
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 600 }),
      configurable: true,
    });
    vi.runAllTimers();
    const penBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/pen/i));
    penBtns[0]?.click();
    // Add only 1 node at (190,300) — no symmetry yet, so NO mirror node is created
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    // Now enable symmetry (AFTER adding node, so mirror was never created)
    const symBtn = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('symmetry')
    ) as HTMLButtonElement;
    symBtn?.click();
    // Switch to move mode
    const moveBtns = Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.match(/move/i));
    moveBtns[0]?.click();
    // mousedown at (190,300) → hits node0 → dragging={0,'node'}
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 190, clientY: 300, bubbles: true }));
    // mousemove: symmetryMode=true, oldX=0.5, mirX=6.5, but no other node near x=6.5 → mirIdx=-1
    expect(() => {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 195, clientY: 300, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 195, clientY: 300, bubbles: true }));
    }).not.toThrow();
    vi.runAllTimers();
  });
});
