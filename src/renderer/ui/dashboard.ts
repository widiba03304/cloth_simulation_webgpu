/**
 * Dashboard UI: Figma-like landing page.
 * Sidebar with tabs (Recent, Projects, Settings) + content area.
 * Project CRUD only — patterns/materials are managed inside the workspace.
 */

import { t, getLocale, setLocale, loadLocale } from '../i18n';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  avatarIndex: number;
  patternId?: string;
  materialId?: string;
  thumbnail?: string;
}

export interface DashboardItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export interface DashboardCallbacks {
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onDeleteProject: (project: Project) => void;
  onRenameProject: (project: Project, newName: string) => void;
}

export function createDashboard(callbacks: DashboardCallbacks): HTMLElement {
  const root = document.createElement('div');
  root.id = 'dashboard';
  root.innerHTML = `
    <div class="dash-sidebar">
      <div class="dash-sidebar-logo">${t('dash.appName')}</div>
      <nav class="dash-sidebar-nav">
        <button class="dash-nav-item active" data-tab="recent">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><polyline points="8,4.5 8,8 10.5,9.5"/></svg>
          <span class="dash-nav-label">${t('dash.recent')}</span>
        </button>
        <button class="dash-nav-item" data-tab="projects">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 15c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/></svg>
          <span class="dash-nav-label">${t('dash.projects')}</span>
        </button>
      </nav>
      <div class="dash-sidebar-spacer"></div>
      <nav class="dash-sidebar-nav">
        <button class="dash-nav-item" data-tab="settings">
          <span style="font-size:16px;line-height:1">&#9881;</span>
          <span class="dash-nav-label">${t('dash.settings')}</span>
        </button>
      </nav>
    </div>
    <div class="dash-main">
      <div class="dash-topbar">
        <h1 class="dash-title">${t('dash.recent')}</h1>
      </div>
      <div class="dash-grid" id="dash-recent-grid"></div>
      <div class="dash-grid hidden" id="dash-grid"></div>
      <div class="dash-settings hidden" id="dash-settings"></div>
    </div>
  `;

  // Build settings panel
  const settingsPanel = root.querySelector('#dash-settings') as HTMLElement;
  const langLabel = document.createElement('label');
  langLabel.textContent = t('ui.language');
  langLabel.style.cssText = 'display:block;font-size:13px;color:#aaa;margin-bottom:6px;';
  const langSelect = document.createElement('select');
  langSelect.style.cssText = 'padding:6px 8px;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:13px;';
  const enOpt = document.createElement('option');
  enOpt.value = 'en'; enOpt.textContent = 'English';
  const koOpt = document.createElement('option');
  koOpt.value = 'ko'; koOpt.textContent = '한국어';
  langSelect.appendChild(enOpt);
  langSelect.appendChild(koOpt);
  langSelect.value = getLocale();
  langSelect.addEventListener('change', async () => {
    await loadLocale(langSelect.value);
    setLocale(langSelect.value);
    location.reload();
  });
  settingsPanel.appendChild(langLabel);
  settingsPanel.appendChild(langSelect);

  // Tab switching
  const navItems = root.querySelectorAll('.dash-nav-item');
  const title = root.querySelector('.dash-title') as HTMLElement;
  const recentGrid = root.querySelector('#dash-recent-grid') as HTMLElement;
  const projectGrid = root.querySelector('#dash-grid') as HTMLElement;

  const contentPanels: Record<string, HTMLElement> = {
    recent: recentGrid,
    projects: projectGrid,
    settings: settingsPanel,
  };

  const titleMap: Record<string, string> = {
    recent: t('dash.recent'),
    projects: t('dash.projects'),
    settings: t('dash.settings'),
  };

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab') ?? 'recent';
      title.textContent = titleMap[tab] ?? '';
      for (const panel of Object.values(contentPanels)) {
        panel.classList.add('hidden');
      }
      const activePanel = contentPanels[tab];
      if (activePanel) activePanel.classList.remove('hidden');
    });
  });

  return root;
}

// --- Project cards ---

export function updateProjectList(
  dashboard: HTMLElement,
  projects: Project[],
  callbacks: DashboardCallbacks
): void {
  const grid = dashboard.querySelector('#dash-grid') as HTMLElement;
  if (!grid) return;
  grid.innerHTML = '';

  const newCard = document.createElement('div');
  newCard.className = 'dash-card dash-card-new';
  newCard.innerHTML = `
    <div class="dash-card-plus">+</div>
    <div class="dash-card-label">${t('dash.newProject')}</div>
  `;
  newCard.addEventListener('click', () => callbacks.onCreateProject());
  grid.appendChild(newCard);

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  if (sorted.length === 0) {
    grid.appendChild(emptyState(t('dash.emptyProjects')));
  }
  for (const project of sorted) {
    const previewSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#666" stroke-width="1.5"><circle cx="24" cy="14" r="6"/><path d="M12 42c0-6.6 5.4-12 12-12s12 5.4 12 12"/></svg>`;
    const card = buildCard(
      project.name,
      previewSvg,
      project.updatedAt,
      () => callbacks.onOpenProject(project),
      () => {
        if (confirm(t('dash.deleteConfirm', { name: project.name }))) {
          callbacks.onDeleteProject(project);
        }
      },
      (newName) => callbacks.onRenameProject(project, newName),
      project.thumbnail,
    );
    grid.appendChild(card);
  }
}

// --- Recent (projects only) ---

export interface RecentItem {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
}

export function updateRecentList(
  dashboard: HTMLElement,
  items: RecentItem[],
  callbacks: DashboardCallbacks,
): void {
  const grid = dashboard.querySelector('#dash-recent-grid') as HTMLElement;
  if (!grid) return;
  grid.innerHTML = '';

  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);

  const previewSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#666" stroke-width="1.5"><circle cx="24" cy="14" r="6"/><path d="M12 42c0-6.6 5.4-12 12-12s12 5.4 12 12"/></svg>`;

  for (const item of sorted) {
    const onClick = () => {
      const proj = { id: item.id, name: item.name, updatedAt: item.updatedAt, createdAt: 0, avatarIndex: 0, thumbnail: item.thumbnail } as Project;
      callbacks.onOpenProject(proj);
    };

    const onDelete = () => {
      if (!confirm(t('dash.deleteConfirm', { name: item.name }))) return;
      callbacks.onDeleteProject({ id: item.id, name: item.name, createdAt: 0, updatedAt: item.updatedAt, avatarIndex: 0 });
    };

    const onRename = (newName: string) => {
      callbacks.onRenameProject({ id: item.id, name: item.name, createdAt: 0, updatedAt: item.updatedAt, avatarIndex: 0 }, newName);
    };

    const card = buildCard(
      item.name,
      previewSvg,
      item.updatedAt,
      onClick,
      onDelete,
      onRename,
      item.thumbnail,
    );

    grid.appendChild(card);
  }
}

function emptyState(message: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dash-empty';
  el.innerHTML = `<div class="dash-empty-text">${message}</div>`;
  return el;
}

// --- Shared card builder ---

function buildCard(
  name: string,
  previewHtml: string,
  updatedAt: number,
  onClick?: () => void,
  onDelete?: () => void,
  onRename?: (newName: string) => void,
  thumbnail?: string,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'dash-card';

  const preview = document.createElement('div');
  preview.className = 'dash-card-preview';
  if (thumbnail) {
    preview.style.backgroundImage = `url(${thumbnail})`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
  } else {
    preview.innerHTML = previewHtml;
  }

  const info = document.createElement('div');
  info.className = 'dash-card-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'dash-card-name';
  nameEl.textContent = name;

  if (onRename) {
    nameEl.title = t('dash.renameHint');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'dash-card-rename';
      input.value = name;
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        const newName = input.value.trim() || name;
        input.replaceWith(nameEl);
        if (newName !== name) {
          nameEl.textContent = newName;
          onRename(newName);
        }
      };
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = name; input.blur(); }
      });
    });
  }

  const dateEl = document.createElement('div');
  dateEl.className = 'dash-card-date';
  dateEl.textContent = formatRelativeDate(updatedAt);

  info.appendChild(nameEl);
  info.appendChild(dateEl);
  card.appendChild(preview);
  card.appendChild(info);

  if (onDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dash-card-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    card.appendChild(deleteBtn);
  }

  if (onClick) {
    card.addEventListener('click', onClick);
  }

  return card;
}

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('dash.justNow');
  if (mins < 60) return t('dash.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('dash.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('dash.daysAgo', { n: days });
  return new Date(ts).toLocaleDateString();
}
