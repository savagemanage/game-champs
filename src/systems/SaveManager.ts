import { ECONOMY, POPULATION } from '../config/GameConfig';
import type { Army, GameState, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem } from './CampaignSystem';
import { HeroRoster } from './HeroRoster';
import { PopulationSystem } from './PopulationSystem';
import { PremiumWallet } from './PremiumWallet';
import { ResourceStore } from './ResourceStore';
import { SummonSystem } from './SummonSystem';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem, type WarmthTickResult } from './WarmthSystem';

/**
 * Current save-format version. Bump when GameState shape changes.
 *
 * - v1: the legacy 'kingdom-rise' medieval theme.
 * - v2: the Frosthold re-theme (frozen resource/building/troop/enemy
 *   vocabulary + warmth).
 * - v3: the FEAT-002 economy/city expansion - refined `steel` resource, Ember
 *   Sparks premium currency, survivor population, and the enlarged building
 *   roster (Shelter Row / Frost Vault / Forge Hall / Envoy Hall / Warming Ward
 *   / Ember Archive / class yards).
 *
 * - v4: the FEAT-003 hero + summon + campaign layer - the collectible hero
 *   roster (levels/stars/skills/shards + lead picks), the deterministic summon
 *   gacha (pity state), and staged campaign progress.
 *
 * A save with any older version is treated as a mismatch and falls back to a
 * fresh frozen settlement rather than mis-mapping old kinds.
 */
export const SAVE_VERSION = 4;

/** Default localStorage key for the single save slot (Frosthold namespace). */
export const SAVE_KEY = 'frosthold:save';

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
  warmth: WarmthSystem;
  population: PopulationSystem;
  premium: PremiumWallet;
  heroes: HeroRoster;
  summon: SummonSystem;
  campaign: CampaignSystem;
  waveCleared: number;
}

/** Extra info returned from a load so the caller can surface offline gains. */
export interface LoadResult {
  snapshot: GameSnapshot;
  /** Whether an existing save was found (false = a fresh game was created). */
  loaded: boolean;
  /** Elapsed offline seconds credited (after capping), 0 for a fresh game. */
  offlineSeconds: number;
  /**
   * NET resource change credited over the offline window: idle production minus
   * the fuel (wood + coal) the Furnace burned to hold back the cold. wood/coal
   * may therefore be negative when the furnace outburned production; food/iron
   * are production-only. The ResourceStore balance is the authoritative value;
   * this bundle is the honest "while away" summary derived from it.
   */
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
      premiumCurrency: snapshot.premium.toJSON(),
      population: snapshot.population.toJSON(),
      heroes: snapshot.heroes.toJSON(),
      summon: snapshot.summon.toJSON(),
      campaign: snapshot.campaign.toJSON(),
      warmth: snapshot.warmth.toJSON(),
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
    // A legacy / warmth-less save (undefined) restores to full warmth.
    const warmth = WarmthSystem.fromJSON(state.warmth);
    // The survivor workforce + premium wallet (both tolerate missing fields).
    const population = PopulationSystem.fromJSON(state.population);
    const premium = PremiumWallet.fromJSON(state.premiumCurrency);
    // Hero roster, summon (gacha) state, and campaign progress (all tolerate
    // missing fields so a partial / older-shaped save loads gracefully).
    const heroes = HeroRoster.fromJSON(state.heroes);
    const summon = SummonSystem.fromJSON(state.summon);
    const campaign = CampaignSystem.fromJSON(state.campaign);

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
    // is that a hut that hit L3 one minute before you return is paid at L2 for
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
      creditSegment(boundary - cursor, resources, buildings, warmth, population, premium, offlineGains);
      buildings.update(boundary);
      cursor = boundary;
    }
    // Final segment: from the last boundary (or window start) to `now`.
    creditSegment(now - cursor, resources, buildings, warmth, population, premium, offlineGains);
    // Finish any upgrades whose timer elapsed exactly at/after `now` bookkeeping
    // (also completes upgrades that ended before the capped window began).
    buildings.update(now);

    return {
      snapshot: {
        resources,
        buildings,
        training,
        warmth,
        population,
        premium,
        heroes,
        summon,
        campaign,
        waveCleared: state.waveCleared ?? 0,
      },
      loaded: true,
      offlineSeconds,
      offlineGains,
    };
  }

  /** A brand-new game snapshot (fresh stockpile, level-1 Furnace, empty queue). */
  static freshGame(): GameSnapshot {
    return {
      resources: new ResourceStore(),
      buildings: new BuildingSystem(),
      training: new TrainingQueue(),
      warmth: new WarmthSystem(),
      population: new PopulationSystem(),
      premium: new PremiumWallet(),
      heroes: new HeroRoster(),
      summon: new SummonSystem(),
      campaign: new CampaignSystem(),
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

/**
 * Credit ONE offline sub-segment of length `dtMs` at the rates currently in
 * effect, mirroring the live GameState.tick order so offline and live play
 * agree: advance warmth (burning fuel), grow the survivor workforce, credit
 * idle production scaled by warmth x population multipliers, run the Forge Hall
 * refinery over the same window/efficiency, and drip premium Ember Sparks. The
 * fuel burned is netted out of `offlineGains` (as elsewhere) so the reported
 * wood/coal is the honest net change. `steel` accrues into offlineGains via the
 * refinery's minted output. Mutates the passed systems + `offlineGains`.
 */
function creditSegment(
  dtMs: number,
  resources: ResourceStore,
  buildings: BuildingSystem,
  warmth: WarmthSystem,
  population: PopulationSystem,
  premium: PremiumWallet,
  offlineGains: ReturnType<ResourceStore['toJSON']>,
): void {
  if (dtMs <= 0) return;
  const furnaceLevel = buildings.furnaceLevel;
  const extraHousing = buildings.totalHousing();

  // Warmth first (burns fuel); net that fuel out of the reported gains.
  deductFuel(offlineGains, warmth.tick(dtMs, furnaceLevel, resources));
  // Grow the workforce over the segment so later segments are better staffed.
  population.tick(dtMs, extraHousing);

  const warmthMult = warmth.productionMultiplier(furnaceLevel);
  const popMult = population.outputMultiplier(
    warmth.warmthRatio(furnaceLevel),
    extraHousing,
    buildings.totalProducerLevels() * POPULATION.STAFF_PER_PRODUCER_LEVEL,
  );
  const efficiency = ECONOMY.OFFLINE_EFFICIENCY * warmthMult * popMult;

  accumulate(offlineGains, resources.applyProduction(buildings.productionRates(), dtMs, efficiency));
  // Refine iron + coal into steel over the same window at the same efficiency;
  // fold the minted steel into the reported gains.
  offlineGains.steel += buildings.refineryConversion(resources, dtMs, efficiency);
  // Premium sparks drip while the Furnace is lit (warmth-independent, offline-scaled).
  premium.drip(dtMs, furnaceLevel, ECONOMY.OFFLINE_EFFICIENCY);
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
 * Subtract the fuel a warmth tick burned (wood + coal) from the running
 * `offlineGains` bundle, so the reported summary is the NET change over the
 * offline window rather than gross production. Uses the tick's reported
 * {@link WarmthTickResult.fuelSpent} directly (never re-derived). food/iron are
 * never fuel, so they are untouched. The value can go negative when the furnace
 * burned more than was produced; that honest net is surfaced by the UI.
 */
function deductFuel(
  dst: ReturnType<ResourceStore['toJSON']>,
  tick: WarmthTickResult,
): void {
  dst.wood -= tick.fuelSpent.wood;
  dst.coal -= tick.fuelSpent.coal;
}

/** Coerce a possibly-partial army object into a full, non-negative integer Army. */
function normalizeArmy(army: Partial<Army> | undefined): Army {
  const out: Army = { trapper: 0, marksman: 0, vanguard: 0 };
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
