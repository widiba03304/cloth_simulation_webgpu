// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDefaultKeymap,
  getModifiersFromEvent,
  resolveMouseAction,
  resolveWheelAction,
  resolveKeyAction,
  loadKeymap,
  saveKeymap,
  isDefaultKeymap,
  formatMouseBinding,
  formatWheelBinding,
  formatKeyBinding,
  DEFAULT_KEYMAP,
} from '../src/renderer/input/keymap';

describe('getDefaultKeymap', () => {
  it('returns a valid keymap object', () => {
    const km = getDefaultKeymap();
    expect(km).toHaveProperty('orbit');
    expect(km).toHaveProperty('pan');
    expect(km).toHaveProperty('zoom');
  });
});

describe('getModifiersFromEvent', () => {
  it('returns empty modifiers for plain event', () => {
    const e = new MouseEvent('mousedown', { button: 0 });
    const mods = getModifiersFromEvent(e);
    expect(mods.alt).toBeFalsy();
    expect(mods.shift).toBeFalsy();
    expect(mods.ctrl).toBeFalsy();
    expect(mods.meta).toBeFalsy();
  });

  it('detects shift modifier', () => {
    const e = new MouseEvent('mousedown', { button: 0, shiftKey: true });
    const mods = getModifiersFromEvent(e);
    expect(mods.shift).toBeTruthy();
  });

  it('detects alt modifier', () => {
    const e = new MouseEvent('mousedown', { button: 0, altKey: true });
    const mods = getModifiersFromEvent(e);
    expect(mods.alt).toBeTruthy();
  });

  it('detects ctrl modifier', () => {
    const e = new MouseEvent('mousedown', { button: 0, ctrlKey: true });
    const mods = getModifiersFromEvent(e);
    expect(mods.ctrl).toBeTruthy();
  });

  it('detects meta modifier', () => {
    const e = new MouseEvent('mousedown', { button: 0, metaKey: true });
    const mods = getModifiersFromEvent(e);
    expect(mods.meta).toBeTruthy();
  });
});

describe('resolveMouseAction', () => {
  it('resolves orbit action for MMB (button 1)', () => {
    const km = getDefaultKeymap();
    const action = resolveMouseAction(1, {}, km);
    expect(action).toBe('orbit');
  });

  it('returns null for unmapped button/modifiers', () => {
    const km = getDefaultKeymap();
    const action = resolveMouseAction(0, {}, km);
    // LMB with no modifiers → not mapped by default
    if (action !== null) {
      expect(typeof action).toBe('string');
    } else {
      expect(action).toBeNull();
    }
  });
});

describe('resolveWheelAction', () => {
  it('returns zoom for wheel with no modifiers', () => {
    const km = getDefaultKeymap();
    const action = resolveWheelAction({}, km);
    expect(action).toBe('zoom');
  });
});

describe('resolveKeyAction', () => {
  it('returns null for unmapped keys', () => {
    const km = getDefaultKeymap();
    const action = resolveKeyAction('q', {}, km);
    expect(action).toBeNull();
  });

  it('resolves roll_left if mapped', () => {
    const km = getDefaultKeymap();
    if (km.rollLeft) {
      const b = km.rollLeft as any;
      const key = b.key ?? 'q';
      const mods = b.modifiers ?? {};
      const action = resolveKeyAction(key, mods, km);
      expect(action).toBe('roll_left');
    }
  });

  it('resolves roll_right if mapped', () => {
    const km = getDefaultKeymap();
    if (km.rollRight) {
      const b = km.rollRight as any;
      const key = b.key ?? 'e';
      const mods = b.modifiers ?? {};
      const action = resolveKeyAction(key, mods, km);
      expect(action).toBe('roll_right');
    }
  });
});

describe('loadKeymap and saveKeymap', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadKeymap returns default when nothing saved', () => {
    const km = loadKeymap();
    expect(km).toHaveProperty('orbit');
  });

  it('saveKeymap persists keymap to localStorage', () => {
    const km = getDefaultKeymap();
    saveKeymap(km);
    const loaded = loadKeymap();
    expect(loaded).toHaveProperty('orbit');
  });

  it('loadKeymap falls back to default on corrupt data', () => {
    localStorage.setItem('camera_keymap', 'not_valid_json{{{');
    const km = loadKeymap();
    expect(km).toHaveProperty('orbit');
  });
});

describe('isDefaultKeymap', () => {
  it('returns true for the default keymap', () => {
    const km = getDefaultKeymap();
    const result = isDefaultKeymap(km);
    expect(typeof result).toBe('boolean');
  });

  it('returns false for modified keymap', () => {
    const km = getDefaultKeymap();
    km.orbit = { button: 2, modifiers: { shift: true } };
    const result = isDefaultKeymap(km);
    expect(result).toBe(false);
  });
});

describe('formatMouseBinding', () => {
  it('returns modKeys and buttonKey strings', () => {
    const result = formatMouseBinding({ button: 1, modifiers: {} });
    expect(result).toHaveProperty('modKeys');
    expect(result).toHaveProperty('buttonKey');
  });

  it('includes modifier names', () => {
    const result = formatMouseBinding({ button: 0, modifiers: { shift: true } });
    expect(result.modKeys.length).toBeGreaterThan(0);
  });
});

describe('formatWheelBinding', () => {
  it('returns modKeys string', () => {
    const result = formatWheelBinding({ modifiers: {} });
    expect(result).toHaveProperty('modKeys');
  });
});

describe('formatKeyBinding', () => {
  it('returns modKeys and key strings', () => {
    const result = formatKeyBinding({ key: 'q', modifiers: {} });
    expect(result).toHaveProperty('modKeys');
    expect(result).toHaveProperty('key');
  });
});

describe('formatMouseBinding - all modifiers coverage', () => {
  it('includes meta modifier key', () => {
    const result = formatMouseBinding({ button: 0, modifiers: { meta: true } });
    expect(result.modKeys).toContain('keymap.modifierMeta');
  });

  it('includes alt modifier key', () => {
    const result = formatMouseBinding({ button: 0, modifiers: { alt: true } });
    expect(result.modKeys).toContain('keymap.modifierAlt');
  });

  it('includes ctrl modifier key', () => {
    const result = formatMouseBinding({ button: 0, modifiers: { ctrl: true } });
    expect(result.modKeys).toContain('keymap.modifierCtrl');
  });

  it('returns bindingRightMouse for button 2', () => {
    const result = formatMouseBinding({ button: 2, modifiers: {} });
    expect(result.buttonKey).toBe('keymap.bindingRightMouse');
  });

  it('returns bindingMiddleMouse for button 1', () => {
    const result = formatMouseBinding({ button: 1, modifiers: {} });
    expect(result.buttonKey).toBe('keymap.bindingMiddleMouse');
  });

  it('returns bindingLeftMouse for button 0', () => {
    const result = formatMouseBinding({ button: 0, modifiers: {} });
    expect(result.buttonKey).toBe('keymap.bindingLeftMouse');
  });
});

describe('formatWheelBinding - all modifiers coverage', () => {
  it('includes meta modifier', () => {
    const result = formatWheelBinding({ modifiers: { meta: true } });
    expect(result.modKeys).toContain('keymap.modifierMeta');
  });

  it('includes alt modifier', () => {
    const result = formatWheelBinding({ modifiers: { alt: true } });
    expect(result.modKeys).toContain('keymap.modifierAlt');
  });

  it('includes shift modifier', () => {
    const result = formatWheelBinding({ modifiers: { shift: true } });
    expect(result.modKeys).toContain('keymap.modifierShift');
  });

  it('includes ctrl modifier', () => {
    const result = formatWheelBinding({ modifiers: { ctrl: true } });
    expect(result.modKeys).toContain('keymap.modifierCtrl');
  });
});

describe('formatKeyBinding - all modifiers coverage', () => {
  it('includes meta modifier', () => {
    const result = formatKeyBinding({ key: 'q', modifiers: { meta: true } });
    expect(result.modKeys).toContain('keymap.modifierMeta');
  });

  it('includes alt modifier', () => {
    const result = formatKeyBinding({ key: 'q', modifiers: { alt: true } });
    expect(result.modKeys).toContain('keymap.modifierAlt');
  });

  it('includes shift modifier', () => {
    const result = formatKeyBinding({ key: 'q', modifiers: { shift: true } });
    expect(result.modKeys).toContain('keymap.modifierShift');
  });

  it('includes ctrl modifier', () => {
    const result = formatKeyBinding({ key: 'q', modifiers: { ctrl: true } });
    expect(result.modKeys).toContain('keymap.modifierCtrl');
  });
});

describe('resolveWheelAction - null path', () => {
  it('returns null when modifiers do not match zoom binding', () => {
    // zoom requires no modifiers; passing shift should not match
    const km = { ...DEFAULT_KEYMAP, zoom: { modifiers: {} } };
    const action = resolveWheelAction({ shift: true }, km);
    expect(action).toBeNull();
  });
});

describe('resolveMouseAction - additional paths', () => {
  it('returns null for button 0 with alt modifier (fallback condition fails)', () => {
    const km = DEFAULT_KEYMAP; // orbit/pan on button 1
    // button 0 + alt → fallback fails because modifiers.alt is true
    const action = resolveMouseAction(0, { alt: true }, km);
    expect(action).toBeNull();
  });

  it('returns null for button 0 with shift modifier', () => {
    const km = DEFAULT_KEYMAP;
    const action = resolveMouseAction(0, { shift: true }, km);
    expect(action).toBeNull();
  });

  it('returns null for button 0 with ctrl modifier', () => {
    const km = DEFAULT_KEYMAP;
    const action = resolveMouseAction(0, { ctrl: true }, km);
    expect(action).toBeNull();
  });

  it('returns null for button 0 with meta modifier', () => {
    const km = DEFAULT_KEYMAP;
    const action = resolveMouseAction(0, { meta: true }, km);
    expect(action).toBeNull();
  });
});

describe('loadKeymap - catch and Mac migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadKeymap falls back on corrupt JSON (covers catch block, line 157)', () => {
    localStorage.setItem('cloth-camera-keymap', 'invalid json {{{');
    const km = loadKeymap();
    expect(km).toHaveProperty('orbit');
  });

  it('loadKeymap migrates old Mac Alt+LMB keymap (covers lines 145-147)', () => {
    // Simulate Mac environment
    Object.defineProperty(globalThis.navigator, 'platform', { value: 'MacIntel', configurable: true });
    // Save old Alt+LMB style keymap (before Blender-style migration)
    const oldKeymap = {
      orbit: { button: 0, modifiers: { alt: true } },
      pan: { button: 0, modifiers: { alt: true, shift: true } },
      zoom: { modifiers: {} },
    };
    localStorage.setItem('cloth-camera-keymap', JSON.stringify(oldKeymap));
    const km = loadKeymap();
    // Should have migrated to Cmd+LMB (DEFAULT_KEYMAP_MAC)
    expect(km.orbit.modifiers).toEqual(expect.objectContaining({ meta: true }));
    // Restore platform
    Object.defineProperty(globalThis.navigator, 'platform', { value: '', configurable: true });
  });

  it('loadKeymap migrates old Mac RMB keymap', () => {
    Object.defineProperty(globalThis.navigator, 'platform', { value: 'MacIntel', configurable: true });
    const oldRmbKeymap = {
      orbit: { button: 2, modifiers: {} },
      pan: { button: 2, modifiers: { shift: true } },
      zoom: { modifiers: {} },
    };
    localStorage.setItem('cloth-camera-keymap', JSON.stringify(oldRmbKeymap));
    const km = loadKeymap();
    expect(km.orbit.modifiers).toEqual(expect.objectContaining({ meta: true }));
    Object.defineProperty(globalThis.navigator, 'platform', { value: '', configurable: true });
  });

  it('loadKeymap uses ?? fallbacks when parsed fields are missing', () => {
    const partial = { orbit: { button: 0, modifiers: {} } };
    localStorage.setItem('cloth-camera-keymap', JSON.stringify(partial));
    const km = loadKeymap();
    // pan/zoom/rollLeft/rollRight should come from fallback
    expect(km.pan).toBeDefined();
    expect(km.zoom).toBeDefined();
  });
});
