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

/** The buildable structure kinds. `town_center` gates the level cap of the rest. */
export type BuildingKind =
  | 'town_center'
  | 'farm'
  | 'lumber_mill'
  | 'quarry'
  | 'mine'
  | 'barracks'
  | 'research';

/** Producer buildings map to the single resource they generate. */
export type ProducerKind = Exclude<BuildingKind, 'town_center' | 'barracks' | 'research'>;

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
  /** Epoch ms of the last simulation update (drives offline reconciliation). */
  lastSeenAt: number;
}
