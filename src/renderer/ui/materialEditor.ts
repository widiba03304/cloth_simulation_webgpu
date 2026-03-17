/**
 * Material Editor: fabric material property editor.
 * Collapsible sections for Appearance, Physical, Presets.
 * WebGPU cloth drape simulation preview.
 */

import { t } from '../i18n';
import { createClothPreview, type ClothPreview } from './clothPreview';

export interface MaterialData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;

  // Color
  albedo: [number, number, number];

  // Surface
  roughness: number;
  metallic: number;
  sheen: number;
  sheenTint: number;

  // Fabric structure
  subsurface: number;
  fuzziness: number;
  thickness: number;
  opacity: number;

  // Texture
  texturePattern: number;   // 0=none,1=plainWeave,2=twill,3=satin,4=knit,5=herringbone
  textureScale: number;
  textureIntensity: number;

  // Physical
  density: number;
  stretchWarp: number;
  stretchWeft: number;
  bendStiffness: number;
  drape: number;
}

/** Scalar keys of MaterialData (excludes albedo, id, name, etc.) */
type ScalarKey = keyof Omit<MaterialData, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'thumbnail' | 'albedo'>;

/** Slider config descriptor */
interface SliderDef {
  key: ScalarKey;
  label: string;
  min: number;
  max: number;
  step: number;
  resetSim?: boolean;  // trigger simulation reset on change
}

const MATERIAL_DEFAULTS: Partial<MaterialData> = {
  albedo: [0.9, 0.9, 0.9],
  roughness: 0.5,
  metallic: 0,
  sheen: 0,
  sheenTint: 0.5,
  subsurface: 0,
  fuzziness: 0,
  thickness: 0.5,
  opacity: 1,
  texturePattern: 0,
  textureScale: 20,
  textureIntensity: 0.5,
  density: 200,
  stretchWarp: 5,
  stretchWeft: 10,
  bendStiffness: 0.5,
  drape: 0.5,
};

export interface MaterialEditorCallbacks {
  onSave: (data: MaterialData) => void;
  onBack: () => void;
}

type FabricPreset = Omit<MaterialData, 'id' | 'createdAt' | 'updatedAt' | 'thumbnail'> & { name: string };

// ============================================================
//  Slider definitions (config-driven)
// ============================================================

const APPEARANCE_SLIDERS: SliderDef[] = [
  { key: 'roughness',    label: 'material.roughness',    min: 0, max: 1,   step: 0.01 },
  { key: 'metallic',     label: 'material.metallic',     min: 0, max: 1,   step: 0.01 },
  { key: 'sheen',        label: 'material.sheen',        min: 0, max: 1,   step: 0.01 },
  { key: 'sheenTint',    label: 'material.sheenTint',    min: 0, max: 1,   step: 0.01 },
  { key: 'subsurface',   label: 'material.subsurface',   min: 0, max: 1,   step: 0.01 },
  { key: 'fuzziness',    label: 'material.fuzziness',    min: 0, max: 1,   step: 0.01 },
  { key: 'opacity',      label: 'material.opacity',      min: 0, max: 1,   step: 0.01 },
];

const TEXTURE_SLIDERS: SliderDef[] = [
  { key: 'textureScale',     label: 'material.textureScale',     min: 1, max: 50, step: 1 },
  { key: 'textureIntensity', label: 'material.textureIntensity', min: 0, max: 1,  step: 0.01 },
];

const PHYSICAL_SLIDERS: SliderDef[] = [
  { key: 'thickness',     label: 'material.thickness',     min: 0.1, max: 5,   step: 0.1 },
  { key: 'density',       label: 'material.density',       min: 50,  max: 600, step: 10,   resetSim: true },
  { key: 'stretchWarp',   label: 'material.stretchWarp',   min: 0,   max: 100, step: 1,    resetSim: true },
  { key: 'stretchWeft',   label: 'material.stretchWeft',   min: 0,   max: 100, step: 1,    resetSim: true },
  { key: 'bendStiffness', label: 'material.bendStiffness', min: 0,   max: 1,   step: 0.01, resetSim: true },
  { key: 'drape',         label: 'material.drape',         min: 0,   max: 1,   step: 0.01, resetSim: true },
];

// ============================================================
//  Main editor
// ============================================================

export function createMaterialEditor(
  data: MaterialData,
  callbacks: MaterialEditorCallbacks,
): HTMLElement {
  // Apply defaults for missing fields
  for (const [k, v] of Object.entries(MATERIAL_DEFAULTS)) {
    if ((data as unknown as Record<string, unknown>)[k] === undefined) {
      (data as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
    }
  }

  let preview: ClothPreview | null = null;
  let resizeObs: ResizeObserver | null = null;

  // Registry: key → slider DOM element (for bulk preset updates)
  const sliderElements = new Map<ScalarKey, HTMLElement>();

  const root = document.createElement('div');
  root.className = 'editor-root';

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'editor-header';

  function cleanup(): void {
    if (preview) preview.destroy();
    if (resizeObs) resizeObs.disconnect();
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'editor-back-btn';
  backBtn.innerHTML = `&larr; ${t('dash.materials')}`;
  backBtn.addEventListener('click', () => {
    cleanup();
    callbacks.onBack();
  });

  const titleInput = document.createElement('input');
  titleInput.className = 'editor-title';
  titleInput.type = 'text';
  titleInput.value = data.name;
  titleInput.addEventListener('change', () => {
    data.name = titleInput.value.trim() || data.name;
    save();
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titleInput.blur();
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'editor-back-btn';
  resetBtn.textContent = '↻';
  resetBtn.title = 'Reset simulation';
  resetBtn.style.padding = '6px 10px';
  resetBtn.addEventListener('click', () => { if (preview) preview.resetSimulation(); });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save-btn';
  saveBtn.textContent = t('ui.save');
  saveBtn.addEventListener('click', () => save());

  header.appendChild(backBtn);
  header.appendChild(titleInput);
  header.appendChild(resetBtn);
  header.appendChild(saveBtn);

  // --- Helper: build sliders from defs and append to container ---
  function buildSliders(defs: SliderDef[], container: Element): void {
    for (const def of defs) {
      const el = createSlider(t(def.label), def.min, def.max, def.step, data[def.key] as number, (v) => {
        (data as unknown as Record<string, unknown>)[def.key] = v;
        if (def.resetSim && preview) preview.resetSimulation();
      });
      sliderElements.set(def.key, el);
      container.appendChild(el);
    }
  }

  // --- Layout ---
  const body = document.createElement('div');
  body.className = 'editor-body';

  const sidebar = document.createElement('div');
  sidebar.className = 'editor-sidebar';

  // ========== Section 1: Appearance ==========
  const appearanceSection = createSection(t('material.appearance'), true);
  const appearanceBody = appearanceSection.querySelector('.editor-section-body')!;

  // Color picker + RGB sliders
  const colorGroup = document.createElement('div');
  colorGroup.className = 'editor-field';
  const colorLabel = document.createElement('label');
  colorLabel.textContent = t('material.albedo');
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = rgbToHex(data.albedo);
  colorInput.className = 'editor-color-input';
  colorInput.addEventListener('input', () => {
    data.albedo = hexToRgb(colorInput.value);
    updateColorSlider(rgbSliders[0], data.albedo[0]);
    updateColorSlider(rgbSliders[1], data.albedo[1]);
    updateColorSlider(rgbSliders[2], data.albedo[2]);
  });
  colorGroup.appendChild(colorLabel);
  colorGroup.appendChild(colorInput);

  const syncColor = () => { colorInput.value = rgbToHex(data.albedo); };
  const rgbSliders = (['R', 'G', 'B'] as const).map((ch, i) =>
    createSlider(ch, 0, 1, 0.01, data.albedo[i], (v) => { data.albedo[i] = v; syncColor(); }, true)
  );

  appearanceBody.appendChild(colorGroup);
  for (const s of rgbSliders) appearanceBody.appendChild(s);

  // Appearance sliders (from registry)
  buildSliders(APPEARANCE_SLIDERS, appearanceBody);

  // Texture pattern dropdown
  const texPatternGroup = document.createElement('div');
  texPatternGroup.className = 'editor-field';
  const texPatternLabel = document.createElement('label');
  texPatternLabel.textContent = t('material.texturePattern');
  const texPatternSelect = document.createElement('select');
  const patternOptions = [
    { value: 0, label: t('material.tex_none') },
    { value: 1, label: t('material.tex_plainWeave') },
    { value: 2, label: t('material.tex_twill') },
    { value: 3, label: t('material.tex_satin') },
    { value: 4, label: t('material.tex_knit') },
    { value: 5, label: t('material.tex_herringbone') },
  ];
  for (const opt of patternOptions) {
    const option = document.createElement('option');
    option.value = String(opt.value);
    option.textContent = opt.label;
    texPatternSelect.appendChild(option);
  }
  texPatternSelect.value = String(data.texturePattern);
  texPatternSelect.addEventListener('change', () => { data.texturePattern = parseInt(texPatternSelect.value); });
  texPatternGroup.appendChild(texPatternLabel);
  texPatternGroup.appendChild(texPatternSelect);
  appearanceBody.appendChild(texPatternGroup);

  // Texture sliders (from registry)
  buildSliders(TEXTURE_SLIDERS, appearanceBody);

  // ========== Section 2: Physical ==========
  const physicalSection = createSection(t('material.physical'), true);
  const physicalBody = physicalSection.querySelector('.editor-section-body')!;
  buildSliders(PHYSICAL_SLIDERS, physicalBody);

  // ========== Section 3: Presets ==========
  const presetSection = createSection(t('material.presets'), false);
  const presetBody = presetSection.querySelector('.editor-section-body')!;

  const presets = getPresets();
  const presetRow = document.createElement('div');
  presetRow.className = 'editor-preset-row';
  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.className = 'editor-preset-btn';
    btn.style.background = rgbToHex(preset.albedo);
    btn.style.color = brightness(preset.albedo) > 0.5 ? '#000' : '#fff';
    btn.textContent = preset.name;
    btn.title = preset.name;
    btn.addEventListener('click', () => applyPreset(preset));
    presetRow.appendChild(btn);
  }
  presetBody.appendChild(presetRow);

  sidebar.appendChild(appearanceSection);
  sidebar.appendChild(physicalSection);
  sidebar.appendChild(presetSection);

  // Canvas (responsive — fills available space)
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'editor-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'editor-canvas';
  canvas.width = 600;
  canvas.height = 600;
  canvasWrap.appendChild(canvas);

  // Resize canvas to fit container
  resizeObs = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      const size = Math.floor(Math.min(width, height) - 40);
      if (size > 100 && (canvas.width !== size || canvas.height !== size)) {
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
    }
  });
  resizeObs.observe(canvasWrap);

  body.appendChild(sidebar);
  body.appendChild(canvasWrap);

  root.appendChild(header);
  root.appendChild(body);

  // --- Initialize WebGPU cloth preview ---
  createClothPreview(canvas, data).then((p) => {
    preview = p;
    if (!p) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 600, 600);
        ctx.fillStyle = '#888';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WebGPU not available', 300, 300);
      }
    }
  });

  function save(): void {
    data.thumbnail = captureThumbnail(canvas);
    callbacks.onSave(data);
    // Brief visual feedback
    saveBtn.textContent = '✓';
    setTimeout(() => { saveBtn.textContent = t('ui.save'); }, 800);
  }

  // Keyboard shortcuts
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      cleanup();
      callbacks.onBack();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Clean up keyboard listener when leaving
  const origOnBack = callbacks.onBack;
  callbacks.onBack = () => {
    window.removeEventListener('keydown', onKeyDown);
    origOnBack();
  };

  function applyPreset(preset: FabricPreset): void {
    data.albedo = [...preset.albedo];
    colorInput.value = rgbToHex(data.albedo);
    for (let i = 0; i < 3; i++) updateColorSlider(rgbSliders[i], data.albedo[i]);

    // Update all registered sliders from preset
    for (const [key, el] of sliderElements) {
      const val = preset[key] as number;
      (data as unknown as Record<string, unknown>)[key] = val;
      updateSliderValue(el, val);
    }

    // Texture dropdown (not a slider)
    data.texturePattern = preset.texturePattern;
    texPatternSelect.value = String(data.texturePattern);

    if (preview) preview.resetSimulation();
  }

  return root;
}

// ============================================================
//  Collapsible section
// ============================================================

function createSection(title: string, open: boolean): HTMLElement {
  const section = document.createElement('div');
  section.className = 'editor-section';

  const header = document.createElement('div');
  header.className = 'editor-section-header';
  const arrow = document.createElement('span');
  arrow.className = 'editor-section-arrow';
  arrow.textContent = open ? '▾' : '▸';
  const label = document.createElement('span');
  label.textContent = title;
  header.appendChild(arrow);
  header.appendChild(label);

  const body = document.createElement('div');
  body.className = 'editor-section-body';
  if (!open) body.style.display = 'none';

  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    arrow.textContent = isOpen ? '▸' : '▾';
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

// ============================================================
//  Slider helper
// ============================================================

function createSlider(
  label: string, min: number, max: number, step: number, value: number,
  onChange: (v: number) => void, compact = false,
): HTMLElement {
  const group = document.createElement('div');
  group.className = compact ? 'editor-field editor-field-compact' : 'editor-field';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  if (compact) lbl.style.width = '16px';

  const row = document.createElement('div');
  row.className = 'editor-slider-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.min = String(min);
  numInput.max = String(max);
  numInput.step = String(step);
  numInput.value = step < 1 ? value.toFixed(2) : String(Math.round(value));
  numInput.className = 'editor-num-input';

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    numInput.value = step < 1 ? v.toFixed(2) : String(Math.round(v));
    onChange(v);
  });
  numInput.addEventListener('change', () => {
    let v = parseFloat(numInput.value);
    v = Math.max(min, Math.min(max, v));
    numInput.value = step < 1 ? v.toFixed(2) : String(Math.round(v));
    slider.value = String(v);
    onChange(v);
  });

  row.appendChild(slider);
  row.appendChild(numInput);
  group.appendChild(lbl);
  group.appendChild(row);
  return group;
}

function updateSliderValue(group: HTMLElement, value: number): void {
  const slider = group.querySelector('input[type="range"]') as HTMLInputElement;
  const num = group.querySelector('input[type="number"]') as HTMLInputElement;
  if (slider) slider.value = String(value);
  if (num) {
    const step = parseFloat(num.step);
    num.value = step < 1 ? value.toFixed(2) : String(Math.round(value));
  }
}

function updateColorSlider(group: HTMLElement, value: number): void {
  const slider = group.querySelector('input[type="range"]') as HTMLInputElement;
  const num = group.querySelector('input[type="number"]') as HTMLInputElement;
  if (slider) slider.value = String(value);
  if (num) num.value = value.toFixed(2);
}

// ============================================================
//  Color helpers
// ============================================================

function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const val = parseInt(hex.slice(1), 16);
  return [((val >> 16) & 255) / 255, ((val >> 8) & 255) / 255, (val & 255) / 255];
}

function brightness(rgb: [number, number, number]): number {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

// ============================================================
//  Thumbnail capture
// ============================================================

function captureThumbnail(source: HTMLCanvasElement): string {
  const tw = 480;
  const th = 240;
  const tmp = document.createElement('canvas');
  tmp.width = tw;
  tmp.height = th;
  const ctx = tmp.getContext('2d')!;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, tw, th);

  const srcAspect = source.width / source.height;
  const dstAspect = tw / th;
  let sw = source.width, sh = source.height, sx = 0, sy = 0;
  if (srcAspect < dstAspect) {
    sh = source.width / dstAspect;
    sy = (source.height - sh) / 2;
  } else {
    sw = source.height * dstAspect;
    sx = (source.width - sw) / 2;
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
  return tmp.toDataURL('image/jpeg', 0.85);
}

// ============================================================
//  Fabric presets
// ============================================================

function getPresets(): FabricPreset[] {
  return [
    { name: t('materials.cotton'), albedo: [0.95, 0.93, 0.88], roughness: 0.85, metallic: 0, sheen: 0.05, sheenTint: 0.5, subsurface: 0.1, fuzziness: 0.15, thickness: 0.4, opacity: 1, texturePattern: 1, textureScale: 25, textureIntensity: 0.3, density: 150, stretchWarp: 3, stretchWeft: 5, bendStiffness: 0.4, drape: 0.5 },
    { name: t('materials.silk'), albedo: [0.92, 0.90, 0.95], roughness: 0.25, metallic: 0, sheen: 0.7, sheenTint: 0.3, subsurface: 0.2, fuzziness: 0.0, thickness: 0.15, opacity: 0.95, texturePattern: 3, textureScale: 30, textureIntensity: 0.2, density: 80, stretchWarp: 2, stretchWeft: 4, bendStiffness: 0.15, drape: 0.9 },
    { name: t('materials.denim'), albedo: [0.20, 0.30, 0.50], roughness: 0.9, metallic: 0, sheen: 0.02, sheenTint: 0.8, subsurface: 0.0, fuzziness: 0.1, thickness: 1.2, opacity: 1, texturePattern: 2, textureScale: 20, textureIntensity: 0.5, density: 350, stretchWarp: 1, stretchWeft: 3, bendStiffness: 0.8, drape: 0.2 },
    { name: t('materials.canvas'), albedo: [0.75, 0.70, 0.60], roughness: 0.95, metallic: 0, sheen: 0.0, sheenTint: 0.5, subsurface: 0.0, fuzziness: 0.05, thickness: 0.8, opacity: 1, texturePattern: 1, textureScale: 15, textureIntensity: 0.4, density: 300, stretchWarp: 1, stretchWeft: 2, bendStiffness: 0.85, drape: 0.15 },
    { name: t('materials.chiffon'), albedo: [0.98, 0.95, 0.97], roughness: 0.2, metallic: 0, sheen: 0.4, sheenTint: 0.2, subsurface: 0.6, fuzziness: 0.0, thickness: 0.1, opacity: 0.4, texturePattern: 1, textureScale: 35, textureIntensity: 0.15, density: 40, stretchWarp: 5, stretchWeft: 8, bendStiffness: 0.05, drape: 0.95 },
    { name: t('materials.linen'), albedo: [0.88, 0.85, 0.78], roughness: 0.8, metallic: 0, sheen: 0.08, sheenTint: 0.6, subsurface: 0.15, fuzziness: 0.1, thickness: 0.5, opacity: 1, texturePattern: 1, textureScale: 18, textureIntensity: 0.45, density: 180, stretchWarp: 2, stretchWeft: 3, bendStiffness: 0.6, drape: 0.4 },
    { name: t('materials.wool'), albedo: [0.72, 0.68, 0.62], roughness: 0.88, metallic: 0, sheen: 0.1, sheenTint: 0.7, subsurface: 0.05, fuzziness: 0.6, thickness: 1.5, opacity: 1, texturePattern: 4, textureScale: 15, textureIntensity: 0.4, density: 280, stretchWarp: 5, stretchWeft: 8, bendStiffness: 0.55, drape: 0.35 },
    { name: t('materials.velvet'), albedo: [0.35, 0.12, 0.18], roughness: 0.92, metallic: 0, sheen: 0.9, sheenTint: 0.8, subsurface: 0.0, fuzziness: 0.8, thickness: 0.8, opacity: 1, texturePattern: 0, textureScale: 20, textureIntensity: 0.1, density: 320, stretchWarp: 2, stretchWeft: 3, bendStiffness: 0.45, drape: 0.55 },
    { name: t('materials.satin'), albedo: [0.90, 0.85, 0.92], roughness: 0.15, metallic: 0.05, sheen: 0.6, sheenTint: 0.4, subsurface: 0.1, fuzziness: 0.0, thickness: 0.25, opacity: 1, texturePattern: 3, textureScale: 25, textureIntensity: 0.25, density: 120, stretchWarp: 3, stretchWeft: 5, bendStiffness: 0.2, drape: 0.85 },
    { name: t('materials.fleece'), albedo: [0.82, 0.80, 0.78], roughness: 0.95, metallic: 0, sheen: 0.05, sheenTint: 0.5, subsurface: 0.05, fuzziness: 0.9, thickness: 2.5, opacity: 1, texturePattern: 4, textureScale: 10, textureIntensity: 0.3, density: 250, stretchWarp: 15, stretchWeft: 20, bendStiffness: 0.3, drape: 0.4 },
    { name: t('materials.leather'), albedo: [0.35, 0.22, 0.12], roughness: 0.55, metallic: 0.05, sheen: 0.3, sheenTint: 0.9, subsurface: 0.0, fuzziness: 0.0, thickness: 1.0, opacity: 1, texturePattern: 0, textureScale: 20, textureIntensity: 0.0, density: 500, stretchWarp: 5, stretchWeft: 8, bendStiffness: 0.7, drape: 0.2 },
    { name: t('materials.organza'), albedo: [0.95, 0.93, 0.96], roughness: 0.15, metallic: 0, sheen: 0.5, sheenTint: 0.2, subsurface: 0.5, fuzziness: 0.0, thickness: 0.08, opacity: 0.3, texturePattern: 1, textureScale: 40, textureIntensity: 0.2, density: 30, stretchWarp: 1, stretchWeft: 2, bendStiffness: 0.3, drape: 0.6 },
    { name: t('materials.neoprene'), albedo: [0.15, 0.15, 0.15], roughness: 0.6, metallic: 0.1, sheen: 0.2, sheenTint: 0.1, subsurface: 0.0, fuzziness: 0.0, thickness: 3.0, opacity: 1, texturePattern: 0, textureScale: 20, textureIntensity: 0.0, density: 450, stretchWarp: 30, stretchWeft: 40, bendStiffness: 0.65, drape: 0.15 },
    { name: t('materials.jersey'), albedo: [0.85, 0.83, 0.80], roughness: 0.7, metallic: 0, sheen: 0.1, sheenTint: 0.5, subsurface: 0.1, fuzziness: 0.2, thickness: 0.6, opacity: 1, texturePattern: 4, textureScale: 20, textureIntensity: 0.35, density: 180, stretchWarp: 20, stretchWeft: 40, bendStiffness: 0.2, drape: 0.75 },
    { name: t('materials.tweed'), albedo: [0.55, 0.48, 0.40], roughness: 0.92, metallic: 0, sheen: 0.05, sheenTint: 0.7, subsurface: 0.0, fuzziness: 0.4, thickness: 2.0, opacity: 1, texturePattern: 5, textureScale: 12, textureIntensity: 0.5, density: 380, stretchWarp: 2, stretchWeft: 3, bendStiffness: 0.8, drape: 0.15 },
  ];
}
