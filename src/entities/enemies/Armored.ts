import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { Enemy } from './Enemy';

/**
 * Armored - heavy frontal plate over face and chest. Frontal body hits are
 * almost entirely absorbed ({@link EnemyStats.frontalResist}); the only
 * reliable damage comes from the exposed nape or from striking it from behind /
 * above. The counter is positioning: use the grapple to get over/behind it.
 *
 * Movement is a steady advance like the Wanderer; its identity is defensive,
 * not mobile, so the resistance logic (in the base {@link Enemy.applyHit}) is
 * what makes it distinct.
 */
export class Armored extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, EnemyRole.Armored);
    this.napeLocalY = -10;
  }
  // Steer/attack use the base march + melee; frontalResist drives its identity.
}
