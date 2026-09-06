import { ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import { TROOP_ORDER } from '../config/TroopConfig';
import type { Army, GameState } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem } from './HeroSystem';
import { QuestSystem } from './QuestSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';

/**
 * Current save-format version. Bump when the GameState shape changes.
 *
 * v1: original (resources/buildings/army/trainingQueue/waveCleared/lastSeenAt).
 * v2: adds the Scholars' Hall `research` field. A v1 save (no research) still
 *     loads: deserialize() default-constructs a fresh, empty ResearchSystem
 *     when the field is missing, and the migration path in load() accepts v1
 *     saves so returning players keep their progress. deserialize tolerates
 *     other missing new fields the same way, so a future feature can add its
 *     own field (bumping the version and extending the accepted range) without
 *     breaking a v2 save.
 * v3: adds the `heroes` field (hero roster + active hero). A v1/v2 save (no
 *     heroes) still loads: deserialize() default-constructs a fresh, empty
 *     HeroSystem when the field is missing, exactly like research did.
 * v4: adds the `quests` field (claimed progression-quest ids) plus the
 *     cumulative `troopsTrained` / `battlesWon` counters the quest conditions
 *     read. A v1/v2/v3 save (no quests/counters) still loads: deserialize()
 *     default-constructs a fresh, empty QuestSystem and zeroes the counters
 *     when the fields are missing, exactly like the earlier migrations.
 */
export const SAVE_VERSION = 4;

/** Save versions this build can load and migrate forward from. */
export const SUPPORTED_SAVE_VERSIONS: readonly number[] = [1, 2, 3, 4];

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
  research: ResearchSystem;
  heroes: HeroSystem;
  quests: QuestSystem;
  waveCleared: number;
  /** Cumulative troops trained over the game's lifetime (a quest counter). */
  troopsTrained: number;
  /** Cumulative battles won over the game's lifetime (a quest counter). */
  battlesWon: number;
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
      research: snapshot.research.toJSON(),
      heroes: snapshot.heroes.toJSON(),
      quests: snapshot.quests.toJSON(),
      troopsTrained: Math.max(0, Math.floor(snapshot.troopsTrained)),
      battlesWon: Math.max(0, Math.floor(snapshot.battlesWon)),
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
    // v1 saves omit `research`; ResearchSystem.fromJSON default-constructs a
    // fresh, empty research state when the field is missing/malformed, so the
    // migration never crashes. Advance it to `now` so any research that would
    // have completed while offline is unlocked on load.
    const research = ResearchSystem.fromJSON(state.research);
    research.update(now);
    // v1/v2 saves omit `heroes`; HeroSystem.fromJSON default-constructs a
    // fresh, empty roster when the field is missing/malformed, so the migration
    // never crashes.
    const heroes = HeroSystem.fromJSON(state.heroes);
    // v1/v2/v3 saves omit `quests` + the counters; QuestSystem.fromJSON
    // default-constructs a fresh (nothing-claimed) log when missing/malformed,
    // and the counters default to 0, so the migration never crashes.
    const quests = QuestSystem.fromJSON(state.quests);
    const troopsTrained = Math.max(0, Math.floor(state.troopsTrained ?? 0));
    const battlesWon = Math.max(0, Math.floor(state.battlesWon ?? 0));

    // Production multipliers applied to offline reconciliation:
    //  - production:  research production techs AND the active economy hero
    //                 both scale the rates (composed multiplicatively).
    //  - storage:     raises the soft cap so offline gains can fill higher.
    //  - offline eff: scales ECONOMY.OFFLINE_EFFICIENCY (>1 = more).
    const prodMult = research.productionMultiplier() * heroes.economyMultiplier();
    const capMult = research.storageMultiplier();
    const eff = ECONOMY.OFFLINE_EFFICIENCY * research.offlineEfficiencyMultiplier();
    const boost = (rates: ReturnType<BuildingSystem['productionRates']>): typeof rates => {
      const out = ResourceStore.emptyBundle();
      for (const res of RESOURCE_ORDER) out[res] = (rates[res] ?? 0) * prodMult;
      return out;
    };

    // Training that finished while away joins the army. (Trained troops do not
    // produce resources, so this ordering has no bearing on offline gains.)
    training.advance(now);

    // Offline production reconciliation, credited over the capped window.
    //
    // Correctness note: buildings can FINISH upgrades mid-window, and a higher
    // level produces more. Crediting the whole window at post-upgrade rates
    // would over-pay for the pre-upgrade portion. So we split the window at
    // each upgrade-completion boundary and credit each sub-segment at the rates
    // in effect during it, advancing buildings segment by segment. The result
    // is that a farm that hit L3 one minute before you return is paid at L2 for
    // the earlier hours and L3 only for that final minute.
    const lastSeen = state.lastSeenAt ?? now;
    const rawSeconds = Math.max(0, (now - lastSeen) / 1000);
    const offlineSeconds = Math.min(rawSeconds, ECONOMY.MAX_OFFLINE_SECONDS);
    // The instant, in epoch ms, at which the credited (capped) window begins.
    const windowStart = now - offlineSeconds * 1000;

    // Upgrades that completed BEFORE the credited window began (possible when
    // raw offline time exceeds the cap) were already at their new level for the
    // whole credited window, so apply them up front.
    buildings.update(windowStart);

    const offlineGains = ResourceStore.emptyBundle();
    let cursor = windowStart;
    // Sorted upgrade-completion instants strictly inside the credited window.
    const boundaries = buildings
      .pendingCompletions()
      .filter((t) => t > windowStart && t < now)
      .sort((a, b) => a - b);

    for (const boundary of boundaries) {
      // Credit production at the CURRENT (pre-completion) rates up to this
      // boundary, then apply the completion so later segments use higher rates.
      accumulate(offlineGains, resources.applyProduction(boost(buildings.productionRates()), boundary - cursor, eff, capMult));
      buildings.update(boundary);
      cursor = boundary;
    }
    // Final segment: from the last boundary (or window start) to `now`.
    accumulate(offlineGains, resources.applyProduction(boost(buildings.productionRates()), now - cursor, eff, capMult));
    // Finish any upgrades whose timer elapsed exactly at/after `now` bookkeeping
    // (also completes upgrades that ended before the capped window began).
    buildings.update(now);

    return {
      snapshot: {
        resources,
        buildings,
        training,
        research,
        heroes,
        quests,
        waveCleared: state.waveCleared ?? 0,
        troopsTrained,
        battlesWon,
      },
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
      research: new ResearchSystem(),
      heroes: new HeroSystem(),
      quests: new QuestSystem(),
      waveCleared: 0,
      troopsTrained: 0,
      battlesWon: 0,
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
    if (!parsed || typeof parsed !== 'object' || !SUPPORTED_SAVE_VERSIONS.includes(parsed.version)) {
      // Unknown / corrupt / unsupported-version save: start fresh rather than
      // crash. A v1 save is SUPPORTED (migrated forward in deserialize); only a
      // version outside SUPPORTED_SAVE_VERSIONS resets.
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

/** Add every resource in `src` into `dst` in place (both full bundles). */
function accumulate(
  dst: ReturnType<ResourceStore['toJSON']>,
  src: ReturnType<ResourceStore['toJSON']>,
): void {
  for (const key of Object.keys(dst) as (keyof typeof dst)[]) {
    dst[key] += src[key] ?? 0;
  }
}

/**
 * Coerce a possibly-partial army object into a full, non-negative integer Army.
 * Built from {@link TROOP_ORDER} so every troop kind is represented; kinds
 * missing from an OLD save (saved before a new troop kind existed) default to
 * 0, so pre-existing saves load without crashing.
 */
function normalizeArmy(army: Partial<Army> | undefined): Army {
  const out = {} as Army;
  for (const kind of TROOP_ORDER) {
    out[kind] = Math.max(0, Math.floor(army?.[kind] ?? 0));
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
