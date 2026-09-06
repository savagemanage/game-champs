/**
 * RallyConfig - the ORIGINAL world-boss / Frostbeast rallies (FEAT-005).
 *
 * When the blizzard births a titanic Frostbeast, the hold rallies against it
 * over MANY attempts: a huge HP pool is chipped down by the player's per-attempt
 * damage plus a deterministic simulated-alliance contribution, and tiered
 * rewards pay out by how much of the pool is destroyed (plus a kill bonus). All
 * single-player — the "alliance" is an AI contribution, never a server.
 *
 * PURE data + lookups (no Phaser). Boss enemy kinds REUSE the shared EnemyKind
 * roster + enemyPower model so a rally speaks the same combat language as waves
 * and campaign. All boss names are ORIGINAL and live in i18n keyed `rally.*`.
 */

import { RALLY } from './GameConfig';
import type { EnemyKind, HeroId, ResourceCost } from '../types';
import { enemyPower } from './TroopConfig';

/** A rally reward bundle (mirrors the campaign reward shape). */
export interface RallyReward {
  /** Resource payout (folded into the ResourceStore). */
  resources?: ResourceCost;
  /** Ember Sparks granted to the PremiumWallet. */
  sparks?: number;
  /** Hero shards granted, keyed by hero id (added to the HeroRoster). */
  shards?: Partial<Record<HeroId, number>>;
}

/** A single world-boss rally target. */
export interface RallyBossDef {
  /** Stable boss id (keys i18n + the persisted per-boss state). */
  id: string;
  /** The Frostbeast enemy kind this boss embodies (drives its base power). */
  kind: EnemyKind;
  /** The boss's total HP pool, depleted across repeated attempts. */
  hpPool: number;
  /** Recommended army power to make meaningful dents (for UI). */
  recommendedPower: number;
  /**
   * Tiered rewards, one per RALLY.REWARD_TIER_THRESHOLDS entry (ascending). The
   * final entry is the KILL reward. RallySystem grants each newly-reached tier
   * exactly once per cycle.
   */
  tierRewards: RallyReward[];
}

/**
 * The world-boss roster, ascending in menace. HP pools are large (thousands to
 * tens of thousands) precisely because they are worn down across many rally
 * attempts rather than one battle.
 */
export const RALLY_BOSSES: RallyBossDef[] = [
  {
    id: 'rime_alpha',
    kind: 'rime_alpha',
    hpPool: 8_000,
    recommendedPower: 300,
    tierRewards: [
      { resources: { food: 200, wood: 160 } },
      { resources: { coal: 120, iron: 80 } },
      { sparks: 60 },
      { sparks: 120, shards: { drift_runner: 6 } },
    ],
  },
  {
    id: 'glacier_behemoth',
    kind: 'glacier_behemoth',
    hpPool: 30_000,
    recommendedPower: 900,
    tierRewards: [
      { resources: { food: 500, iron: 200 } },
      { resources: { steel: 60 } },
      { sparks: 120 },
      { sparks: 240, shards: { iron_bulwark: 8 } },
    ],
  },
  {
    id: 'hoarfrost_wyrm',
    kind: 'hoarfrost_wyrm',
    hpPool: 90_000,
    recommendedPower: 2_400,
    tierRewards: [
      { resources: { food: 1200, steel: 120 } },
      { sparks: 200 },
      { sparks: 300, shards: { winters_eye: 8 } },
      { sparks: 500, shards: { the_pale_marksman: 10 } },
    ],
  },
];

/** All bosses by id for O(1) lookup. */
const BOSS_BY_ID: Record<string, RallyBossDef> = Object.fromEntries(
  RALLY_BOSSES.map((b) => [b.id, b]),
);

/** All boss ids in ascending order. */
export const RALLY_BOSS_IDS: readonly string[] = RALLY_BOSSES.map((b) => b.id);

/** Lookup a boss by id (undefined for an unknown id). */
export function rallyBoss(id: string): RallyBossDef | undefined {
  return BOSS_BY_ID[id];
}

/** Whether `id` is a real world-boss id. */
export function isRallyBoss(id: string): boolean {
  return id in BOSS_BY_ID;
}

/**
 * The reward-tier thresholds as FRACTIONS of the boss HP pool (ascending, final
 * = 1.0 kill). Shared with RallySystem so config + system agree on tier payout.
 */
export const RALLY_REWARD_THRESHOLDS: readonly number[] = RALLY.REWARD_TIER_THRESHOLDS;

/**
 * The per-attempt boss "retaliation" power for UI/recommendation only: the
 * boss's per-unit enemy power. Kept here so consumers share one definition.
 */
export function bossPower(id: string): number {
  const boss = BOSS_BY_ID[id];
  return boss ? enemyPower(boss.kind) : 0;
}
