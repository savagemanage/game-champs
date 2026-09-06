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

import type { GameState } from '../types';
import { freshUpgrades } from './MetaProgress';
import { UPGRADE_ORDER } from '../config/GameConfig';
import type { MetaUpgradeState } from '../types';

/** Current save-format version. Bump when GameState shape changes. */
export const SAVE_VERSION = 1;

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

  /** A brand-new meta state: no coins, no upgrades, no bests. */
  static freshGame(): GameState {
    return {
      version: SAVE_VERSION,
      meta: {
        coins: 0,
        upgrades: freshUpgrades(),
        bestDistance: 0,
        bestScore: 0,
        runsPlayed: 0,
      },
    };
  }

  /** Serialize to a plain, versioned, JSON-safe object (normalized). */
  static serialize(state: GameState): GameState {
    return {
      version: SAVE_VERSION,
      meta: {
        coins: safeInt(state.meta.coins),
        upgrades: normalizeUpgrades(state.meta.upgrades),
        bestDistance: safeInt(state.meta.bestDistance),
        bestScore: safeInt(state.meta.bestScore),
        runsPlayed: safeInt(state.meta.runsPlayed),
      },
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

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as GameState).version !== SAVE_VERSION ||
      typeof (parsed as GameState).meta !== 'object' ||
      (parsed as GameState).meta === null
    ) {
      // Unknown / corrupt / wrong-version save: start fresh rather than crash.
      return { state: SaveManager.freshGame(), loaded: false };
    }

    // Normalize (fills any missing fields, clamps, coerces) so downstream code
    // always sees a complete, well-formed state.
    return { state: SaveManager.serialize(parsed as GameState), loaded: true };
  }

  /** Delete the save slot. */
  clear(): void {
    this.storage.removeItem(this.key);
  }
}

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
