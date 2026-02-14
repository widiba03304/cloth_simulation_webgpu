/**
 * i18n: load locale JSON and expose t(key). No UI strings defined here.
 */

const STORAGE_KEY = 'cloth-sim-locale';
const DEFAULT_LOCALE = 'en';

type LocaleMap = Record<string, string>;
let strings: LocaleMap = {};
let currentLocale = DEFAULT_LOCALE;

export function getLocale(): string {
  return currentLocale;
}

export function setLocale(locale: string): void {
  currentLocale = locale;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function getStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const localeModules: Record<string, () => Promise<{ default: LocaleMap }>> = {
  en: () => import('./locales/en.json'),
  ko: () => import('./locales/ko.json'),
};

/** Load locale file (e.g. en, ko). Returns true if loaded. */
export async function loadLocale(locale: string): Promise<boolean> {
  const load = localeModules[locale];
  if (load) {
    try {
      const mod = await load();
      strings = mod.default;
      currentLocale = locale;
      return true;
    } catch {
      // fall through to fallback
    }
  }
  if (locale !== DEFAULT_LOCALE) return loadLocale(DEFAULT_LOCALE);
  strings = localeModules.en ? (await localeModules.en()).default : {};
  return true;
}

/** Get translated string for key. Falls back to key if missing. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = strings[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

/** Initialize: load stored or system locale. Call once at app init. */
export async function initI18n(): Promise<void> {
  const stored = getStoredLocale();
  const lang = stored ?? navigator.language.split('-')[0];
  await loadLocale(lang === 'ko' ? 'ko' : 'en');
}
