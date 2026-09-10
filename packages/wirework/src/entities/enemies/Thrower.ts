import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { ROLE_BEHAVIOUR } from '../../config/EnemyConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy, type AttackEvent, type EnemyContext, type StructureTarget } from './Enemy';
import { DebrisProjectile } from './DebrisProjectile';

export type SpawnDebris = (projectile: DebrisProjectile) => void;

/** Bombard: straight-line ranged siege machine. */
export class Thrower extends Enemy {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly spawnDebris: SpawnDebris,
    rng: RandomSource,
  ) {
    super(scene, x, y, EnemyRole.Bombard, rng);
  }

  private rangedTarget(ctx: EnemyContext): { x: number; y: number } {
    return this.distanceToHero(ctx) <= ROLE_BEHAVIOUR.BOMBARD_HERO_RANGE
      ? { x: ctx.heroX, y: ctx.heroY }
      : super.structureTarget(ctx);
  }

  protected structureTarget(ctx: EnemyContext): StructureTarget {
    return { kind: 'point', ...this.rangedTarget(ctx) };
  }

  protected inAttackRange(ctx: EnemyContext): boolean {
    const target = this.rangedTarget(ctx);
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= this.stats.attackRange;
  }

  protected steer(ctx: EnemyContext): void {
    const target = this.rangedTarget(ctx);
    const heading = this.headingTo(target);
    const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const direction = distance === ROLE_BEHAVIOUR.BOMBARD_STANDOFF
      ? 0
      : distance > ROLE_BEHAVIOUR.BOMBARD_STANDOFF ? 1 : -1;
    this.setFacing(heading.x, heading.y);
    this.body.setVelocity(
      heading.x * this.stats.moveSpeed * direction,
      heading.y * this.stats.moveSpeed * direction,
    );
  }

  protected performAttack(ctx: EnemyContext, structure: StructureTarget): AttackEvent | null {
    this.spawnDebris(new DebrisProjectile(this.scene, this.x, this.y, structure.x, structure.y, ctx.nowMs));
    return null;
  }
}
