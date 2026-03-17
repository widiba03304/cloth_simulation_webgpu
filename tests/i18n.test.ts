// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('i18n module', () => {
  beforeEach(() => {
    // Reset localStorage
    localStorage.clear();
    // Reset module cache
    vi.resetModules();
  });

  it('getLocale returns a string', async () => {
    const { getLocale } = await import('../src/renderer/i18n');
    expect(typeof getLocale()).toBe('string');
  });

  it('setLocale changes the current locale', async () => {
    const { setLocale, getLocale } = await import('../src/renderer/i18n');
    setLocale('ko');
    expect(getLocale()).toBe('ko');
    setLocale('en');
    expect(getLocale()).toBe('en');
  });

  it('getStoredLocale returns null when nothing saved', async () => {
    const { getStoredLocale } = await import('../src/renderer/i18n');
    expect(getStoredLocale()).toBeNull();
  });

  it('getStoredLocale returns saved value', async () => {
    localStorage.setItem('cloth-sim-locale', 'ko');
    const { getStoredLocale } = await import('../src/renderer/i18n');
    expect(getStoredLocale()).toBe('ko');
  });

  it('t() returns the key when no strings loaded', async () => {
    const { t } = await import('../src/renderer/i18n');
    const result = t('ui.play');
    expect(typeof result).toBe('string');
  });

  it('t() replaces {n} placeholder', async () => {
    // loadLocale then check t with params
    const { loadLocale, t } = await import('../src/renderer/i18n');
    await loadLocale('en');
    const result = t('dash.minutesAgo', { n: 5 });
    expect(result).toContain('5');
  });

  it('loadLocale returns true for valid locale', async () => {
    const { loadLocale } = await import('../src/renderer/i18n');
    const result = await loadLocale('en');
    expect(result).toBe(true);
  });

  it('loadLocale falls back to en for unknown locale (always returns true)', async () => {
    const { loadLocale } = await import('../src/renderer/i18n');
    const result = await loadLocale('xx');
    expect(result).toBe(true); // always falls back to 'en' and returns true
  });

  it('initI18n resolves without error', async () => {
    const { initI18n } = await import('../src/renderer/i18n');
    await expect(initI18n()).resolves.not.toThrow();
  });

  it('getStoredLocale returns null when localStorage.getItem throws (line 29)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Security error');
    });
    const { getStoredLocale } = await import('../src/renderer/i18n');
    expect(getStoredLocale()).toBeNull();
    spy.mockRestore();
  });

  it('loadLocale ko loads ko locale module (line 35)', async () => {
    const { loadLocale } = await import('../src/renderer/i18n');
    const result = await loadLocale('ko');
    expect(result).toBe(true);
  });
});
