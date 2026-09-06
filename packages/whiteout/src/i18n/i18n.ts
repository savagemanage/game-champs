/**
 * i18n.ts - the tiny runtime around the {@link STRINGS} table.
 *
 * Holds the current {@link Language} at module level. Frosthold: Last Ember is
 * KOREAN-FIRST, so the default is 'ko'. Exposes get/set accessors, a
 * change-subscription list so scenes can re-render if they want to, and the
 * {@link tr} lookup used everywhere for user-facing text.
 *
 * `tr` is pure aside from reading the module-level language, so it is trivially
 * unit-testable (set the language, assert the string).
 */

import { STRINGS, LANGUAGES, type Language, type TrKey } from './strings';

/** The active UI language. Defaults to Korean (Korean-first) until settings load. */
let currentLang: Language = 'ko';

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
 * Derive an initial {@link Language} from a browser-like navigator object.
 *
 * Used only on FIRST RUN, when the player has never chosen (and persisted) a
 * language. If any of the navigator's preferred locales starts with `ko`
 * (case-insensitively) the game opens in Korean; any other locale opens in
 * English. Korean is the fallback when detection is impossible (no navigator,
 * empty locales, e.g. the node/test environment), keeping Frosthold
 * Korean-first.
 *
 * The navigator-like object is passed in so this stays a pure, unit-testable
 * function; production callers pass the real `navigator` (guarded with
 * `typeof navigator !== 'undefined'`).
 */
export function detectBrowserLanguage(
  nav?: { language?: string; languages?: readonly string[] },
): Language {
  if (!nav) return 'ko';
  const candidates: string[] = [];
  if (Array.isArray(nav.languages)) candidates.push(...nav.languages);
  if (typeof nav.language === 'string') candidates.push(nav.language);
  for (const locale of candidates) {
    if (typeof locale === 'string' && locale.toLowerCase().startsWith('ko')) return 'ko';
  }
  // A usable locale that is not Korean -> English; otherwise Korean fallback.
  return candidates.some((l) => typeof l === 'string' && l.length > 0) ? 'en' : 'ko';
}

/**
 * Look up a translated string for the active language, substituting any
 * `{name}` placeholders from `params`. Falls back to the English rendering when
 * the active-language value is missing/empty, so a partially-translated table
 * never shows a blank label.
 */
export function tr(key: TrKey, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let template = entry ? (entry[currentLang] as string) : '';
  if (!template) template = entry ? entry.en : key;

  if (params) {
    template = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = params[name];
      return value === undefined ? whole : String(value);
    });
  }
  return template;
}

/**
 * Like {@link tr} but for keys COMPOSED at runtime from config-driven ids
 * (hero/research/boss/event/quest ids that are plain strings rather than the
 * literal {@link TrKey} union). The key is validated against the table at call
 * time; a missing key falls back to the key string itself (never a crash), so a
 * scene rendering a data-driven list stays type-safe without widening TrKey.
 */
export function trDyn(key: string, params?: Record<string, string | number>): string {
  return tr(key as TrKey, params);
}
