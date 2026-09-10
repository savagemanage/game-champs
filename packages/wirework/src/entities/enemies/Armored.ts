import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy } from './Enemy';

/** Bastion: frontal plated machine with a rear cooling node. */
export class Armored extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number, rng: RandomSource) {
    super(scene, x, y, EnemyRole.Bastion, rng);
  }
}
