import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy, type AttackEvent, type EnemyContext } from './Enemy';

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
    // Always march to the wall itself (never diverts), then stop and smash.
    const dir: 1 | -1 = ctx.wallX >= this.x ? 1 : -1;
    this.setMarchDir(dir);
    this.body.setVelocityX(this.inAttackRange(ctx) ? 0 : dir * this.stats.moveSpeed);
  }

  protected performAttack(_ctx: EnemyContext): AttackEvent | null {
    // A heavy slam telegraphed by a small forward lunge tween for feel.
    this.scene.tweens.add({
      targets: this,
      x: this.x + this.marchDir * 6,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    return { role: this.role, damage: this.stats.attack, x: this.x, y: this.y - this.displayHeight * 0.4 };
  }
}
