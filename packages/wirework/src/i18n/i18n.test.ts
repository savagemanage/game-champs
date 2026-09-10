import { describe, it, expect, afterEach } from 'vitest';
import { findMissingKeys } from '@open-games/shared';
import { tr, setLanguage, getLanguage } from './i18n';
import { STRINGS } from './strings';

/**
 * Pure-logic tests for the i18n runtime, in the existing vitest style (no Phaser
 * runtime). Wirework is now KOREAN-FIRST by default (FEAT-002), matching every
 * other game in the monorepo. Language is reset to the Korean default after each
 * test so the module-level state does not leak between cases.
 */
describe('i18n tr()', () => {
  afterEach(() => {
    setLanguage('ko');
  });

  it('returns Korean by default', () => {
    expect(getLanguage()).toBe('ko');
    expect(tr('title.deploy')).toBe('출격');
  });

  it('returns English after setLanguage("en")', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(tr('title.deploy')).toBe('Deploy');
  });

  it('substitutes {param} placeholders', () => {
    setLanguage('en');
    expect(tr('preload.loading', { pct: 42 })).toBe('Loading 42%');
    expect(tr('hud.wave', { wave: 2, total: 5 })).toBe('WAVE 2 / 5');
  });

  it('substitutes multiple params in the stats block', () => {
    setLanguage('en');
    expect(tr('gameover.stats', {
      difficulty: 'STANDARD', score: 100, best: 120, waves: 3, saved: 7, time: '42.0', seed: 123,
    })).toBe(
      'DIFFICULTY   STANDARD\nSCORE   100  /  BEST   120\nWAVES COMPLETED   3\nCITIZENS REMAINING   7\nACTIVE TIME   42.0s\nSEED   123',
    );
  });

  it('fails when required placeholders are omitted', () => {
    setLanguage('en');
    expect(() => tr('preload.loading')).toThrow('Missing translation placeholder {pct}');
  });

  it('falls back to English when the Korean value is missing', () => {
    // Temporarily blank a ko value to exercise the fallback path.
    const original = STRINGS['title.deploy'].ko;
    (STRINGS['title.deploy'] as { ko: string }).ko = '';
    setLanguage('ko');
    expect(tr('title.deploy')).toBe('Deploy');
    (STRINGS['title.deploy'] as { ko: string }).ko = original;
  });

  it('has non-empty en AND ko for every key (shared parity checker)', () => {
    // Route the parity guarantee through the SHARED @open-games/shared checker so
    // it is centralized across all games. STRINGS is a Record<string,{en,ko}>,
    // which is exactly the shared LocaleTable shape.
    expect(findMissingKeys(STRINGS)).toEqual([]);
  });
});
