/**
 * QuestConfig - ORIGINAL daily quests, growth/beginner milestones, and a simple
 * time-boxed events framework (FEAT-005).
 *
 * Quests read game PROGRESS (buildings upgraded, waves cleared, summons pulled,
 * research completed, rally attempts) via a small metric vocabulary and grant
 * resources / Ember Sparks / hero shards. Dailies reset on a day boundary from
 * an injected clock; growth milestones are one-time. Events are time-boxed
 * bonus windows. PURE data + lookups (no Phaser). All names live in i18n keyed
 * `quest.*` / `event.*`.
 */

import type { HeroId, ResourceCost } from '../types';

/**
 * The trackable progress METRICS a quest can key off. GameState fires a hook
 * incrementing the relevant metric from the matching action, and QuestSystem
 * routes it to any quest watching that metric. Kept a small closed vocabulary
 * so config and the hooks never drift.
 */
export const QUEST_METRICS = [
  'buildingUpgraded', // any building upgrade completed
  'waveCleared', // a normal defense wave cleared (growth only)
  'battleCompleted', // any valid resolved wave/campaign/rally/arena attempt
  'summonPulled', // a hero summon performed
  'researchCompleted', // a research node completed
  'rallyAttempt', // an attempt made against a world boss
  'arenaWin', // an arena match won
  'troopTrained', // a troop batch trained
] as const;
export type QuestMetric = (typeof QUEST_METRICS)[number];

/** A quest reward bundle (mirrors the campaign/rally reward shape). */
export interface QuestReward {
  resources?: ResourceCost;
  sparks?: number;
  shards?: Partial<Record<HeroId, number>>;
}

/** A single quest definition (used for both dailies and milestones). */
export interface QuestDef {
  /** Stable quest id (keys i18n + the persisted progress). */
  id: string;
  /** The metric this quest tracks. */
  metric: QuestMetric;
  /** Count of the metric needed to complete the quest. */
  target: number;
  /** Reward granted when claimed (once per day for dailies, once for milestones). */
  reward: QuestReward;
}

/**
 * The DAILY quest set — reset every day. Small, bread-and-butter objectives that
 * nudge the core loop (upgrade, fight, summon, research).
 */
export const DAILY_QUESTS: QuestDef[] = [
  {
    id: 'daily_upgrade',
    metric: 'buildingUpgraded',
    target: 2,
    reward: { resources: { food: 150, wood: 120 } },
  },
  {
    id: 'daily_battle',
    metric: 'battleCompleted',
    target: 3,
    reward: { resources: { iron: 60 }, sparks: 20 },
  },
  {
    id: 'daily_train',
    metric: 'troopTrained',
    target: 1,
    reward: { resources: { food: 100, coal: 80 } },
  },
  {
    id: 'daily_summon',
    metric: 'summonPulled',
    target: 1,
    reward: { sparks: 30 },
  },
];

/**
 * The one-time GROWTH / beginner milestones — bigger, once-ever objectives that
 * reward early progression and never reset.
 */
export const GROWTH_QUESTS: QuestDef[] = [
  {
    id: 'growth_first_wave',
    metric: 'waveCleared',
    target: 1,
    reward: { resources: { food: 200 }, sparks: 50 },
  },
  {
    id: 'growth_builder',
    metric: 'buildingUpgraded',
    target: 10,
    reward: { resources: { food: 400, wood: 300, iron: 150 } },
  },
  {
    id: 'growth_scholar',
    metric: 'researchCompleted',
    target: 3,
    reward: { sparks: 100 },
  },
  {
    id: 'growth_champion',
    metric: 'waveCleared',
    target: 10,
    reward: { sparks: 150, shards: { aurora_sentinel: 8 } },
  },
  {
    id: 'growth_hunter',
    metric: 'rallyAttempt',
    target: 5,
    reward: { resources: { steel: 40 }, sparks: 80 },
  },
];

/** A time-boxed EVENT: a bonus window with an original theme + a multiplier. */
export interface EventDef {
  /** Stable event id (keys i18n). */
  id: string;
  /**
   * A production bonus multiplier applied to idle output while the event runs
   * (1.5 = +50%). Exposed by QuestSystem so GameState can consult it; the event
   * framework stays generic (the multiplier is the objective payoff).
   */
  productionBonus: number;
}

/** The available events (one can be active at a time within its window). */
export const EVENTS: EventDef[] = [
  { id: 'ember_rush', productionBonus: 1.5 },
  { id: 'frostfall_hunt', productionBonus: 1.25 },
];

/** All daily quests by id. */
const DAILY_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  DAILY_QUESTS.map((q) => [q.id, q]),
);
/** All growth quests by id. */
const GROWTH_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  GROWTH_QUESTS.map((q) => [q.id, q]),
);
/** All events by id. */
const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Daily quest ids in order. */
export const DAILY_QUEST_IDS: readonly string[] = DAILY_QUESTS.map((q) => q.id);
/** Growth quest ids in order. */
export const GROWTH_QUEST_IDS: readonly string[] = GROWTH_QUESTS.map((q) => q.id);

/** Lookup a daily quest by id. */
export function dailyQuest(id: string): QuestDef | undefined {
  return DAILY_BY_ID[id];
}
/** Lookup a growth quest by id. */
export function growthQuest(id: string): QuestDef | undefined {
  return GROWTH_BY_ID[id];
}
/** Lookup an event by id. */
export function eventDef(id: string): EventDef | undefined {
  return EVENT_BY_ID[id];
}
