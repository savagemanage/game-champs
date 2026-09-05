import { ECONOMY } from '../config/GameConfig';
import type { Army, GameState, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';

/** Current save-format version. Bump when GameState shape changes. */
export const SAVE_VERSION = 1;

/** Default localStorage key for the single save slot. */
export const SAVE_KEY = 'kingdom-rise:save';

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

/** A snapshot of the whole simulation, ready to serialize. */
export interface GameSnapshot {
  resources: ResourceStore;
  buildings: BuildingSystem;
  training: TrainingQueue;
  waveCleared: number;
}

/** Extra info returned from a load so the caller can surface offline gains. */
export interface LoadResult {
  snapshot: GameSnapshot;
  /** Whether an existing save was found (false = a fresh game was created). */
  loaded: boolean;
  /** Elapsed offline seconds credited (after capping), 0 for a fresh game. */
  offlineSeconds: number;
  /** Resources credited from offline idle production. */
  offlineGains: ReturnType<ResourceStore['toJSON']>;
}

/**
 * SaveManager - versioned serialization of the whole game to a plain JSON
 * object, plus offline idle-gain reconciliation on load.
 *
 * The pure layer works entirely with in-memory systems and plain objects; the
 * actual persistence goes through an injected {@link KeyValueStorage}, so it is
 * fully testable in node with a fake store and has NO window dependency.
 */
export class SaveManager {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = SAVE_KEY,
  ) {}

  /** Build a plain, versioned {@link GameState} from live systems. */
  static serialize(snapshot: GameSnapshot, now: number): GameState {
    return {
      version: SAVE_VERSION,
      resources: snapshot.resources.toJSON(),
      buildings: snapshot.buildings.toJSON(),
      army: snapshot.training.army,
      trainingQueue: snapshot.training.toJSON(),
      waveCleared: snapshot.waveCleared,
      lastSeenAt: now,
    };
  }

  /**
   * Rebuild live systems from a plain {@link GameState}, then reconcile offline
   * idle gains: credit `(now - lastSeenAt)` of production, capped at
   * ECONOMY.MAX_OFFLINE_SECONDS and scaled by ECONOMY.OFFLINE_EFFICIENCY. Also
   * advances the training queue to `now` so units that finished while away are
   * added to the army. Returns the systems plus what was credited.
   */
  static deserialize(state: GameState, now: number): LoadResult {
    const resources = ResourceStore.fromJSON(state.resources);
    const buildings = BuildingSystem.fromJSON(state.buildings);
    const training = TrainingQueue.fromJSON(state.trainingQueue, normalizeArmy(state.army));

    // Complete any building upgrades / training that elapsed while away.
    buildings.update(now);
    training.advance(now);

    // Offline production reconciliation.
    const rawSeconds = Math.max(0, (now - (state.lastSeenAt ?? now)) / 1000);
    const offlineSeconds = Math.min(rawSeconds, ECONOMY.MAX_OFFLINE_SECONDS);
    const offlineGains = resources.applyProduction(
      buildings.productionRates(),
      offlineSeconds * 1000,
      ECONOMY.OFFLINE_EFFICIENCY,
    );

    return {
      snapshot: { resources, buildings, training, waveCleared: state.waveCleared ?? 0 },
      loaded: true,
      offlineSeconds,
      offlineGains,
    };
  }

  /** A brand-new game snapshot (fresh stockpile, level-1 Town Center, empty queue). */
  static freshGame(): GameSnapshot {
    return {
      resources: new ResourceStore(),
      buildings: new BuildingSystem(),
      training: new TrainingQueue(),
      waveCleared: 0,
    };
  }

  /** Persist a snapshot to storage as versioned JSON, stamping `now` as lastSeen. */
  save(snapshot: GameSnapshot, now: number): GameState {
    const state = SaveManager.serialize(snapshot, now);
    this.storage.setItem(this.key, JSON.stringify(state));
    return state;
  }

  /**
   * Load from storage. If no valid save exists, returns a fresh game. Otherwise
   * deserializes and applies offline gains as of `now`.
   */
  load(now: number): LoadResult {
    const raw = this.storage.getItem(this.key);
    if (!raw) {
      return {
        snapshot: SaveManager.freshGame(),
        loaded: false,
        offlineSeconds: 0,
        offlineGains: ResourceStore.emptyBundle(),
      };
    }
    let parsed: GameState | null = null;
    try {
      parsed = JSON.parse(raw) as GameState;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.version !== SAVE_VERSION) {
      // Unknown / corrupt / wrong-version save: start fresh rather than crash.
      return {
        snapshot: SaveManager.freshGame(),
        loaded: false,
        offlineSeconds: 0,
        offlineGains: ResourceStore.emptyBundle(),
      };
    }
    return SaveManager.deserialize(parsed, now);
  }

  /** Delete the save slot. */
  clear(): void {
    this.storage.removeItem(this.key);
  }
}

/** Coerce a possibly-partial army object into a full, non-negative integer Army. */
function normalizeArmy(army: Partial<Army> | undefined): Army {
  const out: Army = { spearman: 0, archer: 0, knight: 0 };
  if (army) {
    for (const kind of Object.keys(out) as TroopKind[]) {
      out[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
    }
  }
  return out;
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
