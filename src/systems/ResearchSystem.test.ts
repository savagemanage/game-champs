import { describe, it, expect } from 'vitest';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { RESEARCH_DEFS, researchDef } from '../config/ResearchConfig';

/**
 * Unit tests for the research tech tree: prerequisite + lab-level + cost gate
 * enforcement, the one-at-a-time timer, bonus aggregation into the shared
 * modifier bundle, troop-tier unlocks, and serialize round-trip.
 */
describe('ResearchSystem', () => {
  /** A store rich enough to afford any single node cost. */
  const richStore = () =>
    new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });

  it('enforces the prerequisite gate', () => {
    const r = new ResearchSystem();
    // eco_logistics requires eco_foraging.
    const check = r.canResearch('eco_logistics', richStore(), 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('prereq');
    // With the prereq complete it becomes startable (given lab level + cost).
    const r2 = new ResearchSystem({ completed: ['eco_foraging'], active: null });
    expect(r2.canResearch('eco_logistics', richStore(), 10).ok).toBe(true);
  });

  it('enforces the Ember Archive (lab) level gate', () => {
    const r = new ResearchSystem();
    // eco_foraging needs lab level 1; at level 0 it is gated.
    const check = r.canResearch('eco_foraging', richStore(), 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('lab_level');
    expect(r.canResearch('eco_foraging', richStore(), 1).ok).toBe(true);
  });

  it('enforces affordability against the resource store', () => {
    const r = new ResearchSystem();
    const broke = new ResourceStore({ food: 0, wood: 0, coal: 0, iron: 0, steel: 0 });
    const check = r.canResearch('eco_foraging', broke, 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
  });

  it('runs ONE research at a time on a timer and charges the cost up front', () => {
    const r = new ResearchSystem();
    const store = richStore();
    const beforeWood = store.get('wood');
    const cost = RESEARCH_DEFS['eco_foraging'].cost.wood ?? 0;

    const started = r.start('eco_foraging', store, 10, 1000);
    expect(started.ok).toBe(true);
    expect(store.get('wood')).toBe(beforeWood - cost);
    expect(r.isBusy).toBe(true);

    // The lab is now busy: a second node cannot start.
    const busy = r.start('bat_drill', store, 10, 1000);
    expect(busy.ok).toBe(false);
    expect(busy.reason).toBe('busy');

    // Not yet complete before the timer elapses.
    const end = 1000 + RESEARCH_DEFS['eco_foraging'].durationMs;
    expect(r.advance(end - 1)).toBeNull();
    expect(r.isCompleted('eco_foraging')).toBe(false);

    // Completes exactly at/after the end instant, once.
    expect(r.advance(end)).toBe('eco_foraging');
    expect(r.isCompleted('eco_foraging')).toBe(true);
    expect(r.isBusy).toBe(false);
    // A second advance resolves nothing new.
    expect(r.advance(end + 10_000)).toBeNull();
  });

  it('aggregates completed bonuses into the shared modifier bundle', () => {
    const empty = new ResearchSystem().modifiers();
    expect(empty.foodOutput).toBe(0);

    const r = new ResearchSystem({
      completed: ['eco_foraging', 'sur_insulation'],
      active: null,
    });
    const mods = r.modifiers();
    // eco_foraging grants foodOutput, sur_insulation grants coalOutput.
    expect(mods.foodOutput).toBeCloseTo(researchDef('eco_foraging')!.bonus!.foodOutput!);
    expect(mods.coalOutput).toBeCloseTo(researchDef('sur_insulation')!.bonus!.coalOutput!);
  });

  it('raises the max troop tier via development nodes', () => {
    expect(new ResearchSystem().maxTroopTier()).toBe(1);
    const r = new ResearchSystem({
      completed: ['dev_ironworking', 'dev_steel_tactics'],
      active: null,
    });
    // dev_steel_tactics unlocks tier 3 (the highest completed unlock).
    expect(r.maxTroopTier()).toBe(3);
  });

  it('round-trips completed + active state via toJSON/fromJSON', () => {
    const r = new ResearchSystem();
    const store = richStore();
    r.start('eco_foraging', store, 10, 500);
    r.advance(500 + RESEARCH_DEFS['eco_foraging'].durationMs);
    r.start('eco_logistics', store, 10, 999);

    const restored = ResearchSystem.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
    expect(restored.isCompleted('eco_foraging')).toBe(true);
    expect(restored.active?.nodeId).toBe('eco_logistics');
    expect(restored.isBusy).toBe(true);
  });

  it('fromJSON tolerates a missing / malformed state (fresh tree)', () => {
    expect(ResearchSystem.fromJSON(undefined).completedIds()).toEqual([]);
    expect(ResearchSystem.fromJSON(null).isBusy).toBe(false);
    // Unknown ids are dropped.
    const r = ResearchSystem.fromJSON({ completed: ['not_a_node'], active: null });
    expect(r.completedIds()).toEqual([]);
  });
});
