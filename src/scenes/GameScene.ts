import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, PHYSICS, WALL } from '../config/GameConfig';

/**
 * GameScene is the core play scene. At this scaffold stage it renders a
 * placeholder arena (sky, ground, defended wall, a player marker) so the boot
 * -> title -> game flow is verifiable. Entities, ODM grapple physics, the wave
 * spawner, and combat systems are layered in via later features.
 */
export class GameScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);

    const groundY = CANVAS.HEIGHT - 30;

    // Parallax-ish background bands.
    this.add.rectangle(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.4, CANVAS.WIDTH, 60, PALETTE.BG_FAR).setAlpha(0.6);
    this.add.rectangle(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.6, CANVAS.WIDTH, 60, PALETTE.BG_NEAR).setAlpha(0.6);

    // Ground.
    this.add.rectangle(CANVAS.WIDTH / 2, groundY + 15, CANVAS.WIDTH, 30, PALETTE.GROUND);

    // The defended wall on the right, guarding the citizens behind it.
    this.add.rectangle(CANVAS.WIDTH - 24, groundY - 40, 24, 80, PALETTE.WALL);
    this.add.rectangle(CANVAS.WIDTH - 24, groundY - 40, 24, 80, PALETTE.WALL_DARK).setAlpha(0.25);

    // Player marker with arcade physics so gravity is exercised at boot.
    this.player = this.add.rectangle(60, groundY - 40, 8, 16, PALETTE.PLAYER);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    // HUD placeholder.
    this.add
      .text(6, 6, `Wall ${WALL.MAX_INTEGRITY}  |  Citizens ${WALL.START_CITIZENS}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: PALETTE.TEXT_CSS,
      })
      .setScrollFactor(0);

    this.add
      .text(CANVAS.WIDTH / 2, 20, 'GAME SCENE (placeholder)', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    this.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT - 8, 'ESC: end run', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.6);

    // Confirm gravity is configured as expected (used by ODM physics later).
    this.physics.world.gravity.y = PHYSICS.GRAVITY_Y;

    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start(SceneKeys.GameOver, { victory: false, wavesSurvived: 0, citizensSaved: WALL.START_CITIZENS });
    });
  }
}
