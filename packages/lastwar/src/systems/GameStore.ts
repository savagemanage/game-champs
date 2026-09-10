/**
 * GameStore.ts - the single runtime owner of the full persisted v2 GameState.
 *
 * Where {@link MetaStore} exposes only the gate-runner mini-game meta, GameStore
 * owns the WHOLE expanded save (mini-game meta + resource economy, buildings,
 * hero roster, formation, season, missions). It wires the pure
 * {@link SaveManager} to real `localStorage` (via browserStorage) and gives
 * every later feature ONE place to read and mutate its own sub-state, then
 * persist. FEAT-001 provides only the accessor + persistence plumbing; each
 * later feature adds the typed getters/mutators for the sub-state it owns.
 *
 * Phaser-free by design so it can be constructed lazily from any scene or
 * pure system.
 */

import type {
  BuildingId,
  FormationState,
  GameState,
  HeroInstance,
  ResourceBag,
  ResourceKind,
  RunResult,
} from '../types';
import { SaveManager, browserStorage, type KeyValueStorage } from './SaveManager';
import {
  isClockRollback,
  localDayOrdinal,
  localSeasonOrdinal,
  localWeekOrdinal,
} from './Calendar';
import {
  accrueProduction,
  addResources,
  emptyBag,
  productionRates,
  spend,
  storageCaps,
} from './Economy';
import {
  canUpgrade,
  levelOf as buildingLevelOf,
  resolveUpgrades,
  startUpgrade,
  type UpgradeBlockReason,
} from './Buildings';
import { duplicateShards, recruit, type RecruitResult } from './Recruit';
import { levelUp, makeHeroInstance, skillUp, starUp } from './Heroes';
import { assembleTeam, placeHero, validateFormation, type Row, type Team } from './Formation';
import { makeRng } from './Rng';
import {
  resolveStage,
  resolveZombieWave,
  type StageBlockReason,
  type StageOutcome,
} from './Campaign';
import {
  addSeasonXp,
  raiseResistance,
  rolloverSeason,
  type SeasonXpResult,
} from './Season';
import {
  dayIndex,
  recordProgress,
  rollover as rolloverMissions,
  settleAllianceDuel,
  type DuelResult,
} from './DailyMissions';
import {
  playerRank,
  resolveLeagueMatch,
  rolloverLeague,
  standings,
  teamPower,
  type AllianceStanding,
  type MatchOutcome,
} from './League';
import type { DailyTaskCategory } from '../types';
import type { RewardBundle } from '../config/Progression';

/** Singleton wrapper around the full persisted v2 {@link GameState}. */
export class GameStore {
  private static instance: GameStore | null = null;

  private readonly saves: SaveManager;
  private stateInternal: GameState;
  private lastPassivePersistAt = 0;

  private constructor(storage: KeyValueStorage) {
    this.saves = new SaveManager(storage);
    this.stateInternal = this.saves.load().state;
    if (typeof window !== 'undefined') {
      const checkpoint = (): void => this.persist();
      window.addEventListener('pagehide', checkpoint);
      window.addEventListener('blur', checkpoint);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') checkpoint();
      });
    }
  }

  /** Fetch (or lazily create) the shared store backed by real localStorage. */
  static get(): GameStore {
    if (!GameStore.instance) GameStore.instance = new GameStore(browserStorage());
    return GameStore.instance;
  }

  /**
   * Replace the singleton with one backed by the given storage. Intended for
   * tests that need a deterministic, injected fake store; production code uses
   * {@link GameStore.get}.
   */
  static createWith(storage: KeyValueStorage): GameStore {
    GameStore.instance = new GameStore(storage);
    return GameStore.instance;
  }

  /** The live, mutable full game state. Mutate a sub-state then call persist(). */
  get state(): GameState {
    return this.stateInternal;
  }

  /** Persistence/recovery warnings that should be surfaced to the player. */
  saveWarnings(): readonly string[] {
    return this.saves.warnings;
  }

  /** Persist the current state to storage; re-reads the normalized result. */
  persist(): void {
    this.stateInternal = this.saves.save(this.stateInternal);
  }

  /** Wipe all progress back to a fresh v2 game and persist. */
  reset(): void {
    this.saves.clear();
    this.stateInternal = SaveManager.freshGame();
    this.saves.save(this.stateInternal);
  }

  /* ------------------------------------------------------------------ */
  /* FEAT-002: economy + building runtime methods (scenes call these).   */
  /* ------------------------------------------------------------------ */

  /**
   * Advance the base by wall-clock `now` (epoch-ms): accrue passive/offline
   * resource production against the stored lastTickTimestamp, then resolve any
   * building upgrades that have finished (including while the tab was closed).
   * Persists when anything changed. Returns the building upgrades completed on
   * this tick so a scene can surface "construction complete" feedback.
   */
  tick(now: number): {
    completed: BuildingId[];
    clockFrozen: boolean;
    gained: ResourceBag;
    discarded: ResourceBag;
  } {
    const state = this.stateInternal;
    const gained = emptyBag();
    const discarded = emptyBag();
    if (isClockRollback(now, state.maxSeenWallTime)) {
      return { completed: [], clockFrozen: true, gained, discarded };
    }
    state.maxSeenWallTime = Math.max(state.maxSeenWallTime, now);
    const resources = state.resources;
    const buildings = state.buildings;
    if (!resources.lastTickTimestamp) {
      resources.lastTickTimestamp = now;
      const resolved = resolveUpgrades(buildings.levels, buildings.queue, now);
      buildings.levels = resolved.levels;
      buildings.queue = resolved.queue;
      this.persist();
      return {
        completed: resolved.completed.map((upgrade) => upgrade.building),
        clockFrozen: false,
        gained,
        discarded,
      };
    }

    const start = resources.lastTickTimestamp;
    const end = Math.max(start, now);
    let stockpiles = resources.stockpiles;
    let levels = { ...buildings.levels };
    const queue = [...buildings.queue];
    const completed: BuildingId[] = [];
    let cursor = Math.max(start, end - 86_400_000);

    const accrueSegment = (seconds: number): void => {
      if (seconds <= 0) return;
      const before = stockpiles;
      const rates = productionRates(levels);
      const after = accrueProduction(before, levels, seconds);
      for (const kind of Object.keys(gained) as ResourceKind[]) {
        const gross = rates[kind] * seconds;
        const granted = Math.max(0, after[kind] - (before[kind] ?? 0));
        gained[kind] += granted;
        discarded[kind] += Math.max(0, gross - granted);
      }
      stockpiles = after;
    };

    // Split production exactly at construction completion so neither old nor
    // new rates are retroactively applied to the other interval.
    const upgrade = queue[0];
    if (upgrade && upgrade.completesAt > cursor && upgrade.completesAt <= end) {
      accrueSegment((upgrade.completesAt - cursor) / 1000);
      cursor = upgrade.completesAt;
      levels[upgrade.building] = Math.max(levels[upgrade.building] ?? 0, upgrade.toLevel);
      completed.push(upgrade.building);
      queue.shift();
    } else if (upgrade && upgrade.completesAt <= cursor) {
      levels[upgrade.building] = Math.max(levels[upgrade.building] ?? 0, upgrade.toLevel);
      completed.push(upgrade.building);
      queue.shift();
    }
    accrueSegment((end - cursor) / 1000);
    resources.stockpiles = stockpiles;
    resources.lastTickTimestamp = end;
    buildings.levels = levels;
    buildings.queue = queue;

    // Passive ticks may update in-memory precision every frame, but durable
    // checkpoints are throttled to at most once/second unless construction ends.
    if (completed.length > 0 || end - this.lastPassivePersistAt >= 1000) {
      this.persist();
      this.lastPassivePersistAt = end;
    }
    return { completed, clockFrozen: false, gained, discarded };
  }

  /** Current stockpile of a single resource. */
  resource(kind: ResourceKind): number {
    return this.stateInternal.resources.stockpiles[kind] ?? 0;
  }

  /** A snapshot of every resource stockpile. */
  resources(): ResourceBag {
    const out = {} as ResourceBag;
    const stockpiles = this.stateInternal.resources.stockpiles;
    for (const kind of Object.keys(stockpiles) as ResourceKind[]) {
      out[kind] = stockpiles[kind] ?? 0;
    }
    return out;
  }

  /** Per-second production rates given the current building levels. */
  productionRates(): ResourceBag {
    return productionRates(this.stateInternal.buildings.levels);
  }

  /** Storage caps given the current building levels. */
  storageCaps(): ResourceBag {
    return storageCaps(this.stateInternal.buildings.levels);
  }

  /** Current level of a building. */
  buildingLevel(id: BuildingId): number {
    return buildingLevelOf(this.stateInternal.buildings.levels, id);
  }

  /** Whether a building can start its next upgrade right now. */
  canUpgrade(
    id: BuildingId,
  ): { ok: true } | { ok: false; reason: UpgradeBlockReason } {
    const { buildings, resources } = this.stateInternal;
    return canUpgrade(id, buildings.levels, resources.stockpiles, buildings.queue);
  }

  /**
   * Attempt to start a building upgrade at wall-clock `now` (epoch-ms). On
   * success it spends the resource cost, queues the timed upgrade, and persists;
   * on failure nothing changes. Returns `true` when the upgrade was queued.
   */
  tryStartUpgrade(id: BuildingId, now: number): boolean {
    const { buildings, resources } = this.stateInternal;
    const started = startUpgrade(
      id,
      buildings.levels,
      resources.stockpiles,
      buildings.queue,
      now,
    );
    if (!started.ok || !started.upgrade || !started.cost) return false;

    const spent = spend(resources.stockpiles, started.cost);
    if (!spent.ok) return false; // Belt-and-braces; canUpgrade already checked.

    resources.stockpiles = spent.stockpiles;
    buildings.queue = [...buildings.queue, started.upgrade];
    this.recordMissionProgressNoPersist('build', 1, now);
    this.persist();
    return true;
  }

  /**
   * Grant resources (e.g. Falcon Rescue rewards) clamped to storage, then
   * persist. Returns the new stockpiles snapshot.
   */
  grantResources(gain: Partial<ResourceBag>): ResourceBag {
    const { buildings, resources } = this.stateInternal;
    resources.stockpiles = addResources(resources.stockpiles, gain, buildings.levels);
    this.persist();
    return this.resources();
  }

  /* ------------------------------------------------------------------ */
  /* FEAT-003: hero roster, recruit, progression, formation.            */
  /* ------------------------------------------------------------------ */

  /** Spendable hero progression shards. */
  shards(): number {
    return this.stateInternal.heroes.shards;
  }

  /** The owned hero instance for an id (undefined if not owned). */
  hero(id: string): HeroInstance | undefined {
    return this.stateInternal.heroes.roster[id];
  }

  /** Whether a hero id is owned. */
  ownsHero(id: string): boolean {
    return this.stateInternal.heroes.roster[id] !== undefined;
  }

  /**
   * Perform one seeded recruit pull, applying the roster / shard / pity
   * mutation and persisting. A brand-new hero is added at level 1; a duplicate
   * instead converts to shards (grade shardValue + bonus) and bumps the owned
   * instance's `dupes`. Pass a `seed` so the pull is deterministic and testable.
   * Returns the recruit outcome plus whether it was a duplicate + shards gained.
   */
  recruitOne(_callerSeed?: number): RecruitResult & { duplicate: boolean; shardsGained: number } {
    const results = this.recruitMany(1);
    if (!results) throw new Error('insufficient hero shards');
    return results[0];
  }

  /** Buy and resolve 1 or 10 pulls atomically using account-owned entropy. */
  recruitMany(count: 1 | 10): (RecruitResult & { duplicate: boolean; shardsGained: number })[] | null {
    const heroes = this.stateInternal.heroes;
    const cost = count === 10 ? 180 : 20;
    if (heroes.shards < cost) return null;
    heroes.shards -= cost;
    const results: (RecruitResult & { duplicate: boolean; shardsGained: number })[] = [];
    for (let i = 0; i < count; i += 1) {
      const seed = (heroes.recruitSeed ^ Math.imul(heroes.pity.totalPulls + 1, 0x9e3779b1)) >>> 0;
      const result = recruit(makeRng(seed), heroes.pity);
      heroes.pity = result.newPityState;
      const existing = heroes.roster[result.heroId];
      let duplicate = false;
      let shardsGained = 0;
      if (existing) {
        duplicate = true;
        shardsGained = duplicateShards(result.grade);
        heroes.shards += shardsGained;
        existing.dupes += 1;
      } else {
        heroes.roster[result.heroId] = makeHeroInstance(result.heroId);
      }
      results.push({ ...result, duplicate, shardsGained });
    }
    this.recordMissionProgressNoPersist('recruit', count, Date.now());
    this.persist();
    return results;
  }

  /**
   * Spend shards to level up an owned hero by one. Returns true on success
   * (affordable + not capped) and persists; false otherwise.
   */
  levelUpHero(id: string): boolean {
    return this.progressHero(id, levelUp);
  }

  /** Spend shards to raise an owned hero's star-tier by one. */
  starUpHero(id: string): boolean {
    return this.progressHero(id, starUp);
  }

  /** Spend shards to raise an owned hero's skill level by one. */
  skillUpHero(id: string): boolean {
    return this.progressHero(id, skillUp);
  }

  /** Shared spend-shards-to-progress helper for the three hero tracks. */
  private progressHero(
    id: string,
    op: (
      instance: HeroInstance,
      shards: number,
    ) => { ok: boolean; instance: HeroInstance; shards: number },
  ): boolean {
    const heroes = this.stateInternal.heroes;
    const instance = heroes.roster[id];
    if (!instance) return false;
    const res = op(instance, heroes.shards);
    if (!res.ok) return false;
    heroes.roster[id] = res.instance;
    heroes.shards = res.shards;
    this.recordMissionProgressNoPersist('power_up', 1, Date.now());
    this.persist();
    return true;
  }

  /** The current squad formation. */
  formation(): FormationState {
    return this.stateInternal.formation;
  }

  /**
   * Place (or clear with null) a hero in a formation row slot, then persist.
   * Only owned heroes may be placed; a hero occupies at most one slot. Returns
   * true when the resulting formation is valid and was stored.
   */
  setFormationSlot(row: Row, index: number, heroId: string | null): boolean {
    if (heroId !== null && !this.ownsHero(heroId)) return false;
    const next = placeHero(this.stateInternal.formation, row, index, heroId);
    if (!validateFormation(next).ok) return false;
    this.stateInternal.formation = next;
    this.persist();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* FEAT-004: progression meta (campaign, season, missions, league).    */
  /* ------------------------------------------------------------------ */

  /**
   * The player's current battle team, assembled from the saved formation +
   * roster. Empty (no members) when the squad is not filled with owned heroes.
   */
  battleTeam(): Team {
    return assembleTeam(this.stateInternal.formation, this.stateInternal.heroes.roster);
  }

  /**
   * Grant a {@link RewardBundle} to the permanent economy: resources are added
   * (clamped to storage), shards to the hero currency, coins to the mini-game
   * wallet, and season XP fed into the battle-pass track (which may itself yield
   * further rewards - those are applied once, non-recursively). Persists once.
   * Returns the season-XP settlement so callers can surface tier-ups.
   */
  private applyReward(reward: RewardBundle): SeasonXpResult | null {
    const seasonResult = this.applyRewardNoPersist(reward);
    this.persist();
    return seasonResult;
  }

  /**
   * The in-memory reward mutation shared by {@link applyReward} and the
   * gate-runner hook: it applies resources/shards/coins/season-XP (including the
   * non-recursive season tier rewards) to state but does NOT persist. Callers
   * are responsible for calling {@link persist} exactly once after batching any
   * further mutations, so a single logical grant results in a single save.
   */
  private applyRewardNoPersist(reward: RewardBundle): SeasonXpResult | null {
    const { resources, buildings, heroes, miniGame } = this.stateInternal;
    if (reward.resources) {
      resources.stockpiles = addResources(resources.stockpiles, reward.resources, buildings.levels);
    }
    if (reward.shards) heroes.shards += reward.shards;
    if (reward.coins) miniGame.coins += reward.coins;

    let seasonResult: SeasonXpResult | null = null;
    if (reward.seasonXp) {
      seasonResult = addSeasonXp(this.stateInternal.season, reward.seasonXp);
      this.stateInternal.season = seasonResult.state;
      // Apply the tier rewards unlocked by the XP grant (non-recursive: their
      // own seasonXp is added to the track but does not re-trigger tier rewards
      // within this call, matching addSeasonXp's documented contract).
      const tierReward = seasonResult.reward;
      if (tierReward.resources) {
        resources.stockpiles = addResources(
          resources.stockpiles,
          tierReward.resources,
          buildings.levels,
        );
      }
      if (tierReward.shards) heroes.shards += tierReward.shards;
      if (tierReward.coins) miniGame.coins += tierReward.coins;
      if (tierReward.seasonXp) {
        const follow = addSeasonXp(this.stateInternal.season, tierReward.seasonXp);
        this.stateInternal.season = follow.state;
      }
    }
    return seasonResult;
  }

  /** The set of cleared campaign stage ids. */
  clearedStages(): string[] {
    return [...this.stateInternal.campaign.clearedStages];
  }

  /** The highest zombie wave index cleared (-1 = none). */
  highestZombieWave(): number {
    return this.stateInternal.campaign.highestWave;
  }

  /**
   * Attempt a campaign stage with the current battle team. On a win the stage is
   * marked cleared (idempotent) and any first-clear reward is applied to the
   * economy + season track; the battle timeline is returned for animation.
   * Returns `{ ok: false, reason }` when the stage is unknown, still locked, or
   * the squad is empty.
   */
  attemptStage(
    stageId: string,
    stageSeed: number,
  ): { ok: true; outcome: StageOutcome } | { ok: false; reason: StageBlockReason } {
    const result = resolveStage(
      this.battleTeam(),
      stageId,
      this.stateInternal.campaign.clearedStages,
      this.stateInternal.season.resistance,
      stageSeed,
    );
    if (!result.ok) return result;
    this.stateInternal.pendingBattleSummary = {
      win: result.outcome.win,
      rounds: result.outcome.battle.rounds,
      survivors: result.outcome.battle.attackerSurvivors.length,
      timedOut: result.outcome.battle.timedOut,
    };
    if (result.outcome.win && !this.stateInternal.campaign.clearedStages.includes(stageId)) {
      this.stateInternal.campaign.clearedStages = [
        ...this.stateInternal.campaign.clearedStages,
        stageId,
      ];
    }
    if (result.outcome.win) {
      this.applyReward(result.outcome.reward);
    } else {
      this.persist();
    }
    return result;
  }

  /**
   * Attempt a zombie wave with the current battle team. On a win beyond the
   * current best the highest-wave record advances and the scaled reward is
   * applied. Returns `{ ok: false, reason }` when the wave is locked (skipping
   * ahead) or the squad is empty.
   */
  attemptZombieWave(
    waveIndex: number,
    waveSeed: number,
  ): { ok: true; outcome: StageOutcome } | { ok: false; reason: StageBlockReason } {
    const result = resolveZombieWave(
      this.battleTeam(),
      waveIndex,
      this.stateInternal.campaign.highestWave,
      waveSeed,
    );
    if (!result.ok) return result;
    this.stateInternal.pendingBattleSummary = {
      win: result.outcome.win,
      rounds: result.outcome.battle.rounds,
      survivors: result.outcome.battle.attackerSurvivors.length,
      timedOut: result.outcome.battle.timedOut,
    };
    if (result.outcome.win && waveIndex > this.stateInternal.campaign.highestWave) {
      this.stateInternal.campaign.highestWave = waveIndex;
    }
    if (result.outcome.win) {
      this.applyReward(result.outcome.reward);
    } else {
      this.persist();
    }
    return result;
  }

  /* --- Season / battle-pass ---------------------------------------- */

  /** The current season / battle-pass tier. */
  seasonTier(): number {
    return this.stateInternal.season.tier;
  }

  /** The current seasonal virus-resistance level. */
  resistance(): number {
    return this.stateInternal.season.resistance;
  }

  /** Whether the premium reward track is unlocked. */
  premiumUnlocked(): boolean {
    return this.stateInternal.season.premiumUnlocked;
  }

  /**
   * Award season XP directly (e.g. from a scene event that is not itself a
   * reward bundle). Settles any tiers crossed and applies their rewards. Returns
   * the settlement for UI feedback.
   */
  awardSeasonXp(xp: number): SeasonXpResult {
    const before = this.stateInternal.season;
    const result = addSeasonXp(before, xp);
    this.stateInternal.season = result.state;
    this.applyReward(result.reward);
    return result;
  }

  /**
   * Spend banked season XP to raise the seasonal virus-resistance by one level
   * (unlocks harder campaign stages and, at the threshold, the premium track).
   * Returns true on success and persists; false when unaffordable / capped.
   */
  raiseResistance(): boolean {
    const res = raiseResistance(this.stateInternal.season);
    if (!res.ok) return false;
    this.stateInternal.season = res.state;
    this.applyRewardNoPersist(res.reward);
    this.persist();
    return true;
  }

  /**
   * Roll the season over to the next season id, resetting seasonal progress
   * (XP / tier / resistance / claimed rewards / premium unlock) while leaving
   * permanent gains untouched. Persists.
   */
  rolloverSeason(): void {
    const next = this.stateInternal.season.current + 1;
    this.stateInternal.season = rolloverSeason(this.stateInternal.season, next);
    this.persist();
  }

  /* --- Daily missions / weekly alliance duel ----------------------- */

  /**
   * Advance daily-missions time to `now`: settle the weekly alliance duel and
   * grant its placement reward if a NEW week has begun, then roll the mission
   * block over (resetting the day/week blocks as needed). Persists. Returns the
   * settled duel result when a week rolled over, else null.
   */
  refreshMissions(now: number): DuelResult | null {
    const duel = this.refreshMissionsNoPersist(now);
    if (!isClockRollback(now, this.stateInternal.maxSeenWallTime)) this.persist();
    return duel;
  }

  /** Advance trusted local calendar cursors without performing a durable write. */
  private refreshMissionsNoPersist(now: number): DuelResult | null {
    const state = this.stateInternal;
    if (isClockRollback(now, state.maxSeenWallTime)) return null;
    const day = localDayOrdinal(now);
    const week = localWeekOrdinal(now);
    const season = localSeasonOrdinal(now);
    if (day < state.maxDayOrdinal || week < state.maxWeekOrdinal || season < state.maxSeasonOrdinal) {
      return null;
    }
    state.maxSeenWallTime = Math.max(state.maxSeenWallTime, now);
    let duel: DuelResult | null = null;

    const priorWeek = state.maxWeekOrdinal;
    if (priorWeek >= 0 && week > priorWeek) {
      duel = settleAllianceDuel(state.missions);
      this.applyRewardNoPersist(duel.reward);
      const leagueResult = rolloverLeague(state.league, teamPower(this.battleTeam()), week);
      state.league = leagueResult.state;
      this.applyRewardNoPersist(leagueResult.reward);
    } else if (priorWeek < 0) {
      state.league.period = Math.max(0, week);
    }

    if (state.maxSeasonOrdinal >= 0 && season > state.maxSeasonOrdinal) {
      state.season = rolloverSeason(state.season, season + 1);
    } else if (state.maxSeasonOrdinal < 0) {
      state.season.current = season + 1;
    }

    state.missions = rolloverMissions(state.missions, now);
    state.maxDayOrdinal = Math.max(state.maxDayOrdinal, day);
    state.maxWeekOrdinal = Math.max(state.maxWeekOrdinal, week);
    state.maxSeasonOrdinal = Math.max(state.maxSeasonOrdinal, season);
    const rank = this.leagueRank();
    state.league.bestRank = state.league.bestRank === 0 ? rank : Math.min(state.league.bestRank, rank);
    return duel;
  }

  /**
   * Record `amount` units of arms-race progress in a task `category` at time
   * `now` (build / recruit / power_up / combat / mini_game). Advances active
   * daily tasks, awards completion + milestone rewards, and accrues the weekly
   * alliance-duel activity. Applies any reward earned and persists. Returns the
   * arms-race points score after the update.
   */
  recordMissionProgress(category: DailyTaskCategory, amount: number, now: number): number {
    const score = this.recordMissionProgressNoPersist(category, amount, now);
    this.persist();
    return score;
  }

  /**
   * The in-memory mission-progress mutation shared by
   * {@link recordMissionProgress} and the gate-runner hook: advances the tasks,
   * applies any earned reward to state, but does NOT persist. Returns the
   * arms-race score after the update; the caller persists once.
   */
  private recordMissionProgressNoPersist(
    category: DailyTaskCategory,
    amount: number,
    now: number,
  ): number {
    const state = this.stateInternal;
    const day = localDayOrdinal(now);
    const week = localWeekOrdinal(now);
    const season = localSeasonOrdinal(now);
    if (
      isClockRollback(now, state.maxSeenWallTime)
      || day < state.maxDayOrdinal
      || week < state.maxWeekOrdinal
      || season < state.maxSeasonOrdinal
    ) {
      return state.missions.armsScore;
    }
    this.refreshMissionsNoPersist(now);
    const result = recordProgress(state.missions, category, amount, now);
    state.missions = result.state;
    this.applyRewardNoPersist(result.reward);
    return state.missions.armsScore;
  }

  /** The current daily arms-race score. */
  armsRaceScore(): number {
    return this.stateInternal.missions.armsScore;
  }

  /* --- League (offline simulation) --------------------------------- */

  /** The current league standings (player + AI alliances) for this period. */
  leagueStandings(): AllianceStanding[] {
    return standings(teamPower(this.battleTeam()), this.stateInternal.league.period);
  }

  /** The player's current league rank (1 = best). */
  leagueRank(): number {
    return playerRank(teamPower(this.battleTeam()), this.stateInternal.league.period);
  }

  /**
   * Resolve an OFFLINE league PvP match against a seeded AI formation via the
   * combat engine, recording the win/loss on the current period. Persists.
   * Returns null when the squad is empty.
   */
  playLeagueMatch(_matchSeed: number): MatchOutcome | null {
    const seed = this.stateInternal.league.period >>> 0;
    const outcome = resolveLeagueMatch(this.battleTeam(), seed);
    if (!outcome) return null;
    this.stateInternal.pendingBattleSummary = {
      win: outcome.win,
      rounds: outcome.battle.rounds,
      survivors: outcome.battle.attackerSurvivors.length,
      timedOut: outcome.battle.timedOut,
    };
    if (outcome.win) this.stateInternal.league.wins += 1;
    else this.stateInternal.league.losses += 1;
    this.persist();
    return outcome;
  }

  /**
   * Roll the league over to the next period, granting the placement reward for
   * the player's rank in the ending period and preserving the best rank ever
   * achieved. Persists. Returns the ending rank + reward.
   */
  rolloverLeague(): { rank: number; reward: RewardBundle } {
    const power = teamPower(this.battleTeam());
    const next = this.stateInternal.league.period + 1;
    const res = rolloverLeague(this.stateInternal.league, power, next);
    this.stateInternal.league = res.state;
    this.applyReward(res.reward);
    return { rank: res.rank, reward: res.reward };
  }

  consumePendingBattleSummary(): GameState['pendingBattleSummary'] {
    const summary = this.stateInternal.pendingBattleSummary;
    if (summary) {
      this.stateInternal.pendingBattleSummary = null;
      this.persist();
    }
    return summary;
  }

  /* --- Gate-runner (Falcon Rescue) integration --------------------- */

  /** Allocate and persist a unique replayable Falcon run identity. */
  beginFalconRun(): { runId: string; seed: number } {
    const sequence = this.stateInternal.runSequence + 1;
    this.stateInternal.runSequence = sequence;
    const runId = `run-${sequence}`;
    const seed = (this.stateInternal.heroes.recruitSeed ^ Math.imul(sequence, 0x85ebca6b)) >>> 0;
    this.persist();
    return { runId, seed };
  }

  /** Atomically settle all Falcon meta/main-game effects once per runId. */
  settleFalconRun(
    runId: string,
    result: RunResult,
    now: number,
  ): { reward: RewardBundle; grantedMainGame: boolean; remainingToday: number; newBestDistance: boolean; newBestScore: boolean } {
    const state = this.stateInternal;
    const match = /^run-(\d+)$/.exec(runId);
    const sequence = match ? Number(match[1]) : Number.NaN;
    const duplicate = !Number.isSafeInteger(sequence)
      || sequence <= state.settledRunSequence
      || state.appliedRunIds.includes(runId);
    const day = Math.max(state.maxDayOrdinal, localDayOrdinal(now));
    if (state.dailyCompletedRuns.dayKey !== day) state.dailyCompletedRuns = { dayKey: day, count: 0 };
    if (duplicate) {
      return { reward: {}, grantedMainGame: false, remainingToday: Math.max(0, 5 - state.dailyCompletedRuns.count), newBestDistance: false, newBestScore: false };
    }

    const newBestDistance = result.distance > state.miniGame.bestDistance;
    const newBestScore = result.score > state.miniGame.bestScore;
    state.miniGame.coins += Math.max(0, Math.floor(result.coinsEarned));
    state.miniGame.bestDistance = Math.max(state.miniGame.bestDistance, result.distance);
    state.miniGame.bestScore = Math.max(state.miniGame.bestScore, result.score);
    state.miniGame.runsPlayed += 1;
    state.dailyCompletedRuns.count += 1;
    const grantedMainGame = state.dailyCompletedRuns.count <= 5;
    const reward: RewardBundle = grantedMainGame ? {
      shards: Math.max(1, Math.round(Math.max(0, result.squadFinal) * 0.5)) + (result.win ? 20 : 0),
      resources: {
        rations: Math.max(0, Math.round(Math.max(0, result.distance) * 0.1)),
        fuel: Math.max(0, Math.round(Math.max(0, result.distance) * 0.05)),
      },
      seasonXp: 30 + (result.win ? 40 : 0),
      coins: result.win ? 50 : 0,
    } : {};
    if (grantedMainGame) {
      this.applyRewardNoPersist(reward);
      this.recordMissionProgressNoPersist('mini_game', 1, now);
    }
    state.settledRunSequence = Math.max(state.settledRunSequence, sequence);
    state.appliedRunIds = [...state.appliedRunIds, runId];
    state.maxDayOrdinal = Math.max(state.maxDayOrdinal, day);
    this.persist();
    return {
      reward,
      grantedMainGame,
      remainingToday: Math.max(0, 5 - state.dailyCompletedRuns.count),
      newBestDistance,
      newBestScore,
    };
  }

  /** Compatibility wrapper for older callers; new code must pass a runId. */
  recordGateRunnerResult(squadFinal: number, distance: number, win: boolean, now: number): RewardBundle {
    const run = this.beginFalconRun();
    return this.settleFalconRun(run.runId, {
      squadFinal,
      squadPeak: squadFinal,
      distance,
      win,
      score: Math.floor(distance + squadFinal * 15 + (win ? 100 : 0)),
      coinsEarned: 0,
    }, now).reward;
  }

  falconRewardsRemaining(now: number): number {
    const day = Math.max(this.stateInternal.maxDayOrdinal, localDayOrdinal(now));
    return this.stateInternal.dailyCompletedRuns.dayKey === day
      ? Math.max(0, 5 - this.stateInternal.dailyCompletedRuns.count)
      : 5;
  }

  /** The day index for a timestamp (exposed so scenes share the derivation). */
  dayOf(now: number): number {
    return dayIndex(now);
  }

  /* ------------------------------------------------------------------ */
  /* FEAT-003: onboarding tutorial (show once, replayable).             */
  /* ------------------------------------------------------------------ */

  /**
   * Whether the first-run onboarding tutorial has been seen. A brand-new game
   * is `false` (so HomeScene auto-shows it once); a returning/migrated player
   * is `true`. HomeScene gates its first-run launch on this.
   */
  tutorialSeen(): boolean {
    return this.stateInternal.tutorial.seen;
  }

  /** The stable ids of tutorial steps the player has completed. */
  tutorialCompletedSteps(): string[] {
    return [...this.stateInternal.tutorial.completedSteps];
  }

  /**
   * Mark the onboarding tutorial as seen (on completion or Skip) and persist,
   * so it never auto-shows again. Idempotent.
   */
  markTutorialSeen(): void {
    const tutorial = this.stateInternal.tutorial;
    if (!tutorial.grantClaimed) {
      this.stateInternal.heroes.shards += 200;
      tutorial.grantClaimed = true;
    }
    tutorial.seen = true;
    this.persist();
  }

  /**
   * Record that a tutorial step (by stable id) has been completed and persist.
   * Ignores empty ids and de-duplicates, so calling it repeatedly for the same
   * step is a no-op beyond the first.
   */
  markTutorialStep(id: string): void {
    if (!id) return;
    const tutorial = this.stateInternal.tutorial;
    if (!tutorial.completedSteps.includes(id)) {
      tutorial.completedSteps = [...tutorial.completedSteps, id];
      this.persist();
    }
  }

  /**
   * Reset the tutorial back to its fresh, unseen state (seen false + no
   * completed steps) and persist, so a replay entry point can run the guided
   * sequence again from the start.
   */
  resetTutorial(): void {
    const grantClaimed = this.stateInternal.tutorial.grantClaimed;
    this.stateInternal.tutorial = { seen: false, completedSteps: [], grantClaimed };
    this.persist();
  }
}
