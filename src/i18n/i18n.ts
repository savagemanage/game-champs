/**
 * i18n.ts - the tiny runtime around the {@link STRINGS} table.
 *
 * Holds the current {@link Language} at module level (default 'en'), exposes
 * get/set accessors, a change-subscription list so scenes can re-render if they
 * want to, and the {@link tr} lookup used everywhere for user-facing text.
 *
 * `tr` is pure aside from reading the module-level language, so it is trivially
 * unit-testable (set the language, assert the string).
 */

import { STRINGS, LANGUAGES, type Language, type TrKey } from './strings';

/** The active UI language. Defaults to English until settings load. */
let currentLang: Language = 'en';

/** Listeners notified whenever the language changes. */
const listeners = new Set<(lang: Language) => void>();

/** Current UI language. */
export function getLanguage(): Language {
  return currentLang;
}

/**
 * Switch the active UI language. Only accepts a known language; unknown values
 * are ignored so callers can pass loosely-typed persisted data safely. Fires
 * every subscriber when the language actually changes.
 */
export function setLanguage(lang: Language): void {
  if (!LANGUAGES.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  for (const fn of listeners) fn(currentLang);
}

/**
 * Subscribe to language changes. Returns an unsubscribe function so scene
 * shutdown handlers can detach their listener.
 */
export function subscribe(fn: (lang: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Look up a translated string for the active language, substituting any
 * `{name}` placeholders from `params`. Falls back to the English rendering when
 * the Korean value is missing/empty, so a partially-translated table never
 * shows a blank label.
 */
export function tr(key: TrKey, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let template = entry[currentLang];
  if (!template) template = entry.en;

  if (params) {
    template = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = params[name];
      return value === undefined ? whole : String(value);
    });
  }
  return template;
}
