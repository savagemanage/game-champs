import { describe, it, expect } from 'vitest';
import { DIFFICULTY_ORDER, stepDifficulty } from './Difficulty';

/**
 * Pure-logic tests for the bidirectional difficulty step (FEAT-001), in the
 * existing vitest style. Wrapping is intentional and symmetric so prev/next
 * mirror one another at both ends.
 */
describe('stepDifficulty', () => {
  it('orders relaxed -> standard -> brutal', () => {
    expect(DIFFICULTY_ORDER).toEqual(['relaxed', 'standard', 'brutal']);
  });

  it('next advances relaxed -> standard -> brutal', () => {
    expect(stepDifficulty('relaxed', 1)).toBe('standard');
    expect(stepDifficulty('standard', 1)).toBe('brutal');
  });

  it('prev retreats brutal -> standard -> relaxed', () => {
    expect(stepDifficulty('brutal', -1)).toBe('standard');
    expect(stepDifficulty('standard', -1)).toBe('relaxed');
  });

  it('wraps symmetrically at both ends', () => {
    // next from the last wraps to the first...
    expect(stepDifficulty('brutal', 1)).toBe('relaxed');
    // ...and prev from the first wraps to the last.
    expect(stepDifficulty('relaxed', -1)).toBe('brutal');
  });

  it('prev then next returns to the start (round trip)', () => {
    for (const d of DIFFICULTY_ORDER) {
      expect(stepDifficulty(stepDifficulty(d, -1), 1)).toBe(d);
      expect(stepDifficulty(stepDifficulty(d, 1), -1)).toBe(d);
    }
  });
});
