/**
 * Properties panel — Material tab.
 * Material preset, albedo color, texture upload/clear.
 */
import { t } from '../../i18n';

export interface MaterialPropCallbacks {
  onMaterialChange: (id: string) => void;
  onColorChange: (albedo: [number, number, number]) => void;
  onTextureLoad: (file: File) => void;
  onClearTexture: () => void;
}

export interface MaterialPropState {
  materialId: string | null;
}

const MATERIALS = ['cotton','silk','denim','canvas','chiffon','wool','linen','velvet','jersey','leather','lace','organza','neoprene','tweed'];

export function createMaterialTab(callbacks: MaterialPropCallbacks): {
  element: HTMLElement;
  update(state: MaterialPropState): void;
  setColor(hex: string): void;
} {
  const el = document.createElement('div');
  el.className = 'ws-prop-content';

  // Material preset
  const matSec = document.createElement('div');
  matSec.className = 'ws-prop-section';
  const matLbl = document.createElement('span');
  matLbl.className = 'ws-prop-section-label';
  matLbl.textContent = t('ui.material');
  const matRow = document.createElement('div');
  matRow.className = 'ws-prop-row';
  const matLabel = document.createElement('label');
  matLabel.textContent = t('ui.preset');
  const matSelect = document.createElement('select');
  matSelect.style.cssText = 'background:#2a2a2a;color:#ccc;border:none;font-size:12px;padding:3px 6px;border-radius:3px;flex:2;min-width:0;';
  MATERIALS.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = id.charAt(0).toUpperCase() + id.slice(1);
    matSelect.appendChild(opt);
  });
  matSelect.addEventListener('change', () => callbacks.onMaterialChange(matSelect.value));
  matRow.appendChild(matLabel);
  matRow.appendChild(matSelect);
  matSec.appendChild(matLbl);
  matSec.appendChild(matRow);
  el.appendChild(matSec);

  // Color
  const colorSec = document.createElement('div');
  colorSec.className = 'ws-prop-section';
  const colorLbl = document.createElement('span');
  colorLbl.className = 'ws-prop-section-label';
  colorLbl.textContent = t('ui.color');
  const colorRow = document.createElement('div');
  colorRow.className = 'ws-prop-row';
  const colorLabel = document.createElement('label');
  colorLabel.textContent = t('ui.albedo');
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#1a3a6e';
  colorInput.style.cssText = 'width:48px;height:28px;border:none;padding:0;background:none;cursor:pointer;border-radius:3px;';
  colorInput.addEventListener('input', () => {
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    callbacks.onColorChange([r, g, b]);
  });
  colorRow.appendChild(colorLabel);
  colorRow.appendChild(colorInput);
  colorSec.appendChild(colorLbl);
  colorSec.appendChild(colorRow);
  el.appendChild(colorSec);

  // Texture
  const texSec = document.createElement('div');
  texSec.className = 'ws-prop-section';
  const texLbl = document.createElement('span');
  texLbl.className = 'ws-prop-section-label';
  texLbl.textContent = t('ui.texture');
  const texRow = document.createElement('div');
  texRow.className = 'ws-prop-row';
  const texInput = document.createElement('input');
  texInput.type = 'file'; texInput.accept = 'image/*'; texInput.style.display = 'none';
  const texBtn = document.createElement('button');
  texBtn.textContent = t('ui.loadTexture');
  texBtn.style.cssText = 'background:#2a2a2a;color:#aaa;border:none;border-radius:3px;padding:5px 8px;font-size:11px;cursor:pointer;flex:1;';
  texBtn.addEventListener('click', () => texInput.click());
  texInput.addEventListener('change', () => { if (texInput.files?.[0]) callbacks.onTextureLoad(texInput.files[0]); });
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '✕';
  clearBtn.title = t('ui.clearTexture');
  clearBtn.style.cssText = 'background:#2a2a2a;color:#888;border:none;border-radius:3px;padding:5px 8px;font-size:11px;cursor:pointer;';
  clearBtn.addEventListener('click', () => callbacks.onClearTexture());
  texRow.appendChild(texBtn);
  texRow.appendChild(texInput);
  texRow.appendChild(clearBtn);
  texSec.appendChild(texLbl);
  texSec.appendChild(texRow);
  el.appendChild(texSec);

  return {
    element: el,
    update(state: MaterialPropState) {
      if (state.materialId) matSelect.value = state.materialId;
    },
    setColor(hex: string) { colorInput.value = hex; },
  };
}
