/**
 * SiegeGeometry - pure, Phaser-independent math for the top-down radial siege.
 *
 * These helpers hold the geometry that used to be inlined inside the Phaser
 * entities (WaveSystem spawn placement, Wall segment layout / nearest-target
 * selection, Player dash direction, and the giant's 2D nape / frontal-armor
 * cone). Extracting them here lets the shipping logic be unit-tested with plain
 * assertions (see SiegeGeometry.test.ts) without booting a WebGL runtime, while
 * the entities call straight into these functions so the tests exercise the
 * real code paths rather than a copy.
 *
 * Everything here is stateless and side-effect free: inputs are numbers, outputs
 * are numbers / small records. No Phaser, no DOM.
 */

/** A 2D point / vector in world space. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Radial spawn placement: given an angle (radians) and a radius from the arena
 * center, return the world point on that circle. WaveSystem spawns each giant
 * just OUTSIDE the outer ring, so it passes a radius > OUTER_RADIUS; the giants
 * then besiege the center from all sides.
 */
export function radialPoint(centerX: number, centerY: number, angle: number, radius: number): Vec2 {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

/**
 * The spawn radius WaveSystem uses for a giant: just outside OUTER_RADIUS by a
 * fixed margin plus a jitter fraction in [0, 1). Kept pure so a test can assert
 * every spawn lands strictly outside the outer ring regardless of jitter.
 */
export function spawnRadius(outerRadius: number, jitter01: number): number {
  return outerRadius + 90 + jitter01 * 60;
}

/**
 * Even angular layout of a ring's segments: the center angle (radians) of
 * segment `index` of `count` evenly spaced blocks. Used by Wall to place each
 * rampart block and mirrored here so the layout is testable.
 */
export function segmentAngle(index: number, count: number): number {
  return (index / count) * Math.PI * 2;
}

/** Euclidean distance between two points. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** A ring segment as far as nearest-target selection is concerned. */
export interface SegmentLike {
  readonly x: number;
  readonly y: number;
  readonly breached: boolean;
}

/**
 * Nearest-un-breached-segment selection. Giants assault the OUTER ring first;
 * once every outer segment is breached they switch to the INNER ring. Returns
 * the index of the nearest standing segment in the active ring, or -1 when the
 * active ring has no standing segments left.
 *
 * @param x,y the giant's world position.
 * @param outer the outer ring's segments.
 * @param inner the inner ring's segments.
 */
export function nearestTargetIndex(
  x: number,
  y: number,
  outer: readonly SegmentLike[],
  inner: readonly SegmentLike[],
): { ring: 0 | 1; index: number } {
  const outerBreached = outer.every((s) => s.breached);
  const ring: 0 | 1 = outerBreached ? 1 : 0;
  const list = ring === 0 ? outer : inner;
  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < list.length; i++) {
    if (list[i].breached) continue;
    const d = distance(x, y, list[i].x, list[i].y);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return { ring, index: bestIndex };
}

/**
 * Dash direction normalization (fix for the "Shift dashes backward" bug). Given
 * an aim vector (worldAim - player), return the UNIT direction pointing toward
 * it - never inverted. A zero vector falls back to a safe default so a dash in
 * place still has a direction.
 */
export function dashDirection(dirX: number, dirY: number): Vec2 {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dirX / len, y: dirY / len };
}

/**
 * Back-of-neck (nape) world offset for a giant, given its 2D facing heading.
 * The nape sits OPPOSITE the facing direction (behind the neck) and high on the
 * body, so it swings around with the giant's heading and the player must strike
 * from behind the approach. Returns the offset to add to the giant's origin.
 *
 * @param facingX,facingY unit facing heading.
 * @param displayHeight rendered height of the giant, world px.
 * @param napeLocalY per-role local vertical nudge (unscaled).
 * @param scale sprite scale.
 */
export function napeOffset(
  facingX: number,
  facingY: number,
  displayHeight: number,
  napeLocalY: number,
  scale: number,
): Vec2 {
  const backOffset = displayHeight * 0.12;
  return {
    x: -facingX * backOffset,
    y: -displayHeight * 0.78 + napeLocalY * scale - facingY * backOffset,
  };
}

/**
 * Frontal-armor test in 2D: is an incoming hit landing within the giant's
 * frontal cone? A hit whose direction (from the giant toward the strike) lies
 * within `coneDeg` of the facing heading is "frontal" and gets reduced by the
 * plate; a hit from behind or the flank (outside the cone) bypasses it.
 *
 * @param facingX,facingY unit facing heading.
 * @param hitDX,hitDY vector from the giant toward the strike point.
 * @param coneDeg half-angle of the frontal cone, degrees.
 */
export function isFrontalHit(
  facingX: number,
  facingY: number,
  hitDX: number,
  hitDY: number,
  coneDeg: number,
): boolean {
  const hlen = Math.hypot(hitDX, hitDY) || 1;
  const dot = (hitDX / hlen) * facingX + (hitDY / hlen) * facingY;
  const coneCos = Math.cos((coneDeg * Math.PI) / 180);
  return dot >= coneCos;
}
