import { describe, it, expect } from 'vitest';
import { GearSystem } from './GearSystem';
import { ResourceStore } from './ResourceStore';
import { GEAR } from '../config/GameConfig';
import { charmUpgradeCost, gearSlotBonus, gearUpgradeCost } from '../config/GearConfig';

/**
 * Unit tests for the chief-gear + charm layer: forge/upgrade cost enforcement,
 * charm socketing + upgrade, level ceilings, bonus aggregation into the shared
 * modifier bundle, and serialize round-trip.
 */
describe('GearSystem', () => {
  const richStore = () =>
    new ResourceStore({ food: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6 });

  it('forges a gear slot, spending the level-0 cost', () => {
    const g = new GearSystem();
    const store = richStore();
    const cost = gearUpgradeCost('gloves', 0);
    const beforeIron = store.get('iron');

    expect(g.level('gloves')).toBe(0);
    expect(g.upgradeGear('gloves', store).ok).toBe(true);
    expect(g.level('gloves')).toBe(1);
    expect(store.get('iron')).toBe(beforeIron - (cost.iron ?? 0));
  });

  it('refuses an unaffordable upgrade without charging', () => {
    const g = new GearSystem();
    const broke = new ResourceStore({ food: 0, wood: 0, coal: 0, iron: 0, steel: 0 });
    const check = g.upgradeGear('coat', broke);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
    expect(g.level('coat')).toBe(0);
  });

  it('clamps gear at the max level', () => {
    const g = new GearSystem();
    const store = richStore();
    for (let i = 0; i < GEAR.MAX_GEAR_LEVEL; i++) {
      expect(g.upgradeGear('helm', store).ok).toBe(true);
    }
    expect(g.level('helm')).toBe(GEAR.MAX_GEAR_LEVEL);
    const over = g.upgradeGear('helm', store);
    expect(over.ok).toBe(false);
    expect(over.reason).toBe('max_level');
  });

  it('requires a forged slot before socketing a charm, then upgrades it', () => {
    const g = new GearSystem();
    const store = richStore();
    // Cannot socket into an unforged slot.
    const early = g.socketCharm('belt', 'warfare', store);
    expect(early.ok).toBe(false);
    expect(early.reason).toBe('no_charm');

    g.upgradeGear('belt', store); // forge to level 1
    expect(g.socketCharm('belt', 'warfare', store).ok).toBe(true);
    expect(g.charm('belt')).toEqual({ kind: 'warfare', level: 1 });

    // Upgrading the charm spends its per-level cost and raises the level.
    const store2 = richStore();
    const cost = charmUpgradeCost('warfare', 1);
    const beforeIron = store2.get('iron');
    expect(g.upgradeCharm('belt', store2).ok).toBe(true);
    expect(g.charm('belt')!.level).toBe(2);
    expect(store2.get('iron')).toBe(beforeIron - (cost.iron ?? 0));
  });

  it('aggregates equipped gear + charm bonuses into the shared bundle', () => {
    const g = new GearSystem();
    const store = richStore();
    g.upgradeGear('gloves', store); // gloves L1 -> troopAttack
    g.upgradeGear('gloves', store); // gloves L2
    g.socketCharm('gloves', 'warfare', store); // + charm troopAttack

    const mods = g.modifiers();
    // gloves L2 attack = 2 * per-level; expected includes the level scaling.
    const expectGloves = gearSlotBonus('gloves', 2).troopAttack ?? 0;
    expect(mods.troopAttack).toBeGreaterThan(expectGloves - 1e-9);
    // The socketed charm adds MORE attack on top of the gear.
    expect(mods.troopAttack).toBeGreaterThan(expectGloves);
  });

  it('an empty gear set contributes a zero bundle', () => {
    const mods = new GearSystem().modifiers();
    expect(mods.troopAttack).toBe(0);
    expect(mods.economyOutput).toBe(0);
  });

  it('round-trips gear + charm state via toJSON/fromJSON', () => {
    const g = new GearSystem();
    const store = richStore();
    g.upgradeGear('coat', store);
    g.upgradeGear('coat', store);
    g.socketCharm('coat', 'bulwark', store);
    g.upgradeCharm('coat', store);

    const restored = GearSystem.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(restored.level('coat')).toBe(2);
    expect(restored.charm('coat')).toEqual({ kind: 'bulwark', level: 2 });
    expect(restored.modifiers()).toEqual(g.modifiers());
  });

  it('fromJSON tolerates a missing / malformed state (empty gear)', () => {
    expect(GearSystem.fromJSON(undefined).level('coat')).toBe(0);
    expect(GearSystem.fromJSON(null).modifiers().troopAttack).toBe(0);
    // A charm on an unforged slot is dropped.
    const g = GearSystem.fromJSON({ slots: { boots: { level: 0, charm: { kind: 'warfare', level: 3 } } } });
    expect(g.charm('boots')).toBeNull();
  });
});
