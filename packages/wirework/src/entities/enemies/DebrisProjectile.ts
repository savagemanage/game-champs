import Phaser from 'phaser';
import { TextureKeys } from '../../config/AssetKeys';
import { ENEMY_COMBAT } from '../../config/EnemyConfig';

/** Bombard's gravity-free linear coolant shell. */
export class DebrisProjectile extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;
  public readonly wallDamage = ENEMY_COMBAT.PROJECTILE_WALL_DAMAGE;
  public readonly heroDamage = ENEMY_COMBAT.PROJECTILE_HERO_DAMAGE;
  private spent = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    private readonly bornAt: number,
  ) {
    super(scene, x, y, TextureKeys.FxDust, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5).setScale(1.5).setTint(0x7ea8b0);
    this.body.setAllowGravity(false);
    const length = Math.hypot(targetX - x, targetY - y) || 1;
    this.body.setVelocity(
      ((targetX - x) / length) * ENEMY_COMBAT.PROJECTILE_SPEED,
      ((targetY - y) / length) * ENEMY_COMBAT.PROJECTILE_SPEED,
    );
  }

  get isSpent(): boolean { return this.spent; }
  expired(nowMs: number): boolean { return nowMs - this.bornAt >= ENEMY_COMBAT.PROJECTILE_LIFETIME_MS; }

  updateProjectile(dtMs: number): void {
    if (!this.spent) this.rotation += (dtMs / 1000) * 6 * Math.sign(this.body.velocity.x || 1);
  }

  onImpact(): void {
    if (this.spent) return;
    this.spent = true;
    this.destroy();
  }
}
