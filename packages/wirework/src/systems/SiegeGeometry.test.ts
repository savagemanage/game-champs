import { describe, it, expect } from 'vitest';
import { WALL } from '../config/GameConfig';
import { ARENA } from '../config/PlayerConfig';
import { ENEMY_COMBAT } from '../config/EnemyConfig';
import {
  dashDirection,
  facingDashDirection,
  isFrontalHit,
  isNodeHook,
  isTraversing,
  nodeFlingAccel,
  coolingNodeOffset,
  nearestTargetIndex,
  radialPoint,
  reelStep,
  segmentAngle,
  spawnRadius,
  distance,
  type SegmentLike,
} from './SiegeGeometry';
import { GRAPPLE } from '../config/PlayerConfig';

/**
 * Pure-logic tests for the top-down radial siege geometry (FEAT-002/003), in
 * the existing vitest style (no Phaser runtime). Each assertion would fail if
 * the corresponding fix regressed:
 *  - radial spawn lands OUTSIDE the outer ring at the requested angle
 *  - nearest-target selection honours the outer-then-inner breach order
 *  - dash direction points TOWARD the aim, never inverted (bug 3)
 *  - the 2D cooling node sits behind the heading and the frontal-armor cone only
 *    catches hits from the front (bug: 2D facing must drive cooling node/armor)
 */

describe('radial spawn placement', () => {
  it('places a point on the requested circle around the center', () => {
    const east = radialPoint(ARENA.CENTER_X, ARENA.CENTER_Y, 0, 100);
    expect(east.x).toBeCloseTo(ARENA.CENTER_X + 100, 6);
    expect(east.y).toBeCloseTo(ARENA.CENTER_Y, 6);

    const south = radialPoint(ARENA.CENTER_X, ARENA.CENTER_Y, Math.PI / 2, 100);
    expect(south.x).toBeCloseTo(ARENA.CENTER_X, 6);
    expect(south.y).toBeCloseTo(ARENA.CENTER_Y + 100, 6);
  });

  it('always spawns machines strictly OUTSIDE the outer ring for any jitter', () => {
    for (let i = 0; i <= 20; i++) {
      const jitter01 = i / 20; // sweep the whole [0,1] jitter range
      const r = spawnRadius(WALL.OUTER_RADIUS, jitter01);
      expect(r).toBeGreaterThan(WALL.OUTER_RADIUS);
    }
  });

  it('distributes spawns to all sides (angle drives the point around center)', () => {
    const r = spawnRadius(WALL.OUTER_RADIUS, 0.5);
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const pts = angles.map((a) => radialPoint(ARENA.CENTER_X, ARENA.CENTER_Y, a, r));
    // East is right of center, west is left, north is above, south is below.
    expect(pts[0].x).toBeGreaterThan(ARENA.CENTER_X);
    expect(pts[2].x).toBeLessThan(ARENA.CENTER_X);
    expect(pts[1].y).toBeGreaterThan(ARENA.CENTER_Y);
    expect(pts[3].y).toBeLessThan(ARENA.CENTER_Y);
    // Every spawn is the same distance from center (on the spawn circle).
    for (const p of pts) {
      expect(distance(p.x, p.y, ARENA.CENTER_X, ARENA.CENTER_Y)).toBeCloseTo(r, 4);
    }
  });
});

describe('ring segment layout', () => {
  it('spaces segments evenly and wraps a full turn', () => {
    const count = WALL.OUTER_SEGMENTS;
    expect(segmentAngle(0, count)).toBe(0);
    expect(segmentAngle(count, count)).toBeCloseTo(Math.PI * 2, 6);
    // Adjacent segments are one slice apart.
    const slice = (Math.PI * 2) / count;
    expect(segmentAngle(1, count) - segmentAngle(0, count)).toBeCloseTo(slice, 6);
  });
});

describe('nearest-target selection (outer ring first, then inner)', () => {
  // A tiny 4-segment outer / 4-segment inner ring at cardinal points.
  const makeRing = (radius: number): SegmentLike[] =>
    [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a) => ({
      x: Math.cos(a) * radius,
      y: Math.sin(a) * radius,
      breached: false,
    }));

  it('targets the nearest standing OUTER segment while the outer ring holds', () => {
    const outer = makeRing(360);
    const inner = makeRing(200);
    // A machine to the far east should target the east (index 0) outer segment.
    const t = nearestTargetIndex(1000, 0, outer, inner);
    expect(t.ring).toBe(0);
    expect(t.index).toBe(0);
  });

  it('switches to the INNER ring only once every outer segment is breached', () => {
    const outer = makeRing(360).map((s) => ({ ...s, breached: true }));
    const inner = makeRing(200);
    const t = nearestTargetIndex(1000, 0, outer, inner);
    expect(t.ring).toBe(1);
    expect(t.index).toBe(0); // nearest inner segment is still the east one
  });

  it('advances through the matching breached outer sector to the INNER sector', () => {
    const outer = makeRing(360).map((s, i) => (i === 0 ? { ...s, breached: true } : s));
    const inner = makeRing(200);
    const t = nearestTargetIndex(1000, 0, outer, inner);
    expect(t.ring).toBe(1);
    expect(t.index).toBe(0);
  });

  it('reports index -1 when the active ring has no standing segments', () => {
    const outer = makeRing(360).map((s) => ({ ...s, breached: true }));
    const inner = makeRing(200).map((s) => ({ ...s, breached: true }));
    const t = nearestTargetIndex(0, 0, outer, inner);
    expect(t.index).toBe(-1);
  });
});

describe('dash direction (fix: Shift dash goes toward aim, never backward)', () => {
  it('returns a unit vector pointing toward the aim', () => {
    const d = dashDirection(3, 4);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d.x).toBeCloseTo(0.6, 6);
    expect(d.y).toBeCloseTo(0.8, 6);
  });

  it('never inverts: the dash points the SAME way as the aim on every axis', () => {
    const aims = [
      { x: 10, y: 0 },
      { x: -10, y: 0 },
      { x: 0, y: 7 },
      { x: 0, y: -7 },
      { x: -5, y: 12 },
    ];
    for (const a of aims) {
      const d = dashDirection(a.x, a.y);
      // Dot product with the aim must be positive: same hemisphere, not flipped.
      expect(d.x * a.x + d.y * a.y).toBeGreaterThan(0);
      expect(Math.sign(d.x)).toBe(Math.sign(a.x) || Math.sign(d.x));
      expect(Math.sign(d.y)).toBe(Math.sign(a.y) || Math.sign(d.y));
    }
  });

  it('falls back to a valid unit direction for a zero aim', () => {
    const d = dashDirection(0, 0);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
  });
});

describe('facing dash direction (dash goes where the CHARACTER faces, not the cursor)', () => {
  it('uses the current move-input direction while the hero is moving', () => {
    // Moving right+down; last facing was left - the LIVE input must win.
    const d = facingDashDirection(1, 1, -1, 0);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d.x).toBeGreaterThan(0);
    expect(d.y).toBeGreaterThan(0);
  });

  it('falls back to the last-held facing when standing still (never nowhere)', () => {
    // No input this frame; last facing pointed up (-y). Dash must go up.
    const d = facingDashDirection(0, 0, 0, -1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(-1, 6);
  });

  it('never dashes backward: the result matches the facing hemisphere', () => {
    // Idle, last facing left+up: the dash must point left+up too, not inverted.
    const d = facingDashDirection(0, 0, -1, -1);
    expect(d.x).toBeLessThan(0);
    expect(d.y).toBeLessThan(0);
  });

  it('always yields a unit direction even if both input and facing are zero', () => {
    const d = facingDashDirection(0, 0, 0, 0);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
  });
});

describe('2D cooling node offset (weak point sits behind the machine heading)', () => {
  it('offsets opposite the facing heading so the cooling node is on the BACK', () => {
    // Facing east -> cooling node offset points west (negative x).
    const east = coolingNodeOffset(1, 0, 18);
    expect(east.x).toBeLessThan(0);
    // Facing west -> cooling node offset points east (positive x). cooling node tracks the heading.
    const west = coolingNodeOffset(-1, 0, 18);
    expect(west.x).toBeGreaterThan(0);
    // The horizontal component mirrors when the heading flips.
    expect(east.x).toBeCloseTo(-west.x, 6);
  });

  it('keeps the cooling node high on the body (above the origin)', () => {
    const off = coolingNodeOffset(0, 1, 18);
    expect(off.y).toBeLessThan(0);
  });
});

describe('2D frontal-armor cone (fix: armor uses full facing vector)', () => {
  const cone = ENEMY_COMBAT.FRONTAL_CONE_DEG;

  it('counts a hit from directly in front as frontal', () => {
    // Facing east, hit comes from the east (in front).
    expect(isFrontalHit(1, 0, 1, 0, cone)).toBe(true);
  });

  it('lets a hit from directly behind BYPASS the plate', () => {
    // Facing east, hit lands from the west (behind).
    expect(isFrontalHit(1, 0, -1, 0, cone)).toBe(false);
  });

  it('lets a flank hit (outside the cone) bypass the plate', () => {
    // Facing east, hit from due south is 90deg off > 70deg half-cone.
    expect(isFrontalHit(1, 0, 0, 1, cone)).toBe(false);
  });

  it('respects the cone on a diagonal heading (not just horizontal sign)', () => {
    // Facing north-east; a hit coming from the north-east is frontal...
    expect(isFrontalHit(0.7071, -0.7071, 0.7071, -0.7071, cone)).toBe(true);
    // ...while a hit from the south-west (behind that heading) is not.
    expect(isFrontalHit(0.7071, -0.7071, -0.7071, 0.7071, cone)).toBe(false);
  });
});

describe('weak-point (cooling node) grapple hook decision (FEAT-003)', () => {
  const snap = GRAPPLE.NODE_ANCHOR_SNAP_DIST;

  it('counts a hit landing ON the cooling node as a weak-point hook', () => {
    expect(isNodeHook(100, 100, 100, 100, snap)).toBe(true);
  });

  it('counts a hit within the snap distance of the cooling node as a weak-point hook', () => {
    // Just inside the snap radius (0.9x) -> still hooks the cooling node.
    expect(isNodeHook(100 + snap * 0.9, 100, 100, 100, snap)).toBe(true);
  });

  it('treats a hit on the body edge (beyond the snap distance) as an ordinary grapple', () => {
    // Well outside the snap radius (2x) -> body grapple, not a cooling node hook.
    expect(isNodeHook(100 + snap * 2, 100, 100, 100, snap)).toBe(false);
  });

  it('is inclusive exactly at the snap distance boundary', () => {
    expect(isNodeHook(100 + snap, 100, 100, 100, snap)).toBe(true);
    expect(isNodeHook(100 + snap + 0.001, 100, 100, 100, snap)).toBe(false);
  });

  it('returns the boosted fling accel ONLY when the wire is cooling node-hooked', () => {
    const base = GRAPPLE.PULL_ACCEL;
    const boosted = GRAPPLE.NODE_PULL_ACCEL;
    expect(nodeFlingAccel(base, boosted, true)).toBe(boosted);
    expect(nodeFlingAccel(base, boosted, false)).toBe(base);
    // The boosted pull is genuinely stronger so the hero is flung, not reeled.
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('Charge-tether wall traversal predicate (FEAT-004: guardian crosses walls while traversing)', () => {
  it('traverses (collider disabled) while DASHING', () => {
    expect(isTraversing(true, false)).toBe(true);
  });

  it('traverses (collider disabled) while FLINGING/attached on a wire', () => {
    expect(isTraversing(false, true)).toBe(true);
  });

  it('traverses while both dashing AND swinging at once', () => {
    expect(isTraversing(true, true)).toBe(true);
  });

  it('is BLOCKED (collider enabled) during plain grounded movement', () => {
    expect(isTraversing(false, false)).toBe(false);
  });
});

describe('manual reel HAULS the hero along the wire (fix: Q/E now visibly move the hero)', () => {
  // Anchor at origin; hero 200px to the right along +x.
  const anchor = { x: 0, y: 0 };
  const hero = { x: 200, y: 0 };

  it('reel-IN moves the hero TOWARD the anchor by speed*dt and tightens the rope', () => {
    const r = reelStep(hero.x, hero.y, anchor.x, anchor.y, true, 190, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    // 200 - 190*1 = 10, but clamped up to MIN_LENGTH.
    expect(r.ropeLength).toBeCloseTo(Math.max(GRAPPLE.MIN_LENGTH, 10));
    // Hero stays on the +x ray, now closer to the anchor.
    expect(r.y).toBeCloseTo(0);
    expect(r.x).toBeLessThan(hero.x);
    expect(r.x).toBeCloseTo(r.ropeLength);
  });

  it('reel-IN over a small step visibly closes distance without overshooting the anchor', () => {
    const r = reelStep(hero.x, hero.y, anchor.x, anchor.y, true, 50, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    expect(r.x).toBeCloseTo(150); // 200 - 50
    expect(r.ropeLength).toBeCloseTo(150);
  });

  it('reel-OUT feeds line so the hero drifts WIDER from the anchor', () => {
    const r = reelStep(hero.x, hero.y, anchor.x, anchor.y, false, 160, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    expect(r.x).toBeCloseTo(360); // 200 + 160
    expect(r.ropeLength).toBeCloseTo(360);
    expect(r.x).toBeGreaterThan(hero.x);
  });

  it('reel-IN never pulls the hero past the anchor (clamped to MIN_LENGTH)', () => {
    const r = reelStep(30, 0, 0, 0, true, 190, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    expect(r.ropeLength).toBeCloseTo(GRAPPLE.MIN_LENGTH);
    expect(r.x).toBeGreaterThanOrEqual(0);
  });

  it('reel-OUT never exceeds the (now huge) MAX_LENGTH', () => {
    const r = reelStep(GRAPPLE.MAX_LENGTH - 10, 0, 0, 0, false, 160, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    expect(r.ropeLength).toBeCloseTo(GRAPPLE.MAX_LENGTH);
  });

  it('preserves the direction from the anchor on a diagonal wire', () => {
    // Hero at (100,100) -> distance ~141.42 along the 45-degree ray.
    const r = reelStep(100, 100, 0, 0, true, 41.42, 1, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
    expect(r.x).toBeCloseTo(r.y); // still on the 45-degree ray
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(r.ropeLength);
    expect(r.ropeLength).toBeLessThan(Math.hypot(100, 100));
  });
});

describe('grapple reach is effectively infinite (사거리 무한)', () => {
  it('RANGE and MAX_LENGTH comfortably exceed the arena diagonal', () => {
    const diagonal = Math.hypot(ARENA.WIDTH, ARENA.HEIGHT);
    expect(GRAPPLE.RANGE).toBeGreaterThan(diagonal);
    expect(GRAPPLE.MAX_LENGTH).toBeGreaterThan(diagonal);
    expect(GRAPPLE.RANGE).toBe(GRAPPLE.MAX_LENGTH);
  });
});
