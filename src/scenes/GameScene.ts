import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, PHYSICS, WALL } from '../config/GameConfig';
import { TextureKeys } from '../config/AssetKeys';

/**
 * GameScene is the core play scene. At this scaffold stage it renders the
 * arena using the loaded pixel-art layers (sky, hills, wall) plus the hero
 * sprite so the boot -> preload -> title -> game flow is verifiable end to end.
 * Entities, ODM grapple physics, the wave spawner, and combat systems are
 * layered in via later features.
 */
export class GameScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Sprite;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);

    const groundY = CANVAS.HEIGHT - 30;
    const cx = CANVAS.WIDTH / 2;

    // Parallax background layers from the loaded art.
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgSky);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgHills).setAlpha(0.9);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgWall);

    // Ground.
    this.add.rectangle(cx, groundY + 15, CANVAS.WIDTH, 30, PALETTE.GROUND);

    // Player sprite with arcade physics so gravity is exercised at boot.
    this.player = this.add.sprite(60, groundY - 16, TextureKeys.Hero, 0);
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
