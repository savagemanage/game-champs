/**
 * Recruit.ts - seeded gacha / recruit with a pity guarantee (FEAT-003).
 *
 * A pull rolls a GRADE against the configured drop rates ({@link RECRUIT.RATES},
 * which sum to 1) using the seeded {@link Rng}, then picks a hero of that grade
 * (also via the RNG). A PITY counter guarantees a UR once
 * {@link RECRUIT.PITY_THRESHOLD} consecutive non-UR pulls have accrued: the pull
 * AT the threshold is forced to UR and the counter resets to 0. Any natural UR
 * pull also resets the counter.
 *
 * DUPLICATE RULE: recruiting a hero already owned does NOT add a second copy;
 * instead it converts to progression shards worth the grade's
 * {@link HEROES}.GRADES.shardValue plus {@link RECRUIT.DUPLICATE_BONUS_SHARDS},
 * and increments the owned instance's `dupes` counter. The pure `recruit()`
 * reports whether the pull was a duplicate and how many shards it yields; the
 * store applies the roster + shard mutation.
 *
 * Everything is Phaser-free and deterministic: the same seed sequence + same
 * pity state always produce the same pull, so tests are reproducible.
 */

import { HEROES, HERO_GRADES, RECRUIT } from '../config/GameConfig';
import { heroesOfGrade } from '../config/Heroes';
import type { HeroGrade, PityState } from '../types';
import type { Rng } from './Rng';

/** The outcome of a single recruit pull. */
export interface RecruitResult {
  /** The catalog hero id pulled. */
  heroId: string;
  /** The grade rolled (or forced by pity). */
  grade: HeroGrade;
  /** True when this grade was granted by the pity guarantee rather than rolled. */
  pity: boolean;
  /** The pity state to store after this pull. */
  newPityState: PityState;
}

/** A fresh pity state (no dry streak, no pulls made). */
export function freshPity(): PityState {
  return { sinceHighGrade: 0, totalPulls: 0 };
}

/**
 * Roll a grade from {@link RECRUIT.RATES} using a value in [0, 1). Buckets are
 * laid out in {@link HERO_GRADES} order (UR, SSR, SR); the value falls into the
 * first bucket whose cumulative rate it is under. Falls back to the last grade
 * for floating-point edge cases.
 */
export function rollGrade(roll: number): HeroGrade {
  let cumulative = 0;
  for (const grade of HERO_GRADES) {
    cumulative += RECRUIT.RATES[grade];
    if (roll < cumulative) return grade;
  }
  return HERO_GRADES[HERO_GRADES.length - 1];
}

/**
 * Shards a duplicate of the given grade converts into: the grade's shardValue
 * plus the flat duplicate bonus.
 */
export function duplicateShards(grade: HeroGrade): number {
  return HEROES.GRADES[grade].shardValue + RECRUIT.DUPLICATE_BONUS_SHARDS;
}

/**
 * Perform one seeded recruit pull.
 *
 * @param rng   seeded RNG (advanced by this call)
 * @param pity  current pity state
 * @returns the pulled hero id + grade, whether pity fired, and the next pity state
 *
 * Pity: when `pity.sinceHighGrade` has already reached
 * {@link RECRUIT.PITY_THRESHOLD}, this pull is forced to UR. Otherwise a grade is
 * rolled; a natural UR resets the counter, anything else increments it.
 */
export function recruit(rng: Rng, pity: PityState): RecruitResult {
  const totalPulls = Math.max(0, Math.floor(pity.totalPulls)) + 1;
  const dryStreak = Math.max(0, Math.floor(pity.sinceHighGrade));

  const forced = dryStreak >= RECRUIT.PITY_THRESHOLD;
  // Always draw the grade roll so the RNG advances identically whether or not
  // pity fires (keeps the stream deterministic and easy to reason about).
  const gradeRoll = rng.next();
  const grade: HeroGrade = forced ? 'UR' : rollGrade(gradeRoll);

  const pool = heroesOfGrade(grade);
  const heroId = rng.pick(pool);

  const isHigh = grade === 'UR';
  const newPityState: PityState = {
    sinceHighGrade: isHigh ? 0 : dryStreak + 1,
    totalPulls,
  };

  return { heroId, grade, pity: forced, newPityState };
}
