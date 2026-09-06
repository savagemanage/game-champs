import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy } from './Enemy';
import { Wanderer } from './Wanderer';
import { Sprinter } from './Sprinter';
import { Breaker } from './Breaker';
import { Aberrant } from './Aberrant';
import { Armored } from './Armored';
import { Thrower, type SpawnDebris } from './Thrower';

export { Enemy, AttackTarget } from './Enemy';
export type { AttackEvent, EnemyContext, HitResult, SiegeTarget } from './Enemy';
export { Wanderer } from './Wanderer';
export { Sprinter } from './Sprinter';
export { Breaker } from './Breaker';
export { Aberrant } from './Aberrant';
export { Armored } from './Armored';
export { Thrower } from './Thrower';
export { DebrisProjectile } from './DebrisProjectile';

/**
 * External hooks the enemy factory needs from the scene. Only the Thrower needs
 * a way to register its projectiles; the hero position is delivered via
 * EnemyContext each frame, so it is no longer a construction dependency.
 */
export interface EnemyFactoryDeps {
  readonly spawnDebris: SpawnDebris;
}

/**
 * Construct the correct Enemy subclass for a role. Central factory so the wave
 * system stays agnostic of concrete classes and every role stays wired to its
 * fixed base stats + behaviour.
 */
export function createEnemy(
  scene: Phaser.Scene,
  role: EnemyRole,
  x: number,
  y: number,
  deps: EnemyFactoryDeps,
): Enemy {
  switch (role) {
    case EnemyRole.Wanderer:
      return new Wanderer(scene, x, y);
    case EnemyRole.Sprinter:
      return new Sprinter(scene, x, y);
    case EnemyRole.Breaker:
      return new Breaker(scene, x, y);
    case EnemyRole.Aberrant:
      return new Aberrant(scene, x, y);
    case EnemyRole.Armored:
      return new Armored(scene, x, y);
    case EnemyRole.Thrower:
      return new Thrower(scene, x, y, deps.spawnDebris);
    default: {
      // Exhaustiveness guard: adding a role without a case is a compile error.
      const _never: never = role;
      throw new Error(`Unhandled enemy role: ${String(_never)}`);
    }
  }
}
