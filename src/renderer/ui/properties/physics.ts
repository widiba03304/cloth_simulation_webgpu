/**
 * Properties panel — Physics tab.
 * Play/pause, wind controls, simulation quality, reset cloth.
 */
import { t } from '../../i18n';

export interface PhysicsPropCallbacks {
  onFreezeToggle: (frozen: boolean) => void;
  onWindChange: (strength: number, angle: number) => void;
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  onResetCloth: () => void;
}

export interface PhysicsPropState {
  simFrozen: boolean;
  subSteps: number;
}

export function createPhysicsTab(callbacks: PhysicsPropCallbacks): {
  element: HTMLElement;
  update(state: PhysicsPropState): void;
} {
  const el = document.createElement('div');
  el.className = 'ws-prop-content';

  let frozen = true;

  // Simulation control
  const simSec = document.createElement('div');
  simSec.className = 'ws-prop-section';
  const simLbl = document.createElement('span');
  simLbl.className = 'ws-prop-section-label';
  simLbl.textContent = t('ui.simulation');

  const playBtn = document.createElement('button');
  playBtn.style.cssText = 'width:100%;border:none;border-radius:4px;padding:8px;font-size:13px;cursor:pointer;margin-bottom:6px;';

  function updatePlayBtn(): void {
    playBtn.textContent = frozen ? `▶  ${t('ui.play')}` : `⏸  ${t('ui.pause')}`;
    playBtn.style.background = frozen ? '#2a4a7a' : '#3a6a3a';
    playBtn.style.color = '#ccc';
  }
  updatePlayBtn();

  playBtn.addEventListener('click', () => {
    frozen = !frozen;
    updatePlayBtn();
    callbacks.onFreezeToggle(frozen);
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = t('ui.resetCloth');
  resetBtn.style.cssText = 'width:100%;background:#2a2a2a;color:#aaa;border:none;border-radius:4px;padding:6px;font-size:12px;cursor:pointer;';
  resetBtn.addEventListener('click', () => callbacks.onResetCloth());

  simSec.appendChild(simLbl);
  simSec.appendChild(playBtn);
  simSec.appendChild(resetBtn);
  el.appendChild(simSec);

  // Quality
  const qualSec = document.createElement('div');
  qualSec.className = 'ws-prop-section';
  const qualLbl = document.createElement('span');
  qualLbl.className = 'ws-prop-section-label';
  qualLbl.textContent = t('ui.quality');
  const qualRow = document.createElement('div');
  qualRow.className = 'ws-prop-row';
  const qualLabel = document.createElement('label');
  qualLabel.textContent = t('ui.quality');
  const qualSelect = document.createElement('select');
  qualSelect.style.cssText = 'background:#2a2a2a;color:#ccc;border:none;font-size:12px;padding:3px 6px;border-radius:3px;flex:2;min-width:0;';
  [
    { value: 'low',    label: `${t('ui.qualityLow')} (2)` },
    { value: 'medium', label: `${t('ui.qualityMedium')} (4)` },
    { value: 'high',   label: `${t('ui.qualityHigh')} (8)` },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    qualSelect.appendChild(opt);
  });
  qualSelect.value = 'high';
  qualSelect.addEventListener('change', () => callbacks.onQualityChange(qualSelect.value as 'low' | 'medium' | 'high'));
  qualRow.appendChild(qualLabel);
  qualRow.appendChild(qualSelect);
  qualSec.appendChild(qualLbl);
  qualSec.appendChild(qualRow);
  el.appendChild(qualSec);

  // Wind
  const windSec = document.createElement('div');
  windSec.className = 'ws-prop-section';
  const windLbl = document.createElement('span');
  windLbl.className = 'ws-prop-section-label';
  windLbl.textContent = t('ui.wind');
  windSec.appendChild(windLbl);

  let windStrength = 0;
  let windAngle = 0;

  const strRow = document.createElement('div');
  strRow.className = 'ws-prop-row';
  const strLabel = document.createElement('label');
  strLabel.textContent = t('ui.strength');
  const strSlider = document.createElement('input');
  strSlider.type = 'range'; strSlider.min = '0'; strSlider.max = '100'; strSlider.value = '0';
  strSlider.style.cssText = 'flex:2;accent-color:#3a7bd5;min-width:0;';
  strSlider.addEventListener('input', () => {
    windStrength = parseInt(strSlider.value);
    callbacks.onWindChange(windStrength, windAngle);
  });
  strRow.appendChild(strLabel);
  strRow.appendChild(strSlider);
  windSec.appendChild(strRow);

  const dirRow = document.createElement('div');
  dirRow.className = 'ws-prop-row';
  const dirLabel = document.createElement('label');
  dirLabel.textContent = t('ui.direction');
  const dirSelect = document.createElement('select');
  dirSelect.style.cssText = 'background:#2a2a2a;color:#ccc;border:none;font-size:12px;padding:3px 6px;border-radius:3px;flex:2;min-width:0;';
  [['0','→ Right'],['90','↑ Back'],['180','← Left'],['270','↓ Front']].forEach(([val, lbl]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = lbl;
    dirSelect.appendChild(opt);
  });
  dirSelect.addEventListener('change', () => {
    windAngle = parseInt(dirSelect.value);
    callbacks.onWindChange(windStrength, windAngle);
  });
  dirRow.appendChild(dirLabel);
  dirRow.appendChild(dirSelect);
  windSec.appendChild(dirRow);
  el.appendChild(windSec);

  return {
    element: el,
    update(state: PhysicsPropState) {
      if (frozen !== state.simFrozen) {
        frozen = state.simFrozen;
        updatePlayBtn();
      }
    },
  };
}
