/**
 * Properties N-panel: tabbed panel on the right side of the workspace.
 * Tabs: Object (🎭), Material (🎨), Physics (⚙️), View (🔍).
 * Toggle with N key (matches Blender convention).
 */
import type { AppState } from '../../app/state';
import { createObjectTab, type ObjectPropCallbacks } from './object';
import { createMaterialTab, type MaterialPropCallbacks } from './material';
import { createPhysicsTab, type PhysicsPropCallbacks } from './physics';
import { createViewTab, type ViewPropCallbacks } from './view';

export type PropTab = 'object' | 'material' | 'physics' | 'view';

export interface PropCallbacks extends
  ObjectPropCallbacks,
  MaterialPropCallbacks,
  PhysicsPropCallbacks,
  ViewPropCallbacks {}

export interface PropertiesPanel {
  element: HTMLElement;
  setActiveTab(tab: PropTab): void;
  update(state: AppState): void;
  setColor(hex: string): void;
}

const TAB_ICONS: Record<PropTab, string> = {
  object:   '🎭',
  material: '🎨',
  physics:  '⚙️',
  view:     '🔍',
};

const TAB_TITLES: Record<PropTab, string> = {
  object:   'Object',
  material: 'Material',
  physics:  'Physics',
  view:     'View',
};

const TABS: PropTab[] = ['object', 'material', 'physics', 'view'];

export function createPropertiesPanel(callbacks: PropCallbacks): PropertiesPanel {
  const element = document.createElement('div');
  element.className = 'ws-properties';

  const tabsEl = document.createElement('div');
  tabsEl.className = 'ws-prop-tabs';

  const contentWrap = document.createElement('div');
  contentWrap.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';

  const objectTab  = createObjectTab(callbacks);
  const materialTab = createMaterialTab(callbacks);
  const physicsTab  = createPhysicsTab(callbacks);
  const viewTab     = createViewTab(callbacks);

  const tabContents: Record<PropTab, HTMLElement> = {
    object:   objectTab.element,
    material: materialTab.element,
    physics:  physicsTab.element,
    view:     viewTab.element,
  };

  const tabBtns: Record<PropTab, HTMLButtonElement> = {} as Record<PropTab, HTMLButtonElement>;
  let activeTab: PropTab = 'physics';

  function switchTab(tab: PropTab): void {
    activeTab = tab;
    for (const t of TABS) tabBtns[t].classList.toggle('active', t === tab);
    contentWrap.innerHTML = '';
    contentWrap.appendChild(tabContents[tab]);
  }

  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.className = 'ws-prop-tab';
    btn.textContent = TAB_ICONS[tab];
    btn.title = TAB_TITLES[tab];
    btn.addEventListener('click', () => switchTab(tab));
    tabsEl.appendChild(btn);
    tabBtns[tab] = btn;
  }

  element.appendChild(tabsEl);
  element.appendChild(contentWrap);
  switchTab('physics');

  return {
    element,
    setActiveTab(tab: PropTab) { switchTab(tab); },
    update(state: AppState) {
      objectTab.update({ avatarIndex: state.avatarIndex, patternId: state.patternId });
      materialTab.update({ materialId: state.materialId });
      physicsTab.update({ simFrozen: state.simFrozen, subSteps: state.subSteps });
    },
    setColor(hex: string) { materialTab.setColor(hex); },
  };
}
