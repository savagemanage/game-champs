import { RESOURCE_ORDER } from '../config/GameConfig';
import { BUILDING_ORDER } from '../config/BuildingConfig';
import { QUEST_DEFS, type QuestId, type QuestProgress } from '../config/QuestConfig';
import type { Army, BuildingKind, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem } from './HeroSystem';
import { QuestSystem } from './QuestSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
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
  readonly research: ResearchSystem;
  readonly heroes: HeroSystem;
  readonly quests: QuestSystem;
  readonly warmth: WarmthSystem;
  private _waveCleared: number;
  /** Cumulative troops trained over the game's lifetime (a quest counter). */
  private _troopsTrained: number;
  /** Cumulative battles won over the game's lifetime (a quest counter). */
  private _battlesWon: number;
  /** Whether the first-run onboarding welcome card has already been shown. */
  private _onboardingSeen: boolean;

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
    this.quests = result.snapshot.quests;
    this.warmth = result.snapshot.warmth;
    this._waveCleared = result.snapshot.waveCleared;
    this._troopsTrained = result.snapshot.troopsTrained;
    this._battlesWon = result.snapshot.battlesWon;
    this._onboardingSeen = result.snapshot.onboardingSeen;
    // Seed the derived quest statuses from the loaded progress immediately so
    // the UI has correct locked/active/completable state before the first tick.
    this.quests.refresh(this.questProgress());
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

  /** Cumulative troops trained over the game's lifetime (a quest counter). */
  get troopsTrained(): number {
    return this._troopsTrained;
  }

  /** Cumulative battles won over the game's lifetime (a quest counter). */
  get battlesWon(): number {
    return this._battlesWon;
  }

  /**
   * Record a battle victory: increments the lifetime `battlesWon` counter and
   * refreshes the quest statuses so a "win N battles" quest can become
   * completable. Called from the BattleScene win path alongside
   * {@link recordWaveCleared}.
   */
  recordBattleWon(): void {
    this._battlesWon += 1;
    this.quests.refresh(this.questProgress());
  }

  /** Whether the first-run onboarding welcome card has already been shown. */
  get onboardingSeen(): boolean {
    return this._onboardingSeen;
  }

  /**
   * Whether the first-run onboarding welcome card should be shown right now:
   * true only for a brand-new game (no save loaded) that has not yet seen it.
   *
   * The once-only decision lives HERE (pure, testable) rather than in the
   * Phaser scene: the scene calls this on every Town entry, but because the
   * flag flips to `true` the moment the card is shown (see
   * {@link markOnboardingSeen}), it returns `true` at most once for the life of
   * a game — including across returning to Town from Settings/Battle in the
   * SAME session, where the in-memory flag already blocks a repeat before any
   * async save has landed. A returning player (loaded save) is treated as
   * already onboarded and is never shown it.
   */
  shouldShowOnboarding(): boolean {
    return !this.loaded && !this._onboardingSeen;
  }

  /**
   * Mark the onboarding welcome as seen: flips the in-memory flag IMMEDIATELY
   * (so a re-entry to Town in the same session never shows it again, even
   * before the save completes) and persists so it never shows again across
   * sessions. Idempotent.
   */
  markOnboardingSeen(now: number = Date.now()): void {
    if (this._onboardingSeen) return;
    this._onboardingSeen = true;
    this.save(now);
  }

  /**
   * Assemble the plain progress snapshot the quest conditions are evaluated
   * against, derived from BuildingSystem / ResearchSystem / the cumulative
   * counters. Kept a pure data object so QuestSystem never touches a live
   * system.
   */
  questProgress(): QuestProgress {
    const buildingLevels: Partial<Record<BuildingKind, number>> = {};
    for (const kind of BUILDING_ORDER) buildingLevels[kind] = this.buildings.level(kind);
    return {
      buildingLevels,
      townCenterLevel: this.buildings.townCenterLevel,
      troopsTrained: this._troopsTrained,
      battlesWon: this._battlesWon,
      techsUnlocked: this.research.unlocked.length,
      unlockedTechIds: this.research.unlocked,
    };
  }

  /**
   * Claim a completable quest's reward: applies its resources to the
   * ResourceStore and its hero shards via HeroSystem.addShards, marks the quest
   * claimed (so it can never pay twice), refreshes statuses (unlocking the next
   * quest in the chain), and persists. Returns true when a reward was applied.
   */
  claimQuest(questId: QuestId): boolean {
    if (!QUEST_DEFS[questId]) return false;
    const reward = this.quests.claim(questId);
    if (!reward) return false;
    if (reward.resources) this.resources.add(reward.resources);
    if (reward.shards) this.heroes.addShards(reward.shards.heroId, reward.shards.shards);
    this.quests.refresh(this.questProgress());
    this.save(Date.now());
    return true;
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
   * The Hearth WARMTH production multiplier at the current Town Center level:
   * 1.0 while the keep is fully warm, sinking toward WARMTH_PRODUCTION_FLOOR as
   * warmth falls (a cold, demoralized town works slower). Composed into
   * {@link economyMultiplier}.
   */
  warmthMultiplier(): number {
    return this.warmth.productionMultiplier(this.buildings.townCenterLevel);
  }

  /** Current warmth as a ratio [0,1] of the max at the current Town Center level. */
  warmthRatio(): number {
    return this.warmth.warmthRatio(this.buildings.townCenterLevel);
  }

  /**
   * The COMPOSED economy/production multiplier: the research production techs
   * multiplied by the active economy hero's bonus AND the Hearth warmth
   * multiplier. Read at the live production seam ({@link tick}) and the offline
   * reconciliation seam. Neutral (1) on a fresh game with a fully-warm keep and
   * no active economy hero; drops below 1 when warmth is low.
   */
  economyMultiplier(): number {
    return (
      this.research.productionMultiplier() *
      this.heroes.economyMultiplier() *
      this.warmthMultiplier()
    );
  }

  /** A serializable snapshot of the live systems for the save layer. */
  snapshot(): GameSnapshot {
    return {
      resources: this.resources,
      buildings: this.buildings,
      training: this.training,
      research: this.research,
      heroes: this.heroes,
      quests: this.quests,
      warmth: this.warmth,
      waveCleared: this._waveCleared,
      troopsTrained: this._troopsTrained,
      battlesWon: this._battlesWon,
      onboardingSeen: this._onboardingSeen,
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
      // multiplier (the research production techs, the active economy hero's
      // bonus, AND the Hearth warmth multiplier), and the storage soft cap is
      // raised by the research storage multiplier. All default neutral on a
      // fresh, fully-warm game.
      const rates = this.buildings.productionRates();
      const prodMult = this.economyMultiplier();
      const boosted = ResourceStore.emptyBundle();
      for (const res of RESOURCE_ORDER) boosted[res] = rates[res] * prodMult;
      this.resources.applyProduction(boosted, deltaMs, 1, this.research.storageMultiplier());
      // Advance the Hearth AFTER crediting production, mirroring the offline
      // reconciliation stepper: it burns the firewood on hand (including this
      // tick's freshly produced wood) to sustain warmth, or decays when the
      // woodpile is cold. This ties fuel -> warmth -> next tick's production.
      this.warmth.tick(deltaMs, this.buildings.townCenterLevel, this.resources);
    }
    const buildingsDone = this.buildings.update(now);
    const trainingDone = this.training.advance(now);
    const researchDone = this.research.update(now);

    // Any troops that finished training this tick add to the lifetime
    // `troopsTrained` counter that the "train N troops" quests read.
    let trainedThisTick = 0;
    for (const kind of Object.keys(trainingDone) as TroopKind[]) {
      trainedThisTick += Math.max(0, Math.floor(trainingDone[kind] ?? 0));
    }
    if (trainedThisTick > 0) this._troopsTrained += trainedThisTick;

    // Recompute quest statuses each tick from the live progress snapshot so a
    // freshly-built building / completed research / trained batch flips the
    // relevant quest to 'completable' promptly.
    this.quests.refresh(this.questProgress());

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
