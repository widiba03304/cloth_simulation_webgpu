/**
 * Scene outliner: Blender-style hierarchy showing avatar and garments.
 * Left panel, collapsible.
 */
import { t } from '../i18n';
import type { AppState } from '../app/state';

const AVATAR_LABELS = ['Male Mannequin', 'Female Mannequin'];
const PATTERN_LABELS: Record<string, string> = {
  tshirt: 'T-Shirt', skirt: 'Skirt', dress: 'Dress', mini_dress: 'Mini Dress',
  tank: 'Tank Top', hood: 'Hood', scarf: 'Scarf', culottes: 'Culottes',
  vest: 'Vest', jacket: 'Jacket',
};

export interface OutlinerCallbacks {
  onAvatarChange: (index: number) => void;
  onGarmentSelect: (id: string) => void;
}

export interface AppOutliner {
  element: HTMLElement;
  update(state: AppState): void;
}

export function createOutliner(callbacks: OutlinerCallbacks): AppOutliner {
  const element = document.createElement('div');
  element.className = 'ws-outliner';

  function render(state: AppState): void {
    element.innerHTML = '';

    // Avatar section
    const avatarHeader = document.createElement('div');
    avatarHeader.className = 'ws-outliner-header';
    avatarHeader.textContent = t('ui.avatar');
    element.appendChild(avatarHeader);

    const avatarEntry = document.createElement('div');
    avatarEntry.className = 'ws-outliner-entry';

    const avatarIcon = document.createElement('span');
    avatarIcon.textContent = '\uD83D\uDC64';
    avatarIcon.style.fontSize = '12px';

    const avatarSelect = document.createElement('select');
    avatarSelect.style.cssText = 'background:#2a2a2a;color:#ccc;border:none;font-size:11px;flex:1;padding:1px 3px;border-radius:2px;';
    AVATAR_LABELS.forEach((label, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      if (i === state.avatarIndex) opt.selected = true;
      avatarSelect.appendChild(opt);
    });
    avatarSelect.addEventListener('change', () => {
      callbacks.onAvatarChange(parseInt(avatarSelect.value));
    });

    avatarEntry.appendChild(avatarIcon);
    avatarEntry.appendChild(avatarSelect);
    element.appendChild(avatarEntry);

    // Garments section
    const garmentHeader = document.createElement('div');
    garmentHeader.className = 'ws-outliner-header';
    garmentHeader.style.marginTop = '8px';
    garmentHeader.textContent = t('ui.pattern');
    element.appendChild(garmentHeader);

    if (state.patternId) {
      const entry = document.createElement('div');
      entry.className = 'ws-outliner-entry ws-outliner-indent selected';

      const patIcon = document.createElement('span');
      patIcon.textContent = '\uD83D\uDCD0';
      patIcon.style.fontSize = '11px';

      const label = document.createElement('span');
      label.style.flex = '1';
      label.textContent = PATTERN_LABELS[state.patternId] ?? state.patternId;

      const matIcon = document.createElement('span');
      matIcon.textContent = '\uD83C\uDFA8';
      matIcon.style.fontSize = '11px';
      matIcon.title = state.materialId ?? '';

      entry.appendChild(patIcon);
      entry.appendChild(label);
      entry.appendChild(matIcon);
      entry.addEventListener('click', () => callbacks.onGarmentSelect(state.patternId!));
      element.appendChild(entry);
    } else {
      const empty = document.createElement('div');
      empty.className = 'ws-outliner-entry ws-outliner-indent';
      empty.style.color = '#555';
      empty.style.fontSize = '11px';
      empty.textContent = t('dash.emptyProjects');
      element.appendChild(empty);
    }
  }

  return {
    element,
    update: render,
  };
}
