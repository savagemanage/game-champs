import { RESOURCE_ORDER } from '../config/GameConfig';
import type { Army, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem } from './HeroSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
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
  readonly research: ResearchSystem;
  readonly heroes: HeroSystem;
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
    this.research = result.snapshot.research;
    this.heroes = result.snapshot.heroes;
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
   * The COMPOSED combat attack multiplier: the research combatAttack techs
   * multiplied by the active war hero's combat bonus. This is the value the
   * battle call site passes into CombatSystem.resolve so both pillars stack.
   * Neutral (1) on a fresh game / no active war hero.
   */
  combatAttackMultiplier(): number {
    return this.research.combatAttackMultiplier() * this.heroes.combatMultiplier();
  }

  /** The research combat defense multiplier (heroes do not affect defense). */
  combatDefenseMultiplier(): number {
    return this.research.combatDefenseMultiplier();
  }

  /**
   * The town's aggregate DEFENSE value from walls / watchtowers, passed into
   * CombatSystem.resolve at the battle call site alongside the research + hero
   * combat multipliers. 0 on a fresh town with no defensive buildings.
   */
  townDefense(): number {
    return this.buildings.townDefense();
  }

  /**
   * The COMPOSED economy/production multiplier: the research production techs
   * multiplied by the active economy hero's bonus. Read at the live production
   * seam ({@link tick}) and the offline reconciliation seam. Neutral (1) on a
   * fresh game / no active economy hero.
   */
  economyMultiplier(): number {
    return this.research.productionMultiplier() * this.heroes.economyMultiplier();
  }

  /** A serializable snapshot of the live systems for the save layer. */
  snapshot(): GameSnapshot {
    return {
      resources: this.resources,
      buildings: this.buildings,
      training: this.training,
      research: this.research,
      heroes: this.heroes,
      waveCleared: this._waveCleared,
    };
  }

  /**
   * Advance the simulation by `deltaMs` at wall-clock `now`: credit live idle
   * production, complete any elapsed building upgrades and training batches,
   * and auto-save on the interval. Returns the buildings/troops that finished
   * this tick so callers can play completion SFX.
   */
  tick(now: number, deltaMs: number): {
    buildingsDone: ReturnType<BuildingSystem['update']>;
    trainingDone: ReturnType<TrainingQueue['advance']>;
    researchDone: ReturnType<ResearchSystem['update']>;
  } {
    if (deltaMs > 0) {
      // Live production seam: building rates are scaled by the COMPOSED economy
      // multiplier (the research production techs multiplied by the active
      // economy hero's bonus), and the storage soft cap is raised by the
      // research storage multiplier. All default neutral on a fresh game.
      const rates = this.buildings.productionRates();
      const prodMult = this.economyMultiplier();
      const boosted = ResourceStore.emptyBundle();
      for (const res of RESOURCE_ORDER) boosted[res] = rates[res] * prodMult;
      this.resources.applyProduction(boosted, deltaMs, 1, this.research.storageMultiplier());
    }
    const buildingsDone = this.buildings.update(now);
    const trainingDone = this.training.advance(now);
    const researchDone = this.research.update(now);

    this.msSinceSave += deltaMs;
    if (this.msSinceSave >= AUTOSAVE_INTERVAL_MS) {
      this.save(now);
    }
    return { buildingsDone, trainingDone, researchDone };
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
