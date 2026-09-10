import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import type { RandomSource } from '../../systems/DeterministicRng';
import { Enemy } from './Enemy';

/** Surveyor: readable baseline autonomous siege machine. */
export class Wanderer extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number, rng: RandomSource) {
    super(scene, x, y, EnemyRole.Surveyor, rng);
  }
}
