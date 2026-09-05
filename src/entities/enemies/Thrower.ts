import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy, type AttackEvent, type EnemyContext } from './Enemy';
import { DebrisProjectile } from './DebrisProjectile';

/** Callback the scene provides so the Thrower can register its projectiles. */
export type SpawnDebris = (proj: DebrisProjectile) => void;

/**
 * Thrower - the ranged giant. Instead of closing to melee it halts at a
 * standoff distance and lobs chunks of debris in a ballistic arc at the wall
 * (or the hero if nearby). Its long attackRange means it never needs to reach
 * the wall, so the player must chase it down or dodge the incoming rubble.
 */
export class Thrower extends Enemy {
  private readonly spawnDebris: SpawnDebris;

  /** Standoff distance from its target the Thrower prefers to hold, px. */
  private static readonly STANDOFF = 420;

  constructor(scene: Phaser.Scene, x: number, y: number, spawnDebris: SpawnDebris) {
    super(scene, x, y, EnemyRole.Thrower);
    this.napeLocalY = -10;
    this.spawnDebris = spawnDebris;
    // The hero position arrives via EnemyContext each frame (see performAttack).
  }

  protected inAttackRange(ctx: EnemyContext): boolean {
    // Ranged: "in range" means within its long throwing reach of its target.
    const t = this.currentTarget(ctx);
    return Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) <= this.stats.attackRange;
  }

  protected steer(ctx: EnemyContext): void {
    const t = this.currentTarget(ctx);
    let dx = t.x - this.x;
    let dy = t.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist;
    dy /= dist;
    this.setFacing(dx, dy);
    if (dist > Thrower.STANDOFF) {
      // Advance toward its target until within standoff, then hold to throw.
      this.body.setVelocity(dx * this.stats.moveSpeed, dy * this.stats.moveSpeed);
    } else {
      this.body.setVelocity(0, 0);
    }
  }

  protected performAttack(ctx: EnemyContext): AttackEvent | null {
    // Lob debris at the hero if close, otherwise at the current ring target.
    const heroDx = ctx.heroX - this.x;
    const heroDy = ctx.heroY - this.y;
    const heroClose = Math.hypot(heroDx, heroDy) < Thrower.STANDOFF + 120;
    const t = this.currentTarget(ctx);
    const targetX = heroClose ? ctx.heroX : t.x;
    const targetY = heroClose ? ctx.heroY : t.y;

    const proj = new DebrisProjectile(this.scene, this.x, this.y, targetX, targetY);
    this.spawnDebris(proj);

    // Throw animation flourish (rock back along the facing side).
    this.scene.tweens.add({
      targets: this,
      angle: (this.facingX >= 0 ? 1 : -1) * -8,
      duration: 120,
      yoyo: true,
    });

    // The ranged attack does not itself apply melee damage; the projectile
    // carries it. Return null so the scene doesn't double-apply.
    return null;
  }
}
