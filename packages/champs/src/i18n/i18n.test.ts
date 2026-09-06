import { describe, it, expect } from 'vitest';
import ko from './locales/ko.json';
import en from './locales/en.json';

type Json = Record<string, unknown>;

/** Recursively collect the dotted key paths of an object. */
function collectKeys(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return collectKeys(value as Json, path);
    }
    return [path];
  });
}

describe('i18n locale parity', () => {
  it('ko and en resource bundles have identical key sets', () => {
    const koKeys = collectKeys(ko as Json).sort();
    const enKeys = collectKeys(en as Json).sort();
    expect(koKeys).toEqual(enKeys);
  });
});

describe('i18n default language (mandatory Korean)', () => {
  it('falls back to Korean for a fresh visitor with no saved choice', async () => {
    // Import the configured instance. In the jsdom test env there is no saved
    // `lol-lang` value and `navigator` detection is disabled, so the resolved
    // language must be the Korean fallback.
    const i18n = (await import('./index')).default;
    expect(i18n.options.fallbackLng).toContain('ko');
    // The app title should resolve to its Korean string by default.
    expect(i18n.getResource('ko', 'translation', 'app.title')).toBe(
      '아레나 챔피언스',
    );
  });
});
