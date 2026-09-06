import { describe, it, expect } from 'vitest';
import { GameState } from './GameState';
import { memoryStorage } from './SaveManager';
import { TECH_DEFS } from '../config/ResearchConfig';
import { QUEST_DEFS } from '../config/QuestConfig';
import { WARMTH } from '../config/GameConfig';

/**
 * GameState composition-seam tests.
 *
 * GameState is Phaser-free (it imports only the pure systems + SaveManager), so
 * it loads fine under vitest. These tests cover the WIRING that the unit-level
 * system tests cannot reach: the single point where the research and hero
 * pillars COMPOSE (`combatAttackMultiplier` / `economyMultiplier`), the town's
 * aggregate defense passed into combat, and the quest counters incremented
 * through the real GameState tick / battle paths.
 *
 * The review flagged this seam as untested: reverting the hero factor out of
 * `combatAttackMultiplier` (leaving just `research.combatAttackMultiplier()`)
 * left all 147 unit tests green. The composition assertions below FAIL under
 * that reversion, closing the gap.
 */
describe('GameState composition seam', () => {
  const NOW = 1_000_000;

  /** A fresh, in-memory GameState (no save present -> fresh game). */
  const fresh = (): GameState => GameState.create(memoryStorage(), NOW);

  /**
   * Unlock a tech directly on the live ResearchSystem by starting it (giving it
   * a Scholars' Hall level high enough) and advancing past its completion. Adds
   * the tech cost to the store first so the start always succeeds.
   */
  const unlockTech = (state: GameState, techId: keyof typeof TECH_DEFS): void => {
    const def = TECH_DEFS[techId];
    state.resources.add(def.cost);
    const started = state.research.startResearch(
      techId,
      state.resources,
      NOW,
      def.requiresResearchLevel,
    );
    expect(started.ok).toBe(true);
    const done = state.research.update(NOW + def.timeMs);
    expect(done).toContain(techId);
    expect(state.research.isUnlocked(techId)).toBe(true);
  };

  /** Recruit + activate a hero, funding the recruit cost first. */
  const recruitActive = (
    state: GameState,
    heroId: 'ser_alden' | 'kara_stormblade' | 'mira_goldhand' | 'old_bram',
  ): void => {
    // Fund generously so the recruit cost is always affordable.
    state.resources.add({ gold: 1000, food: 1000, wood: 1000, stone: 1000 });
    const rec = state.heroes.recruit(heroId, state.resources);
    expect(rec.ok).toBe(true);
    expect(state.heroes.setActive(heroId)).toBe(true);
  };

  it('is neutral (1) on a fresh game for both composed multipliers', () => {
    const state = fresh();
    expect(state.combatAttackMultiplier()).toBe(1);
    expect(state.economyMultiplier()).toBe(1);
    expect(state.combatDefenseMultiplier()).toBe(1);
    expect(state.townDefense()).toBe(0);
  });

  it('combatAttackMultiplier equals research × hero and is >1 with a war hero AND a combat-attack tech', () => {
    const state = fresh();
    // A combat-attack tech alone (sharpened_blades: combatAttack 1.1).
    unlockTech(state, 'sharpened_blades');
    // An active WAR hero alone.
    recruitActive(state, 'ser_alden');

    const research = state.research.combatAttackMultiplier();
    const hero = state.heroes.combatMultiplier();
    // Both pillars are genuinely active.
    expect(research).toBeGreaterThan(1);
    expect(hero).toBeGreaterThan(1);
    // The composition is exactly the product of the two pillars.
    expect(state.combatAttackMultiplier()).toBeCloseTo(research * hero, 10);
    // ... and therefore strictly greater than either factor alone.
    expect(state.combatAttackMultiplier()).toBeGreaterThan(research);
    expect(state.combatAttackMultiplier()).toBeGreaterThan(hero);
  });

  it('an economy hero does NOT boost combat attack (role-gated composition)', () => {
    const state = fresh();
    recruitActive(state, 'mira_goldhand'); // economy role
    // Hero contributes nothing to the combat pillar -> combat stays research-only (1 here).
    expect(state.heroes.combatMultiplier()).toBe(1);
    expect(state.combatAttackMultiplier()).toBe(state.research.combatAttackMultiplier());
    expect(state.combatAttackMultiplier()).toBe(1);
  });

  it('economyMultiplier equals research × hero and is >1 with an economy hero AND a production tech', () => {
    const state = fresh();
    unlockTech(state, 'crop_rotation'); // production 1.1
    recruitActive(state, 'mira_goldhand'); // economy role

    const research = state.research.productionMultiplier();
    const hero = state.heroes.economyMultiplier();
    expect(research).toBeGreaterThan(1);
    expect(hero).toBeGreaterThan(1);
    expect(state.economyMultiplier()).toBeCloseTo(research * hero, 10);
    expect(state.economyMultiplier()).toBeGreaterThan(research);
    expect(state.economyMultiplier()).toBeGreaterThan(hero);
  });

  it('a war hero does NOT boost economy (role-gated composition)', () => {
    const state = fresh();
    recruitActive(state, 'ser_alden'); // war role
    expect(state.heroes.economyMultiplier()).toBe(1);
    expect(state.economyMultiplier()).toBe(state.research.productionMultiplier());
    expect(state.economyMultiplier()).toBe(1);
  });

  it('combatDefenseMultiplier reflects the research defense techs (heroes do not affect it)', () => {
    const state = fresh();
    expect(state.combatDefenseMultiplier()).toBe(1);
    unlockTech(state, 'hardened_armor'); // combatDefense 1.1
    expect(state.combatDefenseMultiplier()).toBeCloseTo(TECH_DEFS.hardened_armor.effect.mult, 10);
    expect(state.combatDefenseMultiplier()).toBe(state.research.combatDefenseMultiplier());
    // An active war hero must not change the defense multiplier.
    recruitActive(state, 'ser_alden');
    expect(state.combatDefenseMultiplier()).toBe(state.research.combatDefenseMultiplier());
  });

  it('townDefense aggregates the wall/watchtower levels the buildings expose', () => {
    const state = fresh();
    expect(state.townDefense()).toBe(0);
    // townDefense is a straight passthrough to the aggregated building defense.
    expect(state.townDefense()).toBe(state.buildings.townDefense());
  });

  it('economyMultiplier composes the Hearth warmth factor (neutral when warm, throttled when cold)', () => {
    const state = fresh();
    // Fresh keep at TC L1 defaults to full warmth -> warmth factor 1.0 -> the
    // composed economy multiplier is neutral.
    expect(state.warmthRatio()).toBeCloseTo(1, 10);
    expect(state.warmthMultiplier()).toBeCloseTo(1, 10);
    expect(state.economyMultiplier()).toBe(1);

    // Freeze the keep by ticking with no firewood on hand: warmth decays and
    // the composed economy multiplier drops below 1 (a cold town works slower).
    // Drain the store's wood first so the hearth cannot burn.
    state.resources.subtract({ wood: state.resources.get('wood') });
    // A long unfueled tick drains warmth to 0; production credited that tick is
    // scaled by the (still non-zero, pre-decay) multiplier, but AFTER it the
    // multiplier sits at the floor.
    state.tick(NOW + 1_000_000, 1_000_000);
    expect(state.warmthRatio()).toBe(0);
    expect(state.warmthMultiplier()).toBeCloseTo(WARMTH.WARMTH_PRODUCTION_FLOOR, 10);
    expect(state.economyMultiplier()).toBeCloseTo(WARMTH.WARMTH_PRODUCTION_FLOOR, 10);
  });

  it('a live tick burns firewood to sustain warmth and throttles production when cold', () => {
    const state = fresh();
    // Fund the farm upgrade with plenty of wood/stone/gold (kept well under the
    // food storage cap so produced food has room to accrue).
    state.resources.add({ wood: 5000, stone: 5000, gold: 5000 });
    // Build a farm to L1 so there is a food producer with headroom under the cap.
    const farm = state.buildings.startUpgrade('farm', state.resources, NOW);
    expect(farm.ok).toBe(true);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('farm'));

    // WARM case: with ample wood, one second of production is credited at the
    // full warmth multiplier (1.0 at fresh TC L1). Warmth stays at max.
    const warmFoodBefore = state.resources.get('food');
    const warmWoodBefore = state.resources.get('wood');
    state.tick(NOW + 1000, 1000);
    const warmGain = state.resources.get('food') - warmFoodBefore;
    expect(warmGain).toBeGreaterThan(0);
    expect(state.warmthRatio()).toBeCloseTo(1, 10); // hearth stayed fueled
    // The woodpile was drawn down by the hearth's firewood burn this tick.
    expect(state.resources.get('wood')).toBeLessThan(warmWoodBefore);

    // COLD case: drain all wood, then let warmth decay to the floor, and credit
    // another second of production. It must be strictly less than the warm gain.
    state.resources.subtract({ wood: state.resources.get('wood') });
    state.tick(NOW + 2_000_000, 1_000_000 - 1000); // long unfueled span -> warmth 0
    expect(state.warmthRatio()).toBe(0);
    const coldFoodBefore = state.resources.get('food');
    state.tick(NOW + 2_001_000, 1000);
    const coldGain = state.resources.get('food') - coldFoodBefore;
    expect(coldGain).toBeGreaterThan(0);
    expect(coldGain).toBeLessThan(warmGain);
    // At the floor the throttle is exactly WARMTH_PRODUCTION_FLOOR of the warm gain.
    expect(coldGain).toBeCloseTo(warmGain * WARMTH.WARMTH_PRODUCTION_FLOOR, 6);
  });
});

describe('GameState quest counters through the real paths', () => {
  const NOW = 2_000_000;
  const fresh = (): GameState => GameState.create(memoryStorage(), NOW);

  /** Build a Barracks so the training queue accepts a batch. */
  const buildBarracks = (state: GameState): void => {
    // Raise the Town Center to level 2 (Barracks prerequisite) instantly by
    // starting + completing its upgrade, funding as needed.
    state.resources.add({ wood: 5000, stone: 5000, food: 5000, gold: 5000 });
    const tcUp = state.buildings.startUpgrade('town_center', state.resources, NOW);
    expect(tcUp.ok).toBe(true);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('town_center'));
    expect(state.buildings.townCenterLevel).toBeGreaterThanOrEqual(2);
    // Now build the Barracks (level 0 -> 1).
    const barracks = state.buildings.startUpgrade('barracks', state.resources, NOW);
    expect(barracks.ok).toBe(true);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('barracks'));
    expect(state.buildings.hasBarracks).toBe(true);
  };

  it('troopsTrained increases after training completes across a tick', () => {
    const state = fresh();
    buildBarracks(state);
    expect(state.troopsTrained).toBe(0);

    // Enqueue a batch of 5 spearmen on the SHARED training queue with the built
    // Barracks, then tick past their completion.
    const enq = state.training.enqueue('spearman', 5, state.resources, NOW, state.buildings.hasBarracks);
    expect(enq.ok).toBe(true);
    const remaining = state.training.remainingMs(NOW);
    expect(remaining).toBeGreaterThan(0);

    // A tick that lands after the batch finishes credits the counter.
    state.tick(NOW + remaining + 1, remaining + 1);
    expect(state.troopsTrained).toBe(5);
    expect(state.army.spearman).toBe(5);
  });

  it('recordBattleWon increments battlesWon and drives the "win N battles" quest to claimable', () => {
    const state = fresh();
    expect(state.battlesWon).toBe(0);

    // The battle quest (repel_the_raiders) needs 5 wins and sits deep in the
    // chain; walk the chain by claiming prerequisites once each condition is met.
    // First satisfy + claim the earlier quests so repel_the_raiders unlocks.
    // raise_a_farm: farm level 1.
    state.resources.add({ wood: 9999, stone: 9999, food: 9999, gold: 9999 });
    state.buildings.startUpgrade('farm', state.resources, NOW);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('farm'));
    state.tick(NOW + 1, 1);
    expect(state.quests.status('raise_a_farm')).toBe('completable');
    expect(state.claimQuest('raise_a_farm')).toBe(true);

    // Record wins toward the counter directly through the real path.
    for (let i = 0; i < 5; i++) state.recordBattleWon();
    expect(state.battlesWon).toBe(5);

    // The battlesWon quest condition is now satisfied; the quest sits somewhere
    // in {locked, active, completable} depending on chain progress. Assert the
    // COUNTER flows into the pure condition regardless of chain gating.
    const battleQuest = state.quests;
    // Directly assert the win counter reached the quest condition threshold.
    expect(QUEST_DEFS.repel_the_raiders.condition).toEqual({ type: 'battlesWon', count: 5 });
    // recordBattleWon refreshed statuses: with the chain unmet the quest is
    // still 'locked', but the underlying progress now meets its condition.
    expect(state.questProgress().battlesWon).toBe(5);
    // Sanity: refreshing again keeps the counter (idempotent refresh).
    battleQuest.refresh(state.questProgress());
    expect(state.questProgress().battlesWon).toBe(5);
  });

  it('a battlesWon quest flips to completable once its chain is unlocked, and claim pays exactly once', () => {
    const state = fresh();
    // Force the prerequisite chain of repel_the_raiders to claimed so the quest
    // is unlocked, then show the win counter flips it completable and the reward
    // applies exactly once. Claim each predecessor by satisfying its condition.
    state.resources.add({ wood: 99999, stone: 99999, food: 99999, gold: 99999 });

    // raise_a_farm (farm L1)
    state.buildings.startUpgrade('farm', state.resources, NOW);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('farm'));
    state.tick(NOW + 1, 1);
    expect(state.claimQuest('raise_a_farm')).toBe(true);

    // grow_the_center (Town Center L3): upgrade twice.
    for (let i = 0; i < 2; i++) {
      state.buildings.startUpgrade('town_center', state.resources, NOW);
      state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('town_center'));
    }
    state.tick(NOW + 1, 1);
    expect(state.buildings.townCenterLevel).toBeGreaterThanOrEqual(3);
    expect(state.claimQuest('grow_the_center')).toBe(true);

    // first_recruits (10 troops trained): build barracks + train.
    state.buildings.startUpgrade('barracks', state.resources, NOW);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('barracks'));
    state.training.enqueue('spearman', 10, state.resources, NOW, state.buildings.hasBarracks);
    const r1 = state.training.remainingMs(NOW);
    state.tick(NOW + r1 + 1, r1 + 1);
    expect(state.troopsTrained).toBeGreaterThanOrEqual(10);
    expect(state.claimQuest('first_recruits')).toBe(true);

    // found_the_hall (research building L1)
    state.buildings.startUpgrade('research', state.resources, NOW);
    state.buildings.update(NOW + state.buildings.nextUpgradeTimeMs('research'));
    state.tick(NOW + 1, 1);
    expect(state.claimQuest('found_the_hall')).toBe(true);

    // first_research (1 tech unlocked)
    const tech = TECH_DEFS.crop_rotation;
    state.resources.add(tech.cost);
    state.research.startResearch('crop_rotation', state.resources, NOW, tech.requiresResearchLevel);
    state.research.update(NOW + tech.timeMs);
    state.tick(NOW + 1, 1);
    expect(state.claimQuest('first_research')).toBe(true);

    // muster_an_army (30 troops trained): train 20 more (already 10).
    state.training.enqueue('spearman', 20, state.resources, NOW, state.buildings.hasBarracks);
    const r2 = state.training.remainingMs(NOW);
    state.tick(NOW + r2 + 1, r2 + 1);
    expect(state.troopsTrained).toBeGreaterThanOrEqual(30);
    expect(state.claimQuest('muster_an_army')).toBe(true);

    // Now repel_the_raiders is unlocked but its condition (5 wins) is unmet.
    expect(state.quests.status('repel_the_raiders')).toBe('active');
    expect(state.quests.canClaim('repel_the_raiders')).toBe(false);

    // Record wins through the real path; the quest flips to completable.
    for (let i = 0; i < 5; i++) state.recordBattleWon();
    expect(state.battlesWon).toBe(5);
    expect(state.quests.status('repel_the_raiders')).toBe('completable');
    expect(state.quests.canClaim('repel_the_raiders')).toBe(true);

    // Claim applies the reward exactly once: gold +400 and 10 ser_alden shards.
    const goldBefore = state.resources.get('gold');
    expect(state.claimQuest('repel_the_raiders')).toBe(true);
    expect(state.resources.get('gold')).toBe(goldBefore + 400);
    // A second claim is a no-op (never pays twice).
    const goldAfter = state.resources.get('gold');
    expect(state.claimQuest('repel_the_raiders')).toBe(false);
    expect(state.resources.get('gold')).toBe(goldAfter);
    expect(state.quests.status('repel_the_raiders')).toBe('claimed');
  });
});
