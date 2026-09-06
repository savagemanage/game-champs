import { describe, it, expect } from 'vitest';
import { duplicateShards, freshPity, recruit, rollGrade } from './Recruit';
import { HEROES, HERO_GRADES, RECRUIT } from '../config/GameConfig';
import { heroDef, heroesOfGrade } from '../config/Heroes';
import { makeRng } from './Rng';
import type { PityState } from '../types';

/**
 * Seeded recruit tests. Drop distribution lands in the configured buckets,
 * pity fires EXACTLY at the threshold, and duplicates convert to shards. These
 * fail if the rates, pity threshold, or duplicate rule were reverted.
 */
describe('Recruit', () => {
  it('drop rates sum to 1', () => {
    const sum = HERO_GRADES.reduce((s, g) => s + RECRUIT.RATES[g], 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('rollGrade maps roll values into the correct cumulative buckets', () => {
    // UR bucket: [0, 0.03).
    expect(rollGrade(0)).toBe('UR');
    expect(rollGrade(RECRUIT.RATES.UR - 1e-9)).toBe('UR');
    // SSR bucket: [0.03, 0.18).
    expect(rollGrade(RECRUIT.RATES.UR)).toBe('SSR');
    expect(rollGrade(RECRUIT.RATES.UR + RECRUIT.RATES.SSR - 1e-9)).toBe('SSR');
    // SR bucket: [0.18, 1).
    expect(rollGrade(RECRUIT.RATES.UR + RECRUIT.RATES.SSR)).toBe('SR');
    expect(rollGrade(0.999999)).toBe('SR');
  });

  it('a pull always returns a real catalog hero of the rolled grade', () => {
    const rng = makeRng(1234);
    let pity = freshPity();
    for (let i = 0; i < 200; i += 1) {
      const res = recruit(rng, pity);
      const def = heroDef(res.heroId);
      expect(def).toBeDefined();
      expect(def!.grade).toBe(res.grade);
      pity = res.newPityState;
    }
  });

  it('seeded distribution across many pulls lands roughly in the rate buckets', () => {
    const rng = makeRng(9999);
    let pity = freshPity();
    const counts: Record<string, number> = { UR: 0, SSR: 0, SR: 0 };
    const N = 5000;
    for (let i = 0; i < N; i += 1) {
      const res = recruit(rng, pity);
      counts[res.grade] += 1;
      pity = res.newPityState;
    }
    // SR is the overwhelming majority; UR is the rarest. (Pity inflates UR a
    // little, so we only assert a generous ordering + a loose SR band.)
    expect(counts.SR).toBeGreaterThan(counts.SSR);
    expect(counts.SSR).toBeGreaterThan(counts.UR);
    expect(counts.SR / N).toBeGreaterThan(0.7);
    expect(counts.SR / N).toBeLessThan(0.95);
  });

  it('pity fires EXACTLY at the threshold: a maxed dry streak forces UR', () => {
    // A pity state already AT the threshold forces the next pull to UR, and the
    // counter resets to 0.
    const primed: PityState = { sinceHighGrade: RECRUIT.PITY_THRESHOLD, totalPulls: 20 };
    // Use a seed whose first roll would NOT naturally be UR, to prove the force.
    const rng = makeRng(7);
    const res = recruit(rng, primed);
    expect(res.grade).toBe('UR');
    expect(res.pity).toBe(true);
    expect(res.newPityState.sinceHighGrade).toBe(0);
    expect(res.newPityState.totalPulls).toBe(21);
  });

  it('one below the threshold does NOT force UR', () => {
    const nearly: PityState = { sinceHighGrade: RECRUIT.PITY_THRESHOLD - 1, totalPulls: 19 };
    // Pick a seed whose natural roll is a non-UR grade so we can see pity did
    // not fire. We search deterministically for such a seed.
    let seed = 0;
    for (; seed < 10000; seed += 1) {
      const g = rollGrade(makeRng(seed).next());
      if (g !== 'UR') break;
    }
    const res = recruit(makeRng(seed), nearly);
    expect(res.pity).toBe(false);
    expect(res.grade).not.toBe('UR');
    // Streak advances by one (still no UR).
    expect(res.newPityState.sinceHighGrade).toBe(RECRUIT.PITY_THRESHOLD);
  });

  it('a natural UR resets the pity counter', () => {
    // Find a seed that naturally rolls UR.
    let seed = 0;
    for (; seed < 100000; seed += 1) {
      if (rollGrade(makeRng(seed).next()) === 'UR') break;
    }
    const state: PityState = { sinceHighGrade: 5, totalPulls: 5 };
    const res = recruit(makeRng(seed), state);
    expect(res.grade).toBe('UR');
    expect(res.pity).toBe(false); // natural, not forced
    expect(res.newPityState.sinceHighGrade).toBe(0);
  });

  it('pity guarantees at least one UR within threshold+1 pulls from a dry start', () => {
    const rng = makeRng(424242);
    let pity = freshPity();
    let sawUr = false;
    for (let i = 0; i < RECRUIT.PITY_THRESHOLD + 1; i += 1) {
      const res = recruit(rng, pity);
      if (res.grade === 'UR') sawUr = true;
      pity = res.newPityState;
    }
    expect(sawUr).toBe(true);
  });

  it('is deterministic: same seed sequence => identical pulls', () => {
    const runOnce = (): string[] => {
      const rng = makeRng(555);
      let pity = freshPity();
      const ids: string[] = [];
      for (let i = 0; i < 30; i += 1) {
        const res = recruit(rng, pity);
        ids.push(res.heroId + ':' + res.grade);
        pity = res.newPityState;
      }
      return ids;
    };
    expect(runOnce()).toEqual(runOnce());
  });

  it('duplicateShards uses grade shardValue plus the flat bonus', () => {
    expect(duplicateShards('UR')).toBe(HEROES.GRADES.UR.shardValue + RECRUIT.DUPLICATE_BONUS_SHARDS);
    expect(duplicateShards('SR')).toBe(HEROES.GRADES.SR.shardValue + RECRUIT.DUPLICATE_BONUS_SHARDS);
    // A rarer duplicate is worth more.
    expect(duplicateShards('UR')).toBeGreaterThan(duplicateShards('SR'));
  });

  it('every grade has a non-empty hero pool to draw from', () => {
    for (const grade of HERO_GRADES) {
      expect(heroesOfGrade(grade).length).toBeGreaterThan(0);
    }
  });
});
