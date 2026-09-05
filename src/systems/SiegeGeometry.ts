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
 * an aim/facing vector, return the UNIT direction pointing toward it - never
 * inverted. A zero vector falls back to a safe default so a dash in place still
 * has a direction.
 */
export function dashDirection(dirX: number, dirY: number): Vec2 {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dirX / len, y: dirY / len };
}

/**
 * Compute the hero's FACING direction the dash should use. The dash goes toward
 * where the character is facing (its planar movement direction), not the mouse
 * cursor. Priority:
 *   1. the current move-input direction while the hero is actively moving, else
 *   2. the last non-zero facing the hero held (so a dash while standing still
 *      still goes toward the last faced direction, never backward / nowhere).
 * The result is a UNIT vector via {@link dashDirection}, so it can never invert.
 *
 * @param inputX,inputY raw 8-direction move intent this frame (-1/0/1 each).
 * @param lastX,lastY the last non-zero facing unit vector the hero held.
 */
export function facingDashDirection(
  inputX: number,
  inputY: number,
  lastX: number,
  lastY: number,
): Vec2 {
  if (Math.hypot(inputX, inputY) > 1e-6) return dashDirection(inputX, inputY);
  return dashDirection(lastX, lastY);
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
 * Weak-point (nape) hook decision for the grapple. A grapple ray that strikes a
 * giant "hooks the nape" when the hit point lands within `snapDist` of the
 * giant's live nape/weak-point. When it does, the wire anchors to the nape and
 * the fling is boosted (see {@link napeFlingAccel}); otherwise it is an ordinary
 * body grapple. Kept pure so the decision is unit-tested without a Phaser ray.
 *
 * @param hitX,hitY the world point where the grapple ray struck the giant.
 * @param napeX,napeY the giant's live nape/weak-point world position.
 * @param snapDist how close the hit must be to the nape to count (px, >= 0).
 */
export function isNapeHook(
  hitX: number,
  hitY: number,
  napeX: number,
  napeY: number,
  snapDist: number,
): boolean {
  return distance(hitX, hitY, napeX, napeY) <= snapDist;
}

/**
 * Select the grapple pull acceleration for this frame: the boosted nape pull
 * when the wire is hooked to a weak-point, otherwise the ordinary body pull.
 * Trivial but centralized so GrappleSystem carries no magic numbers and the
 * gating is directly testable.
 *
 * @param base the ordinary PULL_ACCEL.
 * @param boosted the stronger NAPE_PULL_ACCEL.
 * @param napeHooked whether the wire is anchored to the nape.
 */
export function napeFlingAccel(base: number, boosted: number, napeHooked: boolean): number {
  return napeHooked ? boosted : base;
}

/**
 * ODM wall-traversal predicate (FEAT-004, option B). The hero passes OVER/ACROSS
 * the walls while USING the omni-directional mobility gear - that is, while
 * DASHING or while FLINGING/attached on a wire - and is blocked by standing
 * walls only during plain grounded movement. GameScene toggles the single
 * player<->wall Arcade collider off whenever this returns true.
 *
 * Only the hero traverses: giants share no collider with the walls, so this
 * predicate never touches enemy behaviour.
 *
 * @param dashing whether the hero's dash burst window is active.
 * @param swinging whether a grapple wire is attached / flinging the hero.
 */
export function isTraversing(dashing: boolean, swinging: boolean): boolean {
  return dashing || swinging;
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
