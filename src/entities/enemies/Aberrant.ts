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
    if (this.inAttackRange(ctx)) {
      this.setMarchDir(ctx.wallX >= this.x ? 1 : -1);
      this.body.setVelocityX(0);
      return;
    }

    // Base heading toward the wall, but jittered by a wandering oscillation and
    // periodic twitches so movement reads as unpredictable rather than a march.
    this.phase += (ctx.dtMs / 1000) * 5;
    if (ctx.nowMs >= this.nextTwitchAt) {
      this.nextTwitchAt = ctx.nowMs + 300 + Math.random() * 500;
      // Occasionally lurch away from the wall before resuming.
      this.twitchDir = Math.random() < 0.25 ? -1 : 1;
    }

    const toWall: 1 | -1 = ctx.wallX >= this.x ? 1 : -1;
    const wobble = Math.sin(this.phase); // [-1..1]
    const speed = this.stats.moveSpeed;
    const vx = toWall * this.twitchDir * speed * (0.6 + 0.4 * Math.abs(wobble));
    this.body.setVelocityX(vx);
    // Vertical bob within a small band above the ground for a lurching gait.
    this.setMarchDir(vx >= 0 ? 1 : -1);
    this.y = ctx.groundY - Math.abs(Math.sin(this.phase * 0.5)) * 4;
  }
}
