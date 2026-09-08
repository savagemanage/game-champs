/**
 * Jungle simulation for the original three-lane arena: neutral camps with respawn timers and
 * bounties, plus the Blue and Red buffs granted by the two buff camps.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so it can be
 * exhaustively unit tested in a plain jsdom/node environment. Camp positions
 * are drawn from {@link ./map} anchors and bounties from {@link ./economy}.
 */

import { type MapSide, type Vec2, JUNGLE_CAMPS } from './map';
import { type Bounty, type JungleCampKind, jungleCampBounty } from './economy';

/** The camp archetypes we model (a representative Rift set). */
export type CampType =
  | 'blue'
  | 'red'
  | 'raptors'
  | 'wolves'
  | 'gromp'
  | 'krugs'
  | 'scuttle';

/** A neutral jungle camp instance. */
export interface Camp {
  id: string;
  type: CampType;
  side: MapSide;
  pos: Vec2;
  respawnSeconds: number;
  bounty: Bounty;
}

/** Respawn cooldown per camp type, in seconds. */
export const CAMP_RESPAWN_SECONDS: Record<CampType, number> = {
  blue: 300,
  red: 300,
  raptors: 135,
  wolves: 135,
  gromp: 135,
  krugs: 135,
  scuttle: 150,
};

/** Bounty per camp type. Scuttle (a neutral objective) grants a modest reward. */
const SCUTTLE_BOUNTY: Bounty = { gold: 55, xp: 55 };

function campBountyFor(type: CampType): Bounty {
  if (type === 'scuttle') return SCUTTLE_BOUNTY;
  return jungleCampBounty(type as JungleCampKind);
}

/** Derive the camp type from a map anchor id like `ally-blue`. */
function typeFromAnchorId(id: string): CampType {
  const suffix = id.split('-').slice(1).join('-');
  return suffix as CampType;
}

/**
 * The full set of jungle camps, built from the map anchors. Each camp carries
 * its respawn timer and bounty so systems and tests share one source of truth.
 * A scuttle crab is added on the river for each side.
 */
export const CAMPS: readonly Camp[] = [
  ...JUNGLE_CAMPS.map((anchor) => {
    const type = typeFromAnchorId(anchor.id);
    return {
      id: anchor.id,
      type,
      side: anchor.side,
      pos: { x: anchor.pos.x, y: anchor.pos.y },
      respawnSeconds: CAMP_RESPAWN_SECONDS[type],
      bounty: campBountyFor(type),
    } satisfies Camp;
  }),
  {
    id: 'ally-scuttle',
    type: 'scuttle',
    side: 'ally',
    pos: { x: 1980, y: 1980 },
    respawnSeconds: CAMP_RESPAWN_SECONDS.scuttle,
    bounty: campBountyFor('scuttle'),
  },
  {
    id: 'enemy-scuttle',
    type: 'scuttle',
    side: 'enemy',
    pos: { x: 1020, y: 1020 },
    respawnSeconds: CAMP_RESPAWN_SECONDS.scuttle,
    bounty: campBountyFor('scuttle'),
  },
];

/** The game time (seconds) at which a camp killed at `killedAtSeconds` respawns. */
export function campRespawnAt(camp: Camp, killedAtSeconds: number): number {
  return killedAtSeconds + camp.respawnSeconds;
}

/**
 * Whether `camp` is alive at `nowSeconds`. `lastKilledAt` of null/undefined
 * means the camp has never been killed (alive). Otherwise it is alive once the
 * respawn time has been reached.
 */
export function isCampAlive(
  camp: Camp,
  nowSeconds: number,
  lastKilledAt: number | null,
): boolean {
  if (lastKilledAt == null) return true;
  return nowSeconds >= campRespawnAt(camp, lastKilledAt);
}

// ---------------------------------------------------------------------------
// Buffs
// ---------------------------------------------------------------------------

/** The buff kinds granted by the two buff camps. */
export type BuffKind = 'blue' | 'red';

/** How long a buff lasts once picked up, in seconds. */
export const BUFF_DURATION_SECONDS = 120;

/**
 * Numeric effect of each buff kind. Blue buff models cooldown reduction and
 * resource (mana) regeneration; Red buff models bonus on-hit damage and a slow
 * applied to the target. These feed into champion stats numerically.
 */
export interface BuffEffect {
  /** Fractional cooldown reduction, 0..1 (blue only). */
  cooldownReduction: number;
  /** Mana/resource regen per second (blue only). */
  resourceRegenPerSecond: number;
  /** Flat bonus damage on basic attacks (red only). */
  bonusDamage: number;
  /** Fractional movement slow applied to the target on hit, 0..1 (red only). */
  slowPercent: number;
}

/** Effect payloads for the two buff kinds. */
export const BUFF_EFFECTS: Record<BuffKind, BuffEffect> = {
  blue: {
    cooldownReduction: 0.1,
    resourceRegenPerSecond: 5,
    bonusDamage: 0,
    slowPercent: 0,
  },
  red: {
    cooldownReduction: 0,
    resourceRegenPerSecond: 0,
    bonusDamage: 15,
    slowPercent: 0.2,
  },
};

/** A single active buff on a champion. */
export interface ActiveBuff {
  kind: BuffKind;
  /** Game time (seconds) at which this buff expires. */
  expiresAt: number;
}

/** A small record of the buffs currently held by an entity. */
export interface BuffState {
  buffs: ActiveBuff[];
}

/** A fresh, empty buff state. */
export function createBuffState(): BuffState {
  return { buffs: [] };
}

/**
 * Apply a buff of `kind` at `nowSeconds`, expiring after
 * {@link BUFF_DURATION_SECONDS}. Re-applying the same kind refreshes its timer
 * rather than stacking. Mutates and returns the state.
 */
export function applyBuff(state: BuffState, kind: BuffKind, nowSeconds: number): BuffState {
  const expiresAt = nowSeconds + BUFF_DURATION_SECONDS;
  const existing = state.buffs.find((b) => b.kind === kind);
  if (existing) {
    existing.expiresAt = expiresAt;
  } else {
    state.buffs.push({ kind, expiresAt });
  }
  return state;
}

/**
 * Remove any buffs that have expired by `nowSeconds`. Mutates and returns the
 * state.
 */
export function expireBuffs(state: BuffState, nowSeconds: number): BuffState {
  state.buffs = state.buffs.filter((b) => b.expiresAt > nowSeconds);
  return state;
}

/** Whether a buff of `kind` is currently active at `nowSeconds`. */
export function hasBuff(state: BuffState, kind: BuffKind, nowSeconds: number): boolean {
  return state.buffs.some((b) => b.kind === kind && b.expiresAt > nowSeconds);
}
