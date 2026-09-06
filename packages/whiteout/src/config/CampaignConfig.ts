/**
 * CampaignConfig - the ORIGINAL staged story / exploration mode (FEAT-003).
 *
 * The hold's survivors push out from the Furnace into the frozen dark across a
 * sequence of chapters, each a handful of stages against escalating Frozen
 * Horde compositions. Clearing a stage the first time grants a one-time reward
 * (resources, Ember Sparks, and hero shards) and unlocks the next stage.
 *
 * This module is PURE data + lookups (no Phaser). Enemy compositions REUSE the
 * shared EnemyKind roster (and the CombatSystem power model via
 * enemyPower/effectiveArmyPower) so campaign difficulty and battle difficulty
 * speak the same language. All chapter/stage names + narrative blurbs are
 * ORIGINAL and live in the i18n table keyed `campaign.<id>.*`.
 */

import type { EnemyKind, HeroId, ResourceCost } from '../types';
import { enemyPower } from './TroopConfig';

/** A stage's enemy roster entry (mirrors WaveConfig.WaveEntry). */
export interface StageEnemy {
  kind: EnemyKind;
  count: number;
}

/** First-clear rewards for a stage (granted exactly once). */
export interface StageReward {
  /** Resource payout (folded into the ResourceStore). */
  resources?: ResourceCost;
  /** Ember Sparks granted to the PremiumWallet. */
  sparks?: number;
  /** Hero shards granted, keyed by hero id (added to the HeroRoster). */
  shards?: Partial<Record<HeroId, number>>;
}

/** A single campaign stage. */
export interface StageDef {
  /** Stable stage id (keys i18n + the claimed-rewards set). */
  id: string;
  /** The chapter this stage belongs to (for grouping / narrative). */
  chapter: number;
  /** 1-based order within the whole campaign (drives gating). */
  order: number;
  /** Enemy composition to overcome. */
  enemies: StageEnemy[];
  /** First-clear rewards. */
  reward: StageReward;
}

/**
 * The campaign stages, in order. Kept compact but faithful in structure: two
 * chapters of a few stages each, ramping enemy composition. `order` is the
 * canonical 1-based progression index used for gating.
 */
export const CAMPAIGN_STAGES: StageDef[] = [
  {
    id: 'c1s1',
    chapter: 1,
    order: 1,
    enemies: [{ kind: 'frost_wolf', count: 4 }],
    reward: { resources: { food: 120, wood: 100 }, shards: { ember_warden: 4 } },
  },
  {
    id: 'c1s2',
    chapter: 1,
    order: 2,
    enemies: [{ kind: 'frost_wolf', count: 7 }],
    reward: { resources: { food: 160, coal: 80 }, shards: { snow_picket: 4 } },
  },
  {
    id: 'c1s3',
    chapter: 1,
    order: 3,
    enemies: [
      { kind: 'frost_wolf', count: 8 },
      { kind: 'ravager', count: 1 },
    ],
    reward: { resources: { iron: 60 }, sparks: 50, shards: { drift_runner: 4 } },
  },
  {
    id: 'c2s1',
    chapter: 2,
    order: 4,
    enemies: [
      { kind: 'frost_wolf', count: 10 },
      { kind: 'ravager', count: 2 },
    ],
    reward: { resources: { food: 300, iron: 100 }, shards: { iron_bulwark: 6 } },
  },
  {
    id: 'c2s2',
    chapter: 2,
    order: 5,
    enemies: [
      { kind: 'frost_wolf', count: 12 },
      { kind: 'ravager', count: 3 },
      { kind: 'frost_titan', count: 1 },
    ],
    reward: { sparks: 100, shards: { glacier_lance: 6 } },
  },
  {
    id: 'c2s3',
    chapter: 2,
    order: 6,
    enemies: [
      { kind: 'frost_wolf', count: 14 },
      { kind: 'ravager', count: 4 },
      { kind: 'frost_titan', count: 2 },
    ],
    reward: {
      resources: { food: 500, steel: 40 },
      sparks: 150,
      shards: { aurora_sentinel: 8 },
    },
  },
];

/** All stages by id for O(1) lookup. */
const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(
  CAMPAIGN_STAGES.map((s) => [s.id, s]),
);

/** All stage ids in progression order. */
export const CAMPAIGN_STAGE_IDS: readonly string[] = CAMPAIGN_STAGES.map((s) => s.id);

/** The number of stages in the campaign. */
export const TOTAL_STAGES = CAMPAIGN_STAGES.length;

/** Lookup a stage by id (undefined for an unknown id). */
export function stageById(id: string): StageDef | undefined {
  return STAGE_BY_ID[id];
}

/** Lookup a stage by its 1-based order (undefined out of range). */
export function stageByOrder(order: number): StageDef | undefined {
  return CAMPAIGN_STAGES.find((s) => s.order === order);
}

/**
 * The recommended / required army power to clear a stage: the total effective
 * power of its enemy composition using the SHARED CombatSystem enemy-power
 * model (enemyPower from TroopConfig). Pure and deterministic, so the campaign
 * gate and the battle sim agree on how strong a roster is.
 */
export function stageRequiredPower(id: string): number {
  const stage = STAGE_BY_ID[id];
  if (!stage) return 0;
  let total = 0;
  for (const e of stage.enemies) total += e.count * enemyPower(e.kind);
  return total;
}
