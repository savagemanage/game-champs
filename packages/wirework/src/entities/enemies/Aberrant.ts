import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy, type EnemyContext } from './Enemy';

/**
 * Aberrant - erratic and unpredictable. It broadly trends toward the wall but
 * "ignores normal pathing": it weaves with a wandering sine offset, makes
 * sudden bursts, and occasionally back-steps, making it hard to line up a clean
 * nape hit. Its facing can lag its true heading, so its exposed nape swings
 * around unexpectedly.
 */
export class Aberrant extends Enemy {
  private phase = Math.random() * Math.PI * 2;
  private nextTwitchAt = 0;
  private twitchDir: 1 | -1 = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Aberrant);
    this.napeLocalY = -7;
  }

  protected steer(ctx: EnemyContext): void {
    // Erratic and twitchy: readily pounces at a nearby hero (high aggression).
    if (this.isHuntingHero(ctx)) {
      this.steerTowardHero(ctx);
      return;
    }

    const target = this.currentTarget(ctx);
    if (this.inAttackRange(ctx)) {
      const hh = this.headingTo(target);
      this.setFacing(hh.x, hh.y);
      this.body.setVelocity(0, 0);
      return;
    }

    // Base heading toward the nearest ring target, but jittered by a wandering
    // oscillation and periodic twitches so movement reads as unpredictable
    // rather than a march. The wobble is applied perpendicular to the heading.
    this.phase += (ctx.dtMs / 1000) * 5;
    if (ctx.nowMs >= this.nextTwitchAt) {
      this.nextTwitchAt = ctx.nowMs + 300 + Math.random() * 500;
      // Occasionally lurch away from the target before resuming.
      this.twitchDir = Math.random() < 0.25 ? -1 : 1;
    }

    const h = this.headingTo(target);
    const wobble = Math.sin(this.phase); // [-1..1]
    const speed = this.stats.moveSpeed;
    // Perpendicular to the heading, for a weaving 2D gait.
    const perpX = -h.y;
    const perpY = h.x;
    const forward = 0.6 + 0.4 * Math.abs(wobble);
    const vx = (h.x * forward + perpX * wobble * 0.5) * speed * this.twitchDir;
    const vy = (h.y * forward + perpY * wobble * 0.5) * speed * this.twitchDir;
    this.body.setVelocity(vx, vy);
    // Facing follows the actual (jittered) velocity, so its exposed nape angle
    // swings around unpredictably - the intended read for this role.
    this.setFacing(vx, vy);
  }
}
