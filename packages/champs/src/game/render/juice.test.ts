import { describe, expect, it } from 'vitest';
import {
  BIG_HIT_FRACTION,
  CHIP_HIT_FRACTION,
  MAX_SHAKE_INTENSITY,
  SHAKE_MIN_INTERVAL_MS,
  classifyHit,
  knockbackDir,
  knockbackForHit,
  popupStyleForHit,
  shakeForHit,
  shouldShake,
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
  it('does not shake on chip or normal hits', () => {
    expect(shakeForHit('chip')).toEqual({ duration: 0, intensity: 0 });
    // Ordinary autoattack trading (normal) must not move the camera at all so
    // constant 5v5 combat cannot turn into a permanent tremor.
    expect(shakeForHit('normal')).toEqual({ duration: 0, intensity: 0 });
  });

  it('increases intensity monotonically for the tiers that shake', () => {
    const shaking: HitImportance[] = ['ability', 'ult', 'big'];
    const intensities = shaking.map((i) => shakeForHit(i, 0.12).intensity);
    for (let k = 1; k < intensities.length; k += 1) {
      expect(intensities[k]).toBeGreaterThan(intensities[k - 1]);
    }
    // The lowest shaking tier is still stronger than the non-shaking ones.
    expect(shakeForHit('ability').intensity).toBeGreaterThan(shakeForHit('normal').intensity);
  });

  it('clamps big-hit intensity to the subtle ceiling so the camera never lurches', () => {
    expect(shakeForHit('big', 999).intensity).toBeLessThanOrEqual(MAX_SHAKE_INTENSITY);
    expect(shakeForHit('big', 0).intensity).toBeGreaterThan(0);
  });

  it('structure destruction shake is the strongest hit shake and time-bounded', () => {
    const s = structureDestructionShake();
    expect(s.intensity).toBeGreaterThanOrEqual(shakeForHit('ult').intensity);
    expect(s.intensity).toBeLessThanOrEqual(MAX_SHAKE_INTENSITY);
    expect(s.duration).toBeGreaterThan(0);
  });
});

describe('shouldShake', () => {
  const base = {
    intensity: 0.006,
    involvesPlayer: true,
    onScreen: true,
    sinceLastMs: SHAKE_MIN_INTERVAL_MS + 1,
    running: false,
    runningIntensity: 0,
  };

  it('fires for a perceivable, un-throttled shake with real magnitude', () => {
    expect(shouldShake(base)).toBe(true);
  });

  it('never fires for a zero-intensity shake', () => {
    expect(shouldShake({ ...base, intensity: 0 })).toBe(false);
  });

  it('skips shakes the player cannot perceive (off-screen and not involved)', () => {
    expect(shouldShake({ ...base, involvesPlayer: false, onScreen: false })).toBe(false);
    // On-screen alone is enough even without the player.
    expect(shouldShake({ ...base, involvesPlayer: false, onScreen: true })).toBe(true);
    // Player involvement is enough even off-screen (e.g. player just off-view).
    expect(shouldShake({ ...base, involvesPlayer: true, onScreen: false })).toBe(true);
  });

  it('drops a rapid follow-up shake within the min interval', () => {
    const recent = { ...base, sinceLastMs: 10 };
    // Nothing currently playing but still inside the throttle window: dropped,
    // even for a bigger hit, so rapid hits cannot stack into a tremor.
    expect(shouldShake(recent)).toBe(false);
    expect(shouldShake({ ...recent, intensity: base.intensity + 0.005 })).toBe(false);
  });

  it('lets a shake through once the min interval has elapsed', () => {
    expect(shouldShake({ ...base, sinceLastMs: SHAKE_MIN_INTERVAL_MS + 1 })).toBe(true);
  });

  it('does not restart a shake weaker-or-equal to the one currently playing', () => {
    const running = { ...base, running: true, runningIntensity: 0.01 };
    expect(shouldShake({ ...running, intensity: 0.005 })).toBe(false);
    expect(shouldShake({ ...running, intensity: 0.01 })).toBe(false);
    expect(shouldShake({ ...running, intensity: 0.011 })).toBe(true);
  });

  it('lets a strictly stronger hit punch through the throttle over a weaker in-flight shake', () => {
    const recentRunning = { ...base, sinceLastMs: 10, running: true, runningIntensity: 0.004 };
    expect(shouldShake({ ...recentRunning, intensity: 0.004 })).toBe(false);
    expect(shouldShake({ ...recentRunning, intensity: 0.009 })).toBe(true);
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
