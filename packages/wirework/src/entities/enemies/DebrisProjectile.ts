import Phaser from 'phaser';
import { TextureKeys } from '../../config/AssetKeys';
import { ENEMY_COMBAT } from '../../config/EnemyConfig';

/**
 * DebrisProjectile - a chunk of rubble hurled by a Thrower giant.
 *
 * Top-down (no gravity): it travels in a straight line across the plane toward
 * the target point at a fixed speed. On impact with a ring it damages the ring;
 * a direct hit on the hero damages the hero. The scene owns overlap checks and
 * calls {@link onImpact} to clean up. Uses the Fx dust sprite as a compact
 * rubble mote.
 */
export class DebrisProjectile extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;

  /** Wall damage dealt on impact. */
  public readonly wallDamage: number;
  /** Hero damage dealt on a direct hit. */
  public readonly heroDamage: number;

  private spent = false;

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, TextureKeys.FxDust, 0);
    this.wallDamage = ENEMY_COMBAT.PROJECTILE_WALL_DAMAGE;
    this.heroDamage = ENEMY_COMBAT.PROJECTILE_HERO_DAMAGE;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);
    this.setScale(1.5);
    this.setTint(0x8a7a63);

    this.body.setAllowGravity(false);

    // Straight-line travel across the plane toward the target at fixed speed.
    let dx = targetX - x;
    let dy = targetY - y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = ENEMY_COMBAT.PROJECTILE_SPEED;
    this.body.setVelocity(dx * speed, dy * speed);
  }

  /** True once the projectile has hit something and should be removed. */
  get isSpent(): boolean {
    return this.spent;
  }

  /** Spin as it flies for a little life. */
  updateProjectile(dtMs: number): void {
    if (this.spent) return;
    this.rotation += (dtMs / 1000) * 6 * Math.sign(this.body.velocity.x || 1);
  }

  /** Mark spent and destroy (called by the scene on impact / off-screen). */
  onImpact(): void {
    if (this.spent) return;
    this.spent = true;
    this.destroy();
  }
}
