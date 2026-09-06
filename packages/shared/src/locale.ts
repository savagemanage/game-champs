/**
 * locale.ts - a tiny, shared i18n SCAFFOLD used across every game WITHOUT
 * forcing a rewrite of each game's existing STRINGS table.
 *
 * The user asked that Korean/English be available everywhere. Rather than
 * replace the per-game strings tables, this module generalizes the two pieces
 * every game repeats:
 *   - a localStorage-backed language store with graceful no-storage fallback
 *     and "persisted choice wins, else Korean-first default" semantics
 *     (generalizing whiteout/kingshot SettingsStore), and
 *   - the pure {@link interpolate} `{name}` filler and the shared parity
 *     checkers ({@link findMissingKeys} / {@link assertParity}) so each game's
 *     ko/en parity TEST can call the SAME checker instead of duplicating it.
 *
 * Korean ('ko') is the default language EVERYWHERE. The store is DOM-tolerant:
 * it reads/writes localStorage only when present, so it runs unchanged in the
 * node/vitest environment.
 */

/** Supported UI languages across all games. */
export type Language = 'ko' | 'en';

/** Ordered list of languages a selector cycles through. Korean-first. */
export const LANGUAGES: Language[] = ['ko', 'en'];

/** The default language everywhere in the monorepo. */
export const DEFAULT_LANGUAGE: Language = 'ko';

/** Narrow an untrusted value to a known {@link Language}. */
export function isLanguage(value: unknown): value is Language {
  return value === 'ko' || value === 'en';
}

/** Options for {@link createLocaleStore}. */
export interface LocaleStoreOptions {
  /** localStorage key under which the chosen language is persisted. */
  storageKey: string;
  /** Fallback when nothing is persisted. Defaults to {@link DEFAULT_LANGUAGE}. */
  defaultLanguage?: Language;
}

/** A language store: get/set with change subscription and explicit load/persist. */
export interface LocaleStore {
  /** Current language. */
  getLanguage(): Language;
  /** Set the language (ignores unknown values); persists and notifies on change. */
  setLanguage(lang: Language): void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: (lang: Language) => void): () => void;
  /** Re-read the persisted language into memory; returns the resolved language. */
  load(): Language;
  /** Write the current language to storage; non-fatal if storage is unavailable. */
  persist(): void;
}

/** Read a key from localStorage, tolerating its absence (node/private mode). */
function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

/** Write a key to localStorage, tolerating its absence / quota errors. */
function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    /* storage unavailable (private mode / quota) - non-fatal, keep in memory. */
  }
}

/**
 * Create a localStorage-backed language store implementing the shared
 * "persisted choice wins, else Korean-first default" rule.
 *
 * On construction it {@link LocaleStore.load}s once: a valid persisted language
 * wins, otherwise it falls back to `defaultLanguage` (Korean by default). The
 * store never throws when localStorage is missing (node/tests/private mode); it
 * simply keeps the language in memory.
 */
export function createLocaleStore(options: LocaleStoreOptions): LocaleStore {
  const { storageKey, defaultLanguage = DEFAULT_LANGUAGE } = options;
  const fallback: Language = isLanguage(defaultLanguage) ? defaultLanguage : DEFAULT_LANGUAGE;
  const listeners = new Set<(lang: Language) => void>();
  let current: Language = fallback;

  function resolvePersisted(): Language {
    const raw = readStorage(storageKey);
    // Persisted choice wins; anything missing/invalid falls back to the default.
    return isLanguage(raw) ? raw : fallback;
  }

  const store: LocaleStore = {
    getLanguage() {
      return current;
    },
    setLanguage(lang: Language) {
      if (!isLanguage(lang) || lang === current) return;
      current = lang;
      store.persist();
      for (const fn of listeners) fn(current);
    },
    subscribe(fn: (lang: Language) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load() {
      current = resolvePersisted();
      return current;
    },
    persist() {
      writeStorage(storageKey, current);
    },
  };

  store.load();
  return store;
}

/**
 * Fill `{name}` placeholders in `template` from `params`. An unmatched
 * placeholder is left verbatim (so a missing param is visible, not silently
 * blanked). Pure and framework-free - shared by every game's `tr`.
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** A translation entry with at least an English and Korean rendering. */
export interface LocaleEntry {
  en: string;
  ko: string;
}

/** A translation table: keys mapped to their per-language renderings. */
export type LocaleTable = Record<string, LocaleEntry>;

/**
 * Return the keys of `table` that are MISSING a non-empty `en` or `ko` value,
 * so a game's parity test can assert the list is empty. A key with a blank (or
 * whitespace-only) string on either language is reported.
 */
export function findMissingKeys(table: LocaleTable): string[] {
  const missing: string[] = [];
  for (const key of Object.keys(table)) {
    const entry = table[key];
    const enOk = typeof entry?.en === 'string' && entry.en.trim().length > 0;
    const koOk = typeof entry?.ko === 'string' && entry.ko.trim().length > 0;
    if (!enOk || !koOk) {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Throw if any key in `table` is missing a non-empty `en` or `ko`. A thin
 * wrapper over {@link findMissingKeys} for games that prefer an assertion in
 * their parity test; the thrown message lists the offending keys.
 */
export function assertParity(table: LocaleTable): void {
  const missing = findMissingKeys(table);
  if (missing.length > 0) {
    throw new Error(`i18n parity: keys missing a non-empty en/ko: ${missing.join(', ')}`);
  }
}
