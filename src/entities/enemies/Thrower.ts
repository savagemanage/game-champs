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
  private heroPos: () => Phaser.Math.Vector2;

  /** Standoff distance from the wall the Thrower prefers to hold, px. */
  private static readonly STANDOFF = 420;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    spawnDebris: SpawnDebris,
    heroPos: () => Phaser.Math.Vector2,
  ) {
    super(scene, x, y, EnemyRole.Thrower);
    this.napeLocalY = -10;
    this.spawnDebris = spawnDebris;
    this.heroPos = heroPos;
  }

  protected inAttackRange(ctx: EnemyContext): boolean {
    // Ranged: "in range" means within its long throwing reach of the wall.
    return Math.abs(this.x - ctx.wallX) <= this.stats.attackRange;
  }

  protected steer(ctx: EnemyContext): void {
    const dir: 1 | -1 = ctx.wallX >= this.x ? 1 : -1;
    this.setMarchDir(dir);
    const dist = Math.abs(this.x - ctx.wallX);
    if (dist > Thrower.STANDOFF) {
      // Advance until within standoff, then hold position to throw.
      this.body.setVelocityX(dir * this.stats.moveSpeed);
    } else {
      this.body.setVelocityX(0);
    }
  }

  protected performAttack(ctx: EnemyContext): AttackEvent | null {
    // Lob debris at the hero if close, otherwise at the wall top.
    const hero = this.heroPos();
    const heroClose = Math.abs(hero.x - this.x) < Thrower.STANDOFF + 120;
    const targetX = heroClose ? hero.x : ctx.wallX;
    const targetY = heroClose ? hero.y : ctx.groundY - 80;

    const originY = this.y - this.displayHeight * 0.7;
    const proj = new DebrisProjectile(this.scene, this.x, originY, targetX, targetY);
    this.spawnDebris(proj);

    // Throw animation flourish.
    this.scene.tweens.add({
      targets: this,
      angle: this.marchDir * -8,
      duration: 120,
      yoyo: true,
    });

    // The ranged attack does not itself apply melee wall damage; the projectile
    // carries the damage. Return null so the scene doesn't double-apply.
    return null;
  }
}
