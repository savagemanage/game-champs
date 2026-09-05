import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy } from './Enemy';

/**
 * Wanderer - the baseline giant. Standard size and speed, no tricks: it simply
 * paths straight toward the wall/citizens and melee-attacks on arrival. Serves
 * as the readable reference silhouette against which the other roles contrast.
 */
export class Wanderer extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Wanderer);
    this.napeLocalY = -8;
  }
  // Uses the base steer() (straight march) and base melee performAttack().
}
