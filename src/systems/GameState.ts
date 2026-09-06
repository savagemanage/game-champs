import { POPULATION } from '../config/GameConfig';
import type { Army, HeroId, ResourceCost, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem, type CampaignAttemptResult } from './CampaignSystem';
import { CombatSystem } from './CombatSystem';
import { HeroRoster } from './HeroRoster';
import { PopulationSystem } from './PopulationSystem';
import { PremiumWallet } from './PremiumWallet';
import { ResourceStore } from './ResourceStore';
import { SummonSystem, type Rng, type SummonResult } from './SummonSystem';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem } from './WarmthSystem';
import {
  SaveManager,
  browserStorage,
  type GameSnapshot,
  type KeyValueStorage,
  type LoadResult,
} from './SaveManager';

/** How often the state auto-persists to storage, milliseconds. */
export const AUTOSAVE_INTERVAL_MS = 15_000;

/**
 * GameState - the single authoritative holder of the FEAT-002 pure systems.
 *
 * Every scene (Town, the training UI, Settings, and later Battle) reads and
 * writes THIS one instance rather than constructing its own ResourceStore /
 * BuildingSystem / TrainingQueue, so there are never divergent copies of the
 * simulation. It is a lazily-created singleton loaded from the save on first
 * access (applying offline idle gains) and persisted through SaveManager both
 * on meaningful changes ({@link GameState.save}) and on a wall-clock interval
 * ({@link GameState.tick}).
 *
 * This module owns a SaveManager (which itself wraps an injectable storage) but
 * contains no Phaser dependency, so the scenes stay thin. The pure math still
 * lives in the FEAT-002 systems; this is just the shared container + cadence.
 */
export class GameState {
  private static instance: GameState | null = null;

  readonly resources: ResourceStore;
  readonly buildings: BuildingSystem;
  readonly training: TrainingQueue;
  readonly warmth: WarmthSystem;
  readonly population: PopulationSystem;
  readonly premium: PremiumWallet;
  readonly heroes: HeroRoster;
  readonly summon: SummonSystem;
  readonly campaign: CampaignSystem;
  private _waveCleared: number;

  private readonly saver: SaveManager;
  private msSinceSave = 0;

  /** Whether an existing save was found on load (vs a fresh game). */
  readonly loaded: boolean;
  /** Offline seconds credited on load (0 for a fresh game). */
  readonly offlineSeconds: number;
  /** Resources credited from offline idle production on load. */
  readonly offlineGains: LoadResult['offlineGains'];

  private constructor(result: LoadResult, saver: SaveManager) {
    this.resources = result.snapshot.resources;
    this.buildings = result.snapshot.buildings;
    this.training = result.snapshot.training;
    this.warmth = result.snapshot.warmth;
    this.population = result.snapshot.population;
    this.premium = result.snapshot.premium;
    this.heroes = result.snapshot.heroes;
    this.summon = result.snapshot.summon;
    this.campaign = result.snapshot.campaign;
    this._waveCleared = result.snapshot.waveCleared;
    this.saver = saver;
    this.loaded = result.loaded;
    this.offlineSeconds = result.offlineSeconds;
    this.offlineGains = result.offlineGains;
  }

  /**
   * Fetch (or lazily create) the singleton, loading from `localStorage` via a
   * browser-backed SaveManager and reconciling offline gains as of now.
   */
  static get(): GameState {
    if (!GameState.instance) {
      GameState.instance = GameState.create(browserStorage(), Date.now());
    }
    return GameState.instance;
  }

  /**
   * Build a fresh instance from an explicit storage adapter and clock. Exposed
   * for testability and for the reset flow; production code uses {@link get}.
   */
  static create(storage: KeyValueStorage, now: number): GameState {
    const saver = new SaveManager(storage);
    return new GameState(saver.load(now), saver);
  }

  /** Highest battle wave cleared. */
  get waveCleared(): number {
    return this._waveCleared;
  }

  /** Record a newly-cleared wave (monotonic). */
  recordWaveCleared(wave: number): void {
    if (wave > this._waveCleared) this._waveCleared = wave;
  }

  /** Replace the standing army with post-battle survivors (applies casualties). */
  setArmy(survivors: Army): void {
    this.training.setArmy(survivors);
  }

  /** The standing army available to send into battle. */
  get army(): Army {
    return this.training.army;
  }

  /** Total number of standing troops. */
  get armyCount(): number {
    const a = this.training.army;
    return (Object.keys(a) as TroopKind[]).reduce((sum, k) => sum + a[k], 0);
  }

  /**
   * The hold's total effective ARMY power against wave `wave`, INCLUDING the
   * lead heroes' aggregate army bonus. This is the value combat / campaign
   * checks compare, so heroes matter in battle as well as production.
   */
  effectiveArmyPower(wave: number): number {
    return CombatSystem.effectiveArmyPower(this.army, wave) * this.heroes.armyPowerMultiplier();
  }

  /**
   * The hold's hero-boosted combat power for campaign validation: the raw army
   * power (matchup-neutral) lifted by the lead heroes' army bonus plus the total
   * owned-hero power. Deterministic; feeds {@link attemptCampaignStage}.
   */
  campaignPower(): number {
    const rawArmy = CombatSystem.armyPower(this.army);
    return rawArmy * this.heroes.armyPowerMultiplier() + this.heroes.totalPower();
  }

  /**
   * Perform ONE summon: spend Ember Sparks (returns null if unaffordable), roll
   * a hero via the injected deterministic {@link Rng}, and apply the result to
   * the roster (a first copy, or shards for a duplicate). Returns the outcome.
   */
  summonOnce(rng: Rng): SummonResult | null {
    if (!this.premium.spend(this.summon.sparkCost)) return null;
    const result = this.summon.pull(rng, (id) => this.heroes.isOwned(id));
    if (result.outcome === 'hero') this.heroes.grantHero(result.hero);
    else this.heroes.addShards(result.hero, result.shards);
    return result;
  }

  /**
   * Attempt a campaign stage with the current hero-boosted power. On a FIRST
   * clear the stage's reward is granted exactly once: resources to the store,
   * Ember Sparks to the wallet, and hero shards to the roster. Returns the full
   * attempt result (rewards already applied).
   */
  attemptCampaignStage(stageId: string): CampaignAttemptResult {
    const result = this.campaign.attempt(stageId, this.campaignPower());
    if (result.win && result.firstClear && result.reward) {
      this.grantCampaignReward(result.reward);
    }
    return result;
  }

  /** Apply a campaign reward bundle to the resource store / wallet / roster. */
  private grantCampaignReward(reward: {
    resources?: ResourceCost;
    sparks?: number;
    shards?: Partial<Record<HeroId, number>>;
  }): void {
    if (reward.resources) this.resources.add(reward.resources);
    if (reward.sparks) this.premium.grant(reward.sparks);
    if (reward.shards) {
      for (const [id, amount] of Object.entries(reward.shards) as [HeroId, number][]) {
        this.heroes.addShards(id, amount);
      }
    }
  }

  /** A serializable snapshot of the live systems for the save layer. */
  snapshot(): GameSnapshot {
    return {
      resources: this.resources,
      buildings: this.buildings,
      training: this.training,
      warmth: this.warmth,
      population: this.population,
      premium: this.premium,
      heroes: this.heroes,
      summon: this.summon,
      campaign: this.campaign,
      waveCleared: this._waveCleared,
    };
  }

  /**
   * Advance the simulation by `deltaMs` at wall-clock `now`: credit live idle
   * production, complete any elapsed building upgrades and training batches,
   * and auto-save on the interval. Returns the buildings/troops that finished
   * this tick so callers can play completion SFX.
   */
  tick(now: number, deltaMs: number): { buildingsDone: ReturnType<BuildingSystem['update']>; trainingDone: ReturnType<TrainingQueue['advance']> } {
    if (deltaMs > 0) {
      const furnaceLevel = this.buildings.furnaceLevel;
      const extraHousing = this.buildings.totalHousing();
      // Advance warmth FIRST: burn fuel from the stockpile at the current
      // Furnace level, raising or decaying warmth. Then grow the survivor
      // workforce and credit production scaled by BOTH the warmth-derived
      // multiplier AND the population (satisfaction x staffing) multiplier, so a
      // cold, crowded, or understaffed hold produces less.
      this.warmth.tick(deltaMs, furnaceLevel, this.resources);
      this.population.tick(deltaMs, extraHousing);

      const warmthMult = this.warmth.productionMultiplier(furnaceLevel);
      const popMult = this.population.outputMultiplier(
        this.warmth.warmthRatio(furnaceLevel),
        extraHousing,
        this.buildings.totalProducerLevels() * POPULATION.STAFF_PER_PRODUCER_LEVEL,
      );
      // Lead heroes' aggregate ECONOMY bonus lifts idle output on top of warmth
      // x population, so investing in heroes visibly matters for production.
      const heroEconMult = this.heroes.economyMultiplier();
      const efficiency = warmthMult * popMult * heroEconMult;
      this.resources.applyProduction(this.buildings.productionRates(), deltaMs, efficiency);
      // Refine raw stock into steel (consumes iron + coal), scaled the same way.
      this.buildings.refineryConversion(this.resources, deltaMs, efficiency);
      // The lit Furnace drips premium Ember Sparks (warmth-independent).
      this.premium.drip(deltaMs, furnaceLevel);
    }
    const buildingsDone = this.buildings.update(now);
    const trainingDone = this.training.advance(now);

    this.msSinceSave += deltaMs;
    if (this.msSinceSave >= AUTOSAVE_INTERVAL_MS) {
      this.save(now);
    }
    return { buildingsDone, trainingDone };
  }

  /** Persist the current state immediately, stamping `now` as last-seen. */
  save(now: number = Date.now()): void {
    this.saver.save(this.snapshot(), now);
    this.msSinceSave = 0;
  }

  /**
   * Wipe all progress: clear the save slot and drop the singleton so the next
   * {@link get} rebuilds a fresh game. Callers should then transition scenes.
   */
  reset(): void {
    this.saver.clear();
    GameState.instance = null;
  }
}
