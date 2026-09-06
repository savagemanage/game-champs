import { describe, it, expect, afterEach } from 'vitest';
import { findMissingKeys } from '@open-games/shared';
import { tr, setLanguage, getLanguage, detectBrowserLanguage } from './i18n';
import { STRINGS } from './strings';

/**
 * Pure-logic tests for the i18n runtime (FEAT-001), in the existing vitest
 * style (no Phaser runtime). Kingdom Rise is Korean-first, so the default
 * language is 'ko'. Language is reset to 'ko' after each test so the
 * module-level state does not leak between cases.
 */
describe('i18n tr()', () => {
  afterEach(() => {
    setLanguage('ko');
  });

  it('returns Korean by default (Korean-first)', () => {
    expect(getLanguage()).toBe('ko');
    expect(tr('title.play')).toBe('왕국 입장');
  });

  it('returns English after setLanguage("en")', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(tr('title.play')).toBe('Enter Kingdom');
  });

  it('substitutes {param} placeholders', () => {
    expect(tr('preload.loading', { pct: 42 })).toBe('불러오는 중 42%');
    expect(tr('battle.wave', { wave: 2, total: 5 })).toBe('웨이브 2 / 5');
  });

  it('substitutes multiple params in one template', () => {
    setLanguage('en');
    expect(tr('save.offlineGains', { food: 10, wood: 20, stone: 30, gold: 40 })).toBe(
      'While away you gathered 10 food, 20 wood, 30 stone, 40 gold.',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    setLanguage('en');
    expect(tr('preload.loading')).toBe('Loading {pct}%');
  });

  it('ignores unknown languages', () => {
    // Passing a loosely-typed persisted value must not change the language.
    setLanguage('fr' as unknown as 'ko');
    expect(getLanguage()).toBe('ko');
  });

  it('falls back to English when the active-language value is missing', () => {
    // Temporarily blank a ko value to exercise the fallback path.
    const original = STRINGS['title.play'].ko;
    (STRINGS['title.play'] as { ko: string }).ko = '';
    // Force a change away and back so the setter actually re-applies 'ko'.
    setLanguage('en');
    setLanguage('ko');
    expect(tr('title.play')).toBe('Enter Kingdom');
    (STRINGS['title.play'] as { ko: string }).ko = original;
  });

  it('has non-empty en AND ko for every key', () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.en, `en missing for ${key}`).toBeTruthy();
      expect(entry.ko, `ko missing for ${key}`).toBeTruthy();
    }
  });

  it('passes the SHARED @open-games/shared parity checker', () => {
    // Centralize the ko/en parity guarantee through the shared checker; STRINGS
    // is a Record<string,{en,ko}>, exactly the shared LocaleTable shape.
    expect(findMissingKeys(STRINGS)).toEqual([]);
  });
});

describe('detectBrowserLanguage()', () => {
  it('returns ko for a Korean primary locale', () => {
    expect(detectBrowserLanguage({ language: 'ko-KR', languages: ['ko-KR', 'en-US'] })).toBe('ko');
    expect(detectBrowserLanguage({ language: 'ko' })).toBe('ko');
    // Case-insensitive.
    expect(detectBrowserLanguage({ language: 'KO-kr' })).toBe('ko');
  });

  it('returns ko when Korean appears anywhere in the preferred locales', () => {
    expect(detectBrowserLanguage({ language: 'en-US', languages: ['en-US', 'ko-KR'] })).toBe('ko');
  });

  it('returns en for a non-Korean locale', () => {
    expect(detectBrowserLanguage({ language: 'en-US', languages: ['en-US'] })).toBe('en');
    expect(detectBrowserLanguage({ language: 'ja-JP' })).toBe('en');
    expect(detectBrowserLanguage({ language: 'fr' })).toBe('en');
  });

  it('falls back to ko when detection is impossible (Korean-first)', () => {
    // No navigator (node/test environment).
    expect(detectBrowserLanguage()).toBe('ko');
    expect(detectBrowserLanguage(undefined)).toBe('ko');
    // Empty / unusable locales.
    expect(detectBrowserLanguage({})).toBe('ko');
    expect(detectBrowserLanguage({ language: '', languages: [] })).toBe('ko');
  });
});
