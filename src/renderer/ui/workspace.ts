/**
 * Workspace UI: Blender-style layout with header, outliner, split-pane center,
 * properties N-panel, and status bar.
 *
 * Layout:
 *   .workspace-root (flex col)
 *   ├── .ws-app-header   (mode selector + project name + back/save)
 *   ├── .ws-main (flex row)
 *   │   ├── .ws-outliner  (scene hierarchy, 200px collapsible)
 *   │   ├── .ws-center    (split panes, flex:1)
 *   │   └── .ws-properties (N-panel, 260px, N-key toggle)
 *   └── .ws-statusbar    (FPS + particles + mode)
 */

import type { AppMode, AppState } from '../app/state';
import { createHeader } from './header';
import { createOutliner } from './outliner';
import { createStatusBar } from './statusBar';
import { createPropertiesPanel, type PropTab, type PropCallbacks } from './properties/index';
import type { CameraPreset } from '../render/camera';

export type PaneEditorType = 'simulation' | 'pattern' | 'material';

export interface WorkspacePane {
  id: string;
  type: PaneEditorType;
  element: HTMLElement;
  contentEl: HTMLElement;
}

export interface WorkspaceCallbacks extends PropCallbacks {
  onBack: () => void;
  onSave: () => void;
  onModeChange: (mode: AppMode) => void;
  onAvatarChange: (index: number) => void;
  onPaneTypeChange: (paneId: string, oldType: PaneEditorType, newType: PaneEditorType) => void;
  onPaneAdded: (pane: WorkspacePane) => void;
  onPaneRemoved: (paneId: string, type: PaneEditorType) => void;
}

export interface WorkspaceInstance {
  element: HTMLElement;
  getPanes: () => WorkspacePane[];
  addPane: (type: PaneEditorType, afterPaneId?: string) => WorkspacePane;
  removePane: (id: string) => void;
  getContentEl: (paneId: string) => HTMLElement | null;
  setMode: (mode: AppMode) => void;
  updateStatus: (fps: number, particles: number, subSteps: number, mode: AppMode) => void;
  updateOutliner: (state: AppState) => void;
  updateProperties: (state: AppState) => void;
  setPropertyColor: (hex: string) => void;
  setActivePropertyTab: (tab: PropTab) => void;
  destroy: () => void;
}

interface WorkspaceState {
  centerEl: HTMLElement;
  panes: WorkspacePane[];
  callbacks: WorkspaceCallbacks;
}

const EDITOR_LABELS: Record<PaneEditorType, string> = {
  simulation: '3D Simulation',
  pattern: 'Pattern Editor',
  material: 'Material Editor',
};

let _uid = 0;

function updateSelectOptions(state: WorkspaceState): void {
  const simExists = state.panes.some(p => p.type === 'simulation');
  for (const pane of state.panes) {
    const select = pane.element.querySelector('.ws-type-select') as HTMLSelectElement | null;
    if (!select) continue;
    for (const opt of Array.from(select.options)) {
      if (opt.value === 'simulation' && pane.type !== 'simulation') {
        opt.disabled = simExists;
      } else {
        opt.disabled = false;
      }
    }
  }
}

function rebuildCenter(state: WorkspaceState): void {
  state.centerEl.innerHTML = '';
  state.panes.forEach((pane, idx) => {
    if (idx > 0) state.centerEl.appendChild(buildDivider(state, idx - 1));
    state.centerEl.appendChild(pane.element);
  });
  const canClose = state.panes.length > 1;
  for (const pane of state.panes) {
    const btn = pane.element.querySelector('.ws-close-btn') as HTMLElement | null;
    if (btn) btn.style.display = canClose ? '' : 'none';
  }
  updateSelectOptions(state);
}

function buildDivider(state: WorkspaceState, leftIdx: number): HTMLElement {
  const div = document.createElement('div');
  div.className = 'ws-divider';
  div.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    div.classList.add('dragging');
    const leftPane = state.panes[leftIdx];
    const rightPane = state.panes[leftIdx + 1];
    const startX = e.clientX;
    const startL = leftPane.element.getBoundingClientRect().width;
    const startR = rightPane.element.getBoundingClientRect().width;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const total = startL + startR;
      const newL = Math.max(200, Math.min(startL + dx, total - 200));
      leftPane.element.style.flex = 'none';
      leftPane.element.style.width = `${newL}px`;
      rightPane.element.style.flex = '1';
      rightPane.element.style.width = '';
    };
    const onUp = () => {
      div.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  return div;
}

function createPaneEl(state: WorkspaceState, id: string, type: PaneEditorType): WorkspacePane {
  const element = document.createElement('div');
  element.className = 'ws-pane';
  element.dataset.paneId = id;

  const header = document.createElement('div');
  header.className = 'ws-pane-header';

  const select = document.createElement('select');
  select.className = 'ws-type-select';
  for (const [val, label] of Object.entries(EDITOR_LABELS) as [PaneEditorType, string][]) {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (val === type) opt.selected = true;
    select.appendChild(opt);
  }

  const splitBtn = document.createElement('button');
  splitBtn.className = 'ws-split-btn';
  splitBtn.title = 'Split Pane';
  splitBtn.textContent = '⊞';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ws-close-btn';
  closeBtn.title = 'Close Pane';
  closeBtn.textContent = '×';

  header.appendChild(select);
  header.appendChild(splitBtn);
  header.appendChild(closeBtn);

  const contentEl = document.createElement('div');
  contentEl.className = 'ws-pane-content';

  element.appendChild(header);
  element.appendChild(contentEl);

  const pane: WorkspacePane = { id, type, element, contentEl };

  select.addEventListener('change', () => {
    const oldType = pane.type;
    const newType = select.value as PaneEditorType;
    if (oldType === newType) return;

    // Singleton simulation: swap types if one already exists
    if (newType === 'simulation') {
      const simPane = state.panes.find(p => p.type === 'simulation' && p.id !== pane.id);
      if (simPane) {
        const simSelect = simPane.element.querySelector('.ws-type-select') as HTMLSelectElement | null;
        simPane.type = oldType;
        if (simSelect) simSelect.value = oldType;
        state.callbacks.onPaneTypeChange(simPane.id, 'simulation', oldType);
      }
    }

    pane.type = newType;
    updateSelectOptions(state);
    state.callbacks.onPaneTypeChange(pane.id, oldType, newType);
  });

  splitBtn.addEventListener('click', () => {
    const existingTypes = new Set(state.panes.map(p => p.type));
    const defaultType: PaneEditorType =
      !existingTypes.has('pattern')  ? 'pattern'  :
      !existingTypes.has('material') ? 'material' : 'pattern';
    const newPane = addPaneToState(state, defaultType, pane.id);
    state.callbacks.onPaneAdded(newPane);
  });

  closeBtn.addEventListener('click', () => {
    const removedType = pane.type;
    const removedId = pane.id;
    removePaneById(state, removedId);
    state.callbacks.onPaneRemoved(removedId, removedType);
  });

  return pane;
}

function addPaneToState(state: WorkspaceState, type: PaneEditorType, afterId?: string): WorkspacePane {
  const id = `pane-${++_uid}`;
  const pane = createPaneEl(state, id, type);
  if (afterId) {
    const idx = state.panes.findIndex(p => p.id === afterId);
    state.panes.splice(idx + 1, 0, pane);
  } else {
    state.panes.push(pane);
  }
  rebuildCenter(state);
  return pane;
}

function removePaneById(state: WorkspaceState, id: string): void {
  if (state.panes.length <= 1) return;
  const idx = state.panes.findIndex(p => p.id === id);
  if (idx < 0) return;
  state.panes.splice(idx, 1);
  rebuildCenter(state);
}

export function createWorkspace(
  projectName: string,
  initialPaneTypes: PaneEditorType[],
  callbacks: WorkspaceCallbacks,
): WorkspaceInstance {
  const element = document.createElement('div');
  element.className = 'workspace-root';

  // ── App header ──────────────────────────────────────────────────────────────
  const appHeader = createHeader(projectName, 'simulate', {
    onBack: callbacks.onBack,
    onSave: callbacks.onSave,
    onModeChange: callbacks.onModeChange,
  });
  element.appendChild(appHeader.element);

  // ── Main area (outliner + center + properties) ───────────────────────────────
  const mainEl = document.createElement('div');
  mainEl.className = 'ws-main';

  // Outliner (left)
  const outliner = createOutliner({
    onAvatarChange: callbacks.onAvatarChange,
    onGarmentSelect: (id) => callbacks.onPatternChange(id),
  });
  mainEl.appendChild(outliner.element);

  // Center split panes
  const centerEl = document.createElement('div');
  centerEl.className = 'ws-center';
  mainEl.appendChild(centerEl);

  // Properties N-panel (right)
  const propCallbacks: PropCallbacks = {
    onAvatarChange:    callbacks.onAvatarChange,
    onPatternChange:   callbacks.onPatternChange,
    onCubemapChange:   callbacks.onCubemapChange,
    onSizeChange:      callbacks.onSizeChange,
    onMaterialChange:  callbacks.onMaterialChange,
    onColorChange:     callbacks.onColorChange,
    onTextureLoad:     callbacks.onTextureLoad,
    onClearTexture:    callbacks.onClearTexture,
    onFreezeToggle:    callbacks.onFreezeToggle,
    onWindChange:      callbacks.onWindChange,
    onQualityChange:   callbacks.onQualityChange,
    onResetCloth:      callbacks.onResetCloth,
    onCameraPreset:    callbacks.onCameraPreset,
    onOrthoToggle:     callbacks.onOrthoToggle,
    onTurntableToggle: callbacks.onTurntableToggle,
    onExportOBJ:       callbacks.onExportOBJ,
  };
  const propsPanel = createPropertiesPanel(propCallbacks);
  mainEl.appendChild(propsPanel.element);

  element.appendChild(mainEl);

  // ── Status bar ───────────────────────────────────────────────────────────────
  const statusBar = createStatusBar();
  element.appendChild(statusBar.element);

  // ── N-key toggles properties panel ──────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'n' || e.key === 'N') {
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT')) return;
      propsPanel.element.classList.toggle('collapsed');
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // ── Pane state ───────────────────────────────────────────────────────────────
  const state: WorkspaceState = { centerEl, panes: [], callbacks };

  const types = initialPaneTypes.length ? initialPaneTypes : (['simulation'] as PaneEditorType[]);
  for (const t of types) {
    const id = `pane-${++_uid}`;
    const pane = createPaneEl(state, id, t);
    state.panes.push(pane);
  }
  rebuildCenter(state);

  return {
    element,
    getPanes: () => [...state.panes],
    addPane: (type, afterId) => addPaneToState(state, type, afterId),
    removePane: (id) => removePaneById(state, id),
    getContentEl: (paneId) => state.panes.find(p => p.id === paneId)?.contentEl ?? null,
    setMode: (mode: AppMode) => { appHeader.setMode(mode); },
    updateStatus: (fps, particles, subSteps, mode) => { statusBar.update(fps, particles, subSteps, mode); },
    updateOutliner: (appState: AppState) => { outliner.update(appState); },
    updateProperties: (appState: AppState) => { propsPanel.update(appState); },
    setPropertyColor: (hex: string) => { propsPanel.setColor(hex); },
    setActivePropertyTab: (tab: PropTab) => { propsPanel.setActiveTab(tab); },
    destroy: () => {
      document.removeEventListener('keydown', onKeyDown);
      element.remove();
      state.panes.length = 0;
    },
  };
}
