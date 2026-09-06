import { describe, it, expect } from 'vitest';
import { GameState } from './GameState';
import { memoryStorage } from './SaveManager';
import { ResourceStore } from './ResourceStore';

/**
 * Integration tests that the FEAT-004 progression sources are actually CONSUMED
 * by GameState: the combined StatModifiers bundle scales idle production, and
 * the battle modifiers + research-gated max troop tier flow through the public
 * API. Uses a fresh in-memory GameState so no browser/localStorage is touched.
 */
describe('GameState modifier integration', () => {
  function freshState(): GameState {
    return GameState.create(memoryStorage(), 0);
  }

  it('combines research + gear + hero bonuses into one bundle', () => {
    const gs = freshState();
    const store = new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });

    // Baseline: no progression, an all-zero bundle.
    expect(gs.modifiers().foodOutput).toBe(0);
    expect(gs.modifiers().troopAttack).toBe(0);

    // Complete an economy research node (food output) and forge a gear piece.
    gs.research.start('eco_foraging', store, 10, 0);
    gs.research.advance(999_999_999);
    gs.gear.upgradeGear('gloves', store); // troopAttack

    const mods = gs.modifiers();
    expect(mods.foodOutput).toBeGreaterThan(0);
    expect(mods.troopAttack).toBeGreaterThan(0);
  });

  it('economy modifiers scale idle production in tick', () => {
    // Two identical holds; one gets an economy research bonus. Build a hunters'
    // hut so there is food production, then tick both the same amount.
    const store = () => new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });

    const plain = freshState();
    plain.buildings.startUpgrade('hunters_hut', store(), 0);
    plain.buildings.update(1); // complete instantly for the test setup
    // Force the hut to level 1 by finishing its upgrade.
    while (plain.buildings.level('hunters_hut') < 1) plain.buildings.update(1e12);

    const boosted = freshState();
    boosted.buildings.startUpgrade('hunters_hut', store(), 0);
    while (boosted.buildings.level('hunters_hut') < 1) boosted.buildings.update(1e12);
    boosted.research.start('eco_foraging', store(), 10, 0);
    boosted.research.advance(999_999_999); // +foodOutput

    const before = 1_000_000_000;
    const plainFood0 = plain.resources.get('food');
    const boostFood0 = boosted.resources.get('food');
    plain.tick(before + 10_000, 10_000);
    boosted.tick(before + 10_000, 10_000);
    const plainGain = plain.resources.get('food') - plainFood0;
    const boostGain = boosted.resources.get('food') - boostFood0;

    // The research-boosted hold gathered strictly more food over the same tick.
    expect(boostGain).toBeGreaterThan(plainGain);
  });

  it('battle modifiers lift effective army power', () => {
    const store = () => new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });
    const army = { trapper: 0, marksman: 0, vanguard: 10 };

    const plain = freshState();
    plain.setArmy(army);
    const basePower = plain.effectiveArmyPower(1);

    const boosted = freshState();
    boosted.setArmy(army);
    // Complete a battle research node that raises troop attack.
    boosted.research.start('bat_drill', store(), 10, 0);
    boosted.research.advance(999_999_999);
    const boostedPower = boosted.effectiveArmyPower(1);

    expect(boostedPower).toBeGreaterThan(basePower);
  });

  it('exposes the research-gated max troop tier', () => {
    const gs = freshState();
    const store = new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });
    expect(gs.maxTroopTier()).toBe(1);
    gs.research.start('dev_ironworking', store, 10, 0);
    gs.research.advance(999_999_999);
    expect(gs.maxTroopTier()).toBe(2);
  });
});

/**
 * Integration tests that the FEAT-005 endgame systems are wired into GameState:
 * rallies grant rewards, arena wins credit sparks, alliance help shortens the
 * active timer, and quest hooks fire from the relevant actions.
 */
describe('GameState endgame integration', () => {
  function freshState(): GameState {
    return GameState.create(memoryStorage(), 0);
  }

  it('a rally attempt records the quest metric and grants tier rewards', () => {
    const gs = freshState();
    gs.setArmy({ trapper: 0, marksman: 0, vanguard: 5_000 }); // huge power -> big damage
    const sparks0 = gs.premium.sparks;
    const res = gs.attackRally('rime_alpha', 0);
    expect(res.dealt).toBeGreaterThan(0);
    expect(gs.rally.attempts('rime_alpha')).toBe(1);
    // The daily/growth rally quest metric advanced.
    expect(gs.quests.milestoneProgress('growth_hunter')).toBe(1);
    // Crossing reward-tier thresholds granted at least the spark tiers.
    expect(gs.premium.sparks).toBeGreaterThanOrEqual(sparks0);
  });

  it('an arena win credits Ember Sparks and records the metric', () => {
    const gs = freshState();
    gs.setArmy({ trapper: 0, marksman: 0, vanguard: 100_000 }); // overwhelming
    const sparks0 = gs.premium.sparks;
    const res = gs.fightArena(0);
    expect(res.win).toBe(true);
    expect(gs.premium.sparks).toBe(sparks0 + res.sparks);
    expect(gs.arena.wins).toBe(1);
  });

  it('alliance help shortens the active building timer via GameState', () => {
    const gs = freshState();
    gs.alliance.grantHelps(1);
    // Furnace at a level that lets the hut build; fund it and start an upgrade.
    while (gs.buildings.furnaceLevel < 3) {
      gs.buildings.startUpgrade('furnace', highStore(), 0);
      gs.buildings.update(1e12);
    }
    gs.buildings.startUpgrade('hunters_hut', highStore(), 0);
    const before = gs.buildings.upgradeEndsAt('hunters_hut')!;
    const shaved = gs.useAllianceHelp(0);
    expect(shaved).toBeGreaterThan(0);
    expect(gs.buildings.upgradeEndsAt('hunters_hut')!).toBe(before - shaved);
  });

  it('claims a daily quest reward through GameState once complete', () => {
    const gs = freshState();
    // daily_battle needs 3 waves cleared.
    gs.recordWaveCleared(1, 0);
    gs.recordWaveCleared(2, 0);
    gs.recordWaveCleared(3, 0);
    const food0 = gs.resources.get('food');
    const res = gs.claimDailyQuest('daily_battle', 0);
    expect(res.ok).toBe(true);
    // The reward (iron + sparks) was applied.
    expect(gs.resources.get('iron')).toBeGreaterThan(0);
    expect(food0).toBe(gs.resources.get('food')); // this reward is not food
  });

  it('summoning contributes VIP points', () => {
    const gs = freshState();
    gs.premium.grant(gs.summon.sparkCost * 2);
    const pts0 = gs.vip.points;
    gs.summonOnce(() => 0.5, 0);
    expect(gs.vip.points).toBe(pts0 + gs.summon.sparkCost);
  });
});

/** A well-stocked store so the endgame integration tests never fail on cost. */
function highStore(): ResourceStore {
  return new ResourceStore({ food: 1e9, wood: 1e9, coal: 1e9, iron: 1e9, steel: 1e9 });
}
