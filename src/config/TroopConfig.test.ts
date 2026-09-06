import { describe, it, expect } from 'vitest';
import {
  TROOP_CLASS,
  TROOP_ORDER,
  maxTrainableTier,
  troopClass,
  troopTierCost,
  troopTierPower,
  troopTierStats,
  troopTierTrainTimeMs,
} from './TroopConfig';
import { TROOP_TIERS } from './GameConfig';
import type { TroopKind } from '../types';

/**
 * Unit tests for the FEAT-004 troop tiers + class alignment: the Infantry >
 * Lancer > Marksman class mapping, tier stat/cost/time monotonicity, and the
 * research-gated max trainable tier.
 */
describe('TroopConfig tiers + classes', () => {
  it('maps each troop kind to a WOS triangle class', () => {
    // vanguard = infantry (tank), trapper = lancer (charge), marksman = marksman.
    expect(troopClass('vanguard')).toBe('infantry');
    expect(troopClass('trapper')).toBe('lancer');
    expect(troopClass('marksman')).toBe('marksman');
    // Every troop kind has exactly one class.
    for (const kind of TROOP_ORDER) {
      expect(TROOP_CLASS[kind]).toBeTruthy();
    }
  });

  it('tier 1 stats equal the baseline TroopDef stats', () => {
    for (const kind of TROOP_ORDER) {
      const t1 = troopTierStats(kind, 1);
      // Attack/hp/attackSpeed at T1 are the baseline (growth^0 = 1).
      expect(t1.attack).toBeCloseTo(troopTierStats(kind, 1).attack);
      expect(t1.speed).toBeGreaterThan(0);
    }
  });

  it('tier stats/power/cost/time rise monotonically with tier', () => {
    const kind: TroopKind = 'vanguard';
    for (let t = 1; t < TROOP_TIERS.MAX_TIER; t++) {
      expect(troopTierPower(kind, t + 1)).toBeGreaterThan(troopTierPower(kind, t));
      expect(troopTierStats(kind, t + 1).attack).toBeGreaterThan(troopTierStats(kind, t).attack);
      expect(troopTierStats(kind, t + 1).hp).toBeGreaterThan(troopTierStats(kind, t).hp);
      const costT = troopTierCost(kind, t);
      const costNext = troopTierCost(kind, t + 1);
      // At least one shared cost component grows.
      expect((costNext.food ?? 0) + (costNext.iron ?? 0)).toBeGreaterThan(
        (costT.food ?? 0) + (costT.iron ?? 0),
      );
      expect(troopTierTrainTimeMs(kind, t + 1)).toBeGreaterThan(troopTierTrainTimeMs(kind, t));
    }
  });

  it('clamps tiers into the valid [1, MAX_TIER] range', () => {
    const kind: TroopKind = 'marksman';
    // Below 1 is treated as tier 1.
    expect(troopTierStats(kind, 0).attack).toBeCloseTo(troopTierStats(kind, 1).attack);
    // Above MAX_TIER is clamped to MAX_TIER.
    expect(troopTierStats(kind, 99).attack).toBeCloseTo(
      troopTierStats(kind, TROOP_TIERS.MAX_TIER).attack,
    );
  });

  it('maxTrainableTier is research-gated and clamped', () => {
    // No research: only tier 1.
    expect(maxTrainableTier(1)).toBe(1);
    expect(maxTrainableTier(0)).toBe(1);
    // A research ceiling raises it...
    expect(maxTrainableTier(3)).toBe(3);
    // ...but never beyond the global MAX_TIER.
    expect(maxTrainableTier(99)).toBe(TROOP_TIERS.MAX_TIER);
  });
});
