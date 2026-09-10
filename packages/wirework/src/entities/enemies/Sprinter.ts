import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { ROLE_BEHAVIOUR } from '../../config/EnemyConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy, type EnemyContext } from './Enemy';

/** Skitter: low-profile rapid assault machine. */
export class Sprinter extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number, rng: RandomSource) {
    super(scene, x, y, EnemyRole.Skitter, rng);
  }

  protected steer(ctx: EnemyContext): void {
    if (this.isHuntingHero(ctx)) {
      this.steerTowardHero(ctx, ROLE_BEHAVIOUR.SKITTER_CHARGE_MULTIPLIER);
      return;
    }
    const target = this.currentTarget(ctx);
    const heading = this.headingTo(target);
    this.setFacing(heading.x, heading.y);
    if (this.inAttackRange(ctx)) { this.body.setVelocity(0, 0); return; }
    const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const multiplier = distance <= ROLE_BEHAVIOUR.SKITTER_CHARGE_RANGE
      ? ROLE_BEHAVIOUR.SKITTER_CHARGE_MULTIPLIER : 1;
    this.body.setVelocity(heading.x * this.stats.moveSpeed * multiplier, heading.y * this.stats.moveSpeed * multiplier);
  }
}
