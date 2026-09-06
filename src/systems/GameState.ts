import { POPULATION, RESOURCE_ORDER } from '../config/GameConfig';
import {
  armyBattleMultiplier,
  combineModifiers,
  economyMultiplierFor,
} from '../config/StatModifiers';
import { maxTrainableTier } from '../config/TroopConfig';
import type { Army, HeroId, ResourceCost, StatModifiers, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem, type CampaignAttemptResult } from './CampaignSystem';
import { CombatSystem } from './CombatSystem';
import { GearSystem } from './GearSystem';
import { HeroRoster, type HeroBonuses } from './HeroRoster';
import { PopulationSystem } from './PopulationSystem';
import { PremiumWallet } from './PremiumWallet';
import { ResearchSystem } from './ResearchSystem';
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
  readonly research: ResearchSystem;
  readonly gear: GearSystem;
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
    this.research = result.snapshot.research;
    this.gear = result.snapshot.gear;
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
   * The single COMBINED stat-modifier bundle for the whole hold: research +
   * chief gear + the lead heroes' aggregate bonus, all summed via the shared
   * pure combiner. Every consumer (idle production, combat, campaign) reads this
   * one bundle so the three progression sources stack coherently. Recomputed on
   * demand so it always reflects the current systems.
   */
  modifiers(): StatModifiers {
    return combineModifiers(
      this.research.modifiers(),
      this.gear.modifiers(),
      heroBonusesToModifiers(this.heroes.bonuses()),
    );
  }

  /**
   * The combat-power multiplier applied to raw army power: the lead heroes'
   * army bonus times the combined battle modifiers (attack/hp/defense) from
   * research + gear + heroes. Heroes are counted once (their army bonus is in
   * the multiplier, not doubled through the bundle) - the bundle's battle
   * fields come from research + gear + the heroes' bonus adapted as troopAttack.
   */
  private battleMultiplier(): number {
    const mods = combineModifiers(this.research.modifiers(), this.gear.modifiers());
    return this.heroes.armyPowerMultiplier() * armyBattleMultiplier(mods);
  }

  /**
   * The hold's total effective ARMY power against wave `wave`, INCLUDING the
   * lead heroes' aggregate army bonus AND the research/gear battle modifiers.
   * This is the value combat / campaign checks compare, so heroes, research and
   * gear all matter in battle as well as production.
   */
  effectiveArmyPower(wave: number): number {
    return CombatSystem.effectiveArmyPower(this.army, wave) * this.battleMultiplier();
  }

  /**
   * The hold's hero-boosted combat power for campaign validation: the raw army
   * power (matchup-neutral) lifted by the combined battle multiplier plus the
   * total owned-hero power. Deterministic; feeds {@link attemptCampaignStage}.
   */
  campaignPower(): number {
    const rawArmy = CombatSystem.armyPower(this.army);
    return rawArmy * this.battleMultiplier() + this.heroes.totalPower();
  }

  /** The current MAX trainable troop tier, gated by completed research. */
  maxTroopTier(): number {
    return maxTrainableTier(this.research.maxTroopTier());
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
      research: this.research,
      gear: this.gear,
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
      // The combined economy modifiers (research + gear + heroes) scale idle
      // output PER RESOURCE on top of warmth x population, so investing in any
      // of the three progression sources visibly matters for production.
      const mods = this.modifiers();
      const baseEfficiency = warmthMult * popMult;
      // Pre-scale the per-second production rates by each resource's economy
      // multiplier, then credit at the warmth x population efficiency.
      const rates = this.buildings.productionRates();
      for (const res of RESOURCE_ORDER) {
        rates[res] *= economyMultiplierFor(mods, res);
      }
      this.resources.applyProduction(rates, deltaMs, baseEfficiency);
      // Refine raw stock into steel (consumes iron + coal), scaled the same way
      // plus the steel-specific economy multiplier.
      this.buildings.refineryConversion(
        this.resources,
        deltaMs,
        baseEfficiency * economyMultiplierFor(mods, 'steel'),
      );
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

/**
 * Adapt the HeroRoster's existing {@link HeroBonuses} shape into the shared
 * {@link StatModifiers} bundle so heroes contribute to the SAME combined total
 * as research + gear rather than through a parallel path. The heroes' `economy`
 * fraction maps to the all-producer `economyOutput`; their `army` fraction maps
 * to `troopAttack` (the dominant combat lever). This keeps the hero integration
 * coherent without double-counting: production reads the combined bundle, and
 * combat multiplies raw power by the heroes' army multiplier alongside the
 * research/gear battle modifiers.
 */
function heroBonusesToModifiers(bonuses: HeroBonuses): Partial<StatModifiers> {
  return { economyOutput: bonuses.economy, troopAttack: bonuses.army };
}
