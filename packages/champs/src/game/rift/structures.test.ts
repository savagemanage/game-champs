import { describe, it, expect } from 'vitest';
import {
  buildStructureGraph,
  targetableOrder,
  isStructureTargetable,
  structureId,
  INHIBITOR_RESPAWN_SECONDS,
  inhibitorRespawnAt,
  isInhibitorAlive,
} from './structures';
import { LANES, SIDES } from './map';

/** Convenience: the set of all structure ids for a side. */
function allIds(side: 'ally' | 'enemy'): Set<string> {
  return new Set(targetableOrder(side));
}

describe('structure graph', () => {
  it('builds a full chain per lane plus base buildings for each side', () => {
    for (const side of SIDES) {
      const nodes = buildStructureGraph(side);
      // 4 per lane (outer/inner/inhibTurret/inhibitor) * 3 lanes + 2 nexus turrets + nexus
      expect(nodes.length).toBe(4 * LANES.length + 3);
      expect(nodes.filter((n) => n.kind === 'nexus').length).toBe(1);
      expect(nodes.filter((n) => n.kind === 'nexusTurret').length).toBe(2);
      expect(nodes.filter((n) => n.kind === 'inhibitor').length).toBe(LANES.length);
    }
  });

  it('builds Midline Skirmish from only the active mid lane', () => {
    const nodes = buildStructureGraph('enemy', 'midline');
    expect(nodes).toHaveLength(7);
    expect(nodes.filter((node) => node.lane != null).every((node) => node.lane === 'mid')).toBe(true);
    expect(targetableOrder('enemy', ['mid'])).toEqual(nodes.map((node) => node.id));
  });
});

describe('gating order', () => {
  const side = 'enemy' as const;

  it('shields the inner turret while the outer turret stands', () => {
    const living = allIds(side);
    const inner = structureId(side, 'innerTurret', 'top');
    expect(isStructureTargetable(inner, living)).toBe(false);

    living.delete(structureId(side, 'outerTurret', 'top'));
    expect(isStructureTargetable(inner, living)).toBe(true);
  });

  it('shields the inhibitor behind the inhibitor turret behind the inner turret', () => {
    const living = allIds(side);
    const inhibTurret = structureId(side, 'inhibitorTurret', 'mid');
    const inhib = structureId(side, 'inhibitor', 'mid');

    expect(isStructureTargetable(inhibTurret, living)).toBe(false);
    living.delete(structureId(side, 'innerTurret', 'mid'));
    expect(isStructureTargetable(inhibTurret, living)).toBe(true);

    expect(isStructureTargetable(inhib, living)).toBe(false);
    living.delete(inhibTurret);
    expect(isStructureTargetable(inhib, living)).toBe(true);
  });

  it('shields the nexus turrets until at least one inhibitor falls', () => {
    const living = allIds(side);
    const nexusTurretA = structureId(side, 'nexusTurret', null) + '-a';
    const nexusTurretB = structureId(side, 'nexusTurret', null) + '-b';

    // All inhibitors alive -> nexus turrets shielded.
    expect(isStructureTargetable(nexusTurretA, living)).toBe(false);
    expect(isStructureTargetable(nexusTurretB, living)).toBe(false);

    // Destroy one inhibitor -> nexus turrets become targetable.
    living.delete(structureId(side, 'inhibitor', 'bot'));
    expect(isStructureTargetable(nexusTurretA, living)).toBe(true);
    expect(isStructureTargetable(nexusTurretB, living)).toBe(true);
  });

  it('uses only the active inhibitor to gate Midline Skirmish base turrets', () => {
    const living = new Set(targetableOrder(side, 'midline'));
    const nexusTurret = structureId(side, 'nexusTurret', null) + '-a';
    expect(isStructureTargetable(nexusTurret, living, 'midline')).toBe(false);

    living.delete(structureId(side, 'inhibitor', 'mid'));
    expect(isStructureTargetable(nexusTurret, living, 'midline')).toBe(true);
  });

  it('shields the nexus while any nexus turret stands', () => {
    const living = allIds(side);
    const nexus = structureId(side, 'nexus', null);
    const nexusTurretA = structureId(side, 'nexusTurret', null) + '-a';
    const nexusTurretB = structureId(side, 'nexusTurret', null) + '-b';

    expect(isStructureTargetable(nexus, living)).toBe(false);
    living.delete(nexusTurretA);
    expect(isStructureTargetable(nexus, living)).toBe(false);
    living.delete(nexusTurretB);
    expect(isStructureTargetable(nexus, living)).toBe(true);
  });

  it('returns false for a dead (non-living) structure', () => {
    const living = allIds(side);
    const outer = structureId(side, 'outerTurret', 'top');
    living.delete(outer);
    expect(isStructureTargetable(outer, living)).toBe(false);
  });

  it('lists every structure in targetable order', () => {
    const order = targetableOrder('ally');
    expect(order[0]).toBe(structureId('ally', 'outerTurret', 'top'));
    expect(order[order.length - 1]).toBe(structureId('ally', 'nexus', null));
  });
});

describe('inhibitor respawn', () => {
  it('computes the respawn time from kill time', () => {
    expect(inhibitorRespawnAt(600)).toBe(600 + INHIBITOR_RESPAWN_SECONDS);
    expect(inhibitorRespawnAt(600, 'midline')).toBe(720);
  });

  it('is dead until the respawn time then alive again', () => {
    const killedAt = 600;
    expect(isInhibitorAlive(killedAt + 10, killedAt)).toBe(false);
    expect(isInhibitorAlive(killedAt + INHIBITOR_RESPAWN_SECONDS - 1, killedAt)).toBe(false);
    expect(isInhibitorAlive(killedAt + INHIBITOR_RESPAWN_SECONDS, killedAt)).toBe(true);
  });

  it('is alive when never destroyed', () => {
    expect(isInhibitorAlive(1000, null)).toBe(true);
  });
});
