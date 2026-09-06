/**
 * QuestConfig - the single-player progression quest chain for Kingdom Rise.
 *
 * This is pure data + a pure {@link isComplete} helper with NO Phaser
 * dependency, so QuestSystem and its unit tests can consume it directly.
 *
 * A quest has a DECLARATIVE {@link QuestCondition} that is evaluated against a
 * plain {@link QuestProgress} snapshot assembled by GameState (never against
 * live systems), so the completion logic is fully deterministic and testable.
 * Completing a quest grants a {@link QuestReward}: a resource bundle and/or a
 * bundle of hero shards ({heroId, shards}) that HeroSystem.addShards applies.
 *
 * The quests form a CHAIN: each quest (after the first) lists a `requires`
 * predecessor, so QuestSystem only offers a quest once the one before it has
 * been claimed. This drives the player through the core loop:
 *   gather -> build -> upgrade -> train -> research -> battle -> heroes.
 *
 * All names/flavour are ORIGINAL to this project; no proprietary content.
 */

import type { BuildingKind, ResourceCost } from '../types';
import type { HeroId } from './HeroConfig';

/**
 * A declarative quest condition, evaluated against a {@link QuestProgress}
 * snapshot. Each variant checks one derived or cumulative statistic:
 *   - buildingLevel:   a specific building has reached at least `level`.
 *   - townCenterLevel: the Town Center has reached at least `level`.
 *   - troopsTrained:   at least `count` troops trained over the game's lifetime.
 *   - battlesWon:      at least `count` battles won over the game's lifetime.
 *   - techUnlocked:    at least `count` techs researched (or a specific `techId`).
 */
export type QuestCondition =
  | { type: 'buildingLevel'; kind: BuildingKind; level: number }
  | { type: 'townCenterLevel'; level: number }
  | { type: 'troopsTrained'; count: number }
  | { type: 'battlesWon'; count: number }
  | { type: 'techUnlocked'; count?: number; techId?: string };

/** Hero shards granted by a quest reward. */
export interface ShardReward {
  heroId: HeroId;
  shards: number;
}

/** What a quest grants on claim: resources and/or hero shards. */
export interface QuestReward {
  /** Resource bundle added to the ResourceStore. */
  resources?: ResourceCost;
  /** Hero shards added via HeroSystem.addShards. */
  shards?: ShardReward;
}

/** The identifiers of every quest in the chain. */
export type QuestId =
  | 'raise_a_farm'
  | 'grow_the_center'
  | 'first_recruits'
  | 'found_the_hall'
  | 'first_research'
  | 'muster_an_army'
  | 'repel_the_raiders'
  | 'hold_the_line';

/** Static definition of a single quest node. */
export interface QuestDef {
  id: QuestId;
  /** The declarative completion condition. */
  condition: QuestCondition;
  /** The reward bundle granted on claim. */
  reward: QuestReward;
  /** Predecessor quest that must be CLAIMED before this one is offered. */
  requires?: QuestId;
}

/**
 * The quest chain. Ordered as a progression: each entry (after the first)
 * requires the previous one, so the player is walked through building, upgrade,
 * training, research, and battle milestones. Rewards escalate and mix resources
 * with hero shards so quests feed the hero pillar.
 */
export const QUEST_DEFS: Record<QuestId, QuestDef> = {
  // 1. Build your first food producer.
  raise_a_farm: {
    id: 'raise_a_farm',
    condition: { type: 'buildingLevel', kind: 'farm', level: 1 },
    reward: { resources: { food: 200, wood: 120 } },
  },
  // 2. Grow the capital to unlock the mid-game buildings.
  grow_the_center: {
    id: 'grow_the_center',
    condition: { type: 'townCenterLevel', level: 3 },
    reward: { resources: { wood: 200, stone: 200, gold: 120 } },
    requires: 'raise_a_farm',
  },
  // 3. Train your first troops.
  first_recruits: {
    id: 'first_recruits',
    condition: { type: 'troopsTrained', count: 10 },
    reward: { resources: { gold: 150 }, shards: { heroId: 'ser_alden', shards: 5 } },
    requires: 'grow_the_center',
  },
  // 4. Establish the research building.
  found_the_hall: {
    id: 'found_the_hall',
    condition: { type: 'buildingLevel', kind: 'research', level: 1 },
    reward: { resources: { gold: 200, stone: 150 } },
    requires: 'first_recruits',
  },
  // 5. Unlock your first tech.
  first_research: {
    id: 'first_research',
    condition: { type: 'techUnlocked', count: 1 },
    reward: { resources: { gold: 250 }, shards: { heroId: 'mira_goldhand', shards: 6 } },
    requires: 'found_the_hall',
  },
  // 6. Field a real army.
  muster_an_army: {
    id: 'muster_an_army',
    condition: { type: 'troopsTrained', count: 30 },
    reward: { resources: { food: 400, gold: 200 }, shards: { heroId: 'kara_stormblade', shards: 8 } },
    requires: 'first_research',
  },
  // 7. Win a handful of battles.
  repel_the_raiders: {
    id: 'repel_the_raiders',
    condition: { type: 'battlesWon', count: 5 },
    reward: { resources: { gold: 400 }, shards: { heroId: 'ser_alden', shards: 10 } },
    requires: 'muster_an_army',
  },
  // 8. Fortify: reach a defended, well-researched late game.
  hold_the_line: {
    id: 'hold_the_line',
    condition: { type: 'techUnlocked', count: 3 },
    reward: { resources: { wood: 500, stone: 500, gold: 500 }, shards: { heroId: 'kara_stormblade', shards: 12 } },
    requires: 'repel_the_raiders',
  },
};

/** All quest ids in chain order. */
export const QUEST_ORDER: readonly QuestId[] = [
  'raise_a_farm',
  'grow_the_center',
  'first_recruits',
  'found_the_hall',
  'first_research',
  'muster_an_army',
  'repel_the_raiders',
  'hold_the_line',
] as const;

/** Lookup a quest definition (never undefined for a valid id). */
export function questDef(id: QuestId): QuestDef {
  return QUEST_DEFS[id];
}

/** True when `id` is a known quest id. */
export function isQuestId(id: string): id is QuestId {
  return Object.prototype.hasOwnProperty.call(QUEST_DEFS, id);
}

/**
 * A plain snapshot of every statistic the quest conditions read. Assembled by
 * GameState from BuildingSystem / ResearchSystem / the cumulative counters, so
 * the completion logic never touches a live system and stays pure/testable.
 */
export interface QuestProgress {
  /** Current level of every building kind (0 = not built). */
  buildingLevels: Partial<Record<BuildingKind, number>>;
  /** Current Town Center level. */
  townCenterLevel: number;
  /** Cumulative troops trained over the game's lifetime. */
  troopsTrained: number;
  /** Cumulative battles won over the game's lifetime. */
  battlesWon: number;
  /** Number of techs researched so far. */
  techsUnlocked: number;
  /** The set of unlocked tech ids (for a specific-techId condition). */
  unlockedTechIds: readonly string[];
}

/**
 * Pure predicate: whether the quest's condition is satisfied by `progress`.
 * Every condition type is handled; an unknown/future type conservatively
 * returns false rather than throwing.
 */
export function isComplete(def: QuestDef, progress: QuestProgress): boolean {
  const c = def.condition;
  switch (c.type) {
    case 'buildingLevel':
      return (progress.buildingLevels[c.kind] ?? 0) >= c.level;
    case 'townCenterLevel':
      return progress.townCenterLevel >= c.level;
    case 'troopsTrained':
      return progress.troopsTrained >= c.count;
    case 'battlesWon':
      return progress.battlesWon >= c.count;
    case 'techUnlocked':
      if (c.techId) return progress.unlockedTechIds.includes(c.techId);
      return progress.techsUnlocked >= (c.count ?? 1);
    default:
      return false;
  }
}

/**
 * The current numeric progress toward a quest's condition as a [have, need]
 * pair, for a "3 / 10" style readout. For a specific-techId condition the pair
 * is [0|1, 1]. Building/town-center conditions report level progress.
 */
export function conditionProgress(def: QuestDef, progress: QuestProgress): { have: number; need: number } {
  const c = def.condition;
  switch (c.type) {
    case 'buildingLevel':
      return { have: Math.min(progress.buildingLevels[c.kind] ?? 0, c.level), need: c.level };
    case 'townCenterLevel':
      return { have: Math.min(progress.townCenterLevel, c.level), need: c.level };
    case 'troopsTrained':
      return { have: Math.min(progress.troopsTrained, c.count), need: c.count };
    case 'battlesWon':
      return { have: Math.min(progress.battlesWon, c.count), need: c.count };
    case 'techUnlocked':
      if (c.techId) return { have: progress.unlockedTechIds.includes(c.techId) ? 1 : 0, need: 1 };
      return { have: Math.min(progress.techsUnlocked, c.count ?? 1), need: c.count ?? 1 };
    default:
      return { have: 0, need: 1 };
  }
}
