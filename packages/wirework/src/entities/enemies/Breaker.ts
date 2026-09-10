import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy, type EnemyContext } from './Enemy';

/** Rammer: heavy wall-first siege engine. */
export class Breaker extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number, rng: RandomSource) {
    super(scene, x, y, EnemyRole.Rammer, rng);
  }

  protected steer(ctx: EnemyContext): void {
    if (this.isHuntingHero(ctx)) { this.steerTowardHero(ctx); return; }
    const target = this.currentTarget(ctx);
    const heading = this.headingTo(target);
    this.setFacing(heading.x, heading.y);
    if (this.inAttackRange(ctx)) this.body.setVelocity(0, 0);
    else this.body.setVelocity(heading.x * this.stats.moveSpeed, heading.y * this.stats.moveSpeed);
  }
}
