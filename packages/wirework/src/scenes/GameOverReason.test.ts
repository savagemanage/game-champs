import { describe, it, expect } from 'vitest';
import { outcomeMessageKey, type LoseReason } from './GameOverReason';
import { tr, setLanguage } from '../i18n/i18n';
import { LANGUAGES } from '../i18n/strings';

/**
 * Pure-logic tests for the run-outcome -> message-key mapping (FEAT-002), in
 * the existing vitest style (no Phaser runtime). Each assertion fails if the
 * mapping regressed:
 *  - victory always resolves to the victory line, regardless of reason
 *  - each lose cause maps to its OWN distinct key (no two share a message)
 *  - a reasonless loss falls back to the wall-breached line
 *  - every resolved key renders a non-empty string in both languages
 */
describe('outcomeMessageKey', () => {
  const reasons: LoseReason[] = ['hero_dead', 'inner_breached', 'citizens_lost', 'abandoned'];

  it('maps victory to the victory key (reason ignored)', () => {
    expect(outcomeMessageKey(true)).toBe('gameover.victory');
    expect(outcomeMessageKey(true, 'hero_dead')).toBe('gameover.victory');
  });

  it('maps each lose reason to its matching distinct key', () => {
    expect(outcomeMessageKey(false, 'hero_dead')).toBe('gameover.reason.hero_dead');
    expect(outcomeMessageKey(false, 'inner_breached')).toBe('gameover.reason.inner_breached');
    expect(outcomeMessageKey(false, 'citizens_lost')).toBe('gameover.reason.citizens_lost');
    expect(outcomeMessageKey(false, 'abandoned')).toBe('gameover.reason.abandoned');
  });

  it('produces a unique key per lose reason', () => {
    const keys = reasons.map((r) => outcomeMessageKey(false, r));
    expect(new Set(keys).size).toBe(reasons.length);
  });

  it('falls back to the wall-breached line when a loss has no reason', () => {
    expect(outcomeMessageKey(false)).toBe('gameover.reason.inner_breached');
  });

  it('resolves to a non-empty localized string in every language', () => {
    const keys = [outcomeMessageKey(true), ...reasons.map((r) => outcomeMessageKey(false, r))];
    for (const lang of LANGUAGES) {
      setLanguage(lang);
      for (const key of keys) {
        expect(tr(key).length).toBeGreaterThan(0);
      }
    }
    setLanguage('en');
  });
});
