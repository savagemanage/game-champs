import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { ROLE_BEHAVIOUR } from '../../config/EnemyConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy, type EnemyContext } from './Enemy';

/** Fluxborn: deterministic seeded weave and twitch approach. */
export class Aberrant extends Enemy {
  private phase: number;
  private nextTwitchAt = 0;
  private twitchDir: 1 | -1 = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, rng: RandomSource) {
    super(scene, x, y, EnemyRole.Fluxborn, rng);
    this.phase = rng.next() * Math.PI * 2;
  }

  protected steer(ctx: EnemyContext): void {
    if (this.isHuntingHero(ctx)) { this.steerTowardHero(ctx); return; }
    const target = this.currentTarget(ctx);
    if (this.inAttackRange(ctx)) {
      const heading = this.headingTo(target);
      this.setFacing(heading.x, heading.y);
      this.body.setVelocity(0, 0);
      return;
    }
    this.phase += (ctx.dtMs / 1000) * 5;
    if (ctx.nowMs >= this.nextTwitchAt) {
      this.nextTwitchAt = ctx.nowMs + ROLE_BEHAVIOUR.FLUX_TWITCH_MIN_MS + this.rng.next() * ROLE_BEHAVIOUR.FLUX_TWITCH_SPAN_MS;
      this.twitchDir = this.rng.chance(0.25) ? -1 : 1;
    }
    const heading = this.headingTo(target);
    const wobble = Math.sin(this.phase);
    const forward = 0.6 + 0.4 * Math.abs(wobble);
    const vx = (heading.x * forward - heading.y * wobble * 0.5) * this.stats.moveSpeed * this.twitchDir;
    const vy = (heading.y * forward + heading.x * wobble * 0.5) * this.stats.moveSpeed * this.twitchDir;
    this.body.setVelocity(vx, vy);
    this.setFacing(vx, vy);
  }
}
