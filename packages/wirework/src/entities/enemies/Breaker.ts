import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { AttackTarget, Enemy, type AttackEvent, type EnemyContext } from './Enemy';

/**
 * Breaker - the huge, slow, high-HP wall-smasher. It ignores citizens and
 * fixates on the wall, delivering heavy, slow slams that are the primary threat
 * to wall integrity. A single Breaker can breach the wall if left unchecked;
 * its bulk makes it a long fight unless the player exploits the nape.
 */
export class Breaker extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Breaker);
    this.napeLocalY = -12;
  }

  protected steer(ctx: EnemyContext): void {
    // Dedicated ring-breaker: largely IGNORES the hero (very low aggression in
    // HERO_AGGRESSION) and fixates on the nearest segment, then stops and slams.
    // It still runs the base hero-hunt gate so a rare divert is possible, but in
    // practice it marches on the wall.
    if (this.isHuntingHero(ctx)) {
      this.steerTowardHero(ctx);
      return;
    }
    const h = this.headingTo(this.currentTarget(ctx));
    this.setFacing(h.x, h.y);
    if (this.inAttackRange(ctx)) {
      this.body.setVelocity(0, 0);
    } else {
      this.body.setVelocity(h.x * this.stats.moveSpeed, h.y * this.stats.moveSpeed);
    }
  }

  protected performAttack(ctx: EnemyContext): AttackEvent | null {
    // A heavy slam telegraphed by a big slow forward lunge along the heading.
    const t = this.currentTarget(ctx);
    this.lungeAt(t.x, t.y);
    return {
      role: this.role,
      damage: this.stats.attack,
      x: this.x + this.facingX * this.displayHeight * 0.2,
      y: this.y + this.facingY * this.displayHeight * 0.2,
      target: AttackTarget.Structure,
    };
  }
}
