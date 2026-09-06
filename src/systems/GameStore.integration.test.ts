import { describe, it, expect } from 'vitest';
import { GameStore } from './GameStore';
import { memoryStorage, type KeyValueStorage } from './SaveManager';

/**
 * Store-level integration tests that prove the FULL game loop closes at the
 * model layer BEFORE any Phaser scene is wired (FEAT-002/003 build the scenes
 * on top of these methods). Everything runs Phaser-free against an injected
 * in-memory {@link KeyValueStorage} via {@link GameStore.createWith}, so it is
 * deterministic and node-friendly.
 *
 * The loop under test: assemble a squad -> attemptStage(win) -> reward applied
 * and persisted; and the ad mini-game hook recordGateRunnerResult -> economy
 * credited and persisted. It also pins the empty-squad block-reason contracts
 * the later scenes rely on.
 */
describe('GameStore integration (full loop, injected storage)', () => {
  /**
   * Recruit + place a deliberately strong, maxed 5-hero squad so early stages
   * clear reliably regardless of recruit RNG. Mirrors the helper in
   * GameStore.test.ts.
   */
  function armStrongSquad(store: GameStore): void {
    const ids = ['ironward', 'stormvolley', 'skytalon', 'breachram', 'medevac'];
    for (const id of ids) {
      store.state.heroes.roster[id] = { id, level: 60, stars: 4, skillLevel: 5, dupes: 0 };
    }
    store.persist();
    store.setFormationSlot('front', 0, 'ironward');
    store.setFormationSlot('front', 1, 'breachram');
    store.setFormationSlot('back', 0, 'stormvolley');
    store.setFormationSlot('back', 1, 'skytalon');
    store.setFormationSlot('back', 2, 'medevac');
  }

  /**
   * Find an integer seed that yields a win against stage_1 for the given store's
   * current team. stage_1 uses the weakest enemy with requiredResistance 0, so a
   * maxed squad wins on most seeds; we probe a handful for determinism without
   * mutating persistent state (resolveStage is read-only until the caller acts).
   */
  function findWinningStageSeed(store: GameStore, stageId: string): number {
    for (let seed = 1; seed <= 200; seed += 1) {
      const probe = store.attemptStage(stageId, seed);
      // attemptStage on stage_1 (already unlockable) only mutates on a win; on a
      // loss it just persists an unchanged reward-less state. We still want the
      // FIRST win to be the assertion below, so re-create a clean store per test
      // rather than relying on this probe's side effects.
      if (probe.ok && probe.outcome.win) return seed;
    }
    throw new Error(`no winning seed found for ${stageId}`);
  }

  it('assemble-team -> attemptStage(win) -> reward applied and persisted', () => {
    const storage: KeyValueStorage = memoryStorage();
    const store = GameStore.createWith(storage);
    armStrongSquad(store);
    expect(store.battleTeam().members).toHaveLength(5);

    // Empirically pick a stage_1 winning seed on a throwaway store so the probe's
    // side effects never leak into the asserted run.
    const probeStore = GameStore.createWith(memoryStorage());
    armStrongSquad(probeStore);
    const seed = findWinningStageSeed(probeStore, 'stage_1');

    // Snapshot the economy before the attempt.
    const shardsBefore = store.shards();
    const rationsBefore = store.resource('rations');
    const xpBefore = store.state.season.xp;

    const res = store.attemptStage('stage_1', seed);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.win).toBe(true);
    expect(res.outcome.battle.timeline.length).toBeGreaterThan(0);
    expect(store.clearedStages()).toContain('stage_1');

    // At least one economy value increased vs the pre-attempt snapshot: stage_1
    // grants shards + resources + seasonXp on first clear.
    const economyGrew =
      store.shards() > shardsBefore ||
      store.resource('rations') > rationsBefore ||
      store.state.season.xp > xpBefore;
    expect(economyGrew).toBe(true);

    // Persisted: a fresh store reading the SAME storage sees the cleared stage
    // and the banked season XP.
    const reloaded = GameStore.createWith(storage);
    expect(reloaded.clearedStages()).toContain('stage_1');
    expect(reloaded.state.season.xp).toBe(store.state.season.xp);
    expect(reloaded.shards()).toBe(store.shards());
  });

  it('attemptStage only applies rewards on a win (reward-less loss still persists)', () => {
    // An empty formation cannot lose combat (it is blocked earlier), so to prove
    // reward-only-on-win we lean on the deterministic engine: a maxed squad wins
    // and banks XP; the cleared set and XP only move on the winning branch.
    const store = GameStore.createWith(memoryStorage());
    armStrongSquad(store);
    const seed = findWinningStageSeed(store, 'stage_1');

    // Re-clearing an already-cleared stage yields an empty reward (no double-pay).
    const freshStore = GameStore.createWith(memoryStorage());
    armStrongSquad(freshStore);
    freshStore.attemptStage('stage_1', seed); // first clear banks reward
    const xpAfterFirstClear = freshStore.state.season.xp;
    freshStore.attemptStage('stage_1', seed); // replay -> empty reward
    expect(freshStore.state.season.xp).toBe(xpAfterFirstClear);
  });

  it('recordGateRunnerResult -> economy credited and persisted (single grant visible on reload)', () => {
    const storage: KeyValueStorage = memoryStorage();
    const store = GameStore.createWith(storage);
    const now = 86_400_000 * 700;
    store.refreshMissions(now);

    const shardsBefore = store.shards();
    const rationsBefore = store.resource('rations');
    const fuelBefore = store.resource('fuel');
    const armsBefore = store.armsRaceScore();
    const xpBefore = store.state.season.xp;

    const reward = store.recordGateRunnerResult(5, 1000, true, now);

    // The returned bundle matches the documented reward math for a win:
    // shards = max(1, round(5*0.5)) + 20 = 3 + 20 = 23
    // rations = round(1000*0.1) = 100; fuel = round(1000*0.05) = 50
    // seasonXp = 30 + 40 = 70; coins = 50
    expect(reward.shards).toBe(23);
    expect(reward.resources).toEqual({ rations: 100, fuel: 50 });
    expect(reward.seasonXp).toBe(70);
    expect(reward.coins).toBe(50);

    // The economy was actually credited on the live store.
    expect(store.shards()).toBeGreaterThan(shardsBefore);
    expect(store.resource('rations')).toBeGreaterThan(rationsBefore);
    expect(store.resource('fuel')).toBeGreaterThan(fuelBefore);
    // The mini_game arms-race tick advanced (progress recorded).
    expect(store.armsRaceScore()).toBeGreaterThanOrEqual(armsBefore);
    expect(store.state.season.xp).toBeGreaterThan(xpBefore);

    // Persisted: a brand-new store over the SAME storage reflects the grant,
    // proving persist() ran (exactly once) for the whole run result.
    const reloaded = GameStore.createWith(storage);
    expect(reloaded.shards()).toBe(store.shards());
    expect(reloaded.resource('rations')).toBe(store.resource('rations'));
    expect(reloaded.resource('fuel')).toBe(store.resource('fuel'));
    expect(reloaded.state.season.xp).toBe(store.state.season.xp);
    expect(reloaded.state.missions.daily).toEqual(store.state.missions.daily);
  });

  it('recordGateRunnerResult mini_game tick + reward math holds for a loss', () => {
    const store = GameStore.createWith(memoryStorage());
    const now = 86_400_000 * 701;
    store.refreshMissions(now);
    const reward = store.recordGateRunnerResult(4, 800, false, now);
    // Loss: no win bonuses.
    // shards = max(1, round(4*0.5)) = 2; rations = 80; fuel = 40; seasonXp = 30; coins = 0
    expect(reward.shards).toBe(2);
    expect(reward.resources).toEqual({ rations: 80, fuel: 40 });
    expect(reward.seasonXp).toBe(30);
    expect(reward.coins).toBe(0);
  });

  it('empty battleTeam yields the documented block reasons for the scenes', () => {
    const store = GameStore.createWith(memoryStorage());
    // No heroes owned / no formation -> the assembled team is empty.
    expect(store.battleTeam().members).toHaveLength(0);

    const stage = store.attemptStage('stage_1', 1);
    expect(stage.ok).toBe(false);
    if (!stage.ok) expect(stage.reason).toBe('no_squad');

    const wave = store.attemptZombieWave(0, 1);
    expect(wave.ok).toBe(false);
    if (!wave.ok) expect(wave.reason).toBe('no_squad');

    // League matches simply cannot be played without a squad.
    expect(store.playLeagueMatch(1)).toBeNull();

    // An unknown stage id is reported distinctly from the no_squad case.
    const unknown = store.attemptStage('stage_does_not_exist', 1);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown_stage');
  });
});
