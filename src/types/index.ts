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

/** The buildable structure kinds. `furnace` (the Ember) gates the level cap of the rest. */
export type BuildingKind =
  | 'furnace'
  | 'hunters_hut'
  | 'sawmill'
  | 'coal_pit'
  | 'iron_mine'
  | 'war_camp';

/** Producer buildings map to the single resource they generate. */
export type ProducerKind = Exclude<BuildingKind, 'furnace' | 'war_camp'>;

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

/** The complete persisted game state (serialized to localStorage by the save feature). */
export interface GameState {
  /**
   * Save-format version so future migrations can be detected. Bumped to 2 for
   * the Frosthold re-theme (new resource/building/troop/enemy vocabulary), so
   * legacy medieval saves are detected as a version mismatch and fall back to a
   * fresh frozen settlement rather than mis-mapping.
   */
  version: number;
  resources: Resources;
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
