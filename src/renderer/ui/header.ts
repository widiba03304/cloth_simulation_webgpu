/**
 * App-level header bar: mode selector, project name, back + save buttons.
 * Mirrors Blender's top header with mode dropdown.
 */
import { t } from '../i18n';
import type { AppMode } from '../app/state';

export interface HeaderCallbacks {
  onBack: () => void;
  onSave: () => void;
  onModeChange: (mode: AppMode) => void;
}

export interface AppHeader {
  element: HTMLElement;
  setMode(m: AppMode): void;
  setProjectName(name: string): void;
  setDirty(dirty: boolean): void;
}

const MODE_LABELS: Record<AppMode, string> = {
  'simulate':     '3D Simulation',
  'pattern-edit': 'Edit Pattern',
  'pose':         'Pose Avatar',
};

export function createHeader(
  projectName: string,
  mode: AppMode,
  callbacks: HeaderCallbacks,
): AppHeader {
  const element = document.createElement('div');
  element.className = 'ws-app-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'ws-back-btn';
  backBtn.title = t('ui.backToDashboard');
  backBtn.textContent = '\u2190';
  backBtn.addEventListener('click', callbacks.onBack);

  const modeSelect = document.createElement('select');
  modeSelect.className = 'ws-mode-select';
  for (const [value, label] of Object.entries(MODE_LABELS) as [AppMode, string][]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === mode) opt.selected = true;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener('change', () => {
    callbacks.onModeChange(modeSelect.value as AppMode);
  });

  const nameEl = document.createElement('span');
  nameEl.className = 'ws-project-name';
  nameEl.textContent = projectName;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'ws-save-btn';
  saveBtn.textContent = t('ui.save');
  saveBtn.addEventListener('click', callbacks.onSave);

  element.appendChild(backBtn);
  element.appendChild(modeSelect);
  element.appendChild(nameEl);
  element.appendChild(saveBtn);

  return {
    element,
    setMode(m: AppMode) {
      modeSelect.value = m;
    },
    setProjectName(name: string) {
      nameEl.textContent = name;
    },
    setDirty(dirty: boolean) {
      saveBtn.textContent = dirty ? `\u25CF ${t('ui.save')}` : t('ui.save');
    },
  };
}
