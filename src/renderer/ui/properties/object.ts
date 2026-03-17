/**
 * Properties panel — Object tab.
 * Avatar selector, pattern, size grading, cubemap environment.
 */
import { t } from '../../i18n';

export interface ObjectPropCallbacks {
  onAvatarChange: (index: number) => void;
  onPatternChange: (id: string) => void;
  onCubemapChange: (id: string) => void;
  onSizeChange: (size: string) => void;
}

export interface ObjectPropState {
  avatarIndex: number;
  patternId: string | null;
}

const AVATAR_LABELS = ['Male Mannequin', 'Female Mannequin'];
const PATTERNS = ['tshirt','skirt','dress','mini_dress','tank','hood','scarf','culottes','vest','jacket'];
const PATTERN_LABELS: Record<string, string> = {
  tshirt:'T-Shirt', skirt:'Skirt', dress:'Dress', mini_dress:'Mini Dress',
  tank:'Tank Top', hood:'Hood', scarf:'Scarf', culottes:'Culottes', vest:'Vest', jacket:'Jacket',
};
const CUBEMAPS = ['grid','studio_1','indoor_1','indoor_2'];
const CUBEMAP_LABELS: Record<string, string> = {
  grid:'Grid', studio_1:'Studio', indoor_1:'Indoor 1', indoor_2:'Indoor 2',
};
const SIZES = ['XS','S','M','L','XL','XXL'];

function section(label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ws-prop-section';
  const lbl = document.createElement('span');
  lbl.className = 'ws-prop-section-label';
  lbl.textContent = label;
  el.appendChild(lbl);
  return el;
}

function propRow(labelText: string): { row: HTMLElement; label: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'ws-prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  row.appendChild(label);
  return { row, label };
}

function styledSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.style.cssText = 'background:#2a2a2a;color:#ccc;border:none;font-size:12px;padding:3px 6px;border-radius:3px;flex:2;min-width:0;';
  return sel;
}

export function createObjectTab(callbacks: ObjectPropCallbacks): {
  element: HTMLElement;
  update(state: ObjectPropState): void;
} {
  const el = document.createElement('div');
  el.className = 'ws-prop-content';

  // Avatar
  const avatarSec = section(t('ui.avatar'));
  const { row: avatarRow } = propRow(t('ui.avatar'));
  const avatarSelect = styledSelect();
  AVATAR_LABELS.forEach((label, i) => {
    const opt = document.createElement('option');
    opt.value = String(i); opt.textContent = label;
    avatarSelect.appendChild(opt);
  });
  avatarSelect.addEventListener('change', () => callbacks.onAvatarChange(parseInt(avatarSelect.value)));
  avatarRow.appendChild(avatarSelect);
  avatarSec.appendChild(avatarRow);
  el.appendChild(avatarSec);

  // Pattern
  const patSec = section(t('ui.pattern'));
  const { row: patRow } = propRow(t('ui.pattern'));
  const patSelect = styledSelect();
  PATTERNS.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = PATTERN_LABELS[id] ?? id;
    patSelect.appendChild(opt);
  });
  patSelect.addEventListener('change', () => callbacks.onPatternChange(patSelect.value));
  patRow.appendChild(patSelect);
  patSec.appendChild(patRow);
  el.appendChild(patSec);

  // Size grading
  const sizeSec = section(t('ui.size'));
  const sizeGrid = document.createElement('div');
  sizeGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;';
  let activeSizeBtn: HTMLButtonElement | null = null;
  for (const s of SIZES) {
    const btn = document.createElement('button');
    btn.textContent = s;
    btn.style.cssText = 'background:#2a2a2a;color:#aaa;border:none;border-radius:3px;padding:4px 2px;font-size:11px;cursor:pointer;';
    btn.addEventListener('click', () => {
      if (activeSizeBtn) activeSizeBtn.style.background = '#2a2a2a';
      btn.style.background = '#3a7bd5';
      activeSizeBtn = btn;
      callbacks.onSizeChange(s);
    });
    if (s === 'M') { btn.style.background = '#3a7bd5'; activeSizeBtn = btn; }
    sizeGrid.appendChild(btn);
  }
  sizeSec.appendChild(sizeGrid);
  el.appendChild(sizeSec);

  // Cubemap
  const cubeSec = section(t('ui.cubemap'));
  const { row: cubeRow } = propRow(t('ui.environment'));
  const cubeSelect = styledSelect();
  CUBEMAPS.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = CUBEMAP_LABELS[id] ?? id;
    cubeSelect.appendChild(opt);
  });
  cubeSelect.value = 'studio_1';
  cubeSelect.addEventListener('change', () => callbacks.onCubemapChange(cubeSelect.value));
  cubeRow.appendChild(cubeSelect);
  cubeSec.appendChild(cubeRow);
  el.appendChild(cubeSec);

  return {
    element: el,
    update(state: ObjectPropState) {
      avatarSelect.value = String(state.avatarIndex);
      if (state.patternId) patSelect.value = state.patternId;
    },
  };
}
