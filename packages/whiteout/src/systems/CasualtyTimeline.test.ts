import { describe, it, expect } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { buildTimeline, friendlyTotal, enemyTotal } from './CasualtyTimeline';
import { waveComposition } from '../config/WaveConfig';
import { TROOP_ORDER } from '../config/TroopConfig';
import type { Army } from '../types';

/**
 * The casualty timeline is the ONLY bridge between the deterministic
 * CombatSystem and the animated scene. These tests lock it to the resolution:
 * the final animation frame must equal CombatSystem's survivors/casualties, the
 * sequence must be monotonic, and the enemy side must end at zero on a win.
 */
describe('CasualtyTimeline', () => {
  const army = (a: Partial<Army>): Army => ({ trapper: 0, marksman: 0, vanguard: 0, ...a });

  const startEnemyTotal = (wave: number): number =>
    waveComposition(wave).reduce((s, e) => s + e.count, 0);

  it('ends exactly on the CombatSystem survivors for a win', () => {
    const a = army({ vanguard: 50 });
    const result = CombatSystem.resolve(a, 1);
    expect(result.win).toBe(true);

    const tl = buildTimeline(a, result, 8);
    const last = tl.steps[tl.steps.length - 1];
    for (const k of TROOP_ORDER) {
      expect(last.friendly[k]).toBe(result.survivors[k]);
    }
    // A win wipes the whole wave.
    expect(enemyTotal(last)).toBe(0);
  });

  it('ends with the army wiped and the wave still standing on a loss', () => {
    const a = army({ trapper: 1 });
    const result = CombatSystem.resolve(a, 8);
    expect(result.win).toBe(false);

    const tl = buildTimeline(a, result, 8);
    const last = tl.steps[tl.steps.length - 1];
    // Army fully spent (matches survivors, all zero).
    expect(friendlyTotal(last)).toBe(0);
    for (const k of TROOP_ORDER) expect(last.friendly[k]).toBe(result.survivors[k]);
    // At least one enemy survives a defeat.
    expect(enemyTotal(last)).toBeGreaterThan(0);
  });

  it('starts at the full army vs the full wave composition', () => {
    const a = army({ trapper: 10, marksman: 5 });
    const result = CombatSystem.resolve(a, 4);
    const tl = buildTimeline(a, result, 6);
    expect(friendlyTotal(tl.start)).toBe(15);
    expect(enemyTotal(tl.start)).toBe(startEnemyTotal(4));
  });

  it('is monotonically non-increasing on both sides', () => {
    const a = army({ vanguard: 30, trapper: 20 });
    const result = CombatSystem.resolve(a, 5);
    const tl = buildTimeline(a, result, 10);

    let prevF = friendlyTotal(tl.start);
    let prevE = enemyTotal(tl.start);
    for (const step of tl.steps) {
      const f = friendlyTotal(step);
      const e = enemyTotal(step);
      expect(f).toBeLessThanOrEqual(prevF);
      expect(e).toBeLessThanOrEqual(prevE);
      prevF = f;
      prevE = e;
    }
  });

  it('clamps the step count to at least one', () => {
    const a = army({ vanguard: 10 });
    const result = CombatSystem.resolve(a, 1);
    const tl = buildTimeline(a, result, 0);
    expect(tl.steps.length).toBe(1);
    // Even with one step it must land on the resolution.
    const last = tl.steps[0];
    for (const k of TROOP_ORDER) expect(last.friendly[k]).toBe(result.survivors[k]);
  });

  it('mirrors the win flag from the result', () => {
    const a = army({ vanguard: 50 });
    const win = CombatSystem.resolve(a, 1);
    const loss = CombatSystem.resolve(army({ trapper: 1 }), 9);
    expect(buildTimeline(a, win).win).toBe(true);
    expect(buildTimeline(army({ trapper: 1 }), loss).win).toBe(false);
  });
});
