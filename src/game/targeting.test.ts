import { describe, it, expect } from 'vitest';
import {
  isTargetable,
  nearestTargetableEnemy,
  nearestEnemy,
  type StructureLine,
  type Unit,
} from './combat';

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u',
    kind: 'champion',
    team: 'enemy',
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    ad: 50,
    armor: 0,
    attackRange: 150,
    attackSpeed: 0.7,
    moveSpeed: 330,
    attackCdRemaining: 0,
    dead: false,
    ...overrides,
  };
}

const LINES: StructureLine[] = [
  { turretId: 'enemy-turret', nexusId: 'enemy-nexus' },
  { turretId: 'ally-turret', nexusId: 'ally-nexus' },
];

describe('isTargetable (structure gating)', () => {
  it('a nexus is NOT targetable while its guarding turret lives', () => {
    const nexus = makeUnit({ id: 'enemy-nexus', kind: 'nexus' });
    const living = new Set(['enemy-turret', 'enemy-nexus']);
    expect(isTargetable(nexus, LINES, living)).toBe(false);
  });

  it('a nexus BECOMES targetable once its turret has fallen', () => {
    const nexus = makeUnit({ id: 'enemy-nexus', kind: 'nexus' });
    const living = new Set(['enemy-nexus']); // turret gone
    expect(isTargetable(nexus, LINES, living)).toBe(true);
  });

  it('non-nexus units are always targetable', () => {
    const turret = makeUnit({ id: 'enemy-turret', kind: 'turret' });
    const minion = makeUnit({ id: 'm', kind: 'minion' });
    const living = new Set(['enemy-turret', 'enemy-nexus', 'm']);
    expect(isTargetable(turret, LINES, living)).toBe(true);
    expect(isTargetable(minion, LINES, living)).toBe(true);
  });

  it('a dead unit is never targetable', () => {
    const dead = makeUnit({ id: 'x', dead: true });
    expect(isTargetable(dead, LINES, new Set())).toBe(false);
  });
});

describe('nearestTargetableEnemy', () => {
  it('never returns the nexus while its turret still stands, even if closer', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const nexus = makeUnit({ id: 'enemy-nexus', kind: 'nexus', team: 'enemy', pos: { x: 10, y: 0 } });
    const turret = makeUnit({ id: 'enemy-turret', kind: 'turret', team: 'enemy', pos: { x: 200, y: 0 } });
    const living = new Set(['enemy-nexus', 'enemy-turret']);
    const found = nearestTargetableEnemy(me, [nexus, turret], LINES, living, Infinity);
    // Nexus is shielded, so the only valid structure/target is the turret.
    expect(found?.id).toBe('enemy-turret');
  });

  it('allows the nexus once the turret is dead', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const nexus = makeUnit({ id: 'enemy-nexus', kind: 'nexus', team: 'enemy', pos: { x: 10, y: 0 } });
    const living = new Set(['enemy-nexus']); // turret dead
    const found = nearestTargetableEnemy(me, [nexus], LINES, living, Infinity);
    expect(found?.id).toBe('enemy-nexus');
  });

  it('preferStructures makes a turret outrank a closer minion', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const minion = makeUnit({ id: 'm', kind: 'minion', team: 'enemy', pos: { x: 20, y: 0 } });
    const turret = makeUnit({ id: 'enemy-turret', kind: 'turret', team: 'enemy', pos: { x: 100, y: 0 } });
    const living = new Set(['m', 'enemy-turret', 'enemy-nexus']);
    const found = nearestTargetableEnemy(me, [minion, turret], LINES, living, Infinity, true);
    expect(found?.id).toBe('enemy-turret');
  });

  it('without preferStructures picks the plain nearest targetable unit', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const minion = makeUnit({ id: 'm', kind: 'minion', team: 'enemy', pos: { x: 20, y: 0 } });
    const turret = makeUnit({ id: 'enemy-turret', kind: 'turret', team: 'enemy', pos: { x: 100, y: 0 } });
    const living = new Set(['m', 'enemy-turret', 'enemy-nexus']);
    const found = nearestTargetableEnemy(me, [minion, turret], LINES, living, Infinity, false);
    expect(found?.id).toBe('m');
  });

  it('respects maxRange', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const far = makeUnit({ id: 'm', kind: 'minion', team: 'enemy', pos: { x: 500, y: 0 } });
    const living = new Set(['m']);
    expect(nearestTargetableEnemy(me, [far], LINES, living, 300)).toBeUndefined();
  });
});

describe('nearestEnemy deterministic tie-break', () => {
  it('keeps the first-scanned unit among equidistant candidates', () => {
    const me = makeUnit({ id: 'me', team: 'ally', pos: { x: 0, y: 0 } });
    const a = makeUnit({ id: 'a', team: 'enemy', pos: { x: 50, y: 0 } });
    const b = makeUnit({ id: 'b', team: 'enemy', pos: { x: 50, y: 0 } });
    // Both at distance 50; the first one (a) must win for stability.
    expect(nearestEnemy(me, [a, b])?.id).toBe('a');
    expect(nearestEnemy(me, [b, a])?.id).toBe('b');
  });
});
