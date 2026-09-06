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

  /**
   * Glyph-coverage guard for the bundled SUBSET webfont.
   *
   * The Hangul webfont shipped under public/assets/fonts is a subset built by
   * tools/build_font.py, which only guarantees glyphs it can find: the planned
   * unicode set below PLUS whatever characters appear in this string table.
   * A symbol that is neither in the plan NOR in strings.ts (e.g. one hardcoded
   * only in scene code, like the old '◀' U+25C0) renders as a missing-glyph
   * "tofu" box at runtime. This test asserts every non-ASCII symbol used in
   * strings.ts stays inside the plan, so a future edit that introduces an
   * uncovered symbol here fails loudly instead of shipping tofu.
   */
  it('uses only webfont-subset symbols for non-Hangul, non-ASCII glyphs', () => {
    // Mirror of the planned symbol set in tools/build_font.py (the ranges the
    // subsetter always includes beyond ASCII/Latin-1/Hangul).
    const isInSubsetPlan = (cp: number): boolean => {
      if (cp <= 0x7f) return true; // ASCII printable
      if (cp >= 0xa0 && cp <= 0xff) return true; // Latin-1 supplement (incl. × ÷)
      if (cp >= 0xac00 && cp <= 0xd7a3) return true; // modern Hangul syllables
      if (cp >= 0x3130 && cp <= 0x318f) return true; // Hangul compatibility jamo
      const symbols = new Set<number>([
        0x2018, 0x2019, 0x201c, 0x201d, // curly quotes
        0x2013, 0x2014, // en/em dash
        0x2026, // ellipsis
        0x00b7, 0x2022, // middot, bullet
        0x2605, 0x2606, // black/white star
        0x2190, 0x2191, 0x2192, 0x2193, // arrows
        0x00d7, // multiplication sign (×)
        // NOTE: U+2212 (minus sign) is intentionally EXCLUDED: it is in the
        // build_font plan-sweep but NOT in the currently shipped subset woff2,
        // so UI copy uses ASCII '-' instead to avoid a missing-glyph box.
      ]);
      return symbols.has(cp);
    };
    const offenders: string[] = [];
    for (const [key, entry] of Object.entries(STRINGS)) {
      for (const value of [entry.ko, entry.en]) {
        for (const ch of value) {
          const cp = ch.codePointAt(0)!;
          if (!isInSubsetPlan(cp)) {
            offenders.push(`${key}: '${ch}' (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`);
          }
        }
      }
    }
    expect(offenders, `symbols outside the webfont subset plan: ${offenders.join(', ')}`).toEqual([]);
  });
});
