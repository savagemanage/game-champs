/**
 * Shared cross-cutting types for Kingdom Rise.
 *
 * These are the vocabulary the later features (economy, buildings, training,
 * combat, save/load) all import so their contracts line up. Nothing here
 * depends on Phaser, so the pure-logic systems and their unit tests can import
 * these freely.
 */

import { RESOURCE_ORDER } from '../config/GameConfig';

/** The four resource kinds. Derived from the canonical RESOURCE_ORDER tuple. */
export type ResourceKind = (typeof RESOURCE_ORDER)[number];

/** A full resource bundle: an amount for every resource kind. */
export type Resources = Record<ResourceKind, number>;

/** A partial cost/reward bundle (missing kinds are treated as 0). */
export type ResourceCost = Partial<Resources>;

/**
 * The buildable structure kinds. `town_center` gates the level cap of the rest.
 * `wall` and `watchtower` are non-producer DEFENSIVE buildings: their levels
 * contribute to the town's aggregate defense value (see BuildingConfig
 * defenseValue / BuildingSystem.townDefense), which the combat resolver factors
 * into a raid's outcome.
 */
export type BuildingKind =
  | 'town_center'
  | 'farm'
  | 'lumber_mill'
  | 'quarry'
  | 'mine'
  | 'barracks'
  | 'research'
  | 'wall'
  | 'watchtower';

/** Producer buildings map to the single resource they generate. */
export type ProducerKind = Exclude<
  BuildingKind,
  'town_center' | 'barracks' | 'research' | 'wall' | 'watchtower'
>;

/**
 * The defensive building kinds whose levels feed the town's aggregate defense
 * value. Kept as a subset of {@link BuildingKind} so the aggregation and config
 * stay in lock-step.
 */
export type DefenseKind = 'wall' | 'watchtower';

/**
 * The trainable troop kinds. Five roles form a soft rock-paper-scissors cycle
 * (see TroopConfig.TROOP_COUNTER):
 *   - spearman: light infantry (anti-cavalry pikes)
 *   - archer:   ranged skirmisher
 *   - knight:   heavy cavalry
 *   - cavalry:  fast flanker (runs down archers/ranged)
 *   - siege:    slow anti-armour engine (crushes heavy units)
 */
export type TroopKind = 'spearman' | 'archer' | 'knight' | 'cavalry' | 'siege';

/** A standing army: a count for every troop kind. */
export type Army = Record<TroopKind, number>;

/**
 * The enemy raider kinds faced in battle:
 *   - raider: light, fast skirmisher (spearman-role)
 *   - brute:  durable heavy infantry (knight-role)
 *   - ram:    slow, armored siege engine (siege-role)
 *   - rider:  fast raider-cavalry appearing at higher waves (cavalry-role)
 */
export type EnemyKind = 'raider' | 'brute' | 'ram' | 'rider';

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
 * Persisted research state: the unlocked tech ids and the single in-progress
 * research slot (or null). Kept as a structural type here (rather than importing
 * the systems layer) so this dependency-light types module stays leaf-level.
 * OLD saves written before the research feature simply omit this field; the
 * save layer default-constructs a fresh research state when it is missing.
 */
export interface ResearchStateSave {
  unlocked: string[];
  active: { techId: string; endsAt: number } | null;
}

/**
 * Persisted hero state: each recruited hero's progression and the single active
 * hero id (or null). Kept as a structural type here (rather than importing the
 * systems layer) so this dependency-light types module stays leaf-level. OLD
 * saves written before the heroes feature simply omit this field; the save
 * layer default-constructs a fresh (empty) hero roster when it is missing.
 */
export interface HeroStateSave {
  recruited: Record<string, { level: number; stars: number; shards: number }>;
  active: string | null;
}

/**
 * Persisted quest state: the ids of quests whose reward has been claimed. Every
 * other quest status is derived at runtime from the live progress snapshot, so
 * only the claimed set needs persisting. Kept as a structural type here (rather
 * than importing the systems layer) so this dependency-light types module stays
 * leaf-level. OLD saves written before the quests feature simply omit this
 * field; the save layer default-constructs a fresh (empty) quest log when it is
 * missing.
 */
export interface QuestStateSave {
  claimed: string[];
}

/** The complete persisted game state (serialized to localStorage by the save feature). */
export interface GameState {
  /** Save-format version so future migrations can be detected. */
  version: number;
  resources: Resources;
  buildings: BuildingState[];
  /** Trained, idle troops available to send into battle. */
  army: Record<TroopKind, number>;
  trainingQueue: TrainingOrder[];
  /** Highest battle wave cleared. */
  waveCleared: number;
  /**
   * Scholars' Hall research progress. OPTIONAL for backward compatibility:
   * version-1 saves predate research and omit it, so the save layer treats a
   * missing value as a fresh (empty) research state.
   */
  research?: ResearchStateSave;
  /**
   * Hero roster progress. OPTIONAL for backward compatibility: version-1 and
   * version-2 saves predate heroes and omit it, so the save layer treats a
   * missing value as a fresh (empty) hero roster.
   */
  heroes?: HeroStateSave;
  /**
   * Progression-quest log (claimed quest ids). OPTIONAL for backward
   * compatibility: saves predating the quests feature omit it, so the save
   * layer treats a missing value as a fresh (empty) quest log.
   */
  quests?: QuestStateSave;
  /**
   * Cumulative count of troops trained over the game's lifetime (a quest
   * counter). OPTIONAL: defaults to 0 for saves predating the quests feature.
   */
  troopsTrained?: number;
  /**
   * Cumulative count of battles won over the game's lifetime (a quest counter).
   * OPTIONAL: defaults to 0 for saves predating the quests feature.
   */
  battlesWon?: number;
  /**
   * The keep's current Hearth warmth (온기) scalar. OPTIONAL for backward
   * compatibility: saves predating the Hearth feature omit it, so the save
   * layer treats a missing value as a fully-warm keep (a warm start), migrating
   * old saves forward without penalty. Persisted as a plain number.
   */
  warmth?: number;
  /**
   * Whether the first-run onboarding welcome card has already been shown.
   * OPTIONAL for backward compatibility: saves predating this flag omit it. The
   * save layer treats a missing value on an EXISTING save as `true` (a returning
   * player has already seen the game, so they are never shown the welcome), while
   * a brand-new game starts `false` so the welcome is shown exactly once.
   */
  onboardingSeen?: boolean;
  /** Epoch ms of the last simulation update (drives offline reconciliation). */
  lastSeenAt: number;
}
