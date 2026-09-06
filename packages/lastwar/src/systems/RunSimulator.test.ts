import { describe, it, expect } from 'vitest';
import {
  buildTrack,
  resolveRun,
  difficultyAt,
  clusterHpAt,
  squadFirepower,
} from './RunSimulator';
import { deriveStats } from './MetaProgress';
import { applyGate } from './GateMath';
import { ENEMIES, RUN, SQUAD } from '../config/GameConfig';
import type { DerivedStats, Lane } from '../types';

/**
 * Unit tests for the deterministic run simulator: track generation, difficulty
 * ramp, and full run resolution with fixed seed + fixed lane choices producing
 * a stable RunResult. Also covers death-by-shrink and the boss encounter.
 */
const baseStats: DerivedStats = deriveStats({ start_size: 0, damage: 0, fire_rate: 0, coin_bonus: 0 });

describe('difficulty + track', () => {
  it('difficulty ramps from the low to the high end across the run', () => {
    expect(difficultyAt(0)).toBeCloseTo(RUN.DIFFICULTY_RANGE[0], 6);
    expect(difficultyAt(RUN.DIFFICULTY_RAMP_DISTANCE)).toBeCloseTo(RUN.DIFFICULTY_RANGE[1], 6);
    expect(difficultyAt(RUN.RUN_DISTANCE / 2)).toBeGreaterThan(difficultyAt(0));
  });

  it('cluster HP grows with distance', () => {
    expect(clusterHpAt(RUN.RUN_DISTANCE - 1)).toBeGreaterThan(clusterHpAt(0));
    expect(clusterHpAt(0)).toBe(ENEMIES.CLUSTER_BASE_HP);
  });

  it('builds a deterministic track for a seed', () => {
    const a = buildTrack(999, 5);
    const b = buildTrack(999, 5);
    expect(a).toEqual(b);
    expect(a.rows.length).toBeGreaterThan(0);
    expect(a.clusters.length).toBeGreaterThan(0);
    expect(a.boss.boss).toBe(true);
    expect(a.boss.distance).toBe(RUN.RUN_DISTANCE);
  });

  it('firepower scales with squad size but is capped by the render limit', () => {
    expect(squadFirepower(10, baseStats)).toBeGreaterThan(squadFirepower(5, baseStats));
    // Beyond the render cap firepower plateaus.
    expect(squadFirepower(SQUAD.MAX_RENDERED + 100, baseStats)).toBe(
      squadFirepower(SQUAD.MAX_RENDERED, baseStats),
    );
  });
});

describe('resolveRun', () => {
  it('is deterministic: same seed + same choices give identical results', () => {
    const choices: Lane[] = Array(50).fill(0);
    const r1 = resolveRun(42, baseStats, choices);
    const r2 = resolveRun(42, baseStats, choices);
    expect(r1.result).toEqual(r2.result);
    expect(r1.events).toEqual(r2.events);
  });

  it('produces a bounded result with the expected shape', () => {
    const result = resolveRun(42, baseStats, Array(50).fill(0)).result;
    expect(result.distance).toBeGreaterThanOrEqual(0);
    expect(result.distance).toBeLessThanOrEqual(RUN.RUN_DISTANCE);
    expect(result.squadPeak).toBeGreaterThanOrEqual(result.squadFinal);
    expect(result.coinsEarned).toBeGreaterThanOrEqual(0);
    expect(typeof result.win).toBe('boolean');
  });

  it('always choosing the shrinking lane where possible can wipe the squad', () => {
    // Pick the lane that reduces the squad most at each row by inspecting the
    // track. This should drive the squad toward zero and lose the run.
    const track = buildTrack(7, SQUAD.START_SIZE);
    // Greedily choose the worse lane per row (simulating naive squad size).
    const choices: Lane[] = [];
    let size: number = SQUAD.START_SIZE;
    for (const row of track.rows) {
      const r0 = applyGate(size, row.gates[0].op, row.gates[0].value);
      const r1 = applyGate(size, row.gates[1].op, row.gates[1].value);
      const worse: Lane = r0 <= r1 ? 0 : 1;
      choices.push(worse);
      size = Math.min(r0, r1);
    }
    const result = resolveRun(7, baseStats, choices).result;
    // The greedy-worst path should not win the run.
    expect(result.win).toBe(false);
  });

  it('choosing the best lane every row keeps a much larger squad than the worst path', () => {
    const track = buildTrack(7, SQUAD.START_SIZE);
    const best: Lane[] = [];
    const worst: Lane[] = [];
    let sBest: number = SQUAD.START_SIZE;
    let sWorst: number = SQUAD.START_SIZE;
    for (const row of track.rows) {
      const b0 = applyGate(sBest, row.gates[0].op, row.gates[0].value);
      const b1 = applyGate(sBest, row.gates[1].op, row.gates[1].value);
      best.push(b0 >= b1 ? 0 : 1);
      sBest = Math.max(b0, b1);

      const w0 = applyGate(sWorst, row.gates[0].op, row.gates[0].value);
      const w1 = applyGate(sWorst, row.gates[1].op, row.gates[1].value);
      worst.push(w0 <= w1 ? 0 : 1);
      sWorst = Math.min(w0, w1);
    }
    const bestResult = resolveRun(7, baseStats, best).result;
    const worstResult = resolveRun(7, baseStats, worst).result;
    expect(bestResult.squadPeak).toBeGreaterThan(worstResult.squadPeak);
  });

  it('a strongly upgraded squad taking the best lanes can defeat the boss', () => {
    const strong = deriveStats({ start_size: 20, damage: 20, fire_rate: 20, coin_bonus: 0 });
    const track = buildTrack(3, Math.round(strong.startSize));
    const best: Lane[] = [];
    let size = Math.round(strong.startSize);
    for (const row of track.rows) {
      const b0 = applyGate(size, row.gates[0].op, row.gates[0].value);
      const b1 = applyGate(size, row.gates[1].op, row.gates[1].value);
      best.push(b0 >= b1 ? 0 : 1);
      size = Math.max(b0, b1);
    }
    const result = resolveRun(3, strong, best).result;
    expect(result.win).toBe(true);
    expect(result.distance).toBe(RUN.RUN_DISTANCE);
    // Winning grants the win bonus in coins.
    expect(result.coinsEarned).toBeGreaterThan(0);
  });

  it('a run reaching the boss emits a boss event last', () => {
    const strong = deriveStats({ start_size: 20, damage: 20, fire_rate: 20, coin_bonus: 0 });
    const track = buildTrack(3, Math.round(strong.startSize));
    const best: Lane[] = [];
    let size = Math.round(strong.startSize);
    for (const row of track.rows) {
      const b0 = applyGate(size, row.gates[0].op, row.gates[0].value);
      const b1 = applyGate(size, row.gates[1].op, row.gates[1].value);
      best.push(b0 >= b1 ? 0 : 1);
      size = Math.max(b0, b1);
    }
    const { events } = resolveRun(3, strong, best);
    const last = events[events.length - 1];
    expect(last.kind).toBe('cluster');
    if (last.kind === 'cluster') expect(last.boss).toBe(true);
  });
});
