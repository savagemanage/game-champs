import { RESOURCE_ORDER } from '../config/GameConfig';
import { BUILDING_ORDER } from '../config/BuildingConfig';
import { QUEST_DEFS, type QuestId, type QuestProgress } from '../config/QuestConfig';
import { TOTAL_WAVES, isCampaignWave } from '../config/WaveConfig';
import type { Army, BuildingKind, Resources, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem, type HeroCheck } from './HeroSystem';
import { QuestSystem } from './QuestSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore, storageCap } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem } from './WarmthSystem';
import { CombatSystem } from './CombatSystem';
import type { BattleMode, BattleReceipt } from './BattleReceipt';
import { advanceSimulation, type SimulationReceipt } from './SimulationEngine';
import {
  SaveManager,
  browserStorage,
  type GameSnapshot,
  type KeyValueStorage,
  type LoadIssue,
  type LoadResult,
} from './SaveManager';
import type { HeroId } from '../config/HeroConfig';

export const AUTOSAVE_INTERVAL_MS = 15_000;
export type PersistenceState = 'saved' | 'dirty' | 'error';

export interface BattleCommitResult {
  ok: boolean;
  receipt?: BattleReceipt;
  reason?: 'noTroops' | 'campaignComplete' | 'invalidWave' | 'notNextWave' | 'saveFailed';
}

/** Single Phaser-free runtime authority for simulation, progression, and saves. */
export class GameState {
  private static instance: GameState | null = null;

  resources: ResourceStore;
  buildings: BuildingSystem;
  training: TrainingQueue;
  research: ResearchSystem;
  heroes: HeroSystem;
  quests: QuestSystem;
  warmth: WarmthSystem;
  private _waveCleared: number;
  private _troopsTrained: number;
  private _battlesWon: number;
  private _onboardingSeen: boolean;
  private _tutorialDone: boolean;
  private _lastBattleReceipt: BattleReceipt | null;
  private _battleRevision: number;

  private readonly saver: SaveManager;
  private msSinceSave = 0;
  private tickRemainderMs = 0;
  private simulationTime: number;
  private _saveState: PersistenceState = 'saved';
  private _saveError: string | null = null;
  private _tutorialReplay = false;
  private offlineSummaryConsumed = false;
  private readonly recoveryLocked: boolean;
  private readonly completionListeners = new Set<(
    result: { buildingsDone: BuildingKind[]; trainingDone: Partial<Record<TroopKind, number>>; researchDone: ReturnType<ResearchSystem['update']> },
  ) => void>();

  readonly loaded: boolean;
  readonly offlineSeconds: number;
  readonly offlineGains: LoadResult['offlineGains'];
  readonly offlineReconciliation?: SimulationReceipt;
  readonly loadIssue?: LoadIssue;

  private constructor(result: LoadResult, saver: SaveManager, now: number) {
    this.resources = result.snapshot.resources;
    this.buildings = result.snapshot.buildings;
    this.training = result.snapshot.training;
    this.research = result.snapshot.research;
    this.heroes = result.snapshot.heroes;
    this.quests = result.snapshot.quests;
    this.warmth = result.snapshot.warmth;
    this._waveCleared = Math.min(TOTAL_WAVES, result.snapshot.waveCleared);
    this._troopsTrained = result.snapshot.troopsTrained;
    this._battlesWon = result.snapshot.battlesWon;
    this._onboardingSeen = result.snapshot.onboardingSeen;
    this._tutorialDone = result.snapshot.tutorialDone;
    this._lastBattleReceipt = result.snapshot.lastBattleReceipt ?? null;
    this._battleRevision = result.snapshot.battleRevision ?? 0;
    this.quests.refresh(this.questProgress());
    this.saver = saver;
    this.loaded = result.loaded;
    this.offlineSeconds = result.offlineSeconds;
    this.offlineGains = result.offlineGains;
    this.offlineReconciliation = result.reconciliation;
    this.loadIssue = result.issue;
    this.recoveryLocked = !!result.issue && ['corrupt-json', 'invalid-shape', 'future-version'].includes(result.issue.kind);
    this.simulationTime = result.snapshot.simulationCursorAt ?? now;
    this.tickRemainderMs = Math.max(0, Math.min(999, now - this.simulationTime));
    if (result.issue) {
      this._saveState = 'error';
      this._saveError = result.issue.message;
    }
  }

  static get(): GameState {
    if (!GameState.instance) GameState.instance = GameState.create(browserStorage(), Date.now());
    return GameState.instance;
  }

  static create(storage: KeyValueStorage, now: number): GameState {
    const saver = new SaveManager(storage);
    return new GameState(saver.load(now), saver, now);
  }

  get waveCleared(): number {
    return this._waveCleared;
  }

  get nextCampaignWave(): number | null {
    return this._waveCleared >= TOTAL_WAVES ? null : this._waveCleared + 1;
  }

  recordWaveCleared(wave: number): void {
    if (isCampaignWave(wave) && wave === this._waveCleared + 1) this._waveCleared = wave;
  }

  get troopsTrained(): number {
    return this._troopsTrained;
  }

  get battlesWon(): number {
    return this._battlesWon;
  }

  recordBattleWon(): void {
    this._battlesWon += 1;
    this.quests.refresh(this.questProgress());
  }

  get onboardingSeen(): boolean {
    return this._onboardingSeen;
  }

  shouldShowOnboarding(): boolean {
    return !this.loaded && !this._onboardingSeen;
  }

  markOnboardingSeen(now: number = Date.now()): void {
    if (this._onboardingSeen) return;
    this._onboardingSeen = true;
    this.save(now);
  }

  get tutorialDone(): boolean {
    return this._tutorialDone;
  }

  shouldRunTutorial(): boolean {
    return !this._tutorialDone && (!this.loaded || this._tutorialReplay);
  }

  markTutorialDone(now: number = Date.now()): void {
    this._tutorialReplay = false;
    if (this._tutorialDone) return;
    this._tutorialDone = true;
    this.save(now);
  }

  resetTutorial(): void {
    this._tutorialDone = false;
    this._tutorialReplay = true;
  }

  get saveState(): PersistenceState {
    return this._saveState;
  }

  get saveError(): string | null {
    return this._saveError;
  }

  get lastBattleReceipt(): BattleReceipt | null {
    return this._lastBattleReceipt ? cloneReceipt(this._lastBattleReceipt) : null;
  }

  acknowledgeBattleReceipt(now: number = Date.now()): void {
    if (!this._lastBattleReceipt || this._lastBattleReceipt.acknowledged) return;
    this._lastBattleReceipt.acknowledged = true;
    this.save(now);
  }

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

  claimQuest(questId: QuestId): boolean {
    if (!QUEST_DEFS[questId]) return false;
    return this.durableMutation(() => {
      const reward = this.quests.claim(questId);
      if (!reward) return false;
      if (reward.resources) this.resources.add(reward.resources);
      if (reward.shards) this.heroes.addShards(reward.shards.heroId, reward.shards.shards);
      this.quests.refresh(this.questProgress());
      return true;
    });
  }

  purchasePatronage(hero: HeroId): HeroCheck {
    let result: HeroCheck = { ok: false, reason: 'cost' };
    const committed = this.durableMutation(() => {
      result = this.heroes.purchasePatronage(hero, this.resources);
      return result.ok;
    });
    return committed ? result : { ok: false, reason: 'cost' };
  }

  setArmy(survivors: Army): void {
    this.training.setArmy(survivors);
  }

  get army(): Army {
    return this.training.army;
  }

  get armyCount(): number {
    return RESOURCELESS_TROOP_ORDER.reduce((sum, kind) => sum + this.army[kind], 0);
  }

  combatAttackMultiplier(): number {
    return this.research.combatAttackMultiplier() * this.heroes.combatMultiplier();
  }

  combatDefenseMultiplier(): number {
    return this.research.combatDefenseMultiplier();
  }

  townDefense(): number {
    return this.buildings.townDefense();
  }

  warmthMultiplier(): number {
    return this.warmth.productionMultiplier(this.buildings.townCenterLevel);
  }

  warmthRatio(): number {
    return this.warmth.warmthRatio(this.buildings.townCenterLevel);
  }

  economyMultiplier(): number {
    return this.research.productionMultiplier() * this.heroes.economyMultiplier() * this.warmthMultiplier();
  }

  /** Effective next-tick gross/net rates and storage cap used by the HUD. */
  economyRates(): { gross: Resources; net: Resources; cap: number; fuelPerSecond: number; fuelSpentPerSecond: number } {
    const base = this.buildings.productionRates();
    const gross = ResourceStore.emptyBundle();
    const net = ResourceStore.emptyBundle();
    const cap = storageCap(this.research.storageMultiplier());
    for (const resource of RESOURCE_ORDER) {
      const theoretical = base[resource] * this.economyMultiplier();
      const headroom = Math.max(0, cap - this.resources.get(resource));
      gross[resource] = Math.min(theoretical, headroom);
      net[resource] = gross[resource];
    }
    const fuelPerSecond = this.warmth.fuelPerSecond(this.buildings.townCenterLevel).wood;
    const fuelSpentPerSecond = this.resources.get('wood') + gross.wood >= fuelPerSecond ? fuelPerSecond : 0;
    net.wood -= fuelSpentPerSecond;
    return { gross, net, cap, fuelPerSecond, fuelSpentPerSecond };
  }

  snapshot(): GameSnapshot {
    return {
      resources: this.resources,
      simulationCursorAt: this.simulationTime,
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
      tutorialDone: this._tutorialDone,
      lastBattleReceipt: this._lastBattleReceipt,
      battleRevision: this._battleRevision,
    };
  }

  /** Fixed-step, partition-invariant live simulation. */
  tick(now: number, deltaMs: number): {
    buildingsDone: BuildingKind[];
    trainingDone: Partial<Record<TroopKind, number>>;
    researchDone: ReturnType<ResearchSystem['update']>;
  } {
    const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    // Align a newly resumed runtime with the supplied wall clock while retaining
    // exact partition equivalence for ordinary frame deltas.
    if (now - safeDelta > this.simulationTime + 1000) this.simulationTime = now - safeDelta;
    this.tickRemainderMs += safeDelta;
    const buildingsDone: BuildingKind[] = [];
    const researchDone: ReturnType<ResearchSystem['update']> = [];
    const trainingDone: Partial<Record<TroopKind, number>> = {};
    while (this.tickRemainderMs >= 1000) {
      const end = this.simulationTime + 1000;
      const receipt = advanceSimulation(this.snapshot(), this.simulationTime, end, 'live');
      this.simulationTime = end;
      this.tickRemainderMs -= 1000;
      buildingsDone.push(...receipt.buildingsDone);
      researchDone.push(...receipt.researchDone);
      for (const [kind, count] of Object.entries(receipt.trainingDone) as [TroopKind, number][]) {
        trainingDone[kind] = (trainingDone[kind] ?? 0) + count;
      }
      this._troopsTrained += receipt.trainedCount;
    }
    this.quests.refresh(this.questProgress());
    const completed = { buildingsDone, trainingDone, researchDone };
    if (buildingsDone.length || researchDone.length || Object.keys(trainingDone).length) {
      for (const listener of this.completionListeners) listener(completed);
    }
    this.msSinceSave += safeDelta;
    if (this.msSinceSave >= AUTOSAVE_INTERVAL_MS) this.save(now);
    return completed;
  }

  /** Reconcile a suspended/hidden wall-clock gap with offline policy, then save. */
  reconcileAbsence(now: number = Date.now()): SimulationReceipt {
    const receipt = advanceSimulation(this.snapshot(), this.simulationTime, Math.max(this.simulationTime, now), 'offline');
    this.simulationTime = receipt.economicCursorAt;
    this.tickRemainderMs = Math.max(0, Math.min(999, now - this.simulationTime));
    this._troopsTrained += receipt.trainedCount;
    this.quests.refresh(this.questProgress());
    const completed = {
      buildingsDone: receipt.buildingsDone,
      trainingDone: receipt.trainingDone,
      researchDone: receipt.researchDone,
    };
    if (receipt.buildingsDone.length || receipt.researchDone.length || Object.keys(receipt.trainingDone).length) {
      for (const listener of this.completionListeners) listener(completed);
    }
    this.save(now);
    return receipt;
  }

  subscribeCompletions(
    listener: (result: { buildingsDone: BuildingKind[]; trainingDone: Partial<Record<TroopKind, number>>; researchDone: ReturnType<ResearchSystem['update']> }) => void,
  ): () => void {
    this.completionListeners.add(listener);
    return () => this.completionListeners.delete(listener);
  }

  /** Resolve and, for campaign mode, atomically persist before presentation. */
  commitBattle(mode: BattleMode, wave: number, now: number = Date.now()): BattleCommitResult {
    // A repeated campaign request before its receipt is acknowledged is the
    // same transaction, not a second battle (critical for double input/reload).
    if (
      mode === 'campaign' &&
      this._lastBattleReceipt &&
      !this._lastBattleReceipt.acknowledged &&
      this._lastBattleReceipt.wave === wave
    ) {
      return { ok: true, receipt: cloneReceipt(this._lastBattleReceipt) };
    }
    if (!isCampaignWave(wave)) return { ok: false, reason: 'invalidWave' };
    if (this.armyCount <= 0) return { ok: false, reason: 'noTroops' };
    if (mode === 'campaign') {
      if (this.nextCampaignWave === null) return { ok: false, reason: 'campaignComplete' };
      if (wave !== this.nextCampaignWave) return { ok: false, reason: 'notNextWave' };
    } else if (wave > this._waveCleared) {
      return { ok: false, reason: 'invalidWave' };
    }

    const deployed = this.army;
    const attackMultiplier = this.combatAttackMultiplier();
    const defenseMultiplier = this.combatDefenseMultiplier();
    const townDefense = this.townDefense();
    const result = CombatSystem.resolve(deployed, wave, {
      attackMult: attackMultiplier,
      defenseMult: defenseMultiplier,
      townDefense,
    });
    const revision = this._battleRevision + (mode === 'campaign' ? 1 : 0);
    const receipt: BattleReceipt = {
      id: `${revision}:${wave}:${Math.floor(now)}`,
      revision,
      mode,
      wave,
      win: result.win,
      reward: mode === 'campaign' ? { ...result.reward } : {},
      penalty: mode === 'campaign' ? { ...result.penalty } : {},
      casualties: { ...result.casualties },
      survivors: { ...result.survivors },
      deployed: { ...deployed },
      committedAt: now,
      armyPower: result.armyPower,
      wavePower: result.wavePower,
      attackMultiplier,
      defenseMultiplier,
      townDefense,
      contributions: CombatSystem.effectiveArmyContributions(deployed, wave, attackMultiplier),
      acknowledged: false,
    };

    if (mode === 'replay') return { ok: true, receipt };

    const before = SaveManager.serialize(this.snapshot(), now);
    this.setArmy(result.survivors);
    if (result.win) {
      this.resources.add(result.reward);
      this.recordWaveCleared(wave);
      this.recordBattleWon();
    } else {
      receipt.penalty = this.resources.subtract(result.penalty);
    }
    this._battleRevision = revision;
    this._lastBattleReceipt = receipt;
    const saved = this.save(now);
    if (!saved) {
      this.restore(before, now);
      this._saveState = 'error';
      return { ok: false, reason: 'saveFailed' };
    }
    return { ok: true, receipt };
  }

  save(now: number = Date.now()): boolean {
    if (this.recoveryLocked) {
      this._saveState = 'error';
      this._saveError = this.loadIssue?.message ?? 'Save recovery is required';
      return false;
    }
    this._saveState = 'dirty';
    const result = this.saver.trySave(this.snapshot(), now);
    if (!result.ok) {
      this._saveState = 'error';
      this._saveError = result.error;
      return false;
    }
    this._saveState = 'saved';
    this._saveError = null;
    this.msSinceSave = 0;
    return true;
  }

  retrySave(now: number = Date.now()): boolean {
    return this.save(now);
  }

  /** Return the offline settlement exactly once per loaded runtime. */
  consumeOfflineSummary(): SimulationReceipt | null {
    if (this.offlineSummaryConsumed) return null;
    this.offlineSummaryConsumed = true;
    const receipt = this.offlineReconciliation;
    if (!receipt || receipt.simulatedSeconds < 1) return null;
    const total = Object.values(receipt.gains).reduce((sum, n) => sum + n, 0);
    const completions = receipt.buildingsDone.length + receipt.researchDone.length + receipt.trainedCount;
    return total >= 1 || completions > 0 ? receipt : null;
  }

  reset(): void {
    this.saver.clear();
    GameState.instance = null;
  }

  /** Run a UI domain mutation and keep it only if the resulting snapshot saves. */
  commitDurableAction(action: () => boolean, now: number = Date.now()): boolean {
    return this.durableMutation(action, now);
  }

  private durableMutation(action: () => boolean, now: number = Date.now()): boolean {
    const before = SaveManager.serialize(this.snapshot(), now);
    if (!action()) return false;
    if (this.save(now)) return true;
    this.restore(before, now);
    this._saveState = 'error';
    return false;
  }

  private restore(serialized: ReturnType<typeof SaveManager.serialize>, now: number): void {
    const restored = SaveManager.hydrate(serialized, now);
    this.resources = restored.resources;
    this.buildings = restored.buildings;
    this.training = restored.training;
    this.research = restored.research;
    this.heroes = restored.heroes;
    this.quests = restored.quests;
    this.warmth = restored.warmth;
    this._waveCleared = restored.waveCleared;
    this._troopsTrained = restored.troopsTrained;
    this._battlesWon = restored.battlesWon;
    this._onboardingSeen = restored.onboardingSeen;
    this._tutorialDone = restored.tutorialDone;
    this._lastBattleReceipt = restored.lastBattleReceipt ?? null;
    this._battleRevision = restored.battleRevision ?? 0;
    this.simulationTime = restored.simulationCursorAt ?? now;
    this.tickRemainderMs = Math.max(0, Math.min(999, now - this.simulationTime));
  }
}

const RESOURCELESS_TROOP_ORDER: readonly TroopKind[] = ['spearman', 'archer', 'knight', 'cavalry', 'siege'];

function cloneReceipt(receipt: BattleReceipt): BattleReceipt {
  return {
    ...receipt,
    reward: { ...receipt.reward },
    penalty: { ...receipt.penalty },
    casualties: { ...receipt.casualties },
    survivors: { ...receipt.survivors },
    deployed: { ...receipt.deployed },
    contributions: { ...receipt.contributions },
  };
}
