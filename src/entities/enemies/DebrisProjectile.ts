import Phaser from 'phaser';
import { TextureKeys } from '../../config/AssetKeys';
import { ENEMY_COMBAT } from '../../config/EnemyConfig';

/**
 * DebrisProjectile - a chunk of rubble lobbed by a Thrower giant.
 *
 * Follows a ballistic arc (initial velocity + gravity) toward a target point.
 * On impact with the wall it damages the wall; a direct hit on the hero damages
 * the hero. The scene owns overlap checks and calls {@link onImpact} to clean
 * up. Uses the Fx dust sprite (from FEAT-002) as a compact rubble mote.
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

    this.body.setAllowGravity(true);
    this.body.setGravityY(ENEMY_COMBAT.PROJECTILE_GRAVITY);

    // Solve a lob: horizontal at fixed speed, vertical to reach target with arc.
    const dx = targetX - x;
    const dir = Math.sign(dx) || 1;
    const speed = ENEMY_COMBAT.PROJECTILE_SPEED;
    const t = Math.max(0.35, Math.abs(dx) / speed);
    const vx = dir * speed;
    // vy from: targetY = y + vy*t + 0.5*g*t^2  ->  vy = (dy - 0.5 g t^2) / t
    const g = ENEMY_COMBAT.PROJECTILE_GRAVITY;
    const vy = (targetY - y - 0.5 * g * t * t) / t;
    this.body.setVelocity(vx, vy);
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
