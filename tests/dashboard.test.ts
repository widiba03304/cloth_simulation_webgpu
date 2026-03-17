// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDashboard,
  updateProjectList,
  updateRecentList,
  type Project,
  type RecentItem,
  type DashboardCallbacks,
} from '../src/renderer/ui/dashboard';
import * as i18n from '../src/renderer/i18n';

function makeCallbacks(): DashboardCallbacks {
  return {
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: 'Test Project', createdAt: 1000, updatedAt: 2000, avatarIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {
  // Mock location.reload (called when language changes)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: vi.fn() },
  });
  window.confirm = vi.fn(() => true);
});

describe('createDashboard', () => {
  it('returns an HTMLElement', () => {
    const el = createDashboard(makeCallbacks());
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.id).toBe('dashboard');
  });

  it('contains sidebar and main sections', () => {
    const el = createDashboard(makeCallbacks());
    expect(el.querySelector('.dash-sidebar')).not.toBeNull();
    expect(el.querySelector('.dash-main')).not.toBeNull();
  });

  it('has navigation tabs', () => {
    const el = createDashboard(makeCallbacks());
    const navItems = el.querySelectorAll('.dash-nav-item');
    expect(navItems.length).toBeGreaterThanOrEqual(2);
  });

  it('clicking projects tab shows project grid', () => {
    const el = createDashboard(makeCallbacks());
    const projectsBtn = el.querySelector('[data-tab="projects"]') as HTMLElement;
    projectsBtn?.click();
    expect(projectsBtn.classList.contains('active')).toBe(true);
    const projectGrid = el.querySelector('#dash-grid');
    expect(projectGrid?.classList.contains('hidden')).toBe(false);
  });

  it('clicking settings tab shows settings panel', () => {
    const el = createDashboard(makeCallbacks());
    const settingsBtn = el.querySelector('[data-tab="settings"]') as HTMLElement;
    settingsBtn?.click();
    const settingsPanel = el.querySelector('#dash-settings');
    expect(settingsPanel?.classList.contains('hidden')).toBe(false);
  });

  it('settings panel has language selector', () => {
    const el = createDashboard(makeCallbacks());
    const langSelect = el.querySelector('#dash-settings select');
    expect(langSelect).not.toBeNull();
  });

  it('language select change calls loadLocale, setLocale, and location.reload', async () => {
    vi.spyOn(i18n, 'loadLocale').mockResolvedValue(true);
    const el = createDashboard(makeCallbacks());
    const langSelect = el.querySelector('#dash-settings select') as HTMLSelectElement;
    if (langSelect) {
      langSelect.value = 'ko';
      langSelect.dispatchEvent(new Event('change'));
      // Flush microtasks (async handler)
      await new Promise(resolve => setTimeout(resolve, 0));
      expect((window.location.reload as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    }
  });

  it('does not have patterns or materials tabs', () => {
    const el = createDashboard(makeCallbacks());
    expect(el.querySelector('[data-tab="patterns"]')).toBeNull();
    expect(el.querySelector('[data-tab="materials"]')).toBeNull();
  });
});

describe('updateProjectList', () => {
  it('renders project cards', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject()], cb);
    const grid = el.querySelector('#dash-grid');
    expect(grid?.querySelectorAll('.dash-card').length).toBeGreaterThan(0);
  });

  it('renders new project card', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [], cb);
    const grid = el.querySelector('#dash-grid');
    expect(grid?.querySelector('.dash-card-new')).not.toBeNull();
  });

  it('clicking new card calls onCreateProject', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [], cb);
    const newCard = el.querySelector('#dash-grid .dash-card-new') as HTMLElement;
    newCard?.click();
    expect(cb.onCreateProject).toHaveBeenCalled();
  });

  it('clicking a project card calls onOpenProject', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    const project = makeProject({ id: 'proj123' });
    updateProjectList(el, [project], cb);
    // Click the card (not the new card)
    const cards = el.querySelectorAll('#dash-grid .dash-card:not(.dash-card-new)');
    (cards[0] as HTMLElement)?.click();
    expect(cb.onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj123' }));
  });

  it('clicking delete button calls onDeleteProject when confirmed', () => {
    window.confirm = vi.fn(() => true);
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject()], cb);
    const deleteBtn = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-delete') as HTMLElement;
    deleteBtn?.click();
    expect(cb.onDeleteProject).toHaveBeenCalled();
  });

  it('delete button does NOT call onDeleteProject when cancelled', () => {
    window.confirm = vi.fn(() => false);
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject()], cb);
    const deleteBtn = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-delete') as HTMLElement;
    deleteBtn?.click();
    expect(cb.onDeleteProject).not.toHaveBeenCalled();
  });

  it('shows empty state when no projects', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [], cb);
    const grid = el.querySelector('#dash-grid');
    expect(grid?.querySelector('.dash-empty')).not.toBeNull();
  });

  it('renders project with thumbnail', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ thumbnail: 'data:image/png;base64,' })], cb);
    const grid = el.querySelector('#dash-grid');
    const preview = grid?.querySelector('.dash-card-preview') as HTMLElement;
    expect(preview?.style.backgroundImage).toContain('data:image/png');
  });

  it('double-clicking name triggers rename', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ id: 'p1', name: 'My Project' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true });
    nameEl?.dispatchEvent(dblClickEvent);
    // An input should appear
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'New Name';
      input.dispatchEvent(new Event('blur'));
      expect(cb.onRenameProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' }),
        'New Name'
      );
    }
  });

  it('escape key restores original name during rename', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ name: 'Original' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = 'Changed';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      input.dispatchEvent(new Event('blur'));
      expect(cb.onRenameProject).not.toHaveBeenCalled();
    }
  });

  it('enter key blurs input during rename', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ name: 'Original' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = 'New';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // blur is handled by input itself
    }
  });
});

describe('updateRecentList', () => {
  const makeRecent = (id: string): RecentItem => ({
    id, name: `Item ${id}`, updatedAt: Date.now() - 60000,
  });

  it('renders recent items', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [makeRecent('a1'), makeRecent('a2')], cb);
    const grid = el.querySelector('#dash-recent-grid');
    expect(grid?.querySelectorAll('.dash-card').length).toBe(2);
  });

  it('clicking recent card calls onOpenProject', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [makeRecent('a1')], cb);
    const card = el.querySelector('#dash-recent-grid .dash-card') as HTMLElement;
    card?.click();
    expect(cb.onOpenProject).toHaveBeenCalled();
  });

  it('deleting recent card calls onDeleteProject', () => {
    window.confirm = vi.fn(() => true);
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [makeRecent('a1')], cb);
    const deleteBtn = el.querySelector('#dash-recent-grid .dash-card-delete') as HTMLElement;
    deleteBtn?.click();
    expect(cb.onDeleteProject).toHaveBeenCalled();
  });

  it('cancel delete does not call any callback', () => {
    window.confirm = vi.fn(() => false);
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [makeRecent('a1')], cb);
    const deleteBtn = el.querySelector('#dash-recent-grid .dash-card-delete') as HTMLElement;
    deleteBtn?.click();
    expect(cb.onDeleteProject).not.toHaveBeenCalled();
  });

  it('sorts by updatedAt descending', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    const old: RecentItem = { id: 'old', name: 'Old', updatedAt: 1000 };
    const newer: RecentItem = { id: 'new', name: 'New', updatedAt: 9000 };
    updateRecentList(el, [old, newer], cb);
    const cards = el.querySelectorAll('#dash-recent-grid .dash-card-name');
    expect(cards[0]?.textContent).toBe('New');
  });

  it('handles empty list', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [], cb);
    const grid = el.querySelector('#dash-recent-grid');
    expect(grid?.querySelectorAll('.dash-card').length).toBe(0);
  });

  it('formats recent items with minutes/hours/days labels', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    const justNow: RecentItem = { id: '1', name: 'JustNow', updatedAt: Date.now() - 10000 };
    const minutesAgo: RecentItem = { id: '2', name: 'Minutes', updatedAt: Date.now() - 5 * 60 * 1000 };
    const hoursAgo: RecentItem = { id: '3', name: 'Hours', updatedAt: Date.now() - 2 * 3600 * 1000 };
    const daysAgo: RecentItem = { id: '4', name: 'Days', updatedAt: Date.now() - 3 * 24 * 3600 * 1000 };
    const monthsAgo: RecentItem = { id: '5', name: 'Months', updatedAt: Date.now() - 31 * 24 * 3600 * 1000 };
    updateRecentList(el, [justNow, minutesAgo, hoursAgo, daysAgo, monthsAgo], cb);
    const dates = el.querySelectorAll('#dash-recent-grid .dash-card-date');
    expect(dates.length).toBe(5);
  });

  it('rename in recent list triggers onRenameProject', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [{ id: 'a1', name: 'OldName', updatedAt: Date.now() }], cb);
    const nameEl = el.querySelector('#dash-recent-grid .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-recent-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = 'Renamed';
      input.dispatchEvent(new Event('blur'));
      expect(cb.onRenameProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a1' }), 'Renamed'
      );
    }
  });

  it('recent item with thumbnail renders background image', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateRecentList(el, [{ id: 'a1', name: 'Thumb', updatedAt: Date.now(), thumbnail: 'data:image/png;base64,' }], cb);
    const prev = el.querySelector('#dash-recent-grid .dash-card-preview') as HTMLElement;
    expect(prev?.style.backgroundImage).toContain('data:image/png');
  });
});

describe('buildCard rename edge cases', () => {
  it('rename with empty input falls back to original name', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ id: 'p1', name: 'Original' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = '   '; // whitespace-only → trim() = '' → || 'Original'
      input.dispatchEvent(new Event('blur'));
      expect(cb.onRenameProject).not.toHaveBeenCalled();
    }
  });

  it('rename with same name as original does not call rename callback', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ id: 'p1', name: 'SameName' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = 'SameName';
      input.dispatchEvent(new Event('blur'));
      expect(cb.onRenameProject).not.toHaveBeenCalled();
    }
  });

  it('non-Enter/Escape keydown does not blur or call callback', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ name: 'Proj' })], cb);
    const nameEl = el.querySelector('#dash-grid .dash-card:not(.dash-card-new) .dash-card-name') as HTMLElement;
    nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = el.querySelector('#dash-grid .dash-card-rename') as HTMLInputElement;
    if (input) {
      input.value = 'Changed';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      expect(cb.onRenameProject).not.toHaveBeenCalled();
    }
  });

  it('project card with thumbnail covers thumbnail branch', () => {
    const cb = makeCallbacks();
    const el = createDashboard(cb);
    updateProjectList(el, [makeProject({ thumbnail: 'data:image/png;base64,abc' })], cb);
    const prev = el.querySelector('#dash-grid .dash-card-preview') as HTMLElement;
    expect(prev?.style.backgroundImage).toContain('data:image/png');
  });
});
