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
} from '../types';
import { SaveManager, browserStorage, type KeyValueStorage } from './SaveManager';
import {
  accrueSince,
  addResources,
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
  weekIndex,
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

  private constructor(storage: KeyValueStorage) {
    this.saves = new SaveManager(storage);
    this.stateInternal = this.saves.load().state;
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

  /** Persist the current state to storage; re-reads the normalized result. */
  persist(): void {
    this.stateInternal = this.saves.save(this.stateInternal);
  }

  /** Wipe all progress back to a fresh v2 game and persist. */
  reset(): void {
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
  tick(now: number): { completed: BuildingId[] } {
    const buildings = this.stateInternal.buildings;

    // 1) Resolve finished upgrades first so freshly-completed buildings feed
    //    into the production accrual below.
    const resolved = resolveUpgrades(buildings.levels, buildings.queue, now);
    buildings.levels = resolved.levels;
    buildings.queue = resolved.queue;

    // 2) Accrue production for the elapsed wall-clock gap, clamped to storage.
    const resources = this.stateInternal.resources;
    const accrued = accrueSince(
      resources.stockpiles,
      buildings.levels,
      resources.lastTickTimestamp,
      now,
    );
    resources.stockpiles = accrued.stockpiles;
    resources.lastTickTimestamp = accrued.lastTickTimestamp;

    this.persist();
    return { completed: resolved.completed.map((u) => u.building) };
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
  recruitOne(seed: number): RecruitResult & { duplicate: boolean; shardsGained: number } {
    const heroes = this.stateInternal.heroes;
    const rng = makeRng(seed);
    const result = recruit(rng, heroes.pity);
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
    this.persist();
    return { ...result, duplicate, shardsGained };
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
    const missions = this.stateInternal.missions;
    const week = weekIndex(now);
    let duel: DuelResult | null = null;
    // A real week rollover (an initialized prior week that differs) settles the
    // just-ended week's duel before the activity score is reset.
    if (missions.weekKey >= 0 && missions.weekKey !== week) {
      duel = settleAllianceDuel(missions);
    }
    this.stateInternal.missions = rolloverMissions(missions, now);
    if (duel) this.applyReward(duel.reward);
    else this.persist();
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
    const result = recordProgress(this.stateInternal.missions, category, amount, now);
    this.stateInternal.missions = result.state;
    this.applyRewardNoPersist(result.reward);
    return this.stateInternal.missions.armsScore;
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
  playLeagueMatch(matchSeed: number): MatchOutcome | null {
    const outcome = resolveLeagueMatch(this.battleTeam(), matchSeed);
    if (!outcome) return null;
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

  /* --- Gate-runner (Falcon Rescue) integration --------------------- */

  /**
   * Feed a completed Falcon Rescue (gate-runner) run into the progression loop.
   * The rescued squad / run quality translates into army economy rewards:
   * shards scale with the squad brought home, resources with distance, and a
   * win grants a bonus; the run also advances the daily "mini-game" arms-race
   * task and (via {@link applyReward}) the season track. This is the store hook
   * the FEAT-007 Results flow calls after a run resolves. Persists.
   *
   * @param squadFinal Surviving squad size at run end.
   * @param distance   Distance travelled (world units).
   * @param win        Whether the boss was defeated.
   * @param now        Wall-clock epoch-ms (drives the daily/weekly rollover).
   */
  recordGateRunnerResult(
    squadFinal: number,
    distance: number,
    win: boolean,
    now: number,
  ): RewardBundle {
    const shards = Math.max(1, Math.round(Math.max(0, squadFinal) * 0.5));
    const rations = Math.max(0, Math.round(Math.max(0, distance) * 0.1));
    const fuel = Math.max(0, Math.round(Math.max(0, distance) * 0.05));
    const reward: RewardBundle = {
      shards: shards + (win ? 20 : 0),
      resources: { rations, fuel },
      seasonXp: 30 + (win ? 40 : 0),
      coins: win ? 50 : 0,
    };
    // Batch the reward grant and the mini-game arms-race tick as in-memory
    // mutations, then persist exactly ONCE for the whole run result.
    this.applyRewardNoPersist(reward);
    // One mini-game arms-race unit per completed run.
    this.recordMissionProgressNoPersist('mini_game', 1, now);
    this.persist();
    return reward;
  }

  /** The day index for a timestamp (exposed so scenes share the derivation). */
  dayOf(now: number): number {
    return dayIndex(now);
  }
}
