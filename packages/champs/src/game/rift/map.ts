/**
 * Original three-lane world model: pure geometry for the arena map, lane
 * waypoint polylines, jungle/river anchors, and structure (turret / inhibitor /
 * nexus) positions.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so it can be
 * exhaustively unit tested in a plain jsdom/node environment. The rendering
 * layer consumes these coordinates and draws them; every number here is a
 * plain, testable value.
 *
 * Coordinate space
 * ----------------
 * A fixed square world of {@link WORLD_SIZE} x {@link WORLD_SIZE} world units.
 * The origin (0,0) is the top-left corner and (WORLD_SIZE, WORLD_SIZE) is the
 * bottom-right, matching the usual screen convention (y grows downward).
 *
 * Team orientation places the ALLY base in the bottom-left corner and the
 * ENEMY base in the top-right corner. Lanes run
 * from one base to the other:
 *   - MID  is a straight diagonal from bottom-left to top-right.
 *   - BOT  hugs the bottom then the right edge (an L along the south/east).
 *   - TOP  hugs the left then the top edge (an L along the west/north).
 * The river runs along the anti-diagonal (bottom-left <-> top-right is the
 * lane diagonal, so the river is the perpendicular top-left <-> bottom-right
 * band through the centre).
 */

/** Side length of the square world, in world units. */
export const WORLD_SIZE = 3000;

/** The three lanes of the conquest arena. */
export type Lane = 'top' | 'mid' | 'bot';

/** Which team a position/structure belongs to. */
export type MapSide = 'ally' | 'enemy';

/** A 2D point in world space (world units, y grows downward). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Every lane, in a stable order, for iteration in tests and rendering. */
export const LANES: readonly Lane[] = ['top', 'mid', 'bot'];

/** Both sides, in a stable order. */
export const SIDES: readonly MapSide[] = ['ally', 'enemy'];

// ---------------------------------------------------------------------------
// Base / fountain anchors
// ---------------------------------------------------------------------------

/** Inset of a base fountain from the map corner, in world units. */
const BASE_INSET = 260;

/**
 * Fountain (spawn) position for each side. Ally spawns bottom-left and enemy
 * spawns top-right.
 */
export const BASE_POSITIONS: Record<MapSide, Vec2> = {
  ally: { x: BASE_INSET, y: WORLD_SIZE - BASE_INSET },
  enemy: { x: WORLD_SIZE - BASE_INSET, y: BASE_INSET },
};

/** Alias for base positions; the fountain is co-located with the base. */
export const FOUNTAIN_POSITIONS: Record<MapSide, Vec2> = BASE_POSITIONS;

// ---------------------------------------------------------------------------
// Lane waypoint polylines (ally -> enemy direction)
// ---------------------------------------------------------------------------

/**
 * Ordered waypoint polylines for each lane, expressed in the ally -> enemy
 * marching direction (starting near the ally base, ending near the enemy base).
 * Ally minions follow these directly; enemy minions follow the reverse (see
 * {@link laneWaypoints}).
 *
 * MID is a straight diagonal. TOP and BOT are L-shaped around the map edges.
 */
/**
 * How far the top/bot lanes are pushed toward the map edges. A SMALL inset
 * makes the two side lanes hug the west/north and south/east edges tightly, so
 * in the dimetric projection they fan away from the central mid lane instead of
 * bunching near the base diagonal. (Screen-vertical position in the projection
 * tracks `x + y`, so hugging the edges maximizes the top<->bot separation.)
 */
const LANE_EDGE = 300;

export const LANE_WAYPOINTS: Record<Lane, Vec2[]> = {
  // MID: straight diagonal from the ally base corner to the enemy base corner.
  mid: [
    { x: 560, y: WORLD_SIZE - 560 },
    { x: WORLD_SIZE * 0.35, y: WORLD_SIZE * 0.65 },
    { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5 },
    { x: WORLD_SIZE * 0.65, y: WORLD_SIZE * 0.35 },
    { x: WORLD_SIZE - 560, y: 560 },
  ],
  // TOP: strike NORTH-WEST off the base immediately, hug the west edge, then run
  // east along the north edge (L-shape pinned to the far corner). Leaving the
  // base already fanned keeps the near-base turrets clear of the mid diagonal.
  top: [
    { x: 560, y: WORLD_SIZE - 860 },
    { x: LANE_EDGE, y: WORLD_SIZE * 0.52 },
    { x: LANE_EDGE, y: LANE_EDGE },
    { x: WORLD_SIZE * 0.52, y: LANE_EDGE },
    { x: WORLD_SIZE - 860, y: 560 },
  ],
  // BOT: strike SOUTH-EAST off the base immediately, hug the south edge, then
  // run up the east edge (L-shape pinned to the far corner). Mirror of TOP.
  bot: [
    { x: 860, y: WORLD_SIZE - 560 },
    { x: WORLD_SIZE * 0.48, y: WORLD_SIZE - LANE_EDGE },
    { x: WORLD_SIZE - LANE_EDGE, y: WORLD_SIZE - LANE_EDGE },
    { x: WORLD_SIZE - LANE_EDGE, y: WORLD_SIZE * 0.48 },
    { x: WORLD_SIZE - 560, y: WORLD_SIZE - 860 },
  ],
};

/**
 * Return the waypoint polyline a given team's minions should march along for a
 * lane. The ally team marches along {@link LANE_WAYPOINTS} as authored; the
 * enemy team marches the reverse, so the first waypoint for the enemy equals
 * the last waypoint for the ally.
 *
 * A fresh array (with cloned points) is returned so callers may mutate freely.
 */
export function laneWaypoints(lane: Lane, forTeam: MapSide): Vec2[] {
  const path = LANE_WAYPOINTS[lane].map((p) => ({ x: p.x, y: p.y }));
  return forTeam === 'ally' ? path : path.reverse();
}

// ---------------------------------------------------------------------------
// Structures: turrets, inhibitors, nexus
// ---------------------------------------------------------------------------

/**
 * Structure anchor positions for one side. The original topology includes:
 *   - per lane: outer turret, inner turret, inhibitor turret, inhibitor
 *   - base: two nexus turrets + the nexus itself
 */
export interface SideStructures {
  /** Two turrets per lane (outer then inner), in ally->enemy travel order. */
  outerTurrets: Record<Lane, Vec2>;
  innerTurrets: Record<Lane, Vec2>;
  /** The turret that guards each inhibitor (third/inhib turret). */
  inhibitorTurrets: Record<Lane, Vec2>;
  /** Inhibitor building behind the inhibitor turret, per lane. */
  inhibitors: Record<Lane, Vec2>;
  /** The two turrets guarding the nexus. */
  nexusTurrets: [Vec2, Vec2];
  /** The nexus itself. */
  nexus: Vec2;
}

/**
 * Interpolate a point along a lane's ally->enemy polyline at a fractional
 * distance `t` in [0,1] and, for enemy-side structures, mirror it by pulling
 * from the tail of the path instead. Helper used to place turrets sensibly on
 * the lane geometry.
 */
function alongLane(lane: Lane, t: number): Vec2 {
  const path = LANE_WAYPOINTS[lane];
  return pointAlongPath(path, pathLength(path) * clamp01(t));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Structure anchors for each side. Turrets sit at increasing distances along
 * each lane from the owning team's base; the ally owns the near end of the
 * ally->enemy polyline, the enemy owns the far end.
 */
export const STRUCTURES: Record<MapSide, SideStructures> = {
  ally: buildSideStructures('ally'),
  enemy: buildSideStructures('enemy'),
};

function buildSideStructures(side: MapSide): SideStructures {
  // Fractions along the ally->enemy polyline. Ally structures sit near the
  // start (small t); enemy structures sit near the end (large t), mirrored.
  const f = side === 'ally'
    ? { outer: 0.28, inner: 0.16, inhib: 0.07 }
    : { outer: 0.72, inner: 0.84, inhib: 0.93 };

  const base = BASE_POSITIONS[side];
  const towardEnemy = side === 'ally' ? 1 : -1;

  const laneRecord = (frac: number): Record<Lane, Vec2> => ({
    top: alongLane('top', frac),
    mid: alongLane('mid', frac),
    bot: alongLane('bot', frac),
  });

  // Nexus turrets flank the nexus, offset diagonally toward the enemy.
  const nexusOffset = 150;
  const nexusTurretA: Vec2 = {
    x: base.x + towardEnemy * nexusOffset,
    y: base.y - towardEnemy * nexusOffset * 0.4,
  };
  const nexusTurretB: Vec2 = {
    x: base.x + towardEnemy * nexusOffset * 0.4,
    y: base.y - towardEnemy * nexusOffset,
  };
  const nexus: Vec2 = {
    x: base.x + towardEnemy * 90,
    y: base.y - towardEnemy * 90,
  };

  return {
    outerTurrets: laneRecord(f.outer),
    innerTurrets: laneRecord(f.inner),
    inhibitorTurrets: laneRecord(f.inhib),
    inhibitors: laneRecord(side === 'ally' ? 0.04 : 0.96),
    nexusTurrets: [nexusTurretA, nexusTurretB],
    nexus,
  };
}

// ---------------------------------------------------------------------------
// Jungle + river + epic monster anchors
// ---------------------------------------------------------------------------

/**
 * A named jungle camp anchor. `side` marks whether the camp sits in the ally
 * half or the enemy half of the map.
 */
export interface JungleCamp {
  id: string;
  side: MapSide;
  pos: Vec2;
}

/**
 * Jungle camp anchor points, split into ally-side and enemy-side quadrants.
 * The jungle occupies the two quadrants between the lanes (the top-left and
 * bottom-right of the map are lane edges; the jungle fills the space around
 * the central river band). Each side has a symmetric set of camps.
 */
export const JUNGLE_CAMPS: readonly JungleCamp[] = [
  // Ally-side jungle (bottom-left half, between mid and the side lanes).
  { id: 'ally-blue', side: 'ally', pos: { x: 900, y: WORLD_SIZE - 1150 } },
  { id: 'ally-red', side: 'ally', pos: { x: WORLD_SIZE - 1150, y: WORLD_SIZE - 900 } },
  { id: 'ally-gromp', side: 'ally', pos: { x: 720, y: WORLD_SIZE - 1000 } },
  { id: 'ally-wolves', side: 'ally', pos: { x: 1050, y: WORLD_SIZE - 950 } },
  { id: 'ally-raptors', side: 'ally', pos: { x: WORLD_SIZE - 1050, y: WORLD_SIZE - 720 } },
  { id: 'ally-krugs', side: 'ally', pos: { x: WORLD_SIZE - 900, y: WORLD_SIZE - 620 } },
  // Enemy-side jungle (top-right half), mirrored across the map centre.
  { id: 'enemy-blue', side: 'enemy', pos: { x: WORLD_SIZE - 900, y: 1150 } },
  { id: 'enemy-red', side: 'enemy', pos: { x: 1150, y: 900 } },
  { id: 'enemy-gromp', side: 'enemy', pos: { x: WORLD_SIZE - 720, y: 1000 } },
  { id: 'enemy-wolves', side: 'enemy', pos: { x: WORLD_SIZE - 1050, y: 950 } },
  { id: 'enemy-raptors', side: 'enemy', pos: { x: 1050, y: 720 } },
  { id: 'enemy-krugs', side: 'enemy', pos: { x: 900, y: 620 } },
];

/**
 * An epic monster pit anchor on the river. Ember Dragon sits in the bottom-right
 * river; the Void Tyrant and Stone Warden share the top-left river pit.
 */
export interface EpicPit {
  id: 'dragon' | 'baron' | 'herald';
  pos: Vec2;
}

/**
 * Epic-monster pits. The river runs along the anti-diagonal (top-left <->
 * bottom-right). The Ember Dragon pit sits near the bottom lane; the Void Tyrant
 * and Stone Warden share the top-side pit at their configured match phases.
 */
export const EPIC_PITS: readonly EpicPit[] = [
  { id: 'dragon', pos: { x: WORLD_SIZE * 0.66, y: WORLD_SIZE * 0.66 } },
  { id: 'baron', pos: { x: WORLD_SIZE * 0.34, y: WORLD_SIZE * 0.34 } },
  { id: 'herald', pos: { x: WORLD_SIZE * 0.34, y: WORLD_SIZE * 0.34 } },
];

/**
 * River band anchor points along the anti-diagonal, from the bottom-right
 * (dragon) side to the top-left (baron) side, passing through map centre.
 */
export const RIVER_ANCHORS: readonly Vec2[] = [
  { x: WORLD_SIZE * 0.72, y: WORLD_SIZE * 0.72 },
  { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5 },
  { x: WORLD_SIZE * 0.28, y: WORLD_SIZE * 0.28 },
];

// ---------------------------------------------------------------------------
// Pure path helpers
// ---------------------------------------------------------------------------

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Linear interpolation between two points; t=0 -> a, t=1 -> b. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Total length of a polyline (sum of segment lengths). */
export function pathLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distance(path[i - 1], path[i]);
  }
  return total;
}

/**
 * Return the point that lies `dist` world units from the start of `path`,
 * walking segment by segment. Distances <= 0 return the first waypoint;
 * distances >= the total path length return the last waypoint. An empty path
 * returns {0,0}; a single-point path returns that point.
 */
export function pointAlongPath(path: readonly Vec2[], dist: number): Vec2 {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1 || dist <= 0) {
    return { x: path[0].x, y: path[0].y };
  }
  let remaining = dist;
  for (let i = 1; i < path.length; i++) {
    const segLen = distance(path[i - 1], path[i]);
    if (remaining <= segLen) {
      const t = segLen === 0 ? 0 : remaining / segLen;
      return lerp(path[i - 1], path[i], t);
    }
    remaining -= segLen;
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * Index of the next waypoint to head toward, given the index a unit is
 * currently walking toward. Clamps at the final waypoint (the path end), so a
 * unit that has reached the end stays there.
 */
export function nextWaypoint(path: readonly Vec2[], currentIndex: number): number {
  if (path.length === 0) return 0;
  const next = currentIndex + 1;
  return Math.min(next, path.length - 1);
}
