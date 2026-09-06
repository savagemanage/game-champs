import { describe, expect, it } from 'vitest';
import {
  BIG_HIT_FRACTION,
  CHIP_HIT_FRACTION,
  classifyHit,
  knockbackDir,
  knockbackForHit,
  popupStyleForHit,
  shakeForHit,
  sparkCountForHit,
  structureDestructionShake,
  type HitImportance,
} from './juice';

const ORDER: HitImportance[] = ['chip', 'normal', 'ability', 'ult', 'big'];

describe('classifyHit', () => {
  it('treats lethal or >= BIG_HIT_FRACTION as big regardless of source', () => {
    expect(classifyHit({ fraction: 0.01, lethal: true })).toBe('big');
    expect(classifyHit({ fraction: BIG_HIT_FRACTION })).toBe('big');
    expect(classifyHit({ fraction: 0.5, ability: true })).toBe('big');
  });

  it('bands ult, ability, chip and normal by source and size', () => {
    expect(classifyHit({ fraction: 0.05, ult: true })).toBe('ult');
    expect(classifyHit({ fraction: 0.05, ability: true })).toBe('ability');
    expect(classifyHit({ fraction: CHIP_HIT_FRACTION - 0.001 })).toBe('chip');
    expect(classifyHit({ fraction: 0.08 })).toBe('normal');
  });

  it('handles non-finite / negative fractions safely as zero', () => {
    expect(classifyHit({ fraction: Number.NaN })).toBe('chip');
    expect(classifyHit({ fraction: -1 })).toBe('chip');
  });
});

describe('shakeForHit', () => {
  it('does not shake on chip hits', () => {
    expect(shakeForHit('chip')).toEqual({ duration: 0, intensity: 0 });
  });

  it('increases intensity monotonically with importance', () => {
    const intensities = ORDER.map((i) => shakeForHit(i, 0.12).intensity);
    for (let k = 1; k < intensities.length; k += 1) {
      expect(intensities[k]).toBeGreaterThan(intensities[k - 1]);
    }
  });

  it('clamps big-hit intensity so the camera never lurches too far', () => {
    expect(shakeForHit('big', 999).intensity).toBeLessThanOrEqual(0.03);
    expect(shakeForHit('big', 0).intensity).toBeGreaterThanOrEqual(0.011);
  });

  it('structure destruction shake is strong and time-bounded', () => {
    const s = structureDestructionShake();
    expect(s.intensity).toBeGreaterThan(shakeForHit('ult').intensity);
    expect(s.duration).toBeGreaterThan(0);
  });
});

describe('sparkCountForHit / knockbackForHit', () => {
  it('spark count grows with importance', () => {
    const counts = ORDER.map(sparkCountForHit);
    for (let k = 1; k < counts.length; k += 1) {
      expect(counts[k]).toBeGreaterThan(counts[k - 1]);
    }
  });

  it('knockback distance grows with importance and stays small/visual', () => {
    const kb = ORDER.map(knockbackForHit);
    for (let k = 1; k < kb.length; k += 1) {
      expect(kb[k]).toBeGreaterThan(kb[k - 1]);
    }
    expect(Math.max(...kb)).toBeLessThanOrEqual(12);
  });
});

describe('knockbackDir', () => {
  it('returns a unit vector pointing away from the attacker', () => {
    const d = knockbackDir({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(d.x).toBeCloseTo(0.6, 5);
    expect(d.y).toBeCloseTo(0.8, 5);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 5);
  });

  it('falls back to an upward nudge when points coincide', () => {
    expect(knockbackDir({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: -1 });
  });
});

describe('popupStyleForHit', () => {
  it('big hits pop bigger, jitter more and read heavy', () => {
    const chip = popupStyleForHit('chip');
    const big = popupStyleForHit('big');
    expect(big.fontSize).toBeGreaterThan(chip.fontSize);
    expect(big.pop).toBeGreaterThan(chip.pop);
    expect(big.jitter).toBeGreaterThan(chip.jitter);
    expect(chip.heavy).toBe(false);
    expect(big.heavy).toBe(true);
  });

  it('font size increases monotonically with importance', () => {
    const sizes = ORDER.map((i) => popupStyleForHit(i).fontSize);
    for (let k = 1; k < sizes.length; k += 1) {
      expect(sizes[k]).toBeGreaterThan(sizes[k - 1]);
    }
  });
});
