import { describe, it, expect } from 'vitest';
import { PopulationSystem } from './PopulationSystem';
import { POPULATION, populationOutputMultiplier } from '../config/GameConfig';

/**
 * Unit tests for the survivor workforce: growth toward the housing cap,
 * assignment/idle accounting with caps, the satisfaction + staffing output
 * multiplier curve, and serialize round-trip. Each test fails if the
 * corresponding rule were reverted.
 */
describe('PopulationSystem', () => {
  it('a fresh workforce starts at START_SURVIVORS with nobody assigned', () => {
    const pop = new PopulationSystem();
    expect(pop.total).toBe(POPULATION.START_SURVIVORS);
    expect(pop.assigned).toBe(0);
    expect(pop.idle).toBe(POPULATION.START_SURVIVORS);
  });

  it('grows survivors over time toward the housing cap and stops at it', () => {
    const pop = new PopulationSystem({ total: 0, assignments: {} });
    const extraHousing = 0; // cap = BASE_HOUSING
    const cap = pop.housingCap(extraHousing);
    // Enough time to comfortably fill the base housing at GROWTH_PER_SEC.
    const secondsToFill = (cap / POPULATION.GROWTH_PER_SEC) * 1.5;
    pop.tick(secondsToFill * 1000, extraHousing);
    expect(pop.total).toBe(cap);
    // Further ticks add nobody (already capped).
    expect(pop.tick(secondsToFill * 1000, extraHousing)).toBe(0);
    expect(pop.total).toBe(cap);
  });

  it('accrues fractional growth across ticks rather than losing it', () => {
    const pop = new PopulationSystem({ total: 0, assignments: {} });
    // One second at GROWTH_PER_SEC (< 1) adds no whole survivor yet...
    expect(pop.tick(1000, 100)).toBe(0);
    expect(pop.total).toBe(0);
    // ...but the carry accrues, so enough small ticks eventually yield one.
    const ticksForOne = Math.ceil(1 / POPULATION.GROWTH_PER_SEC);
    let arrived = 0;
    for (let i = 0; i < ticksForOne; i++) arrived += pop.tick(1000, 100);
    expect(arrived).toBeGreaterThanOrEqual(1);
  });

  it('more Shelter Row housing raises the cap', () => {
    const pop = new PopulationSystem({ total: 0, assignments: {} });
    expect(pop.housingCap(0)).toBe(POPULATION.BASE_HOUSING);
    expect(pop.housingCap(30)).toBe(POPULATION.BASE_HOUSING + 30);
  });

  it('assignment is capped at available survivors and tracks idle', () => {
    const pop = new PopulationSystem({ total: 10, assignments: {} });
    // Cannot assign more than the total.
    expect(pop.assign('hunters_hut', 100)).toBe(10);
    expect(pop.assigned).toBe(10);
    expect(pop.idle).toBe(0);
    // Reassigning a smaller number frees the rest back to idle.
    expect(pop.assign('hunters_hut', 4)).toBe(4);
    expect(pop.idle).toBe(6);
    // A second building draws from the idle pool.
    expect(pop.assign('sawmill', 5)).toBe(5);
    expect(pop.idle).toBe(1);
    // Asking for more than idle+current on a building clamps to what's free.
    expect(pop.assign('sawmill', 100)).toBe(6); // 5 already here + 1 idle
    expect(pop.idle).toBe(0);
  });

  it('recruit adds survivors up to the cap and returns the amount added', () => {
    const pop = new PopulationSystem({ total: 0, assignments: {} });
    expect(pop.recruit(3, 100)).toBe(3);
    expect(pop.total).toBe(3);
    // Cannot exceed the cap.
    const cap = pop.housingCap(0);
    const pop2 = new PopulationSystem({ total: cap - 2, assignments: {} });
    expect(pop2.recruit(10, 0)).toBe(2);
    expect(pop2.total).toBe(cap);
  });

  it('satisfaction blends warmth and housing headroom', () => {
    const pop = new PopulationSystem({ total: 0, assignments: {} });
    // Empty hold, ample housing, full warmth -> maximum satisfaction (1).
    expect(pop.satisfaction(1, 1000)).toBeCloseTo(1, 6);
    // Freezing but roomy: only the housing weight contributes.
    expect(pop.satisfaction(0, 1000)).toBeCloseTo(POPULATION.SATISFACTION_HOUSING_WEIGHT, 6);
    // Warm but overcrowded (total at cap -> headroom 0): only warmth weight.
    const crowded = new PopulationSystem({ total: POPULATION.BASE_HOUSING, assignments: {} });
    expect(crowded.satisfaction(1, 0)).toBeCloseTo(POPULATION.SATISFACTION_WARMTH_WEIGHT, 6);
  });

  it('output multiplier follows the shared curve and rewards staffing + satisfaction', () => {
    const pop = new PopulationSystem({ total: 20, assignments: { hunters_hut: 10 } });
    const warmthRatio = 1;
    const extraHousing = 1000; // roomy -> high satisfaction
    const desiredStaff = 10; // fully staffed
    const mult = pop.outputMultiplier(warmthRatio, extraHousing, desiredStaff);
    const sat = pop.satisfaction(warmthRatio, extraHousing);
    expect(mult).toBeCloseTo(populationOutputMultiplier(sat, 1), 6);

    // Understaffing lowers the multiplier (staffing ratio < 1).
    const understaffed = pop.outputMultiplier(warmthRatio, extraHousing, 40);
    expect(understaffed).toBeLessThan(mult);

    // With no producers desired, staffing is treated as full.
    expect(pop.staffingRatio(0)).toBe(1);
  });

  it('the multiplier is bounded by the config floors and 1.0', () => {
    // Worst case: zero satisfaction and zero staffing -> product of both floors.
    const worst = populationOutputMultiplier(0, 0);
    expect(worst).toBeCloseTo(
      POPULATION.SATISFACTION_OUTPUT_FLOOR * POPULATION.STAFFING_FLOOR,
      6,
    );
    // Best case: full satisfaction and staffing -> 1.0.
    expect(populationOutputMultiplier(1, 1)).toBeCloseTo(1, 6);
    // Values are clamped defensively.
    expect(populationOutputMultiplier(2, 2)).toBeCloseTo(1, 6);
    expect(populationOutputMultiplier(-1, -1)).toBeCloseTo(worst, 6);
  });

  it('round-trips through toJSON / fromJSON, clamping over-committed assignments', () => {
    const pop = new PopulationSystem({ total: 8, assignments: { hunters_hut: 3, sawmill: 2 } });
    const restored = PopulationSystem.fromJSON(pop.toJSON());
    expect(restored.total).toBe(8);
    expect(restored.assignedTo('hunters_hut')).toBe(3);
    expect(restored.assignedTo('sawmill')).toBe(2);
    expect(restored.idle).toBe(3);

    // A corrupt save that over-assigns is trimmed to the total on load.
    const over = PopulationSystem.fromJSON({ total: 4, assignments: { hunters_hut: 10, sawmill: 10 } });
    expect(over.assigned).toBeLessThanOrEqual(4);

    // A missing/malformed save yields a fresh workforce.
    expect(PopulationSystem.fromJSON(undefined).total).toBe(POPULATION.START_SURVIVORS);
    expect(PopulationSystem.fromJSON(null).total).toBe(POPULATION.START_SURVIVORS);
  });

  it('recallAll clears every assignment', () => {
    const pop = new PopulationSystem({ total: 6, assignments: { hunters_hut: 3, sawmill: 3 } });
    expect(pop.assigned).toBe(6);
    pop.recallAll();
    expect(pop.assigned).toBe(0);
    expect(pop.idle).toBe(6);
  });
});
