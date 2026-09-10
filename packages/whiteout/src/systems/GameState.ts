import { HEROES, heroTrainXp } from '../config/GameConfig';
import { BUILDING_ORDER, buildingDef, isProducer, outputPerSec } from '../config/BuildingConfig';
import { combineModifiers, economyMultiplierFor } from '../config/StatModifiers';
import { maxTrainableTier } from '../config/TroopConfig';
import type { Army, ArmyTiers, HeroId, ResourceCost, Resources, StatModifiers, TroopKind } from '../types';
import { AllianceSystem } from './AllianceSystem';
import { ArenaSystem, type ArenaMatchResult } from './ArenaSystem';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem, type CampaignAttemptResult } from './CampaignSystem';
import { CombatSystem, type CombatResult } from './CombatSystem';
import { GearSystem } from './GearSystem';
import { HeroRoster, type HeroBonuses } from './HeroRoster';
import { PopulationSystem } from './PopulationSystem';
import { PremiumWallet } from './PremiumWallet';
import { QuestSystem, type QuestClaimResult } from './QuestSystem';
import { RallySystem, type RallyAttemptResult } from './RallySystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { SummonSystem, type Rng, type SummonResult } from './SummonSystem';
import { TrainingQueue } from './TrainingQueue';
import { VipSystem } from './VipSystem';
import { WarmthSystem } from './WarmthSystem';
import { settleDueCompletions, simulate } from './SimulationEngine';
import type { QuestReward } from '../config/QuestConfig';
import type { RallyReward } from '../config/RallyConfig';
import type { BuildingKind } from '../types';
import {
  SaveManager,
  browserStorage,
  type GameSnapshot,
  type KeyValueStorage,
  type LoadResult,
} from './SaveManager';
import type { OnboardingState } from '../types';

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
  readonly rally: RallySystem;
  readonly arena: ArenaSystem;
  readonly alliance: AllianceSystem;
  readonly quests: QuestSystem;
  readonly vip: VipSystem;
  private _waveCleared: number;
  /**
   * New-player onboarding / tutorial state (FEAT-003). Mutable so the Town can
   * mark the intro card dismissed and the guided flow complete; persisted via
   * the snapshot so a returning player is never re-onboarded.
   */
  private _onboarding: OnboardingState;
  private readonly processedActionIds = new Set<string>();

  private readonly saver: SaveManager;
  private msSinceSave = 0;
  private simulationAt: number;
  private clockHighWater: number;

  /** Whether an existing save was found on load (vs a fresh game). */
  readonly loaded: boolean;
  /** Offline seconds credited on load (0 for a fresh game). */
  readonly offlineSeconds: number;
  /** Resources credited from offline idle production on load. */
  readonly offlineGains: LoadResult['offlineGains'];
  /** Recovery/migration diagnostic surfaced to the player. */
  readonly loadDiagnostic: LoadResult['diagnostic'];

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
    this.rally = result.snapshot.rally;
    this.arena = result.snapshot.arena;
    this.alliance = result.snapshot.alliance;
    this.quests = result.snapshot.quests;
    this.vip = result.snapshot.vip;
    this._waveCleared = result.snapshot.waveCleared;
    this._onboarding = result.snapshot.onboarding;
    for (const id of result.snapshot.processedActionIds ?? []) this.processedActionIds.add(id);
    this.saver = saver;
    this.loaded = result.loaded;
    this.offlineSeconds = result.offlineSeconds;
    this.offlineGains = result.offlineGains;
    this.loadDiagnostic = result.diagnostic;
    this.simulationAt = result.clockAt;
    this.clockHighWater = result.clockAt;
    // Arm/sync from the save layer's sanitized monotonic watermark. A rolled
    // back or invalid local clock must never reset daily state or poison ticks.
    this.quests.dailySync(this.clockHighWater);
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

  /** Sanitize caller clocks and preserve a monotonic runtime/calendar watermark. */
  private monotonicClock(now: number): number {
    const observed = Number.isFinite(now) && now >= 0 ? now : this.clockHighWater;
    this.clockHighWater = Math.max(this.clockHighWater, observed);
    return this.clockHighWater;
  }

  /** Highest battle wave cleared. */
  get waveCleared(): number {
    return this._waveCleared;
  }

  /** The current new-player onboarding / tutorial state (defensive copy). */
  get onboarding(): OnboardingState {
    return { ...this._onboarding };
  }

  /**
   * Mark the short first-run welcome card as dismissed and persist immediately.
   * Idempotent; safe to call more than once.
   */
  markIntroDismissed(now: number = Date.now()): void {
    if (this._onboarding.introDismissed) return;
    this._onboarding.introDismissed = true;
    this.save(now);
  }

  /**
   * Mark the guided objective flow as complete (or skipped) and persist. Once
   * set, a returning player sees no banner/pointer (except the low-warmth
   * advisory). Idempotent.
   */
  markGuidedComplete(now: number = Date.now()): void {
    if (this._onboarding.guidedComplete) return;
    this._onboarding.guidedComplete = true;
    this.save(now);
  }

  /** Reserve a persisted action receipt; false means this submission already committed. */
  private beginAction(actionId?: string): boolean {
    if (!actionId) return true;
    if (this.processedActionIds.has(actionId)) return false;
    this.processedActionIds.add(actionId);
    while (this.processedActionIds.size > 256) {
      const oldest = this.processedActionIds.values().next().value as string | undefined;
      if (!oldest) break;
      this.processedActionIds.delete(oldest);
    }
    return true;
  }

  /** Remove a receipt when validation rejects an action before any mutation. */
  private rejectAction(actionId?: string): void {
    if (actionId) this.processedActionIds.delete(actionId);
  }

  /**
   * Record a newly-cleared wave (monotonic) and fire the `waveCleared` quest
   * hook so daily/growth quests progress. `now` defaults to the wall clock.
   */
  recordWaveCleared(wave: number, now: number = Date.now(), eventId?: string): void {
    const newlyCleared = wave > this._waveCleared;
    if (newlyCleared) {
      this._waveCleared = Math.min(20, Math.max(this._waveCleared, Math.floor(wave)));
      this.recordQuest('waveCleared', 1, now, eventId);
    }
    this.recordQuest('battleCompleted', 1, now, eventId);
  }

  /** Record a quest metric and atomically apply all auto-claim rewards. */
  recordQuest(metric: import('../config/QuestConfig').QuestMetric, amount: number, now: number, eventId?: string): void {
    const effectiveNow = this.monotonicClock(now);
    const receipt = eventId ? `${eventId}:${metric}` : undefined;
    for (const reward of this.quests.record(metric, amount, effectiveNow, receipt)) this.grantReward(reward);
  }

  /** Commit one normal battle result exactly once, including casualties and quests. */
  commitBattleResult(wave: number, result: CombatResult, now: number = Date.now(), actionId?: string): boolean {
    if (wave < 1 || wave > 20 || !this.beginAction(actionId)) return false;
    if (result.win) {
      this.resources.add(result.reward);
      this.recordWaveCleared(wave, now, actionId);
    } else {
      this.recordQuest('battleCompleted', 1, now, actionId);
    }
    this.training.setArmy(result.survivors, result.survivorTiers);
    this._onboarding.battleAttempted = true;
    this.save(now);
    return true;
  }

  /**
   * Replace the standing army with post-battle survivors (applies casualties).
   * An optional per-tier breakdown (from {@link CombatResult.survivorTiers})
   * keeps the tiered army accurate; without it, casualties fall on the highest
   * tiers first (TrainingQueue reconciles the breakdown against the totals).
   */
  setArmy(survivors: Army, survivorTiers?: ArmyTiers): void {
    this.training.setArmy(survivors, survivorTiers);
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
      this.alliance.modifiers(),
      this.vip.modifiers(),
    );
  }

  /**
   * The combined RESEARCH + GEAR battle modifier bundle CombatSystem consumes
   * (army-wide attack/hp/defense + the per-class Infantry/Lancer/Marksman
   * bonuses). Heroes are deliberately NOT folded in here: their aggregate army
   * bonus is applied separately via {@link HeroRoster.armyPowerMultiplier} so a
   * hero is counted exactly once (its bonus is not also double-counted through
   * the bundle's troopAttack field, which only feeds the economy/UI view).
   */
  private battleModifiers(): StatModifiers {
    return combineModifiers(this.research.modifiers(), this.gear.modifiers(), this.alliance.modifiers());
  }

  /**
   * The hold's total effective ARMY power against wave `wave`, INCLUDING the
   * research/gear battle modifiers (via CombatSystem, which resolves the
   * Infantry>Lancer>Marksman triangle and the per-class bonuses) AND the lead
   * heroes' aggregate army bonus. Heroes, research and gear all matter in
   * battle as well as production.
   */
  effectiveArmyPower(wave: number): number {
    return (
      CombatSystem.effectiveArmyPower(
        this.army,
        wave,
        this.battleModifiers(),
        this.training.armyTiers,
      ) * this.heroes.armyPowerMultiplier()
    );
  }

  /** The battle modifier bundle (research + gear) for the current hold. */
  combatModifiers(): StatModifiers {
    return this.battleModifiers();
  }

  /** The standing army broken down by tier (for combat resolution / UI). */
  get armyTiers(): ArmyTiers {
    return this.training.armyTiers;
  }

  /**
   * The hold's hero-boosted combat power for campaign validation: the raw army
   * power (matchup-neutral) lifted by the research/gear battle modifiers and the
   * lead heroes' army multiplier, plus the total owned-hero power. Deterministic;
   * feeds {@link attemptCampaignStage}.
   */
  campaignPower(): number {
    const rawArmy = CombatSystem.armyPower(
      this.army,
      this.battleModifiers(),
      this.training.armyTiers,
    );
    return rawArmy * this.heroes.armyPowerMultiplier();
  }

  /** The current MAX trainable troop tier, gated by completed research. */
  maxTroopTier(): number {
    return maxTrainableTier(this.research.maxTroopTier());
  }

  /** Current effective net resource rates used by the Town HUD. */
  effectiveResourceRates(now: number = Date.now()): Resources {
    const rates = ResourceStore.emptyBundle();
    const mods = this.modifiers();
    const warmth = this.warmth.productionMultiplier(this.buildings.furnaceLevel);
    const satisfaction = this.population.satisfactionProduction(this.buildings.totalHousing());
    const event = this.quests.productionBonus(this.monotonicClock(now));
    for (const kind of BUILDING_ORDER) {
      if (!isProducer(kind)) continue;
      const level = this.buildings.level(kind);
      const resource = buildingDef(kind).produces;
      if (level <= 0 || !resource) continue;
      rates[resource] += outputPerSec(kind, level)
        * this.population.staffingMultiplier(kind, level)
        * warmth * satisfaction * economyMultiplierFor(mods, resource) * event;
    }
    const fuel = this.warmth.fuelPerSecond(this.buildings.furnaceLevel);
    const fueled = this.buildings.furnaceLevel > 0 && this.resources.get('wood') >= fuel.wood && this.resources.get('coal') >= fuel.coal;
    if (fueled) {
      rates.wood -= fuel.wood;
      rates.coal -= fuel.coal;
    }
    const forgeLevel = this.buildings.level('forge_hall');
    if (forgeLevel > 0) {
      const capacity = this.buildings.steelThroughput()
        * this.population.staffingMultiplier('forge_hall', forgeLevel)
        * warmth * satisfaction * economyMultiplierFor(mods, 'steel') * event;
      const actual = Math.max(0, Math.min(capacity, this.resources.get('iron') / 2, this.resources.get('coal')));
      rates.steel += actual;
      rates.iron -= actual * 2;
      rates.coal -= actual;
    }
    return rates;
  }

  /**
   * Perform ONE summon: spend Ember Sparks (returns null if unaffordable), roll
   * a hero via the injected deterministic {@link Rng}, and apply the result to
   * the roster (a first copy, or shards for a duplicate). Returns the outcome.
   */
  summonOnce(rng?: Rng, now: number = Date.now(), actionId?: string): SummonResult | null {
    if (this.premium.sparks < this.summon.sparkCost || !this.beginAction(actionId)) return null;
    if (!this.premium.spend(this.summon.sparkCost)) {
      this.rejectAction(actionId);
      return null;
    }
    const result = this.summon.pull(rng, (id) => this.heroes.isOwned(id));
    if (result.outcome === 'hero') this.heroes.grantHero(result.hero);
    else this.heroes.addShards(result.hero, result.shards);
    this.vip.addPoints(this.summon.sparkCost);
    this.recordQuest('summonPulled', 1, now, actionId);
    this.save(now);
    return result;
  }

  /**
   * Train an owned hero by spending HEROES.TRAIN_SPARK_COST Ember Sparks for
   * heroTrainXp() experience (an ORIGINAL spark->XP exchange). Returns the
   * number of levels gained, or -1 when the hero is not owned / sparks are
   * insufficient (nothing spent). Spending also feeds VIP points, matching the
   * summon path.
   */
  trainHero(id: HeroId, now: number = Date.now(), actionId?: string): number {
    const hero = this.heroes.get(id);
    if (!hero?.owned || hero.level >= HEROES.MAX_LEVEL) return -1;
    if (this.buildings.level('warming_ward') < 1 || this.premium.sparks < HEROES.TRAIN_SPARK_COST) return -1;
    if (!this.beginAction(actionId)) return -1;
    if (!this.premium.spend(HEROES.TRAIN_SPARK_COST)) {
      this.rejectAction(actionId);
      return -1;
    }
    this.vip.addPoints(HEROES.TRAIN_SPARK_COST);
    const gained = this.heroes.addXp(id, heroTrainXp(HEROES.TRAIN_SPARK_COST));
    this.save(now);
    return gained;
  }

  /**
   * Attempt a campaign stage with the current hero-boosted power. On a FIRST
   * clear the stage's reward is granted exactly once: resources to the store,
   * Ember Sparks to the wallet, and hero shards to the roster. Returns the full
   * attempt result (rewards already applied).
   */
  attemptCampaignStage(stageId: string, now: number = Date.now(), actionId?: string): CampaignAttemptResult {
    if (!this.beginAction(actionId)) return this.campaign.attempt(stageId, this.campaignPower());
    const result = this.campaign.attempt(stageId, this.campaignPower());
    if (result.reason === 'unknown_stage' || result.reason === 'locked') {
      this.rejectAction(actionId);
      return result;
    }
    if (result.win && result.firstClear && result.reward) this.grantCampaignReward(result.reward);
    this.recordQuest('battleCompleted', 1, now, actionId);
    this.save(now);
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

  /**
   * Rally the hold for today's event: (re)arm the day's rotating event window
   * from `now` (a UI-driven trigger, complementing the automatic day-roll
   * arming in {@link tick}). Returns the id of the event now running so the
   * caller can surface it. Deterministic given `now`.
   */
  rallyDailyEvent(now: number = Date.now()): string | null {
    const effectiveNow = this.monotonicClock(now);
    this.quests.dailySync(effectiveNow);
    return this.quests.activeEvent(effectiveNow);
  }

  // --- FEAT-005: rallies, arena, alliance, quests, VIP ---------------------

  /**
   * Launch ONE rally attempt against a world boss with the hold's current
   * combat power (hero + research + gear boosted). RallySystem applies the
   * player's damage plus the deterministic simulated-alliance share, and grants
   * any newly-unlocked reward tier ONCE (rewards applied here). Also advances
   * the `rallyAttempt` quest metric. Returns the full attempt result.
   */
  attackRally(bossId: string, now: number = Date.now(), actionId?: string): RallyAttemptResult {
    const effectiveNow = this.monotonicClock(now);
    this.rally.syncDay(effectiveNow);
    if (!this.beginAction(actionId)) {
      return { bossId, playerDamage: 0, allianceDamage: 0, dealt: 0, remaining: this.rally.remaining(bossId), defeated: this.rally.isDefeated(bossId), rewards: [] };
    }
    if (this.buildings.level('envoy_hall') < 1) {
      this.rejectAction(actionId);
      return this.rally.attack(bossId, 0);
    }
    const result = this.rally.attack(bossId, this.campaignPower());
    if (result.dealt <= 0) {
      this.rejectAction(actionId);
      return result;
    }
    for (const reward of result.rewards) this.grantReward(reward);
    this.alliance.contribute(1);
    this.recordQuest('rallyAttempt', 1, effectiveNow, actionId);
    this.recordQuest('battleCompleted', 1, effectiveNow, actionId);
    this.save(effectiveNow);
    return result;
  }

  /**
   * Fight ONE simulated arena match with the hold's current combat power. On a
   * win the player climbs the NPC ladder and earns Ember Sparks (credited here);
   * a loss slips a rank. Deterministic given the persisted arena seed. Advances
   * the `arenaWin` quest metric on a win. Returns the match result.
   */
  fightArena(now: number = Date.now(), actionId?: string): ArenaMatchResult {
    if (!this.beginAction(actionId)) {
      return { win: false, playerPower: this.campaignPower(), opponentPower: this.arena.previewOpponentPower(), rankBefore: this.arena.rank, rankAfter: this.arena.rank, sparks: 0 };
    }
    const result = this.arena.fight(this.campaignPower());
    if (result.win && result.sparks > 0) this.premium.grant(result.sparks);
    this.recordQuest('battleCompleted', 1, now, actionId);
    this.save(now);
    return result;
  }

  /**
   * Spend one alliance HELP charge on whichever timer is active, preferring an
   * in-progress research node, then the first upgrading building. Shaves
   * ALLIANCE.HELP_REDUCTION_MS off it. Returns the ms actually shaved (0 when no
   * charge or no active timer).
   */
  useAllianceHelp(now: number = Date.now()): number {
    if (this.buildings.level('envoy_hall') < 1) return 0;
    const effectiveNow = this.monotonicClock(now);
    let shaved = 0;
    if (this.research.isBusy) {
      shaved = this.alliance.help((ms, n) => this.research.reduceTimer(ms, n), effectiveNow);
    } else {
      const kind: BuildingKind | null = this.buildings.firstUpgrading();
      if (kind) shaved = this.alliance.help((ms, n) => this.buildings.reduceUpgradeTimer(kind, ms, n), effectiveNow);
    }
    if (shaved > 0) this.save(effectiveNow);
    return shaved;
  }

  /** Make one gated, paid NPC-alliance contribution. */
  contributeAlliance(now: number = Date.now(), actionId?: string): boolean {
    if (this.buildings.level('envoy_hall') < 1 || !this.beginAction(actionId)) return false;
    const effectiveNow = this.monotonicClock(now);
    const ok = this.alliance.directContribute(this.resources, effectiveNow);
    if (!ok) {
      this.rejectAction(actionId);
      return false;
    }
    this.save(effectiveNow);
    return true;
  }

  /**
   * Claim a DAILY quest reward at `now` (once per day). Applies the reward and
   * returns the claim result.
   */
  claimDailyQuest(id: string, now: number = Date.now()): QuestClaimResult {
    const result = this.quests.claimDaily(id, this.monotonicClock(now));
    if (result.ok && result.reward) this.grantReward(result.reward);
    return result;
  }

  /**
   * Claim a GROWTH milestone reward (once ever). Applies the reward and returns
   * the claim result.
   */
  claimMilestone(id: string, now: number = Date.now()): QuestClaimResult {
    const result = this.quests.claimMilestone(id, this.monotonicClock(now));
    if (result.ok && result.reward) this.grantReward(result.reward);
    return result;
  }

  /** Apply a rally/quest reward bundle (same shape as a campaign reward). */
  private grantReward(reward: RallyReward | QuestReward): void {
    this.grantCampaignReward(reward);
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
      rally: this.rally,
      arena: this.arena,
      alliance: this.alliance,
      quests: this.quests,
      vip: this.vip,
      waveCleared: this._waveCleared,
      onboarding: this._onboarding,
      processedActionIds: [...this.processedActionIds],
    };
  }

  /**
   * Advance the simulation by `deltaMs` at wall-clock `now`: credit live idle
   * production, complete any elapsed building upgrades and training batches,
   * and auto-save on the interval. Returns the buildings/troops that finished
   * this tick so callers can play completion SFX.
   */
  tick(now: number, deltaMs: number): { buildingsDone: ReturnType<BuildingSystem['update']>; trainingDone: ReturnType<TrainingQueue['advance']> } {
    const elapsed = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    const observed = Number.isFinite(now) && now >= 0 ? Math.max(this.clockHighWater, now) : this.clockHighWater;
    // Advance by measured active delta without allowing a backward/invalid wall
    // clock to poison simulation. The simulated target becomes the new runtime
    // high-water mark; unsimulated wall jumps are not checkpointed early.
    const target = Math.min(Math.max(this.simulationAt, observed), this.simulationAt + elapsed);
    const start = this.simulationAt;
    const result = simulate(this.snapshot(), start, target, 1);
    this.simulationAt = target;
    this.clockHighWater = Math.max(this.clockHighWater, target);
    this.msSinceSave += elapsed;
    if (result.buildingsDone.length > 0 || result.researchDone.length > 0 || Object.keys(result.trainingDone).length > 0) {
      this.save(this.clockHighWater);
    } else if (this.msSinceSave >= AUTOSAVE_INTERVAL_MS) {
      this.save(this.clockHighWater);
    }
    return { buildingsDone: result.buildingsDone, trainingDone: result.trainingDone };
  }

  /** Reconcile a hidden/suspended wall-clock gap under the 8h offline policy. */
  reconcileAbsence(now: number = Date.now()): void {
    if (!Number.isFinite(now) || now < 0) return;
    const effectiveNow = Math.max(this.clockHighWater, now);
    if (effectiveNow <= this.simulationAt) return;
    const windowStart = Math.max(this.simulationAt, effectiveNow - 8 * 60 * 60 * 1000);
    settleDueCompletions(this.snapshot(), windowStart);
    simulate(this.snapshot(), windowStart, effectiveNow, 0.5);
    this.simulationAt = effectiveNow;
    this.clockHighWater = effectiveNow;
    this.save(effectiveNow);
  }

  get persistenceWarning(): string | null {
    return this.saver.lastSaveError;
  }

  get blockedSave(): boolean {
    return this.saver.blockedPayload !== null;
  }

  exportSave(now: number = Date.now()): string {
    return this.saver.blockedPayload ?? JSON.stringify(SaveManager.serialize(this.snapshot(), now), null, 2);
  }

  /** Persist immediately without ever moving the durable clock backwards. */
  save(now: number = Date.now()): void {
    const checkpointAt = this.monotonicClock(now);
    this.saver.save(this.snapshot(), checkpointAt);
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
 * Adapt the HeroRoster's aggregate {@link HeroBonuses} into the shared
 * {@link StatModifiers} bundle so heroes contribute to the SAME combined total
 * as research + gear for IDLE PRODUCTION. Only the `economy` fraction is mapped
 * (to the all-producer `economyOutput`).
 *
 * The heroes' `army` fraction is deliberately NOT folded into the bundle's
 * `troopAttack`. Combat applies it exactly once via
 * {@link HeroRoster.armyPowerMultiplier} (see {@link GameState.effectiveArmyPower}
 * / {@link GameState.campaignPower}), and {@link GameState.battleModifiers}
 * excludes heroes entirely. Keeping the hero army bonus OUT of the economy
 * bundle makes the "counted once" invariant STRUCTURAL rather than conventional:
 * no matter what future consumer reads `modifiers().troopAttack`, it can never
 * double-count the hero army bonus, because that bonus is not in the bundle.
 * This mirrors {@link SaveManager}'s `heroEconomyBundle` so live + offline agree.
 */
function heroBonusesToModifiers(bonuses: HeroBonuses): Partial<StatModifiers> {
  return { economyOutput: bonuses.economy };
}
