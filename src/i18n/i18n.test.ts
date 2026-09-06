import { describe, it, expect, afterEach } from 'vitest';
import { tr, setLanguage, getLanguage } from './i18n';
import { STRINGS } from './strings';

/**
 * Pure-logic tests for the i18n runtime (FEAT-001), in the existing vitest
 * style (no Phaser runtime). LAST SQUAD is Korean-first, so the default
 * language is 'ko'. Language is reset to 'ko' after each test so the
 * module-level state does not leak between cases.
 */
describe('i18n tr()', () => {
  afterEach(() => {
    setLanguage('ko');
  });

  it('returns Korean by default (Korean-first)', () => {
    expect(getLanguage()).toBe('ko');
    expect(tr('title.play')).toBe('출격');
  });

  it('returns English after setLanguage("en")', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(tr('title.play')).toBe('Deploy');
  });

  it('substitutes {param} placeholders', () => {
    expect(tr('preload.loading', { pct: 42 })).toBe('불러오는 중 42%');
    expect(tr('run.squadSize', { count: 12 })).toBe('분대 12');
  });

  it('substitutes multiple params in one template', () => {
    setLanguage('en');
    expect(tr('upgrade.levelOf', { level: 3, max: 20 })).toBe('Lv. 3 / 20');
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
    expect(tr('title.play')).toBe('Deploy');
    (STRINGS['title.play'] as { ko: string }).ko = original;
  });

  it('has the FEAT-004 onboarding start/how-to keys in both ko and en', () => {
    const keys = [
      'title.start',
      'title.startHint',
      'howto.goal',
      'howto.loopTitle',
      'howto.loop.base',
      'howto.loop.heroes',
      'howto.loop.battle',
      'howto.loop.falcon',
      'howto.controlsTitle',
      'howto.laneLabel',
      'howto.gateGood',
      'howto.gateBad',
      'howto.startTutorial',
    ] as const;
    for (const key of keys) {
      const entry = STRINGS[key];
      expect(entry, `missing entry for ${key}`).toBeTruthy();
      expect(entry.ko, `ko missing for ${key}`).toBeTruthy();
      expect(entry.en, `en missing for ${key}`).toBeTruthy();
    }
    // Korean-first: the primary start hint reads as the exact spec string.
    expect(STRINGS['title.startHint'].ko).toBe('여기를 눌러 시작하세요');
  });

  it('has non-empty en AND ko for every key', () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.en, `en missing for ${key}`).toBeTruthy();
      expect(entry.ko, `ko missing for ${key}`).toBeTruthy();
    }
  });
});
