import Phaser from 'phaser';
import { PALETTE, WALL } from '../config/GameConfig';
import { ARENA } from '../config/PlayerConfig';
import type { GrappleSurface } from '../systems/GrappleSystem';

/** Which concentric ring a segment belongs to. */
export const enum RingId {
  Outer = 0,
  Inner = 1,
}

/** A single breachable arc segment of a ring. */
interface Segment {
  readonly ring: RingId;
  /** Center angle of the segment, radians. */
  readonly angle: number;
  /** World position of the segment's midpoint (on the ring circle). */
  readonly x: number;
  readonly y: number;
  hp: number;
  readonly maxHp: number;
  breached: boolean;
  /** The rendered rampart block for this segment. */
  readonly rect: Phaser.GameObjects.Rectangle;
}

/** The nearest attackable target a besieging giant should path toward. */
export interface RingTarget {
  /** World point to advance on / attack. */
  readonly x: number;
  readonly y: number;
  /** Which ring the target segment belongs to. */
  readonly ring: RingId;
  /** Index of the segment within its ring (for {@link Wall.damageSegment}). */
  readonly index: number;
}

/**
 * Wall - the defendable settlement's CONCENTRIC DOUBLE RING fortification.
 *
 * Two rings guard the citizen core at the arena center: an OUTER ring the
 * giants reach first and an INNER ring behind it. Each ring is split into
 * breachable arc SEGMENTS with their own HP; a segment whose HP hits zero is
 * BREACHED (it collapses visually and no longer blocks). When every segment of
 * the inner ring is breached the core is exposed - a lose condition surfaced to
 * the scene via {@link isInnerBreached}.
 *
 * The class keeps the original "rampart" pixel look (PALETTE.WALL /
 * WALL_DARK). Giants target the nearest un-breached segment via
 * {@link nearestTarget} and chip it with {@link damageSegment}; the scene tests
 * the citizen safe zone with {@link isInsideInner} and provides grapple anchor
 * surfaces from {@link grappleSurfaces}.
 */
export class Wall {
  private readonly scene: Phaser.Scene;
  private readonly cx = ARENA.CENTER_X;
  private readonly cy = ARENA.CENTER_Y;

  /** Segments grouped by ring. */
  private readonly outer: Segment[] = [];
  private readonly inner: Segment[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildRing(RingId.Outer, WALL.OUTER_RADIUS, WALL.OUTER_SEGMENTS, WALL.OUTER_SEGMENT_HP);
    this.buildRing(RingId.Inner, WALL.INNER_RADIUS, WALL.INNER_SEGMENTS, WALL.INNER_SEGMENT_HP);
  }

  /** Lay out one ring as `count` rampart blocks evenly spaced on its circle. */
  private buildRing(ring: RingId, radius: number, count: number, hp: number): void {
    const list = ring === RingId.Outer ? this.outer : this.inner;
    // Arc length each segment must span so neighbours meet, plus the radial band.
    const arc = (2 * Math.PI * radius) / count;
    const segLen = arc * 1.02;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = this.cx + Math.cos(angle) * radius;
      const y = this.cy + Math.sin(angle) * radius;
      const rect = this.scene.add
        .rectangle(x, y, segLen, WALL.RING_THICKNESS, PALETTE.WALL)
        .setOrigin(0.5, 0.5)
        .setDepth(1);
      rect.setStrokeStyle(1, PALETTE.WALL_DARK);
      // Orient the block tangent to the ring so it reads as an arc.
      rect.setRotation(angle + Math.PI / 2);
      const staticBody = this.scene.physics.add.existing(rect, true);
      void staticBody;
      list.push({ ring, angle, x, y, hp, maxHp: hp, breached: false, rect });
    }
  }

  private ringList(ring: RingId): Segment[] {
    return ring === RingId.Outer ? this.outer : this.inner;
  }

  /** Aggregate integrity ratio of a ring [0..1] (sum of segment HP). */
  ringRatio(ring: RingId): number {
    const list = this.ringList(ring);
    let hp = 0;
    let max = 0;
    for (const s of list) {
      hp += s.hp;
      max += s.maxHp;
    }
    return max > 0 ? hp / max : 0;
  }

  /** Outer ring integrity ratio [0..1]. */
  get outerRatio(): number {
    return this.ringRatio(RingId.Outer);
  }

  /** Inner ring integrity ratio [0..1]. */
  get innerRatio(): number {
    return this.ringRatio(RingId.Inner);
  }

  /** Combined integrity ratio across both rings [0..1] (for a single gauge). */
  get ratio(): number {
    return (this.outerRatio + this.innerRatio) / 2;
  }

  /** True once every segment of a ring is breached. */
  isRingBreached(ring: RingId): boolean {
    return this.ringList(ring).every((s) => s.breached);
  }

  /** True once the OUTER ring is fully breached (giants can reach the inner). */
  get isOuterBreached(): boolean {
    return this.isRingBreached(RingId.Outer);
  }

  /** True once the INNER ring is fully breached (the core is exposed - lose). */
  get isInnerBreached(): boolean {
    return this.isRingBreached(RingId.Inner);
  }

  /**
   * True if a world point is inside the INNER ring circle - the citizen safe
   * zone. Citizens spawn/wander here; a giant is "at the core" once it crosses
   * in past a breach.
   */
  isInsideInner(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, this.cx, this.cy) < WALL.INNER_RADIUS;
  }

  /**
   * Find the nearest un-breached segment a giant at (x, y) should attack. Giants
   * assault the OUTER ring first; once it is fully breached they switch to the
   * INNER ring. Returns null when both rings are down (the scene then routes the
   * giant at the citizens). This is the ring-targeting API FEAT-003's radial AI
   * builds on.
   */
  nearestTarget(x: number, y: number): RingTarget | null {
    const ring = this.isOuterBreached ? RingId.Inner : RingId.Outer;
    const list = this.ringList(ring);
    let best: RingTarget | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.breached) continue;
      const d = Phaser.Math.Distance.Between(x, y, s.x, s.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: s.x, y: s.y, ring, index: i };
      }
    }
    return best;
  }

  /**
   * Apply damage to a specific segment (as returned by {@link nearestTarget}).
   * Returns true if this hit breached that segment. Once breached, further
   * damage is ignored.
   */
  damageSegment(ring: RingId, index: number, amount: number): boolean {
    const list = this.ringList(ring);
    const seg = list[index];
    if (!seg || seg.breached) return false;
    seg.hp = Math.max(0, seg.hp - amount);
    this.refreshSegment(seg);
    this.scene.cameras.main.shake(90, Math.min(0.008, amount * 0.0003));
    if (seg.hp <= 0) {
      this.breachSegment(seg);
      return true;
    }
    return false;
  }

  /**
   * Convenience: damage the nearest attackable segment to a world point.
   * Returns true if that hit breached the segment. Used when an attacker only
   * knows a world position (e.g. a melee giant at its own position).
   */
  damageNearest(x: number, y: number, amount: number): boolean {
    const target = this.nearestTarget(x, y);
    if (!target) return false;
    return this.damageSegment(target.ring, target.index, amount);
  }

  /**
   * Result of a projectile-style contact test against the rings.
   * `hit` = a standing segment was in contact; `breached` = that hit dropped it.
   */
  hitNearestIfClose(x: number, y: number, amount: number): { hit: boolean; breached: boolean } {
    const target = this.nearestTarget(x, y);
    if (!target) return { hit: false, breached: false };
    const contact = WALL.RING_THICKNESS * 1.5;
    if (Phaser.Math.Distance.Between(x, y, target.x, target.y) > contact) {
      return { hit: false, breached: false };
    }
    const breached = this.damageSegment(target.ring, target.index, amount);
    return { hit: true, breached };
  }

  /** Fade a segment toward its dark tone as its HP drops. */
  private refreshSegment(seg: Segment): void {
    const t = 1 - (seg.maxHp > 0 ? seg.hp / seg.maxHp : 0);
    seg.rect.fillColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(PALETTE.WALL),
      Phaser.Display.Color.IntegerToColor(PALETTE.WALL_DARK),
      100,
      Math.floor(t * 100),
    ).color;
  }

  /** Collapse a breached segment: disable its collider and fade it out. */
  private breachSegment(seg: Segment): void {
    seg.breached = true;
    const staticBody = seg.rect.body as Phaser.Physics.Arcade.StaticBody | null;
    if (staticBody) staticBody.enable = false;
    this.scene.tweens.add({
      targets: seg.rect,
      alpha: 0.15,
      scaleX: 0.3,
      duration: 300,
      ease: 'Quad.easeIn',
    });
  }

  /**
   * Static colliders for the un-breached ring blocks so the hero (and giants)
   * bump into standing walls. Breached segments have their bodies disabled.
   */
  get colliders(): Phaser.GameObjects.Rectangle[] {
    return [...this.outer, ...this.inner].map((s) => s.rect);
  }

  /**
   * Grapple-attachable surfaces approximating the two rings. Each un-breached
   * segment contributes a small AABB the wire can anchor to, so the hero can
   * fire at any point on either ring and fling around the arena.
   */
  get grappleSurfaces(): GrappleSurface[] {
    const surfaces: GrappleSurface[] = [];
    for (const s of [...this.outer, ...this.inner]) {
      if (s.breached) continue;
      const half = WALL.RING_THICKNESS;
      surfaces.push({
        bounds: new Phaser.Geom.Rectangle(s.x - half, s.y - half, half * 2, half * 2),
      });
    }
    return surfaces;
  }
}
