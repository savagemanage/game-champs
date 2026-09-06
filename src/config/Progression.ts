/**
 * Progression.ts - the offline progression meta tuning for LAST SQUAD (FEAT-004).
 *
 * This module is Phaser-free `as const` design data shared by the pure
 * progression systems (Campaign, DailyMissions, Season, League) and their
 * vitest tests, so the whole meta loop can be tuned in one place with the same
 * single-source-of-truth pattern as {@link GameConfig}.
 *
 * Everything here models an OFFLINE, single-player game: PvE campaign stages and
 * zombie waves are seeded AI formations resolved by the FEAT-003 combat engine;
 * the "alliance duel" and "league" are AI simulations with deterministic seeded
 * scores. There is NO networking and NO real multiplayer anywhere in the game.
 *
 * Reward amounts, gating thresholds, XP curves, and AI-simulation parameters
 * all live here; the systems read them rather than hardcoding magic numbers.
 */

import type {
  DailyTaskCategory,
  HeroRole,
  HeroType,
  ResourceKind,
} from '../types';

/**
 * A reward bundle a stage / mission / tier can grant. Every field is optional;
 * the systems merge these into the runtime economy (resources -> stockpiles,
 * shards -> hero progression currency, seasonXp -> the battle-pass track,
 * coins -> the gate-runner meta wallet).
 */
export interface RewardBundle {
  /** Resource stockpile grants keyed by {@link ResourceKind}. */
  resources?: Partial<Record<ResourceKind, number>>;
  /** Hero progression shards. */
  shards?: number;
  /** Season / battle-pass XP. */
  seasonXp?: number;
  /** Gate-runner meta coins. */
  coins?: number;
}

/**
 * A single enemy combatant slot in a seeded AI formation blueprint. The
 * Campaign / League systems turn these into concrete combat {@link Team}s by
 * scaling the base stats with the stage/wave multiplier. Rows follow the same
 * 2-front / 3-back rule as the player squad.
 */
export interface EnemyUnitDef {
  /** Stable id used for the combatant (for the battle timeline). */
  id: string;
  /** Combat type (type triangle). */
  type: HeroType;
  /** Battlefield role (combat behavior). */
  role: HeroRole;
  /** Front or back row placement. */
  row: 'front' | 'back';
  /** Base HP before the stage/wave scale multiplier. */
  hp: number;
  /** Base ATK before scaling. */
  atk: number;
  /** Base DEF before scaling. */
  def: number;
  /** Turn-order speed (unscaled). */
  speed: number;
}

/** A named enemy formation blueprint (up to 5 units, 2 front + 3 back). */
export type EnemyFormationDef = readonly EnemyUnitDef[];

/**
 * A PvE campaign stage definition. Each stage owns an enemy formation
 * blueprint, a stat-scale multiplier, a required seasonal virus-resistance
 * level (the seasonal gate), and a reward bundle granted on first clear.
 * Advancing to a stage also requires the previous stage to be cleared.
 */
export interface StageDef {
  /** Stable stage id. */
  id: string;
  /** i18n key for the stage name. */
  nameKey: string;
  /** Enemy formation blueprint key (see {@link ENEMY_FORMATIONS}). */
  formation: keyof typeof ENEMY_FORMATIONS;
  /** Multiplier applied to the blueprint's base stats for this stage. */
  scale: number;
  /** Minimum seasonal virus-resistance level required to attempt this stage. */
  requiredResistance: number;
  /** Reward granted the first time the stage is cleared. */
  reward: RewardBundle;
}

/**
 * Named enemy formation blueprints reused by campaign stages, zombie waves, and
 * league AI opponents. Each is a small squad; the consuming system scales the
 * stats and (for zombie waves) may layer additional wave scaling on top.
 */
export const ENEMY_FORMATIONS = {
  /** Light scout screen: a couple of fragile skirmishers. */
  raiders: [
    { id: 'raider_front', type: 'tank', role: 'tank', row: 'front', hp: 700, atk: 60, def: 45, speed: 40 },
    { id: 'raider_gun', type: 'missile', role: 'dealer', row: 'back', hp: 480, atk: 110, def: 25, speed: 62 },
  ],
  /** Balanced militia: a front wall plus mixed backline. */
  militia: [
    { id: 'militia_wall', type: 'tank', role: 'tank', row: 'front', hp: 950, atk: 70, def: 70, speed: 42 },
    { id: 'militia_striker', type: 'aircraft', role: 'dealer', row: 'front', hp: 640, atk: 130, def: 35, speed: 74 },
    { id: 'militia_gun', type: 'missile', role: 'dealer', row: 'back', hp: 560, atk: 120, def: 30, speed: 64 },
    { id: 'militia_medic', type: 'missile', role: 'support', row: 'back', hp: 600, atk: 80, def: 40, speed: 60 },
  ],
  /** Armored column: heavy front line, hard to crack without missiles. */
  armored: [
    { id: 'armor_van', type: 'tank', role: 'tank', row: 'front', hp: 1300, atk: 85, def: 110, speed: 38 },
    { id: 'armor_flank', type: 'tank', role: 'dealer', row: 'front', hp: 1000, atk: 140, def: 80, speed: 46 },
    { id: 'armor_arty', type: 'missile', role: 'dealer', row: 'back', hp: 700, atk: 150, def: 40, speed: 58 },
    { id: 'armor_support', type: 'tank', role: 'support', row: 'back', hp: 820, atk: 95, def: 70, speed: 50 },
    { id: 'armor_recon', type: 'aircraft', role: 'dealer', row: 'back', hp: 720, atk: 135, def: 45, speed: 78 },
  ],
  /** Air wing: fast aircraft that punish tank-heavy squads. */
  airwing: [
    { id: 'wing_lead', type: 'aircraft', role: 'tank', row: 'front', hp: 1100, atk: 90, def: 90, speed: 60 },
    { id: 'wing_ace', type: 'aircraft', role: 'dealer', row: 'front', hp: 780, atk: 175, def: 45, speed: 86 },
    { id: 'wing_bomber', type: 'aircraft', role: 'dealer', row: 'back', hp: 820, atk: 160, def: 50, speed: 80 },
    { id: 'wing_medic', type: 'aircraft', role: 'support', row: 'back', hp: 900, atk: 100, def: 60, speed: 76 },
    { id: 'wing_escort', type: 'missile', role: 'dealer', row: 'back', hp: 640, atk: 140, def: 35, speed: 68 },
  ],
  /** Shambling horde: many weak melee bodies (zombie-wave base). */
  horde: [
    { id: 'horde_maw', type: 'tank', role: 'dealer', row: 'front', hp: 900, atk: 100, def: 40, speed: 30 },
    { id: 'horde_brute', type: 'tank', role: 'tank', row: 'front', hp: 1200, atk: 80, def: 60, speed: 28 },
    { id: 'horde_spitter', type: 'missile', role: 'dealer', row: 'back', hp: 620, atk: 130, def: 20, speed: 44 },
    { id: 'horde_swarm', type: 'aircraft', role: 'dealer', row: 'back', hp: 560, atk: 120, def: 25, speed: 52 },
    { id: 'horde_carrier', type: 'tank', role: 'support', row: 'back', hp: 800, atk: 70, def: 50, speed: 34 },
  ],
  /** Mutant boss: a single overwhelming bruiser plus escorts. */
  behemoth: [
    { id: 'behemoth', type: 'tank', role: 'dealer', row: 'front', hp: 3200, atk: 220, def: 130, speed: 46 },
    { id: 'behemoth_claw', type: 'aircraft', role: 'dealer', row: 'front', hp: 1200, atk: 180, def: 60, speed: 82 },
    { id: 'behemoth_spore', type: 'missile', role: 'support', row: 'back', hp: 1000, atk: 120, def: 55, speed: 58 },
    { id: 'behemoth_horn', type: 'missile', role: 'dealer', row: 'back', hp: 950, atk: 190, def: 45, speed: 66 },
    { id: 'behemoth_shell', type: 'tank', role: 'tank', row: 'back', hp: 1600, atk: 90, def: 120, speed: 40 },
  ],
} as const satisfies Record<string, EnemyFormationDef>;

/**
 * The PvE campaign: an ordered list of stages. Each raises the required
 * seasonal virus-resistance so the season's resistance stat literally gates how
 * far the campaign can progress, on top of the previous-stage-cleared rule.
 */
export const CAMPAIGN_STAGES = [
  {
    id: 'stage_1',
    nameKey: 'campaign.stage.outskirts',
    formation: 'raiders',
    scale: 1.0,
    requiredResistance: 0,
    reward: { resources: { rations: 200, steel: 150 }, shards: 10, seasonXp: 40, coins: 20 },
  },
  {
    id: 'stage_2',
    nameKey: 'campaign.stage.checkpoint',
    formation: 'militia',
    scale: 1.15,
    requiredResistance: 0,
    reward: { resources: { rations: 260, steel: 200, fuel: 100 }, shards: 12, seasonXp: 50, coins: 25 },
  },
  {
    id: 'stage_3',
    nameKey: 'campaign.stage.depot',
    formation: 'militia',
    scale: 1.35,
    requiredResistance: 1,
    reward: { resources: { steel: 300, fuel: 180, circuitry: 40 }, shards: 15, seasonXp: 60, coins: 30 },
  },
  {
    id: 'stage_4',
    nameKey: 'campaign.stage.overpass',
    formation: 'armored',
    scale: 1.4,
    requiredResistance: 2,
    reward: { resources: { steel: 360, fuel: 240, circuitry: 60 }, shards: 18, seasonXp: 75, coins: 35 },
  },
  {
    id: 'stage_5',
    nameKey: 'campaign.stage.airfield',
    formation: 'airwing',
    scale: 1.55,
    requiredResistance: 3,
    reward: { resources: { fuel: 320, circuitry: 90 }, shards: 22, seasonXp: 90, coins: 45 },
  },
  {
    id: 'stage_6',
    nameKey: 'campaign.stage.citadel',
    formation: 'behemoth',
    scale: 1.7,
    requiredResistance: 5,
    reward: { resources: { steel: 500, fuel: 400, circuitry: 150 }, shards: 30, seasonXp: 140, coins: 80 },
  },
] as const satisfies readonly StageDef[];

/**
 * A zombie-wave definition. Waves reuse the {@link ENEMY_FORMATIONS} horde/
 * behemoth blueprints but layer an ADDITIONAL per-wave stat multiplier so later
 * waves scale up sharply, matching an endless-defense feel. Rewards scale with
 * the wave index at runtime (see Campaign.zombieWaveReward).
 */
export interface ZombieWaveDef {
  /** Enemy formation blueprint key. */
  formation: keyof typeof ENEMY_FORMATIONS;
  /** Base stat multiplier for the first wave using this definition. */
  baseScale: number;
}

/** Zombie-wave tuning: definitions cycle, scale grows per wave index. */
export const ZOMBIE_WAVES = {
  /** Ordered pool of wave blueprints; the wave index selects one (mod length). */
  DEFS: [
    { formation: 'horde', baseScale: 1.0 },
    { formation: 'horde', baseScale: 1.15 },
    { formation: 'behemoth', baseScale: 1.05 },
  ] as const satisfies readonly ZombieWaveDef[],
  /** Additional multiplicative scaling applied per wave index (0-based). */
  SCALE_PER_WAVE: 0.12,
  /** Base reward granted per cleared wave (scaled by 1 + index * REWARD_PER_WAVE). */
  BASE_REWARD: { shards: 6, seasonXp: 25, coins: 10 } as RewardBundle,
  /** Fractional reward growth per wave index. */
  REWARD_PER_WAVE: 0.2,
} as const;

/**
 * Ordered tuple of daily "arms race" task categories. The DailyTaskCategory
 * union type is derived in src/types. Mirrors the spec's rotating arms-race
 * objectives: construction, recruiting, powering-up, combat, and the mini-game.
 */
export const DAILY_TASK_CATEGORIES = [
  'build',
  'recruit',
  'power_up',
  'combat',
  'mini_game',
] as const;

/**
 * A daily arms-race task template. The DailyMissions system picks a
 * deterministic-per-day rotating subset of these; each tracks progress of one
 * category up to `target`, awarding `points` (toward the daily arms-race score)
 * and a reward bundle when completed.
 */
export interface DailyTaskTemplate {
  /** Stable template id (also the progress key within a day). */
  id: string;
  /** i18n key for the task description. */
  nameKey: string;
  /** Which game-event category advances this task. */
  category: DailyTaskCategory;
  /** Units of the category required to complete the task. */
  target: number;
  /** Arms-race points awarded on completion. */
  points: number;
  /** Reward bundle granted on completion. */
  reward: RewardBundle;
}

/** Daily arms-race + weekly alliance-duel tuning. */
export const MISSIONS = {
  /**
   * How many arms-race tasks are active per day. The DailyMissions system draws
   * this many templates deterministically from a per-day seed.
   */
  DAILY_TASK_COUNT: 4,
  /** The full pool of daily task templates the daily set is drawn from. */
  DAILY_TEMPLATES: [
    { id: 'build_1', nameKey: 'mission.daily.build', category: 'build', target: 1, points: 100, reward: { resources: { steel: 120 }, seasonXp: 20 } },
    { id: 'build_2', nameKey: 'mission.daily.buildMany', category: 'build', target: 3, points: 200, reward: { resources: { steel: 260 }, seasonXp: 40 } },
    { id: 'recruit_1', nameKey: 'mission.daily.recruit', category: 'recruit', target: 1, points: 100, reward: { shards: 10, seasonXp: 20 } },
    { id: 'recruit_2', nameKey: 'mission.daily.recruitMany', category: 'recruit', target: 5, points: 220, reward: { shards: 30, seasonXp: 45 } },
    { id: 'power_1', nameKey: 'mission.daily.powerUp', category: 'power_up', target: 2, points: 120, reward: { shards: 12, seasonXp: 25 } },
    { id: 'power_2', nameKey: 'mission.daily.powerUpMany', category: 'power_up', target: 6, points: 240, reward: { shards: 36, seasonXp: 50 } },
    { id: 'combat_1', nameKey: 'mission.daily.combat', category: 'combat', target: 2, points: 120, reward: { resources: { fuel: 120 }, seasonXp: 25 } },
    { id: 'combat_2', nameKey: 'mission.daily.combatMany', category: 'combat', target: 5, points: 250, reward: { resources: { fuel: 260 }, seasonXp: 55 } },
    { id: 'mini_1', nameKey: 'mission.daily.miniGame', category: 'mini_game', target: 1, points: 100, reward: { coins: 40, seasonXp: 20 } },
    { id: 'mini_2', nameKey: 'mission.daily.miniGameMany', category: 'mini_game', target: 3, points: 220, reward: { coins: 120, seasonXp: 45 } },
  ] as const satisfies readonly DailyTaskTemplate[],
  /**
   * Milestone thresholds on the accumulated daily arms-race score, each with a
   * bonus reward chest. Reaching a threshold grants its reward once per day.
   */
  DAILY_MILESTONES: [
    { points: 200, reward: { shards: 15, seasonXp: 30 } },
    { points: 500, reward: { shards: 30, seasonXp: 60 } },
    { points: 900, reward: { shards: 50, seasonXp: 100, coins: 100 } },
  ] as const,
  /** Weekly "alliance duel" tuning: player weekly score vs a seeded AI alliance. */
  ALLIANCE_DUEL: {
    /** The AI alliance's weekly score is drawn in this range from the week seed. */
    AI_SCORE_RANGE: [600, 1400] as const,
    /** Placement rewards: [win, loss]. Granted on week rollover. */
    WIN_REWARD: { shards: 80, seasonXp: 150, coins: 150 } as RewardBundle,
    LOSS_REWARD: { shards: 30, seasonXp: 60, coins: 50 } as RewardBundle,
  },
} as const;

/**
 * Season / battle-pass tuning. The season track advances by XP; each tier costs
 * a growing amount of XP and grants a free-track reward plus a premium-track
 * reward. The premium track is unlocked by an IN-GAME achievement (clearing the
 * gate given by {@link SEASON.PREMIUM_UNLOCK_RESISTANCE} seasonal resistance),
 * NOT by real money - this is a single-player static game with no purchases.
 *
 * The seasonal "virus resistance" stat is raised by spending season XP-derived
 * resistance points; it gates campaign stages and later season tiers. On season
 * rollover the seasonal progress (XP, tier, resistance) resets while permanent
 * gains (heroes, buildings, resources already banked) are preserved.
 */
export const SEASON = {
  /** XP required to advance FROM tier T to T+1 = round(BASE * GROWTH^T). */
  TIER_XP_BASE: 100,
  TIER_XP_GROWTH: 1.18,
  /** Highest reachable tier in a season. */
  MAX_TIER: 30,
  /** Seasonal virus-resistance the player starts each season at. */
  START_RESISTANCE: 0,
  /** Maximum seasonal virus-resistance level. */
  MAX_RESISTANCE: 10,
  /** Season XP spent to raise virus resistance by one level (geometric). */
  RESISTANCE_COST_BASE: 150,
  RESISTANCE_COST_GROWTH: 1.35,
  /** Reaching this resistance level unlocks the premium reward track. */
  PREMIUM_UNLOCK_RESISTANCE: 3,
  /**
   * Reward tracks indexed by tier (tier 1 => index 0). Each tier grants the
   * free reward always and the premium reward only when the premium track is
   * unlocked. The list length caps meaningful rewards; tiers beyond it still
   * advance but grant nothing.
   */
  TIER_REWARDS: [
    { free: { resources: { rations: 150 } }, premium: { shards: 20 } },
    { free: { shards: 8 }, premium: { resources: { circuitry: 40 } } },
    { free: { resources: { steel: 220 } }, premium: { shards: 25 } },
    { free: { coins: 40 }, premium: { shards: 30 } },
    { free: { shards: 12 }, premium: { resources: { circuitry: 80 }, coins: 60 } },
    { free: { resources: { fuel: 260 } }, premium: { shards: 40 } },
    { free: { shards: 15 }, premium: { resources: { steel: 400 } } },
    { free: { coins: 80 }, premium: { shards: 50 } },
    { free: { resources: { circuitry: 60 } }, premium: { shards: 60, coins: 120 } },
    { free: { shards: 25 }, premium: { resources: { rations: 500, steel: 500 }, coins: 150 } },
  ] as const,
} as const;

/**
 * League / alliance tuning (OFFLINE AI simulation). The player belongs to one
 * alliance; a fixed number of AI alliances have deterministic seeded power
 * scores that drift each league period. Standings rank all alliances by power;
 * the player's alliance power is derived from their team power. League "PvP"
 * matches resolve against a seeded AI formation via the FEAT-003 combat engine.
 * No networking - purely local simulation.
 */
export const LEAGUE = {
  /** Number of AI alliances the player competes against for standings. */
  AI_ALLIANCE_COUNT: 9,
  /** Base power an AI alliance is seeded around. */
  AI_BASE_POWER: 8000,
  /** Half-width of the seeded AI power spread (+/- around the base). */
  AI_POWER_SPREAD: 5000,
  /** How much an AI alliance's power can drift per league period (+/-). */
  AI_DRIFT: 1200,
  /** Placement reward tiers by final rank bracket (1 = best). */
  RANK_REWARDS: [
    { maxRank: 1, reward: { shards: 100, seasonXp: 200, coins: 200 } },
    { maxRank: 3, reward: { shards: 60, seasonXp: 120, coins: 120 } },
    { maxRank: 6, reward: { shards: 30, seasonXp: 60, coins: 60 } },
    { maxRank: 999, reward: { shards: 10, seasonXp: 20, coins: 20 } },
  ] as const,
  /** AI opponent formations a league PvP match may draw from. */
  MATCH_FORMATIONS: ['militia', 'armored', 'airwing'] as const,
  /** Scale applied to a league PvP AI opponent's stats. */
  MATCH_SCALE: 1.3,
} as const;

/** Ordered tuple of campaign stage ids (canonical iteration order). */
export const CAMPAIGN_ORDER = CAMPAIGN_STAGES.map((s) => s.id);

/** A campaign stage id string-literal union. */
export type CampaignStageId = (typeof CAMPAIGN_STAGES)[number]['id'];
