import { ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import { TROOP_ORDER } from '../config/TroopConfig';
import type { Army, GameState } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem } from './HeroSystem';
import { QuestSystem } from './QuestSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem } from './WarmthSystem';

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
 * v5: adds the `warmth` field (the keep's Hearth warmth scalar). A v1..v4 save
 *     (no warmth) still loads: WarmthSystem.fromJSON default-constructs a
 *     fully-WARM keep when the field is missing/malformed, so old saves migrate
 *     forward to a warm start rather than a frozen one, exactly like the
 *     earlier migrations.
 * v6: adds the `onboardingSeen` flag (whether the first-run welcome card has
 *     been shown). A v1..v5 save (no flag) still loads: because that save
 *     already EXISTS, its owner is a returning player who has already seen the
 *     game, so deserialize() migrates a missing flag to `true` and they are
 *     never shown the welcome. A brand-new game (freshGame) starts `false`, so
 *     the welcome is shown exactly once.
 * v7: adds the `tutorialDone` flag (whether the first-run interactive tutorial
 *     has been completed or skipped). Exactly like `onboardingSeen`: a v1..v6
 *     save already EXISTS, so its owner is a returning player who has already
 *     played, and deserialize() migrates a missing flag to `true` (they are
 *     never shown the tutorial). A brand-new game (freshGame) starts `false`,
 *     so the guided tutorial runs exactly once for a first-time player.
 */
export const SAVE_VERSION = 7;

/** Save versions this build can load and migrate forward from. */
export const SUPPORTED_SAVE_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

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
  warmth: WarmthSystem;
  waveCleared: number;
  /** Cumulative troops trained over the game's lifetime (a quest counter). */
  troopsTrained: number;
  /** Cumulative battles won over the game's lifetime (a quest counter). */
  battlesWon: number;
  /** Whether the first-run onboarding welcome card has already been shown. */
  onboardingSeen: boolean;
  /** Whether the first-run interactive tutorial has been completed or skipped. */
  tutorialDone: boolean;
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
      warmth: snapshot.warmth.toJSON(),
      onboardingSeen: snapshot.onboardingSeen,
      tutorialDone: snapshot.tutorialDone,
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
    // v1..v4 saves omit `warmth`; WarmthSystem.fromJSON default-constructs a
    // fully-warm keep when the field is missing/malformed, so old saves migrate
    // forward to a warm start rather than a frozen one.
    const warmth = WarmthSystem.fromJSON(state.warmth);
    const troopsTrained = Math.max(0, Math.floor(state.troopsTrained ?? 0));
    const battlesWon = Math.max(0, Math.floor(state.battlesWon ?? 0));
    // v1..v5 saves omit `onboardingSeen`. Because this save EXISTS, its owner is
    // a returning player who has already seen the game, so a missing flag
    // migrates to `true` (they are never shown the first-run welcome). Only a
    // brand-new game (freshGame) starts `false`.
    const onboardingSeen = typeof state.onboardingSeen === 'boolean' ? state.onboardingSeen : true;
    // v1..v6 saves omit `tutorialDone`. Exactly like `onboardingSeen`: because
    // this save EXISTS, its owner is a returning player who has already played,
    // so a missing flag migrates to `true` (they are never shown the tutorial).
    // Only a brand-new game (freshGame) starts `false`.
    const tutorialDone = typeof state.tutorialDone === 'boolean' ? state.tutorialDone : true;

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

    // Static (window-constant) production multipliers applied to offline
    // reconciliation:
    //  - production:  research production techs AND the active economy hero
    //                 scale the rates (composed multiplicatively). The Hearth
    //                 WARMTH multiplier is applied SEPARATELY per step below,
    //                 because warmth itself evolves across the window as the
    //                 hearth burns / runs out of firewood.
    //  - storage:     raises the soft cap so offline gains can fill higher.
    //  - offline eff: scales ECONOMY.OFFLINE_EFFICIENCY (>1 = more).
    const staticProdMult = research.productionMultiplier() * heroes.economyMultiplier();
    const capMult = research.storageMultiplier();
    const eff = ECONOMY.OFFLINE_EFFICIENCY * research.offlineEfficiencyMultiplier();

    // Offline reconciliation as a fixed-step SIMULATION over the credited
    // window, mirroring the live GameState.tick seam exactly: each step credits
    // production (scaled by the current warmth multiplier) and THEN advances the
    // Hearth (burning the firewood on hand, or decaying when cold). Stepping
    // (rather than one big multiply) matters because warmth changes over the
    // window - a keep whose woodpile runs dry mid-absence produces less for the
    // rest of it, and a lumber mill's freshly produced wood is available to the
    // hearth on the next step. Buildings are advanced each step so upgrades that
    // finish mid-window raise the rates from that point on. Deterministic given
    // the same inputs. Capped at MAX_OFFLINE_SECONDS so the step count is
    // bounded.
    const stepMs = ECONOMY.TICK_MS;
    const offlineGains = ResourceStore.emptyBundle();
    let cursor = windowStart;
    // Apply upgrades that completed before the window began (over-cap case).
    buildings.update(windowStart);
    while (cursor < now) {
      const stepEnd = Math.min(now, cursor + stepMs);
      const dt = stepEnd - cursor;
      const tcLevel = buildings.townCenterLevel;
      const prodMult = staticProdMult * warmth.productionMultiplier(tcLevel);
      const rates = buildings.productionRates();
      const boosted = ResourceStore.emptyBundle();
      for (const res of RESOURCE_ORDER) boosted[res] = (rates[res] ?? 0) * prodMult;
      accumulate(offlineGains, resources.applyProduction(boosted, dt, eff, capMult));
      // Advance the Hearth for this step (burns/decays; spends wood on hand).
      warmth.tick(dt, tcLevel, resources);
      // Apply any upgrade that completed within this step so the next step uses
      // the higher rates / warmth ceiling.
      buildings.update(stepEnd);
      cursor = stepEnd;
    }
    // Final bookkeeping: finish any upgrade whose timer elapsed at/after `now`.
    buildings.update(now);

    return {
      snapshot: {
        resources,
        buildings,
        training,
        research,
        heroes,
        quests,
        warmth,
        waveCleared: state.waveCleared ?? 0,
        troopsTrained,
        battlesWon,
        onboardingSeen,
        tutorialDone,
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
      warmth: new WarmthSystem(),
      waveCleared: 0,
      troopsTrained: 0,
      battlesWon: 0,
      onboardingSeen: false,
      tutorialDone: false,
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
