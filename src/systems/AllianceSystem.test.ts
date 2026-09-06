import { describe, it, expect } from 'vitest';
import { AllianceSystem } from './AllianceSystem';
import { BuildingSystem } from './BuildingSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { ALLIANCE } from '../config/GameConfig';
import { allianceTechModifiers, pointsForTechLevel } from '../config/AllianceConfig';

/**
 * Unit tests for the simulated NPC alliance: help charges reducing active
 * timers (against real BuildingSystem + ResearchSystem timers), the tech
 * contribution track -> level -> shared bonus, and serialize round-trip.
 */
describe('AllianceSystem', () => {
  it('exposes the fixed simulated member count', () => {
    expect(new AllianceSystem().memberCount).toBe(ALLIANCE.MEMBER_COUNT);
  });

  it('help measurably reduces an active BUILDING timer and consumes a charge', () => {
    const a = new AllianceSystem();
    a.grantHelps(3);
    const store = new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });
    const buildings = new BuildingSystem([{ kind: 'furnace', level: 5, upgradeEndsAt: null }]);
    buildings.startUpgrade('hunters_hut', store, 0);
    const before = buildings.upgradeEndsAt('hunters_hut')!;

    const shaved = a.help((ms, now) => buildings.reduceUpgradeTimer('hunters_hut', ms, now), 0);
    expect(shaved).toBeGreaterThan(0);
    expect(buildings.upgradeEndsAt('hunters_hut')!).toBe(before - shaved);
    expect(a.helpsAvailable).toBe(2); // one charge spent
  });

  it('help reduces an active RESEARCH timer', () => {
    const a = new AllianceSystem();
    a.grantHelps(1);
    const store = new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });
    const research = new ResearchSystem();
    research.start('eco_foraging', store, 10, 0);
    const before = research.active!.endsAt;
    const shaved = a.help((ms, now) => research.reduceTimer(ms, now), 0);
    expect(shaved).toBe(Math.min(ALLIANCE.HELP_REDUCTION_MS, before));
    expect(research.active!.endsAt).toBe(before - shaved);
    expect(a.helpsAvailable).toBe(0);
  });

  it('does not consume a charge when there is no active timer', () => {
    const a = new AllianceSystem();
    a.grantHelps(2);
    const shaved = a.help(() => 0, 0); // reducer reports nothing shaved
    expect(shaved).toBe(0);
    expect(a.helpsAvailable).toBe(2); // charge preserved
  });

  it('caps banked help charges at the maximum', () => {
    const a = new AllianceSystem();
    a.grantHelps(ALLIANCE.MAX_HELPS + 100);
    expect(a.helpsAvailable).toBe(ALLIANCE.MAX_HELPS);
  });

  it('tech contributions raise the level and grant a shared bonus', () => {
    const a = new AllianceSystem();
    expect(a.techLevel).toBe(0);
    // Below the level-1 threshold: no bonus yet.
    a.contribute(pointsForTechLevel(1) - 1);
    expect(a.techLevel).toBe(0);
    expect(a.modifiers().economyOutput).toBe(0);
    // Cross the threshold: level 1, non-zero shared bonus.
    a.contribute(1);
    expect(a.techLevel).toBe(1);
    expect(a.modifiers()).toEqual(allianceTechModifiers(1));
    expect(a.modifiers().economyOutput).toBeGreaterThan(0);
    expect(a.modifiers().troopAttack).toBeGreaterThan(0);
  });

  it('serializes and restores tech points + help charges', () => {
    const a = new AllianceSystem();
    a.contribute(pointsForTechLevel(2));
    a.grantHelps(5);
    const restored = AllianceSystem.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(restored.techPoints).toBe(a.techPoints);
    expect(restored.helpsAvailable).toBe(5);
    expect(restored.techLevel).toBe(a.techLevel);
  });

  it('a missing/malformed save yields a fresh alliance', () => {
    expect(AllianceSystem.fromJSON(undefined).techPoints).toBe(0);
    expect(AllianceSystem.fromJSON(null).helpsAvailable).toBe(0);
  });
});
