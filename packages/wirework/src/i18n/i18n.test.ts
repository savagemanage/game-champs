import { describe, it, expect, afterEach } from 'vitest';
import { tr, setLanguage, getLanguage } from './i18n';
import { STRINGS } from './strings';

/**
 * Pure-logic tests for the i18n runtime (FEAT-001), in the existing vitest
 * style (no Phaser runtime). Language is reset to 'en' after each test so the
 * module-level state does not leak between cases.
 */
describe('i18n tr()', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('returns English by default', () => {
    expect(getLanguage()).toBe('en');
    expect(tr('title.deploy')).toBe('Deploy');
  });

  it('returns Korean after setLanguage("ko")', () => {
    setLanguage('ko');
    expect(getLanguage()).toBe('ko');
    expect(tr('title.deploy')).toBe('출격');
  });

  it('substitutes {param} placeholders', () => {
    expect(tr('preload.loading', { pct: 42 })).toBe('Loading 42%');
    expect(tr('hud.wave', { wave: 2, total: 5 })).toBe('WAVE 2 / 5');
  });

  it('substitutes multiple params in the stats block', () => {
    expect(tr('gameover.stats', { score: 100, waves: 3, saved: 7 })).toBe(
      'SCORE   100\nWAVES SURVIVED   3\nCITIZENS SAVED   7',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(tr('preload.loading')).toBe('Loading {pct}%');
  });

  it('falls back to English when the Korean value is missing', () => {
    // Temporarily blank a ko value to exercise the fallback path.
    const original = STRINGS['title.deploy'].ko;
    (STRINGS['title.deploy'] as { ko: string }).ko = '';
    setLanguage('ko');
    expect(tr('title.deploy')).toBe('Deploy');
    (STRINGS['title.deploy'] as { ko: string }).ko = original;
  });

  it('has non-empty en AND ko for every key', () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.en, `en missing for ${key}`).toBeTruthy();
      expect(entry.ko, `ko missing for ${key}`).toBeTruthy();
    }
  });
});
