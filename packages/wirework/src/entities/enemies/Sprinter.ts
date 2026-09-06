import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy, type EnemyContext } from './Enemy';

/**
 * Sprinter - small, fast, quadrupedal charger. Accelerates from its base speed
 * into a faster charge once it has closed most of the distance to the wall,
 * reaching the defenses quickly and pressuring the player to intercept early.
 * Low HP: a glass cannon that punishes being ignored.
 */
export class Sprinter extends Enemy {
  /** Extra speed multiplier applied during the final charge to the wall. */
  private static readonly CHARGE_MULT = 1.6;
  /** Distance from the wall at which the charge kicks in, px. */
  private static readonly CHARGE_RANGE = 360;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Sprinter);
    this.napeLocalY = -5;
  }

  protected steer(ctx: EnemyContext): void {
    // Most likely of the roles to break off and CHARGE the hero when near.
    if (this.isHuntingHero(ctx)) {
      // The charge multiplier is a movement PATTERN (applied to displacement),
      // never a mutation of the FIXED base speed stat.
      this.steerTowardHero(ctx, Sprinter.CHARGE_MULT);
      return;
    }

    const target = this.currentTarget(ctx);
    const h = this.headingTo(target);
    this.setFacing(h.x, h.y);
    if (this.inAttackRange(ctx)) {
      this.body.setVelocity(0, 0);
      return;
    }
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const charging = dist < Sprinter.CHARGE_RANGE;
    // Speed comes from the FIXED base stat; the charge is a movement pattern
    // (multiplier on displacement), not a mutation of the giant's base speed.
    const speed = this.stats.moveSpeed * (charging ? Sprinter.CHARGE_MULT : 1);
    this.body.setVelocity(h.x * speed, h.y * speed);
  }
}
