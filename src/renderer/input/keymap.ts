/**
 * Camera keymap: map mouse/wheel/key to orbit, pan, zoom, roll.
 * Blender-style default: MMB = orbit, Shift+MMB = pan, Wheel = zoom.
 * On Mac (no middle mouse): Alt+LMB = orbit, Shift+Alt+LMB = pan.
 */

export type CameraAction = 'orbit' | 'pan' | 'zoom' | 'roll_left' | 'roll_right';

export interface Modifiers {
  alt?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean; // Cmd on Mac, Win key on Windows
}

export interface MouseBinding {
  button: 0 | 1 | 2; // 0=left, 1=middle, 2=right
  modifiers: Modifiers;
}

export interface WheelBinding {
  modifiers: Modifiers;
}

export interface KeyBinding {
  key: string; // e.g. "Numpad4", "KeyQ"
  modifiers: Modifiers;
}

export interface CameraKeymap {
  orbit: MouseBinding;
  pan: MouseBinding;
  zoom: WheelBinding;
  rollLeft?: KeyBinding;
  rollRight?: KeyBinding;
}

function modsMatch(a: Modifiers, b: Modifiers): boolean {
  return !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.ctrl === !!b.ctrl && !!a.meta === !!b.meta;
}

/** Blender-style: MMB orbit, Shift+MMB pan. For PC / external mouse. */
export const DEFAULT_KEYMAP: CameraKeymap = {
  orbit: { button: 1, modifiers: {} },           // MMB
  pan: { button: 1, modifiers: { shift: true } }, // Shift+MMB
  zoom: { modifiers: {} },                        // Wheel
  rollLeft: { key: 'Numpad4', modifiers: { shift: true } },
  rollRight: { key: 'Numpad6', modifiers: { shift: true } },
};

/** Mac-friendly: Blender-style. Cmd+LMB = orbit, Shift+Cmd+LMB = pan. */
export const DEFAULT_KEYMAP_MAC: CameraKeymap = {
  orbit: { button: 0, modifiers: { meta: true } },           // Cmd+LMB
  pan: { button: 0, modifiers: { meta: true, shift: true } }, // Shift+Cmd+LMB
  zoom: { modifiers: {} },
  rollLeft: { key: 'Numpad4', modifiers: { shift: true } },
  rollRight: { key: 'Numpad6', modifiers: { shift: true } },
};

export function getDefaultKeymap(): CameraKeymap {
  return isMac() ? { ...DEFAULT_KEYMAP_MAC } : { ...DEFAULT_KEYMAP };
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
}

export function getModifiersFromEvent(e: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Modifiers {
  return {
    alt: e.altKey,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
  };
}

export function resolveMouseAction(
  button: number,
  modifiers: Modifiers,
  keymap: CameraKeymap
): CameraAction | null {
  if (button !== 0 && button !== 1 && button !== 2) return null;
  const b = button as 0 | 1 | 2;
  // Check pan first (more specific: Shift+Cmd+LMB)
  if (modsMatch(modifiers, keymap.pan.modifiers) && keymap.pan.button === b) return 'pan';
  // Then check orbit (Cmd+LMB)
  if (modsMatch(modifiers, keymap.orbit.modifiers) && keymap.orbit.button === b) return 'orbit';
  // Fallback: plain left-button drag = orbit (helps on trackpads / unusual mice)
  if (
    b === 0 &&
    !modifiers.alt &&
    !modifiers.shift &&
    !modifiers.ctrl &&
    !modifiers.meta
  ) {
    return 'orbit';
  }
  return null;
}

export function resolveWheelAction(modifiers: Modifiers, keymap: CameraKeymap): CameraAction | null {
  if (modsMatch(modifiers, keymap.zoom.modifiers)) return 'zoom';
  return null;
}

export function resolveKeyAction(key: string, modifiers: Modifiers, keymap: CameraKeymap): CameraAction | null {
  if (keymap.rollLeft && keymap.rollLeft.key === key && modsMatch(modifiers, keymap.rollLeft.modifiers))
    return 'roll_left';
  if (keymap.rollRight && keymap.rollRight.key === key && modsMatch(modifiers, keymap.rollRight.modifiers))
    return 'roll_right';
  return null;
}

const STORAGE_KEY = 'cloth-camera-keymap';

/** Old Mac preset used Alt+LMB or RMB. Migrate to Cmd+LMB (Blender-style). */
function isOldMacKeymap(parsed: Partial<CameraKeymap>): boolean {
  const o = parsed.orbit;
  const p = parsed.pan;
  if (!isMac()) return false;

  // Old Alt+LMB style
  const isOldAltStyle = (
    !!o && o.button === 0 && !!o.modifiers?.alt && !o.modifiers?.shift &&
    !!p && p.button === 0 && !!p.modifiers?.alt && !!p.modifiers?.shift
  );

  // Old RMB style (previous default)
  const isOldRmbStyle = (
    !!o && o.button === 2 && !o.modifiers?.meta &&
    !!p && p.button === 2 && !!p.modifiers?.shift && !p.modifiers?.meta
  );

  return isOldAltStyle || isOldRmbStyle;
}

export function loadKeymap(): CameraKeymap {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const fallback = getDefaultKeymap();
    if (!s) return fallback;
    const parsed = JSON.parse(s) as Partial<CameraKeymap>;
    if (isOldMacKeymap(parsed)) {
      const migrated = { ...DEFAULT_KEYMAP_MAC };
      saveKeymap(migrated);
      return migrated;
    }
    return {
      orbit: parsed.orbit ?? fallback.orbit,
      pan: parsed.pan ?? fallback.pan,
      zoom: parsed.zoom ?? fallback.zoom,
      rollLeft: parsed.rollLeft ?? fallback.rollLeft,
      rollRight: parsed.rollRight ?? fallback.rollRight,
    };
  } catch {
    return getDefaultKeymap();
  }
}

export function saveKeymap(keymap: CameraKeymap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keymap));
}

export function isDefaultKeymap(km: CameraKeymap): boolean {
  return (
    JSON.stringify(km) === JSON.stringify(DEFAULT_KEYMAP) ||
    JSON.stringify(km) === JSON.stringify(DEFAULT_KEYMAP_MAC)
  );
}

/** For UI: i18n key ids for modifier and button so UI can t() them. */
export function formatMouseBinding(b: MouseBinding): { modKeys: string[]; buttonKey: string } {
  const modKeys: string[] = [];
  if (b.modifiers.meta) modKeys.push('keymap.modifierMeta');
  if (b.modifiers.alt) modKeys.push('keymap.modifierAlt');
  if (b.modifiers.shift) modKeys.push('keymap.modifierShift');
  if (b.modifiers.ctrl) modKeys.push('keymap.modifierCtrl');
  const buttonKey =
    b.button === 0 ? 'keymap.bindingLeftMouse' : b.button === 1 ? 'keymap.bindingMiddleMouse' : 'keymap.bindingRightMouse';
  return { modKeys, buttonKey };
}

export function formatWheelBinding(b: WheelBinding): { modKeys: string[] } {
  const modKeys: string[] = [];
  if (b.modifiers.meta) modKeys.push('keymap.modifierMeta');
  if (b.modifiers.alt) modKeys.push('keymap.modifierAlt');
  if (b.modifiers.shift) modKeys.push('keymap.modifierShift');
  if (b.modifiers.ctrl) modKeys.push('keymap.modifierCtrl');
  return { modKeys };
}

export function formatKeyBinding(b: KeyBinding): { modKeys: string[]; key: string } {
  const modKeys: string[] = [];
  if (b.modifiers.meta) modKeys.push('keymap.modifierMeta');
  if (b.modifiers.alt) modKeys.push('keymap.modifierAlt');
  if (b.modifiers.shift) modKeys.push('keymap.modifierShift');
  if (b.modifiers.ctrl) modKeys.push('keymap.modifierCtrl');
  return { modKeys, key: b.key };
}
