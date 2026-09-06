import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createLocaleStore,
  interpolate,
  findMissingKeys,
  assertParity,
  isLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type LocaleTable,
} from './locale';

/** A minimal in-memory localStorage stand-in for the store tests. */
function installMemoryStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  return map;
}

describe('locale constants', () => {
  it('defaults to Korean and lists ko first', () => {
    expect(DEFAULT_LANGUAGE).toBe('ko');
    expect(LANGUAGES[0]).toBe('ko');
  });

  it('narrows known languages', () => {
    expect(isLanguage('ko')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe('createLocaleStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to Korean when nothing is persisted', () => {
    installMemoryStorage();
    const store = createLocaleStore({ storageKey: 'game:lang' });
    expect(store.getLanguage()).toBe('ko');
  });

  it('honors a custom default language when nothing is persisted', () => {
    installMemoryStorage();
    const store = createLocaleStore({ storageKey: 'game:lang', defaultLanguage: 'en' });
    expect(store.getLanguage()).toBe('en');
  });

  it('persisted choice wins over the default', () => {
    installMemoryStorage({ 'game:lang': 'en' });
    const store = createLocaleStore({ storageKey: 'game:lang' });
    expect(store.getLanguage()).toBe('en');
  });

  it('ignores an invalid persisted value and falls back to the default', () => {
    installMemoryStorage({ 'game:lang': 'zz' });
    const store = createLocaleStore({ storageKey: 'game:lang' });
    expect(store.getLanguage()).toBe('ko');
  });

  it('sets, persists, and notifies subscribers on change', () => {
    const map = installMemoryStorage();
    const store = createLocaleStore({ storageKey: 'game:lang' });
    const seen: string[] = [];
    store.subscribe((l) => seen.push(l));

    store.setLanguage('en');
    expect(store.getLanguage()).toBe('en');
    expect(map.get('game:lang')).toBe('en');
    expect(seen).toEqual(['en']);

    // No-op set (same value) does not re-notify.
    store.setLanguage('en');
    expect(seen).toEqual(['en']);

    // Unknown value is ignored.
    // @ts-expect-error deliberately passing an invalid language
    store.setLanguage('fr');
    expect(store.getLanguage()).toBe('en');
  });

  it('unsubscribe detaches the listener', () => {
    installMemoryStorage();
    const store = createLocaleStore({ storageKey: 'game:lang' });
    const seen: string[] = [];
    const off = store.subscribe((l) => seen.push(l));
    off();
    store.setLanguage('en');
    expect(seen).toEqual([]);
  });

  it('works with no localStorage (node/private mode) without throwing', () => {
    vi.unstubAllGlobals(); // ensure localStorage is absent
    const store = createLocaleStore({ storageKey: 'game:lang' });
    expect(store.getLanguage()).toBe('ko');
    expect(() => store.setLanguage('en')).not.toThrow();
    expect(store.getLanguage()).toBe('en');
  });
});

describe('interpolate', () => {
  it('fills {name} placeholders', () => {
    expect(interpolate('WAVE {wave} / {total}', { wave: 3, total: 10 })).toBe('WAVE 3 / 10');
  });

  it('leaves an unmatched placeholder verbatim', () => {
    expect(interpolate('Hello {who}', {})).toBe('Hello {who}');
  });

  it('returns the template unchanged when no params are given', () => {
    expect(interpolate('static text')).toBe('static text');
  });
});

describe('findMissingKeys / assertParity', () => {
  it('returns no missing keys for a complete table', () => {
    const table: LocaleTable = {
      'a.b': { en: 'Hello', ko: '안녕' },
      'c.d': { en: 'Bye', ko: '잘가' },
    };
    expect(findMissingKeys(table)).toEqual([]);
    expect(() => assertParity(table)).not.toThrow();
  });

  it('detects a blank en or ko value', () => {
    const table: LocaleTable = {
      'ok': { en: 'Hello', ko: '안녕' },
      'blank.en': { en: '', ko: '있음' },
      'blank.ko': { en: 'Present', ko: '   ' },
    };
    expect(findMissingKeys(table).sort()).toEqual(['blank.en', 'blank.ko']);
    expect(() => assertParity(table)).toThrow(/blank\.en/);
  });
});
