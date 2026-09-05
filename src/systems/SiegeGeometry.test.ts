import { describe, it, expect } from 'vitest';
import { WALL } from '../config/GameConfig';
import { ARENA } from '../config/PlayerConfig';
import { ENEMY_COMBAT } from '../config/EnemyConfig';
import {
  dashDirection,
  facingDashDirection,
  isFrontalHit,
  isNapeHook,
  isTraversing,
  napeFlingAccel,
  napeOffset,
  nearestTargetIndex,
  radialPoint,
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
 *  - the 2D nape sits behind the heading and the frontal-armor cone only
 *    catches hits from the front (bug: 2D facing must drive nape/armor)
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

  it('always spawns giants strictly OUTSIDE the outer ring for any jitter', () => {
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
    // A giant to the far east should target the east (index 0) outer segment.
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

  it('skips breached segments and picks the next nearest standing one', () => {
    const outer = makeRing(360).map((s, i) => (i === 0 ? { ...s, breached: true } : s));
    const inner = makeRing(200);
    const t = nearestTargetIndex(1000, 0, outer, inner);
    expect(t.ring).toBe(0);
    expect(t.index).not.toBe(0);
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

describe('2D nape offset (weak point sits behind the giant heading)', () => {
  it('offsets opposite the facing heading so the nape is on the BACK', () => {
    // Facing east -> nape offset points west (negative x).
    const east = napeOffset(1, 0, 100, -6, 1);
    expect(east.x).toBeLessThan(0);
    // Facing west -> nape offset points east (positive x). Nape swings with heading.
    const west = napeOffset(-1, 0, 100, -6, 1);
    expect(west.x).toBeGreaterThan(0);
    // The horizontal component mirrors when the heading flips.
    expect(east.x).toBeCloseTo(-west.x, 6);
  });

  it('keeps the nape high on the body (above the origin)', () => {
    const off = napeOffset(0, 1, 100, -6, 1);
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

describe('weak-point (nape) grapple hook decision (FEAT-003)', () => {
  const snap = GRAPPLE.NAPE_ANCHOR_SNAP_DIST;

  it('counts a hit landing ON the nape as a weak-point hook', () => {
    expect(isNapeHook(100, 100, 100, 100, snap)).toBe(true);
  });

  it('counts a hit within the snap distance of the nape as a weak-point hook', () => {
    // Just inside the snap radius (0.9x) -> still hooks the nape.
    expect(isNapeHook(100 + snap * 0.9, 100, 100, 100, snap)).toBe(true);
  });

  it('treats a hit on the body edge (beyond the snap distance) as an ordinary grapple', () => {
    // Well outside the snap radius (2x) -> body grapple, not a nape hook.
    expect(isNapeHook(100 + snap * 2, 100, 100, 100, snap)).toBe(false);
  });

  it('is inclusive exactly at the snap distance boundary', () => {
    expect(isNapeHook(100 + snap, 100, 100, 100, snap)).toBe(true);
    expect(isNapeHook(100 + snap + 0.001, 100, 100, 100, snap)).toBe(false);
  });

  it('returns the boosted fling accel ONLY when the wire is nape-hooked', () => {
    const base = GRAPPLE.PULL_ACCEL;
    const boosted = GRAPPLE.NAPE_PULL_ACCEL;
    expect(napeFlingAccel(base, boosted, true)).toBe(boosted);
    expect(napeFlingAccel(base, boosted, false)).toBe(base);
    // The boosted pull is genuinely stronger so the hero is flung, not reeled.
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('ODM wall traversal predicate (FEAT-004: hero crosses walls while using ODM)', () => {
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
