import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy } from './Enemy';

/**
 * Wanderer - the baseline giant. Standard size and speed, no tricks: it
 * advances radially toward the nearest ring segment (then inner ring, then the
 * citizens at the core) and melee-attacks on arrival, taking an opportunistic
 * swipe at the hero when the hero strays adjacent. Serves as the readable
 * reference silhouette against which the other roles contrast.
 */
export class Wanderer extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Wanderer);
    this.napeLocalY = -8;
  }
  // Uses the base steer() (radial advance + opportunistic hero swipe) and base
  // melee performAttack()/performHeroAttack().
}
