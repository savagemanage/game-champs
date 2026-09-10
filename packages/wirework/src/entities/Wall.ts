import Phaser from 'phaser';
import { PALETTE, WALL } from '../config/GameConfig';
import { ARENA, MOVEMENT } from '../config/PlayerConfig';
import { radialPoint, sectorTargetIndex, segmentAngle, slashIntersectsAabb, type Aabb } from '../systems/SiegeGeometry';
import type { GrappleSurface } from '../systems/GrappleSystem';

export const enum RingId { Outer = 0, Inner = 1 }
interface Segment {
  readonly ring: RingId;
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  readonly length: number;
  hp: number;
  readonly maxHp: number;
  breached: boolean;
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly cracks: Phaser.GameObjects.Graphics;
}
export interface RingTarget { readonly x: number; readonly y: number; readonly ring: RingId; readonly index: number }

/** Two independent angular defense rings. */
export class Wall {
  private readonly outer: Segment[] = [];
  private readonly inner: Segment[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.buildRing(RingId.Outer, WALL.OUTER_RADIUS, WALL.OUTER_SEGMENTS, WALL.OUTER_SEGMENT_HP);
    this.buildRing(RingId.Inner, WALL.INNER_RADIUS, WALL.INNER_SEGMENTS, WALL.INNER_SEGMENT_HP);
  }

  private buildRing(ring: RingId, radius: number, count: number, hp: number): void {
    const list = this.ringList(ring);
    const length = ((2 * Math.PI * radius) / count) * 1.02;
    for (let index = 0; index < count; index += 1) {
      const angle = segmentAngle(index, count);
      const point = radialPoint(ARENA.CENTER_X, ARENA.CENTER_Y, angle, radius);
      const rect = this.scene.add.rectangle(point.x, point.y, length, WALL.RING_THICKNESS, PALETTE.WALL)
        .setOrigin(0.5).setDepth(1).setRotation(angle + Math.PI / 2);
      rect.setStrokeStyle(1, PALETTE.WALL_DARK);
      this.scene.physics.add.existing(rect, true);
      const cracks = this.scene.add.graphics().setDepth(2);
      list.push({ ring, angle, x: point.x, y: point.y, length, hp, maxHp: hp, breached: false, rect, cracks });
    }
  }

  private ringList(ring: RingId): Segment[] { return ring === RingId.Outer ? this.outer : this.inner; }

  ringRatio(ring: RingId): number {
    const list = this.ringList(ring);
    return list.reduce((sum, segment) => sum + segment.hp, 0) /
      list.reduce((sum, segment) => sum + segment.maxHp, 0);
  }
  get outerRatio(): number { return this.ringRatio(RingId.Outer); }
  get innerRatio(): number { return this.ringRatio(RingId.Inner); }
  get outerBreaches(): readonly boolean[] { return this.outer.map((segment) => segment.breached); }
  get innerBreaches(): readonly boolean[] { return this.inner.map((segment) => segment.breached); }
  isRingBreached(ring: RingId): boolean { return this.ringList(ring).every((segment) => segment.breached); }
  get isInnerBreached(): boolean { return this.isRingBreached(RingId.Inner); }

  isInsideInner(x: number, y: number): boolean {
    return Math.hypot(x - ARENA.CENTER_X, y - ARENA.CENTER_Y) < WALL.INNER_RADIUS;
  }

  nearestTarget(x: number, y: number): RingTarget | null {
    const target = sectorTargetIndex(x, y, ARENA.CENTER_X, ARENA.CENTER_Y, this.outer, this.inner);
    if (target.index < 0) return null;
    const list = this.ringList(target.ring === 0 ? RingId.Outer : RingId.Inner);
    const segment = list[target.index];
    return { x: segment.x, y: segment.y, ring: segment.ring, index: target.index };
  }

  /** True only when this point's corresponding outer and inner sectors are open. */
  hasOpenPath(x: number, y: number): boolean { return this.nearestTarget(x, y) === null; }

  isSegmentStanding(ring: RingId, index: number): boolean {
    const segment = this.ringList(ring)[index];
    return Boolean(segment && !segment.breached);
  }

  damageSegment(ring: RingId, index: number, amount: number): boolean {
    const segment = this.ringList(ring)[index];
    if (!segment || segment.breached) return false;
    segment.hp = Math.max(0, segment.hp - Math.max(0, Math.round(amount)));
    this.refreshSegment(segment);
    if (segment.hp === 0) { this.breachSegment(segment); return true; }
    return false;
  }

  damageNearest(x: number, y: number, amount: number): boolean {
    const target = this.nearestTarget(x, y);
    return target ? this.damageSegment(target.ring, target.index, amount) : false;
  }

  hitNearestIfClose(x: number, y: number, amount: number): { hit: boolean; breached: boolean } {
    const target = this.nearestTarget(x, y);
    if (!target || Math.hypot(x - target.x, y - target.y) > WALL.RING_THICKNESS * 1.5) {
      return { hit: false, breached: false };
    }
    return { hit: true, breached: this.damageSegment(target.ring, target.index, amount) };
  }

  private refreshSegment(segment: Segment): void {
    const ratio = segment.hp / segment.maxHp;
    segment.rect.fillColor = ratio <= WALL.SEVERE_CRACK_RATIO ? PALETTE.WALL_DARK : PALETTE.WALL;
    segment.cracks.clear();
    if (ratio > WALL.CRACKED_RATIO) return;
    const severe = ratio <= WALL.SEVERE_CRACK_RATIO;
    segment.cracks.lineStyle(severe ? 3 : 2, 0x171d22, 1);
    const tangentX = -Math.sin(segment.angle);
    const tangentY = Math.cos(segment.angle);
    const radialX = Math.cos(segment.angle);
    const radialY = Math.sin(segment.angle);
    segment.cracks.beginPath();
    segment.cracks.moveTo(segment.x - tangentX * 8 - radialX * 4, segment.y - tangentY * 8 - radialY * 4);
    segment.cracks.lineTo(segment.x, segment.y);
    segment.cracks.lineTo(segment.x + tangentX * 8 + radialX * 4, segment.y + tangentY * 8 + radialY * 4);
    if (severe) {
      segment.cracks.moveTo(segment.x, segment.y);
      segment.cracks.lineTo(segment.x - tangentX * 7 + radialX * 7, segment.y - tangentY * 7 + radialY * 7);
    }
    segment.cracks.strokePath();
  }

  private breachSegment(segment: Segment): void {
    segment.breached = true;
    const body = segment.rect.body as Phaser.Physics.Arcade.StaticBody | null;
    if (body) body.enable = false;
    segment.cracks.clear();
    const reducedMotion = typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'on';
    if (reducedMotion) segment.rect.setAlpha(0.15).setScale(0.3, 1);
    else this.scene.tweens.add({ targets: segment.rect, alpha: 0.15, scaleX: 0.3, duration: 300 });
  }

  get colliders(): Phaser.GameObjects.Rectangle[] { return [...this.outer, ...this.inner].map((segment) => segment.rect); }

  private segmentAabb(segment: Segment): Aabb {
    const half = WALL.GRAPPLE_AABB_SIZE / 2;
    return { left: segment.x - half, top: segment.y - half, right: segment.x + half, bottom: segment.y + half };
  }

  get grappleSurfaces(): GrappleSurface[] {
    return [...this.outer, ...this.inner].map((segment, insertionOrder) => {
      const aabb = this.segmentAabb(segment);
      return {
        insertionOrder,
        bounds: new Phaser.Geom.Rectangle(aabb.left, aabb.top, WALL.GRAPPLE_AABB_SIZE, WALL.GRAPPLE_AABB_SIZE),
        get isValid() { return !segment.breached && segment.rect.active; },
      };
    }).filter((surface) => surface.isValid);
  }

  private overlapsStandingSegment(x: number, y: number): boolean {
    const hero: Aabb = {
      left: x - MOVEMENT.BODY_WIDTH / 2,
      top: y - MOVEMENT.BODY_HEIGHT / 2,
      right: x + MOVEMENT.BODY_WIDTH / 2,
      bottom: y + MOVEMENT.BODY_HEIGHT / 2,
    };
    return [...this.outer, ...this.inner].some((segment) => {
      if (segment.breached) return false;
      const tangentX = -Math.sin(segment.angle);
      const tangentY = Math.cos(segment.angle);
      return slashIntersectsAabb({
        originX: segment.x - tangentX * segment.length / 2,
        originY: segment.y - tangentY * segment.length / 2,
        forwardX: tangentX,
        forwardY: tangentY,
        reach: segment.length,
        halfWidth: WALL.RING_THICKNESS / 2,
      }, hero);
    });
  }

  /** Resolve only a traversal endpoint lodged in an authoritative oriented wall segment. */
  resolveTraversalEndpoint(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): { x: number; y: number; blocked: boolean; blockedX: boolean; blockedY: boolean } {
    if (!this.overlapsStandingSegment(endX, endY)) {
      return { x: endX, y: endY, blocked: false, blockedX: false, blockedY: false };
    }
    const dx = endX - startX;
    const dy = endY - startY;
    if (this.overlapsStandingSegment(startX, startY)) {
      return { x: startX, y: startY, blocked: true, blockedX: dx !== 0, blockedY: dy !== 0 };
    }

    let validT = 0;
    let invalidT = 1;
    const searchSteps = 256;
    for (let step = 1; step <= searchSteps; step += 1) {
      const candidateT = 1 - step / searchSteps;
      if (!this.overlapsStandingSegment(startX + dx * candidateT, startY + dy * candidateT)) {
        validT = candidateT;
        break;
      }
      invalidT = candidateT;
    }
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const candidateT = (validT + invalidT) / 2;
      if (this.overlapsStandingSegment(startX + dx * candidateT, startY + dy * candidateT)) invalidT = candidateT;
      else validT = candidateT;
    }
    return {
      x: startX + dx * validT,
      y: startY + dy * validT,
      blocked: true,
      blockedX: dx !== 0,
      blockedY: dy !== 0,
    };
  }
}
