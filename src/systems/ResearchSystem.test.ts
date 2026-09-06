import { describe, it, expect } from 'vitest';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
import { CombatSystem } from './CombatSystem';
import { techDef } from '../config/ResearchConfig';
import { troopDef } from '../config/TroopConfig';
import type { Army } from '../types';

/**
 * Unit tests for the pure ResearchSystem: canResearch reason codes, the
 * start/complete lifecycle, composed aggregate multipliers, and JSON
 * round-tripping. Plus INTEGRATION tests proving wired bonuses (attack,
 * training speed, production) change concrete outcomes in the real systems.
 */
describe('ResearchSystem', () => {
  const richStore = () => new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });
  const pooreStore = () => new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });

  describe('canResearch reason codes', () => {
    it('allows a tier-1 tech with a Hall and resources', () => {
      const r = new ResearchSystem();
      expect(r.canResearch('crop_rotation', richStore(), 1)).toEqual({ ok: true });
    });

    it('reports "building" when the Scholars\' Hall level is too low', () => {
      const r = new ResearchSystem();
      // tier-1 needs level 1; a level-0 (unbuilt) Hall fails.
      expect(r.canResearch('crop_rotation', richStore(), 0)).toEqual({ ok: false, reason: 'building' });
      // A tier-2 tech needs level 2 even with its prereq unlocked.
      const r2 = new ResearchSystem(['crop_rotation']);
      expect(r2.canResearch('guild_charters', richStore(), 1)).toEqual({ ok: false, reason: 'building' });
    });

    it('reports "prereq" when the predecessor tech is not unlocked', () => {
      const r = new ResearchSystem();
      expect(r.canResearch('guild_charters', richStore(), 2)).toEqual({ ok: false, reason: 'prereq' });
    });

    it('reports "cost" when resources are insufficient', () => {
      const r = new ResearchSystem();
      expect(r.canResearch('crop_rotation', pooreStore(), 1)).toEqual({ ok: false, reason: 'cost' });
    });

    it('reports "already" when the tech is unlocked', () => {
      const r = new ResearchSystem(['crop_rotation']);
      expect(r.canResearch('crop_rotation', richStore(), 3)).toEqual({ ok: false, reason: 'already' });
    });

    it('reports "busy" while another research is in progress', () => {
      const r = new ResearchSystem();
      r.startResearch('crop_rotation', richStore(), 0, 1);
      expect(r.canResearch('drill_grounds', richStore(), 1)).toEqual({ ok: false, reason: 'busy' });
    });
  });

  describe('start / complete lifecycle', () => {
    it('startResearch spends the cost and schedules completion', () => {
      const r = new ResearchSystem();
      const store = richStore();
      const cost = techDef('crop_rotation').cost;
      const foodBefore = store.get('food');

      const check = r.startResearch('crop_rotation', store, 1000, 1);
      expect(check.ok).toBe(true);
      expect(r.isBusy).toBe(true);
      expect(r.activeTech).toBe('crop_rotation');
      // Cost charged.
      expect(store.get('food')).toBe(foodBefore - (cost.food ?? 0));
      // Not yet unlocked.
      expect(r.isUnlocked('crop_rotation')).toBe(false);
    });

    it('does not spend when the start is denied', () => {
      const r = new ResearchSystem();
      const store = pooreStore();
      const check = r.startResearch('crop_rotation', store, 0, 1);
      expect(check.ok).toBe(false);
      expect(r.isBusy).toBe(false);
      expect(store.get('food')).toBe(0);
    });

    it('update completes research at/after endsAt and unlocks it', () => {
      const r = new ResearchSystem();
      const time = techDef('crop_rotation').timeMs;
      r.startResearch('crop_rotation', richStore(), 0, 1);

      // Before completion: still busy, not unlocked.
      expect(r.update(time - 1)).toEqual([]);
      expect(r.isUnlocked('crop_rotation')).toBe(false);
      expect(r.isBusy).toBe(true);

      // At completion: unlocked, slot freed.
      expect(r.update(time)).toEqual(['crop_rotation']);
      expect(r.isUnlocked('crop_rotation')).toBe(true);
      expect(r.isBusy).toBe(false);
      // A second update does nothing.
      expect(r.update(time + 5000)).toEqual([]);
    });

    it('reports progress and remaining time of the active research', () => {
      const r = new ResearchSystem();
      const time = techDef('crop_rotation').timeMs;
      r.startResearch('crop_rotation', richStore(), 0, 1);
      expect(r.progress(0)).toBe(0);
      expect(r.progress(time / 2)).toBeCloseTo(0.5, 5);
      expect(r.progress(time)).toBe(1);
      expect(r.remainingMs(time / 2)).toBeCloseTo(time / 2, 5);
    });
  });

  describe('composed multipliers', () => {
    it('are neutral (1) on a fresh system', () => {
      const r = new ResearchSystem();
      expect(r.productionMultiplier()).toBe(1);
      expect(r.trainSpeedMultiplier()).toBe(1);
      expect(r.buildSpeedMultiplier()).toBe(1);
      expect(r.storageMultiplier()).toBe(1);
      expect(r.offlineEfficiencyMultiplier()).toBe(1);
      expect(r.combatAttackMultiplier()).toBe(1);
      expect(r.combatDefenseMultiplier()).toBe(1);
    });

    it('composes multiplicatively across unlocked techs of the same kind', () => {
      // Two production techs: 1.1 * 1.15 = 1.265.
      const r = new ResearchSystem(['crop_rotation', 'guild_charters']);
      expect(r.productionMultiplier()).toBeCloseTo(1.1 * 1.15, 6);
      // Two attack techs: 1.1 * 1.15.
      const r2 = new ResearchSystem(['sharpened_blades', 'forged_weapons']);
      expect(r2.combatAttackMultiplier()).toBeCloseTo(1.1 * 1.15, 6);
      // A train-speed tech is a <1 scale.
      const r3 = new ResearchSystem(['drill_grounds']);
      expect(r3.trainSpeedMultiplier()).toBeCloseTo(0.9, 6);
    });
  });

  describe('JSON round-trip', () => {
    it('round-trips unlocked + active through toJSON / fromJSON', () => {
      const r = new ResearchSystem(['crop_rotation'], { techId: 'sharpened_blades', endsAt: 12345 });
      const restored = ResearchSystem.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
      expect(restored.unlocked).toEqual(['crop_rotation']);
      expect(restored.activeTech).toBe('sharpened_blades');
      expect(restored.active?.endsAt).toBe(12345);
    });

    it('fromJSON tolerates missing / malformed data (old saves) as a fresh state', () => {
      expect(ResearchSystem.fromJSON(undefined).unlocked).toEqual([]);
      expect(ResearchSystem.fromJSON(null).unlocked).toEqual([]);
      expect(ResearchSystem.fromJSON({}).unlocked).toEqual([]);
      // Unknown tech ids are filtered out.
      const r = ResearchSystem.fromJSON({ unlocked: ['crop_rotation', 'not_a_tech'], active: null });
      expect(r.unlocked).toEqual(['crop_rotation']);
    });
  });
});

/**
 * Integration tests: prove the research multipliers are wired into the real
 * systems and change concrete outcomes (attack, training speed, production).
 */
describe('ResearchSystem integration (wired bonuses change outcomes)', () => {
  const army = (a: Partial<Army>): Army => ({
    spearman: 0,
    archer: 0,
    knight: 0,
    cavalry: 0,
    siege: 0,
    ...a,
  });

  it('a combatAttack tech lets CombatSystem.resolve win a wave it would otherwise lose', () => {
    const wave = 3;
    // Find the largest cavalry count that still LOSES wave 3 with no bonus
    // (cavalry are off-counter here, so effective power falls short).
    let n = 1;
    while (CombatSystem.resolve(army({ cavalry: n }), wave).win === false) {
      // grow until it would win unaided, then step back one so it loses unaided
      n++;
      if (n > 2000) break;
    }
    const losing = n - 1; // this count loses without a bonus
    expect(CombatSystem.resolve(army({ cavalry: losing }), wave).win).toBe(false);

    // With enough attack research the SAME army wins. Compose attack techs to
    // clear the shortfall (each ~1.1-1.2x; three chained is >1.5x).
    const research = new ResearchSystem(['sharpened_blades', 'forged_weapons', 'masterwork_arms']);
    const boosted = CombatSystem.resolve(army({ cavalry: losing }), wave, {
      attackMult: research.combatAttackMultiplier(),
    });
    expect(boosted.win).toBe(true);
  });

  it('a combatDefense tech reduces casualties on a close win', () => {
    // Size a spearman stack to a NEAR-TIE win: spearmen are not the dominant
    // counter to wave 3, so the fight is close, the casualty fraction is large,
    // and defense meaningfully reduces the (integer) losses. Just above the
    // smallest winning count so it is a genuine squeaker.
    const wave = 3;
    let count = 1;
    while (CombatSystem.effectiveArmyPower(army({ spearman: count }), wave) < CombatSystem.wavePower(wave)) {
      count++;
    }
    count += 1; // a squeaker win with substantial casualties
    const a = army({ spearman: count });

    const base = CombatSystem.resolve(a, wave);
    const research = new ResearchSystem(['hardened_armor', 'tempered_plate']);
    const defended = CombatSystem.resolve(a, wave, { defenseMult: research.combatDefenseMultiplier() });
    expect(base.win).toBe(true);
    expect(defended.win).toBe(true);
    const baseLosses = base.casualties.spearman;
    const defendedLosses = defended.casualties.spearman;
    // Defense never increases losses, and on this close fight it strictly reduces them.
    expect(defendedLosses).toBeLessThanOrEqual(baseLosses);
    expect(defendedLosses).toBeLessThan(baseLosses);
  });

  it('a trainingSpeed tech shortens a batch completesAt', () => {
    const research = new ResearchSystem(['drill_grounds']); // 0.9x time
    const baseQ = new TrainingQueue();
    const fastQ = new TrainingQueue();
    const t = troopDef('spearman').trainTimeMs;

    baseQ.enqueue('spearman', 5, new ResourceStore({ food: 9999, wood: 9999, stone: 0, gold: 0 }), 0, true);
    fastQ.enqueue(
      'spearman',
      5,
      new ResourceStore({ food: 9999, wood: 9999, stone: 0, gold: 0 }),
      0,
      true,
      research.trainSpeedMultiplier(),
    );

    const baseEnd = baseQ.orders[0].completesAt;
    const fastEnd = fastQ.orders[0].completesAt;
    expect(baseEnd).toBe(5 * t);
    expect(fastEnd).toBeCloseTo(5 * t * 0.9, 6);
    expect(fastEnd).toBeLessThan(baseEnd);
  });

  it('a productionRate tech credits more resources over the same window', () => {
    const rates = { food: 10, wood: 0, stone: 0, gold: 0 };
    const research = new ResearchSystem(['crop_rotation']); // 1.1x

    const base = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const boosted = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });

    base.applyProduction(rates, 1000, 1);
    // Boosted rates as the GameState/offline seam applies them.
    boosted.applyProduction({ ...rates, food: rates.food * research.productionMultiplier() }, 1000, 1);

    expect(boosted.get('food')).toBeCloseTo(base.get('food') * 1.1, 6);
    expect(boosted.get('food')).toBeGreaterThan(base.get('food'));
  });

  it('a storage tech raises the soft cap so more production can be credited', () => {
    // A huge rate over a long window would slam the base cap; the storage tech
    // raises the ceiling so more is actually banked.
    const rates = { food: 1_000_000, wood: 0, stone: 0, gold: 0 };
    const research = new ResearchSystem(['reinforced_stores']); // 1.5x cap

    const base = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const bigger = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });

    base.applyProduction(rates, 60_000, 1, 1);
    bigger.applyProduction(rates, 60_000, 1, research.storageMultiplier());

    expect(bigger.get('food')).toBeGreaterThan(base.get('food'));
    expect(bigger.get('food')).toBeCloseTo(base.get('food') * 1.5, 4);
  });
});
