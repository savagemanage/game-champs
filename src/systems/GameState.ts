import { ALLIANCE, HEROES, POPULATION, QUESTS, RESOURCE_ORDER, heroTrainXp } from '../config/GameConfig';
import { combineModifiers, economyMultiplierFor } from '../config/StatModifiers';
import { maxTrainableTier } from '../config/TroopConfig';
import type { Army, ArmyTiers, HeroId, ResourceCost, StatModifiers, TroopKind } from '../types';
import { AllianceSystem } from './AllianceSystem';
import { ArenaSystem, type ArenaMatchResult } from './ArenaSystem';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem, type CampaignAttemptResult } from './CampaignSystem';
import { CombatSystem } from './CombatSystem';
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

  private readonly saver: SaveManager;
  private msSinceSave = 0;
  /** Fractional alliance-help accrual carried between ticks (see tick()). */
  private allianceHelpAccrual = 0;

  /** Whether an existing save was found on load (vs a fresh game). */
  readonly loaded: boolean;
  /** Offline seconds credited on load (0 for a fresh game). */
  readonly offlineSeconds: number;
  /** Resources credited from offline idle production on load. */
  readonly offlineGains: LoadResult['offlineGains'];

  private constructor(result: LoadResult, saver: SaveManager, now: number) {
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
    this.saver = saver;
    this.loaded = result.loaded;
    this.offlineSeconds = result.offlineSeconds;
    this.offlineGains = result.offlineGains;
    // Arm the day's rotating event immediately (fresh game or load) so the
    // events framework is live from the first frame and the QuestsScene shows
    // it. Uses the creation clock; subsequent ticks keep it rolling per day.
    this.quests.dailySync(now);
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
    return new GameState(saver.load(now), saver, now);
  }

  /** Highest battle wave cleared. */
  get waveCleared(): number {
    return this._waveCleared;
  }

  /**
   * Record a newly-cleared wave (monotonic) and fire the `waveCleared` quest
   * hook so daily/growth quests progress. `now` defaults to the wall clock.
   */
  recordWaveCleared(wave: number, now: number = Date.now()): void {
    if (wave > this._waveCleared) this._waveCleared = wave;
    this.quests.record('waveCleared', 1, now);
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
    return combineModifiers(this.research.modifiers(), this.gear.modifiers());
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
    return rawArmy * this.heroes.armyPowerMultiplier() + this.heroes.totalPower();
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
  summonOnce(rng: Rng, now: number = Date.now()): SummonResult | null {
    if (!this.premium.spend(this.summon.sparkCost)) return null;
    const result = this.summon.pull(rng, (id) => this.heroes.isOwned(id));
    if (result.outcome === 'hero') this.heroes.grantHero(result.hero);
    else this.heroes.addShards(result.hero, result.shards);
    // Spending sparks on summons contributes VIP points + a quest metric.
    this.vip.addPoints(this.summon.sparkCost);
    this.quests.record('summonPulled', 1, now);
    return result;
  }

  /**
   * Train an owned hero by spending HEROES.TRAIN_SPARK_COST Ember Sparks for
   * heroTrainXp() experience (an ORIGINAL spark->XP exchange). Returns the
   * number of levels gained, or -1 when the hero is not owned / sparks are
   * insufficient (nothing spent). Spending also feeds VIP points, matching the
   * summon path.
   */
  trainHero(id: HeroId): number {
    if (!this.heroes.isOwned(id)) return -1;
    if (!this.premium.spend(HEROES.TRAIN_SPARK_COST)) return -1;
    this.vip.addPoints(HEROES.TRAIN_SPARK_COST);
    return this.heroes.addXp(id, heroTrainXp(HEROES.TRAIN_SPARK_COST));
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

  /**
   * Rally the hold for today's event: (re)arm the day's rotating event window
   * from `now` (a UI-driven trigger, complementing the automatic day-roll
   * arming in {@link tick}). Returns the id of the event now running so the
   * caller can surface it. Deterministic given `now`.
   */
  rallyDailyEvent(now: number = Date.now()): string | null {
    this.quests.dailySync(now);
    // If the day's event already ran and expired, restart it so the action is
    // always meaningful within a day.
    if (!this.quests.eventActive(now)) {
      this.quests.startEvent(QuestSystem.eventForDay(Math.floor(now / QUESTS.DAY_MS)).id, now);
    }
    return this.quests.activeEvent(now);
  }

  // --- FEAT-005: rallies, arena, alliance, quests, VIP ---------------------

  /**
   * Launch ONE rally attempt against a world boss with the hold's current
   * combat power (hero + research + gear boosted). RallySystem applies the
   * player's damage plus the deterministic simulated-alliance share, and grants
   * any newly-unlocked reward tier ONCE (rewards applied here). Also advances
   * the `rallyAttempt` quest metric. Returns the full attempt result.
   */
  attackRally(bossId: string, now: number = Date.now()): RallyAttemptResult {
    const result = this.rally.attack(bossId, this.campaignPower());
    for (const reward of result.rewards) this.grantReward(reward);
    // Each attempt also earns a little alliance-tech contribution.
    if (result.dealt > 0) this.alliance.contribute(1);
    this.quests.record('rallyAttempt', 1, now);
    return result;
  }

  /**
   * Fight ONE simulated arena match with the hold's current combat power. On a
   * win the player climbs the NPC ladder and earns Ember Sparks (credited here);
   * a loss slips a rank. Deterministic given the persisted arena seed. Advances
   * the `arenaWin` quest metric on a win. Returns the match result.
   */
  fightArena(now: number = Date.now()): ArenaMatchResult {
    const result = this.arena.fight(this.campaignPower());
    if (result.win) {
      if (result.sparks > 0) this.premium.grant(result.sparks);
      this.quests.record('arenaWin', 1, now);
    }
    return result;
  }

  /**
   * Spend one alliance HELP charge on whichever timer is active, preferring an
   * in-progress research node, then the first upgrading building. Shaves
   * ALLIANCE.HELP_REDUCTION_MS off it. Returns the ms actually shaved (0 when no
   * charge or no active timer).
   */
  useAllianceHelp(now: number = Date.now()): number {
    if (this.research.isBusy) {
      return this.alliance.help((ms, n) => this.research.reduceTimer(ms, n), now);
    }
    const kind: BuildingKind | null = this.buildings.firstUpgrading();
    if (kind) {
      return this.alliance.help((ms, n) => this.buildings.reduceUpgradeTimer(kind, ms, n), now);
    }
    return 0;
  }

  /**
   * Claim a DAILY quest reward at `now` (once per day). Applies the reward and
   * returns the claim result.
   */
  claimDailyQuest(id: string, now: number = Date.now()): QuestClaimResult {
    const result = this.quests.claimDaily(id, now);
    if (result.ok && result.reward) this.grantReward(result.reward);
    return result;
  }

  /**
   * Claim a GROWTH milestone reward (once ever). Applies the reward and returns
   * the claim result.
   */
  claimMilestone(id: string, now: number = Date.now()): QuestClaimResult {
    const result = this.quests.claimMilestone(id, now);
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
      // A running time-boxed event lifts idle output by its production bonus, so
      // events are a meaningful (temporary) boost on top of the permanent mods.
      const eventBonus = this.quests.productionBonus(now);
      const baseEfficiency = warmthMult * popMult * eventBonus;
      // Pre-scale the per-second production rates by each resource's economy
      // multiplier, then credit at the warmth x population x event efficiency.
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
    // Complete any research whose timer elapsed this tick, and fire quest hooks
    // for the progress made this tick (buildings upgraded, research completed).
    const researchDone = this.research.advance(now);

    // Roll the daily-quest board over on a day boundary, expire stale events,
    // AND arm the day's rotating event so the events framework is always live
    // (its production bonus is applied in the tick above). This is the real
    // trigger the review asked for: a returning player finds today's event
    // running without any manual action.
    this.quests.dailySync(now);
    for (let i = 0; i < buildingsDone.length; i++) {
      this.quests.record('buildingUpgraded', 1, now);
    }
    if (researchDone) this.quests.record('researchCompleted', 1, now);

    // The simulated alliance trickles in help charges over real time so a
    // returning player has some banked to spend on their timers. Fractional
    // accrual is carried between ticks so a slow drip still adds up.
    if (deltaMs > 0) {
      this.allianceHelpAccrual += deltaMs / ALLIANCE.HELP_GEN_INTERVAL_MS;
      const whole = Math.floor(this.allianceHelpAccrual);
      if (whole > 0) {
        this.alliance.grantHelps(whole);
        this.allianceHelpAccrual -= whole;
      }
    }

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
