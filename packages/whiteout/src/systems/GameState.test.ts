import { describe, it, expect } from 'vitest';
import { GameState } from './GameState';
import { memoryStorage } from './SaveManager';
import { ResourceStore } from './ResourceStore';
import { HEROES, heroTrainXp } from '../config/GameConfig';
import type { BuildingKind } from '../types';

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

  it('a lead hero army bonus lifts combat but is NOT folded into modifiers().troopAttack (no double-count)', () => {
    // Review note 4: the hero army bonus must be counted ONCE (via the army
    // multiplier), never also through the economy bundle's troopAttack field.
    const gs = freshState();
    gs.setArmy({ trapper: 0, marksman: 0, vanguard: 10 });
    const basePower = gs.effectiveArmyPower(1);

    // Lead ember_warden (an ARMY-bonus infantry hero).
    gs.heroes.grantHero('ember_warden');
    gs.heroes.setLead(['ember_warden']);
    expect(gs.heroes.bonuses().army).toBeGreaterThan(0);

    // Combat power rises (the army multiplier applies the hero bonus once)...
    expect(gs.effectiveArmyPower(1)).toBeGreaterThan(basePower);
    // ...but the economy/UI bundle's troopAttack stays ZERO for heroes, so no
    // future modifiers() consumer can double-count the hero army bonus.
    expect(gs.modifiers().troopAttack).toBe(0);
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

  it('training and fielding a higher tier raises effective army power', () => {
    // Two holds; both train one vanguard, but the second trains it at tier 2
    // (which research would gate in-game). The tier-2 hold fields strictly more
    // effective power AND the tier survives into the standing army.
    const rich = () => new ResourceStore({ food: 1e7, wood: 1e7, coal: 1e7, iron: 1e7, steel: 1e7 });

    const t1 = freshState();
    t1.training.enqueue('vanguard', 4, rich(), 0, true, 1);
    t1.training.advance(1e12);

    const t2 = freshState();
    t2.training.enqueue('vanguard', 4, rich(), 0, true, 2);
    t2.training.advance(1e12);

    expect(t2.armyTiers.vanguard).toEqual({ 2: 4 });
    expect(t2.effectiveArmyPower(1)).toBeGreaterThan(t1.effectiveArmyPower(1));
    // The tiered power also flows into campaign validation.
    expect(t2.campaignPower()).toBeGreaterThan(t1.campaignPower());
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
    buildToLevelOne(gs, 'envoy_hall');
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
    buildToLevelOne(gs, 'envoy_hall');
    gs.alliance.grantHelps(1);
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

  it('auto-claims a daily quest reward in the causing action', () => {
    const gs = freshState();
    const iron0 = gs.resources.get('iron');
    const sparks0 = gs.premium.sparks;
    gs.recordWaveCleared(1, 0);
    gs.recordWaveCleared(2, 0);
    gs.recordWaveCleared(3, 0);
    expect(gs.quests.isDailyClaimed('daily_battle')).toBe(true);
    expect(gs.resources.get('iron')).toBe(iron0 + 60);
    expect(gs.premium.sparks).toBeGreaterThanOrEqual(sparks0 + 20);
    expect(gs.claimDailyQuest('daily_battle', 0).reason).toBe('already_claimed');
  });

  it('arms the day event on creation so the production bonus is live', () => {
    const gs = freshState();
    // The GameState constructor arms the day's event via dailySync, so the
    // events framework is no longer inert: an event is running at the creation
    // clock and its production bonus exceeds 1.
    expect(gs.quests.eventActive(0)).toBe(true);
    expect(gs.quests.productionBonus(0)).toBeGreaterThan(1);
  });

  it('the active event lifts idle production during tick', () => {
    const store = () => new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });
    const buildHut = (gs: GameState): void => {
      gs.buildings.startUpgrade('hunters_hut', store(), 0);
      while (gs.buildings.level('hunters_hut') < 1) gs.buildings.update(1e12);
    };
    // Two holds ticked over the SAME small (same-day) window so dailySync does
    // not re-arm; one keeps the day's armed event, the other has it expired.
    const withEvent = freshState();
    buildHut(withEvent);
    expect(withEvent.quests.eventActive(0)).toBe(true);

    const plain = freshState();
    buildHut(plain);
    // Expire the event with a zero-length window; same-day tick won't re-arm.
    plain.quests.startEvent('ember_rush', 0, 0);
    expect(plain.quests.eventActive(1)).toBe(false);

    const withEvent0 = withEvent.resources.get('food');
    const plain0 = plain.resources.get('food');
    withEvent.tick(1000, 1000);
    plain.tick(1000, 1000);
    const withEventGain = withEvent.resources.get('food') - withEvent0;
    const plainGain = plain.resources.get('food') - plain0;

    // The event-active hold gathered strictly more over the identical window.
    expect(withEventGain).toBeGreaterThan(plainGain);
    // And the event is still running for the boosted hold (same day).
    expect(withEvent.quests.eventActive(1000)).toBe(true);
  });

  it('summoning contributes VIP points', () => {
    const gs = freshState();
    gs.premium.grant(gs.summon.sparkCost * 2);
    const pts0 = gs.vip.points;
    gs.summonOnce(() => 0.5, 0);
    expect(gs.vip.points).toBe(pts0 + gs.summon.sparkCost);
  });
});

/**
 * FEAT-006 hero training: the Hero screen's spark->XP exchange. Verifies the
 * pure helper and the GameState.trainHero action (spends sparks, grants XP /
 * levels, guards ownership + affordability).
 */
describe('hero training (FEAT-006)', () => {
  function freshState(): GameState {
    return GameState.create(memoryStorage(), 0);
  }

  it('heroTrainXp converts sparks to XP deterministically', () => {
    expect(heroTrainXp(HEROES.TRAIN_SPARK_COST)).toBe(HEROES.TRAIN_SPARK_COST * HEROES.TRAIN_XP_PER_SPARK);
    expect(heroTrainXp(0)).toBe(0);
    expect(heroTrainXp(-5)).toBe(0);
  });

  it('trainHero spends sparks and grants XP to an owned hero', () => {
    const gs = freshState();
    gs.heroes.grantHero('ember_warden');
    buildToLevelOne(gs, 'warming_ward');
    gs.premium.grant(HEROES.TRAIN_SPARK_COST * 5);
    const sparks0 = gs.premium.sparks;
    const vip0 = gs.vip.points;
    const levels = gs.trainHero('ember_warden');
    expect(levels).toBeGreaterThanOrEqual(0);
    expect(gs.premium.sparks).toBe(sparks0 - HEROES.TRAIN_SPARK_COST);
    expect(gs.vip.points).toBe(vip0 + HEROES.TRAIN_SPARK_COST);
    // The hero accrued the XP (either as banked xp or a level gain).
    const h = gs.heroes.get('ember_warden')!;
    expect(h.level >= 1 && (h.level > 1 || h.xp > 0)).toBe(true);
  });

  it('trainHero refuses an unowned hero or insufficient sparks (nothing spent)', () => {
    const gs = freshState();
    // Unowned.
    expect(gs.trainHero('the_kindled_queen')).toBe(-1);
    // Owned but broke.
    gs.heroes.grantHero('ember_warden');
    expect(gs.premium.sparks).toBeLessThan(HEROES.TRAIN_SPARK_COST);
    expect(gs.trainHero('ember_warden')).toBe(-1);
  });
});

/** Build a gated support building for integration fixtures. */
function buildToLevelOne(gs: GameState, kind: BuildingKind): void {
  while (gs.buildings.furnaceLevel < 2) {
    gs.buildings.startUpgrade('furnace', highStore(), 0);
    gs.buildings.update(1e12);
  }
  gs.buildings.startUpgrade(kind, highStore(), 0);
  gs.buildings.update(1e12);
}

/** A well-stocked store so the endgame integration tests never fail on cost. */
function highStore(): ResourceStore {
  return new ResourceStore({ food: 1e9, wood: 1e9, coal: 1e9, iron: 1e9, steel: 1e9 });
}
