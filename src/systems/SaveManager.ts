/**
 * SaveManager.ts - versioned persistence of LAST SQUAD meta-progression.
 *
 * A run itself is transient and never saved; only meta-progression (coins,
 * purchased upgrade levels, personal bests, runs played) persists. The pure
 * layer works entirely with plain objects and an injected
 * {@link KeyValueStorage}, so it is fully testable in node with a fake store
 * and has NO window dependency. `load()` is robust: a missing, corrupt, or
 * wrong-version save yields a fresh game rather than crashing.
 */

import type {
  BuildingState,
  FormationState,
  GameState,
  GameStateV1,
  HeroState,
  MetaUpgradeState,
  MiniGameMeta,
  MissionState,
  ResourceState,
  SeasonState,
} from '../types';
import { freshUpgrades } from './MetaProgress';
import { GAME_STATE, UPGRADE_ORDER } from '../config/GameConfig';

/** Current save-format version. Bump when GameState shape changes. */
export const SAVE_VERSION = 2;

/** Default localStorage key for the single meta save slot. */
export const SAVE_KEY = 'last-squad:save';

/**
 * Minimal synchronous key/value storage. `window.localStorage` satisfies this,
 * and a plain object-backed fake satisfies it in tests - so the pure save logic
 * never touches `window` directly.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * SaveManager - versioned serialization of the meta GameState to plain JSON.
 * Persistence goes through the injected {@link KeyValueStorage}.
 */
export class SaveManager {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = SAVE_KEY,
  ) {}

  /**
   * A brand-new v2 game state: a fresh gate-runner meta block plus empty-but-
   * valid placeholders for every expanded sub-state (resources, buildings,
   * heroes, formation, season, missions). Later features populate those.
   */
  static freshGame(): GameState {
    return {
      version: SAVE_VERSION,
      miniGame: freshMiniGame(),
      resources: freshResources(),
      buildings: freshBuildings(),
      heroes: freshHeroes(),
      formation: freshFormation(),
      season: freshSeason(),
      missions: freshMissions(),
    };
  }

  /**
   * Serialize to a plain, versioned, JSON-safe v2 object (normalized). Missing
   * or malformed sub-states are filled with fresh defaults so downstream code
   * always sees a complete state.
   */
  static serialize(state: GameState): GameState {
    return {
      version: SAVE_VERSION,
      miniGame: normalizeMiniGame(state.miniGame),
      resources: normalizeResources(state.resources),
      buildings: normalizeBuildings(state.buildings),
      heroes: normalizeHeroes(state.heroes),
      formation: normalizeFormation(state.formation),
      season: normalizeSeason(state.season),
      missions: normalizeMissions(state.missions),
    };
  }

  /** Persist a state to storage as versioned JSON. Returns the normalized state. */
  save(state: GameState): GameState {
    const normalized = SaveManager.serialize(state);
    this.storage.setItem(this.key, JSON.stringify(normalized));
    return normalized;
  }

  /**
   * Load from storage. Returns { state, loaded }. When no valid save exists
   * (missing / corrupt / wrong version) `loaded` is false and a fresh game is
   * returned instead of throwing.
   */
  load(): { state: GameState; loaded: boolean } {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { state: SaveManager.freshGame(), loaded: false };

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') {
      // Corrupt / bare-value save: start fresh rather than crash.
      return { state: SaveManager.freshGame(), loaded: false };
    }

    const version = (parsed as { version?: unknown }).version;

    // Current v2 save: normalize and use as-is.
    if (version === SAVE_VERSION) {
      const state = parsed as GameState;
      if (typeof state.miniGame !== 'object' || state.miniGame === null) {
        return { state: SaveManager.freshGame(), loaded: false };
      }
      // Normalize (fills any missing fields, clamps, coerces) so downstream
      // code always sees a complete, well-formed state.
      return { state: SaveManager.serialize(state), loaded: true };
    }

    // Legacy v1 save: a top-level `meta` block. Migrate it forward.
    if (version === 1) {
      const legacy = parsed as GameStateV1;
      if (typeof legacy.meta !== 'object' || legacy.meta === null) {
        return { state: SaveManager.freshGame(), loaded: false };
      }
      return { state: SaveManager.serialize(migrateV1toV2(legacy)), loaded: true };
    }

    // Unknown / missing version: start fresh rather than crash.
    return { state: SaveManager.freshGame(), loaded: false };
  }

  /** Delete the save slot. */
  clear(): void {
    this.storage.removeItem(this.key);
  }
}

/**
 * Migrate a legacy v1 save into a v2 {@link GameState}: the old top-level
 * `meta` gate-runner block moves verbatim under `miniGame`, and every new
 * sub-state is initialized to its fresh default. Normalization (clamps, missing
 * fields) is applied later by {@link SaveManager.serialize}, so this step only
 * needs to reshape the object; coins / upgrade levels / bests are preserved.
 */
function migrateV1toV2(legacy: GameStateV1): GameState {
  return {
    version: SAVE_VERSION,
    miniGame: legacy.meta,
    resources: freshResources(),
    buildings: freshBuildings(),
    heroes: freshHeroes(),
    formation: freshFormation(),
    season: freshSeason(),
    missions: freshMissions(),
  };
}

/* -------------------------------------------------------------------------- */
/* Fresh-default builders for each v2 sub-state.                              */
/* -------------------------------------------------------------------------- */

/** A fresh gate-runner meta block: no coins, no upgrades, no bests. */
function freshMiniGame(): MiniGameMeta {
  return {
    coins: 0,
    upgrades: freshUpgrades(),
    bestDistance: 0,
    bestScore: 0,
    runsPlayed: 0,
  };
}

/** Empty-but-valid resource economy (no stockpiles yet). */
function freshResources(): ResourceState {
  return { stockpiles: {} };
}

/** Empty-but-valid building state (nothing constructed). */
function freshBuildings(): BuildingState {
  return { levels: {} };
}

/** Empty-but-valid hero roster (no heroes recruited). */
function freshHeroes(): HeroState {
  return { roster: {} };
}

/** Empty-but-valid formation: front/back rows sized from config, all unassigned. */
function freshFormation(): FormationState {
  return {
    front: new Array<string | null>(GAME_STATE.FORMATION.FRONT_SLOTS).fill(null),
    back: new Array<string | null>(GAME_STATE.FORMATION.BACK_SLOTS).fill(null),
  };
}

/** Empty-but-valid season state (no season started). */
function freshSeason(): SeasonState {
  return {
    current: GAME_STATE.SEASON.START_SEASON,
    progress: GAME_STATE.SEASON.START_PROGRESS,
  };
}

/** Empty-but-valid mission state (no daily/weekly progress tracked). */
function freshMissions(): MissionState {
  return { daily: {}, weekly: {} };
}

/* -------------------------------------------------------------------------- */
/* Normalizers: coerce a possibly-partial sub-state into a complete one.      */
/* -------------------------------------------------------------------------- */

/** Coerce any value into a non-negative integer (missing/NaN -> 0). */
function safeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Coerce a possibly-partial upgrade object into a full, non-negative-int state. */
function normalizeUpgrades(upgrades: Partial<MetaUpgradeState> | undefined): MetaUpgradeState {
  const out = freshUpgrades();
  if (upgrades) {
    for (const kind of UPGRADE_ORDER) {
      out[kind] = Math.max(0, Math.floor(upgrades[kind] ?? 0));
    }
  }
  return out;
}

/** Coerce a possibly-partial gate-runner meta block into a complete one. */
function normalizeMiniGame(meta: Partial<MiniGameMeta> | undefined): MiniGameMeta {
  return {
    coins: safeInt(meta?.coins),
    upgrades: normalizeUpgrades(meta?.upgrades),
    bestDistance: safeInt(meta?.bestDistance),
    bestScore: safeInt(meta?.bestScore),
    runsPlayed: safeInt(meta?.runsPlayed),
  };
}

/** A shallow record of non-negative integers, keyed by string. */
function normalizeIntRecord(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = safeInt(v);
    }
  }
  return out;
}

/** Coerce a possibly-partial resource state into a complete one. */
function normalizeResources(resources: Partial<ResourceState> | undefined): ResourceState {
  return { stockpiles: normalizeIntRecord(resources?.stockpiles) };
}

/** Coerce a possibly-partial building state into a complete one. */
function normalizeBuildings(buildings: Partial<BuildingState> | undefined): BuildingState {
  return { levels: normalizeIntRecord(buildings?.levels) };
}

/**
 * Coerce a possibly-partial hero state into a complete one. Hero entries are
 * opaque here (owned by a later FEAT); this only guarantees a plain object.
 */
function normalizeHeroes(heroes: Partial<HeroState> | undefined): HeroState {
  const roster = heroes?.roster;
  return { roster: roster && typeof roster === 'object' ? { ...roster } : {} };
}

/**
 * Coerce a possibly-partial formation into the config-sized rows. Each slot is
 * a hero id string or null; extra slots are dropped and missing ones filled
 * with null so the row lengths always match the config.
 */
function normalizeFormation(formation: Partial<FormationState> | undefined): FormationState {
  const slot = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const row = (input: unknown, size: number): (string | null)[] => {
    const src = Array.isArray(input) ? input : [];
    return Array.from({ length: size }, (_, i) => slot(src[i]));
  };
  return {
    front: row(formation?.front, GAME_STATE.FORMATION.FRONT_SLOTS),
    back: row(formation?.back, GAME_STATE.FORMATION.BACK_SLOTS),
  };
}

/** Coerce a possibly-partial season state into a complete one. */
function normalizeSeason(season: Partial<SeasonState> | undefined): SeasonState {
  return {
    current: safeInt(season?.current),
    progress: safeInt(season?.progress),
  };
}

/** Coerce a possibly-partial mission state into a complete one. */
function normalizeMissions(missions: Partial<MissionState> | undefined): MissionState {
  return {
    daily: normalizeIntRecord(missions?.daily),
    weekly: normalizeIntRecord(missions?.weekly),
  };
}

/**
 * Thin real-`localStorage` adapter. Kept out of the pure logic; a scene wires
 * this in at runtime while tests inject a fake. Falls back to an in-memory map
 * when `localStorage` is unavailable (e.g. SSR / private mode).
 */
export function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage as unknown as KeyValueStorage;
    }
  } catch {
    // Access can throw in sandboxed frames; fall through to memory.
  }
  return memoryStorage();
}

/** An in-memory {@link KeyValueStorage}, useful for tests and fallbacks. */
export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
