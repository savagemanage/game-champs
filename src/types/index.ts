/**
 * Shared cross-cutting types for Frosthold: Last Ember.
 *
 * These are the vocabulary the later features (economy, buildings, training,
 * combat, save/load, warmth) all import so their contracts line up. Nothing
 * here depends on Phaser, so the pure-logic systems and their unit tests can
 * import these freely.
 */

import { RESOURCE_ORDER } from '../config/GameConfig';

/**
 * The four resource kinds of the frozen settlement (rations, timber, coal,
 * iron). Derived from the canonical RESOURCE_ORDER tuple.
 */
export type ResourceKind = (typeof RESOURCE_ORDER)[number];

/** A full resource bundle: an amount for every resource kind. */
export type Resources = Record<ResourceKind, number>;

/** A partial cost/reward bundle (missing kinds are treated as 0). */
export type ResourceCost = Partial<Resources>;

/**
 * The buildable structure kinds. `furnace` (the Ember) gates the level cap of
 * the rest. The original six are the founding roster; the FEAT-002 expansion
 * adds a Furnace-gated city of ORIGINAL-named support buildings (envoy hall,
 * warming ward, frost vault, ember archive, shelter row, forge hall) plus the
 * three class training yards that FEAT-004 will build troops from.
 */
export type BuildingKind =
  | 'furnace'
  | 'hunters_hut'
  | 'sawmill'
  | 'coal_pit'
  | 'iron_mine'
  | 'war_camp'
  // --- FEAT-002 expanded city (all original names) ---
  | 'envoy_hall' // diplomacy / help hub (Embassy-equivalent)
  | 'warming_ward' // heals/recovers wounded survivors (Infirmary-equivalent)
  | 'frost_vault' // shelters a fraction of resources from raids (Warehouse-equivalent)
  | 'ember_archive' // research/academy building (Academy-equivalent)
  | 'shelter_row' // survivor housing (raises population cap)
  | 'forge_hall' // steelworks: converts iron + coal -> steel (refinery)
  | 'infantry_yard' // class training: front-line infantry
  | 'lancer_yard' // class training: lancers
  | 'marksman_range'; // class training: marksmen

/**
 * Producer buildings map to the single resource they generate. Non-producers
 * (furnace, war_camp, and the new support/training buildings, plus the refinery
 * which is handled separately) are excluded.
 */
export type ProducerKind = Exclude<
  BuildingKind,
  | 'furnace'
  | 'war_camp'
  | 'envoy_hall'
  | 'warming_ward'
  | 'frost_vault'
  | 'ember_archive'
  | 'shelter_row'
  | 'forge_hall'
  | 'infantry_yard'
  | 'lancer_yard'
  | 'marksman_range'
>;

/** The trainable troop kinds (survivor militia roles). */
export type TroopKind = 'trapper' | 'marksman' | 'vanguard';

/** A standing army: a count for every troop kind. */
export type Army = Record<TroopKind, number>;

/** The Frozen Horde enemy kinds faced in battle. */
export type EnemyKind = 'frost_wolf' | 'ravager' | 'frost_titan';

/** A combatant's shared stat block (troops and enemies both use this shape). */
export interface UnitStats {
  hp: number;
  attack: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** Movement speed in world px/second (battle lane). */
  speed: number;
  /** Attack reach in world px. */
  range: number;
}

/** A single building's persisted state. */
export interface BuildingState {
  kind: BuildingKind;
  level: number;
  /** Epoch ms when an in-progress upgrade completes, or null when idle. */
  upgradeEndsAt: number | null;
}

/** A queued training batch. */
export interface TrainingOrder {
  troop: TroopKind;
  count: number;
  /** Epoch ms when this batch completes. */
  completesAt: number;
}

/**
 * The survivor workforce, persisted. `total` survivors are split into those
 * `assigned` to producer buildings (summed across `assignments`) and the
 * idle remainder. Per-building assignment is keyed by BuildingKind so the
 * save/UI can show who works where; only producer kinds are meaningful keys.
 */
export interface PopulationState {
  /** Total living survivors in the hold. */
  total: number;
  /** Survivors assigned to each producer building (missing = 0 assigned). */
  assignments: Partial<Record<BuildingKind, number>>;
}

// --- FEAT-003: heroes, summon (gacha) and story campaign ---------------------

/**
 * A hero's combat CLASS, the same soft rock-paper-scissors triangle the troops
 * use (FEAT-004 formalizes troop tiers): infantry > lancer > marksman >
 * infantry. A hero leads and buffs its own class, so class composition of the
 * lead heroes matters. Kept as its own union (distinct from TroopKind) so the
 * two vocabularies can diverge later.
 */
export type HeroClass = 'infantry' | 'lancer' | 'marksman';

/**
 * Hero rarity tiers, low to high. Rarity drives base power, star ceiling, the
 * shards a duplicate summon grants, and the summon draw weights. Ordered tuple
 * so UI/iteration share one canonical order; the union is derived from it.
 */
export const HERO_RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const;
export type HeroRarity = (typeof HERO_RARITY_ORDER)[number];

/**
 * The original collectible hero roster ids. All names/lore are ORIGINAL (see
 * HeroConfig + i18n). The union is derived from HERO_IDS so config, systems and
 * the persisted state can never drift out of sync.
 */
export const HERO_IDS = [
  'ember_warden', // common infantry
  'snow_picket', // common marksman
  'drift_runner', // common lancer
  'iron_bulwark', // rare infantry
  'glacier_lance', // rare lancer
  'frost_archer', // rare marksman
  'aurora_sentinel', // epic infantry
  'stormpike_rider', // epic lancer
  'winters_eye', // epic marksman
  'the_kindled_queen', // legendary infantry
  'wyrmspear_valdis', // legendary lancer
  'the_pale_marksman', // legendary marksman
] as const;
export type HeroId = (typeof HERO_IDS)[number];

/**
 * A single owned hero's persisted state. A hero is "owned" once summoned; before
 * that it may still have accumulated `shards` from duplicate pulls / campaign
 * rewards toward its first copy. `level` and `stars` drive power; `skillLevels`
 * mirrors the hero's skill ids -> level.
 */
export interface OwnedHeroState {
  id: HeroId;
  /** True once the first full copy has been obtained (summon or shard craft). */
  owned: boolean;
  /** Current level (>=1 once owned). */
  level: number;
  /** Accumulated XP toward the next level. */
  xp: number;
  /** Star rank (>=1 once owned), gated by rarity ceiling. */
  stars: number;
  /** Loose hero shards held (toward first copy, or toward the next star-up). */
  shards: number;
  /** Per-skill level, keyed by the hero's skill ids. */
  skillLevels: Record<string, number>;
}

/** The persisted hero roster: every touched hero keyed by id, plus lead picks. */
export interface HeroRosterState {
  heroes: Partial<Record<HeroId, OwnedHeroState>>;
  /** The lead heroes whose bonuses apply to the whole hold (ordered, capped). */
  lead: HeroId[];
}

/** The persisted summon/gacha state: total pulls and the pity miss counter. */
export interface SummonState {
  /** Total summons ever performed (for stats / UI). */
  totalPulls: number;
  /** Draws since the last high-rarity (epic+) pull; drives the pity guarantee. */
  pityCounter: number;
}

/** The persisted campaign progress: highest cleared stage index + claimed rewards. */
export interface CampaignState {
  /**
   * Highest cleared stage ORDER index (0 = nothing cleared, 1 = first stage
   * cleared). Gating uses this; a stage is attemptable iff its order <=
   * highestCleared + 1.
   */
  highestCleared: number;
  /** Stage ids whose first-clear reward has already been granted. */
  claimed: string[];
}

/** The complete persisted game state (serialized to localStorage by the save feature). */
export interface GameState {
  /**
   * Save-format version so future migrations can be detected. Bumped to 4 for
   * the FEAT-003 hero + summon + campaign layer (collectible heroes, gacha pity
   * state, and staged campaign progress) on top of the v3 economy/city
   * expansion. Older saves (v1 medieval, v2 pre-expansion, v3 pre-heroes) are
   * detected as a version mismatch and fall back to a fresh frozen settlement
   * rather than mis-mapping.
   */
  version: number;
  resources: Resources;
  /** Ember Sparks: the soft-premium wallet, kept separate from idle resources. */
  premiumCurrency: number;
  /** The survivor workforce (housing, growth, per-building assignment). */
  population: PopulationState;
  /** The collectible hero roster (FEAT-003): owned heroes + lead picks. */
  heroes: HeroRosterState;
  /** The summon/gacha state (FEAT-003): total pulls + pity counter. */
  summon: SummonState;
  /** Story campaign progress (FEAT-003): highest cleared stage + claimed rewards. */
  campaign: CampaignState;
  /**
   * Current Furnace warmth level (the signature frozen-survival mechanic).
   * Persisted so warmth carries across sessions and is reconciled over the
   * offline window on load. A legacy / warmth-less save (undefined) loads to
   * full warmth (see WarmthSystem.fromJSON).
   */
  warmth: number;
  buildings: BuildingState[];
  /** Trained, idle troops available to send into battle. */
  army: Record<TroopKind, number>;
  trainingQueue: TrainingOrder[];
  /** Highest battle wave cleared. */
  waveCleared: number;
  /** Epoch ms of the last simulation update (drives offline reconciliation). */
  lastSeenAt: number;
}
