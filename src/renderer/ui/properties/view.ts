/**
 * Properties panel — View tab.
 * Camera presets, orthographic, turntable, export OBJ.
 */
import { t } from '../../i18n';
import type { CameraPreset } from '../../render/camera';

export interface ViewPropCallbacks {
  onCameraPreset: (preset: CameraPreset) => void;
  onOrthoToggle: (enabled: boolean) => void;
  onTurntableToggle: (enabled: boolean) => void;
  onExportOBJ: () => void;
}

export function createViewTab(callbacks: ViewPropCallbacks): { element: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'ws-prop-content';

  // Camera presets
  const camSec = document.createElement('div');
  camSec.className = 'ws-prop-section';
  const camLbl = document.createElement('span');
  camLbl.className = 'ws-prop-section-label';
  camLbl.textContent = t('ui.cameraView');
  const presetGrid = document.createElement('div');
  presetGrid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-bottom:8px;';
  const PRESETS: CameraPreset[] = ['front','back','left','right','top'];
  const PRESET_LABELS: Record<CameraPreset, string> = { front:'Fr', back:'Bk', left:'Lt', right:'Rt', top:'Top' };
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.textContent = PRESET_LABELS[p];
    btn.style.cssText = 'background:#2a2a2a;color:#aaa;border:none;border-radius:3px;padding:4px 2px;font-size:10px;cursor:pointer;';
    btn.addEventListener('click', () => callbacks.onCameraPreset(p));
    btn.addEventListener('mouseover', () => { btn.style.background = '#3a3a3a'; });
    btn.addEventListener('mouseout', () => { btn.style.background = '#2a2a2a'; });
    presetGrid.appendChild(btn);
  }
  camSec.appendChild(camLbl);
  camSec.appendChild(presetGrid);

  // Ortho toggle
  const orthoRow = document.createElement('div');
  orthoRow.className = 'ws-prop-row';
  const orthoLabel = document.createElement('label');
  orthoLabel.textContent = t('ui.orthographic');
  orthoLabel.style.cursor = 'pointer';
  const orthoCheck = document.createElement('input');
  orthoCheck.type = 'checkbox';
  orthoCheck.style.accentColor = '#3a7bd5';
  orthoCheck.addEventListener('change', () => callbacks.onOrthoToggle(orthoCheck.checked));
  orthoRow.appendChild(orthoLabel);
  orthoRow.appendChild(orthoCheck);
  camSec.appendChild(orthoRow);

  // Turntable toggle
  const ttRow = document.createElement('div');
  ttRow.className = 'ws-prop-row';
  const ttLabel = document.createElement('label');
  ttLabel.textContent = t('ui.turntable');
  ttLabel.style.cursor = 'pointer';
  const ttCheck = document.createElement('input');
  ttCheck.type = 'checkbox';
  ttCheck.style.accentColor = '#3a7bd5';
  ttCheck.addEventListener('change', () => callbacks.onTurntableToggle(ttCheck.checked));
  ttRow.appendChild(ttLabel);
  ttRow.appendChild(ttCheck);
  camSec.appendChild(ttRow);
  el.appendChild(camSec);

  // Export
  const expSec = document.createElement('div');
  expSec.className = 'ws-prop-section';
  const expLbl = document.createElement('span');
  expLbl.className = 'ws-prop-section-label';
  expLbl.textContent = t('ui.export');
  const expBtn = document.createElement('button');
  expBtn.textContent = t('ui.exportOBJ');
  expBtn.style.cssText = 'width:100%;background:#2a2a2a;color:#aaa;border:none;border-radius:4px;padding:6px;font-size:12px;cursor:pointer;';
  expBtn.addEventListener('click', () => callbacks.onExportOBJ());
  expSec.appendChild(expLbl);
  expSec.appendChild(expBtn);
  el.appendChild(expSec);

  return { element: el };
}
