import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy } from './Enemy';
import { Wanderer } from './Wanderer';
import { Sprinter } from './Sprinter';
import { Breaker } from './Breaker';
import { Aberrant } from './Aberrant';
import { Armored } from './Armored';
import { Thrower, type SpawnDebris } from './Thrower';

export { Enemy, AttackTarget } from './Enemy';
export type { AttackEvent, CitizenTarget, EnemyContext, HitResult, SiegeTarget, StructureTarget } from './Enemy';
export { DebrisProjectile } from './DebrisProjectile';

export interface EnemyFactoryDeps {
  readonly spawnDebris: SpawnDebris;
  readonly rng: RandomSource;
}

export function createEnemy(
  scene: Phaser.Scene,
  role: EnemyRole,
  x: number,
  y: number,
  deps: EnemyFactoryDeps,
): Enemy {
  switch (role) {
    case EnemyRole.Surveyor: return new Wanderer(scene, x, y, deps.rng);
    case EnemyRole.Skitter: return new Sprinter(scene, x, y, deps.rng);
    case EnemyRole.Rammer: return new Breaker(scene, x, y, deps.rng);
    case EnemyRole.Fluxborn: return new Aberrant(scene, x, y, deps.rng);
    case EnemyRole.Bastion: return new Armored(scene, x, y, deps.rng);
    case EnemyRole.Bombard: return new Thrower(scene, x, y, deps.spawnDebris, deps.rng);
    default: {
      const exhaustive: never = role;
      throw new Error(`Unhandled machine role: ${String(exhaustive)}`);
    }
  }
}
