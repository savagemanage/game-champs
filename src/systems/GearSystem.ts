import {
  CHARM_DEFS,
  GEAR_SLOT_DEFS,
  charmBonus,
  charmUpgradeCost,
  gearSlotBonus,
  gearUpgradeCost,
} from '../config/GearConfig';
import { GEAR } from '../config/GameConfig';
import { combineModifiers } from '../config/StatModifiers';
import type {
  CharmKind,
  EquippedCharm,
  GearSlot,
  GearSlotState,
  GearState,
  StatModifiers,
} from '../types';
import { CHARM_KIND_ORDER, GEAR_SLOT_ORDER } from '../types';
import { ResourceStore } from './ResourceStore';

/** Outcome of attempting to forge/upgrade a gear slot or charm. */
export interface GearCheck {
  ok: boolean;
  /** Reason code when `ok` is false. */
  reason?: 'unknown' | 'max_level' | 'no_charm' | 'cost';
}

/**
 * GearSystem - the chief-gear + charm layer as PURE logic (no Phaser).
 *
 * It owns each of the six gear slots' level (0 = not forged) and the single
 * charm socketed into each slot. Upgrading a slot or a charm charges its
 * material cost against a {@link ResourceStore} (mirroring BuildingSystem's
 * affordability model), clamped by the GEAR max levels. Every equipped slot +
 * socketed charm contributes a partial {@link StatModifiers} bundle, aggregated
 * (via the shared combiner) into {@link GearSystem.modifiers} so GameState folds
 * gear into the same total as research + heroes. Serializable via toJSON/fromJSON.
 */
export class GearSystem {
  private readonly _slots: Map<GearSlot, GearSlotState> = new Map();

  constructor(state?: GearState) {
    if (state?.slots) {
      for (const slot of GEAR_SLOT_ORDER) {
        const s = state.slots[slot];
        if (s) this._slots.set(slot, normalizeSlot(s));
      }
    }
  }

  /** Current level of a gear slot (0 = not forged). */
  level(slot: GearSlot): number {
    return this._slots.get(slot)?.level ?? 0;
  }

  /** The charm socketed in a slot, or null. */
  charm(slot: GearSlot): EquippedCharm | null {
    const c = this._slots.get(slot)?.charm ?? null;
    return c ? { ...c } : null;
  }

  private ensure(slot: GearSlot): GearSlotState {
    let s = this._slots.get(slot);
    if (!s) {
      s = { level: 0, charm: null };
      this._slots.set(slot, s);
    }
    return s;
  }

  /** Cost to take a slot from its current level to the next. */
  nextGearCost(slot: GearSlot) {
    return gearUpgradeCost(slot, this.level(slot));
  }

  /** Whether a slot upgrade may be afforded/started against `store`. */
  canUpgradeGear(slot: GearSlot, store: ResourceStore): GearCheck {
    if (!GEAR_SLOT_DEFS[slot]) return { ok: false, reason: 'unknown' };
    if (this.level(slot) >= GEAR.MAX_GEAR_LEVEL) return { ok: false, reason: 'max_level' };
    if (!store.canAfford(this.nextGearCost(slot))) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Forge or upgrade a gear slot by one level, spending its material cost. From
   * level 0 this forges the piece; from level N it advances to N+1. Returns the
   * check; on failure nothing changes.
   */
  upgradeGear(slot: GearSlot, store: ResourceStore): GearCheck {
    const check = this.canUpgradeGear(slot, store);
    if (!check.ok) return check;
    if (!store.spend(this.nextGearCost(slot))) return { ok: false, reason: 'cost' };
    const s = this.ensure(slot);
    s.level += 1;
    return { ok: true };
  }

  /** Cost to take the charm in `slot` (of `kind`) from its level to the next. */
  nextCharmCost(kind: CharmKind, level: number) {
    return charmUpgradeCost(kind, level);
  }

  /**
   * Socket a charm of `kind` into `slot`, forging it at level 1 (spending the
   * level-0 cost). Overwrites any existing charm in the slot. The slot must be
   * forged (level >= 1) to hold a charm. Returns the check.
   */
  socketCharm(slot: GearSlot, kind: CharmKind, store: ResourceStore): GearCheck {
    if (!GEAR_SLOT_DEFS[slot] || !CHARM_DEFS[kind]) return { ok: false, reason: 'unknown' };
    if (this.level(slot) <= 0) return { ok: false, reason: 'no_charm' };
    const cost = charmUpgradeCost(kind, 0);
    if (!store.canAfford(cost)) return { ok: false, reason: 'cost' };
    store.spend(cost);
    const s = this.ensure(slot);
    s.charm = { kind, level: 1 };
    return { ok: true };
  }

  /**
   * Upgrade the charm already socketed in `slot` by one level, spending its
   * cost. Fails if the slot has no charm or the charm is at its max level.
   */
  upgradeCharm(slot: GearSlot, store: ResourceStore): GearCheck {
    const s = this._slots.get(slot);
    if (!s || !s.charm) return { ok: false, reason: 'no_charm' };
    if (s.charm.level >= GEAR.MAX_CHARM_LEVEL) return { ok: false, reason: 'max_level' };
    const cost = charmUpgradeCost(s.charm.kind, s.charm.level);
    if (!store.canAfford(cost)) return { ok: false, reason: 'cost' };
    store.spend(cost);
    s.charm.level += 1;
    return { ok: true };
  }

  /**
   * The aggregate bonus of ALL equipped gear + socketed charms, as the shared
   * {@link StatModifiers} bundle. GameState combines this with research + hero
   * bundles and consumes the total.
   */
  modifiers(): StatModifiers {
    const bundles: (Partial<StatModifiers> | undefined)[] = [];
    for (const slot of GEAR_SLOT_ORDER) {
      const s = this._slots.get(slot);
      if (!s) continue;
      bundles.push(gearSlotBonus(slot, s.level));
      if (s.charm) bundles.push(charmBonus(s.charm.kind, s.charm.level));
    }
    return combineModifiers(...bundles);
  }

  /** Serialize to a plain {@link GearState}. */
  toJSON(): GearState {
    const slots: GearState['slots'] = {};
    for (const [slot, s] of this._slots.entries()) {
      slots[slot] = { level: s.level, charm: s.charm ? { ...s.charm } : null };
    }
    return { slots };
  }

  /**
   * Restore from a persisted {@link GearState}. A missing / malformed value
   * yields empty gear so old saves load without crashing.
   */
  static fromJSON(data: GearState | undefined | null): GearSystem {
    if (!data || typeof data !== 'object') return new GearSystem();
    return new GearSystem(data);
  }
}

/** Coerce a persisted slot into a valid {@link GearSlotState}, clamping levels. */
function normalizeSlot(s: GearSlotState): GearSlotState {
  const level = Math.min(GEAR.MAX_GEAR_LEVEL, Math.max(0, Math.floor(s.level ?? 0)));
  let charm: EquippedCharm | null = null;
  if (s.charm && CHARM_KIND_ORDER.includes(s.charm.kind) && level > 0) {
    const cLevel = Math.min(GEAR.MAX_CHARM_LEVEL, Math.max(1, Math.floor(s.charm.level ?? 1)));
    charm = { kind: s.charm.kind, level: cLevel };
  }
  return { level, charm };
}
