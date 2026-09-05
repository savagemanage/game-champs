import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys } from '../config/AssetKeys';

/**
 * TitleScene renders the game title and prompts the player to start. It
 * transitions into the GameScene on input and can open the SettingsScene.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);

    const cx = CANVAS.WIDTH / 2;

    // Parallax backdrop built from the loaded background layers.
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgSky);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgHills).setAlpha(0.9);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgWall).setAlpha(0.85);

    // Hero silhouette standing on the wall, scaled up for the splash.
    this.add
      .image(cx + 150, CANVAS.HEIGHT * 0.62, TextureKeys.Hero, 0)
      .setScale(2)
      .setFlipX(true);

    this.add
      .text(cx, CANVAS.HEIGHT * 0.34, 'WIREWORK', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: PALETTE.TEXT_CSS,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, CANVAS.HEIGHT * 0.48, 'Wall-Defense ODM Action', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.8);

    const prompt = this.add
      .text(cx, CANVAS.HEIGHT * 0.7, 'Press SPACE / Click to Deploy', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(cx, CANVAS.HEIGHT * 0.86, 'S: Settings', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.6);

    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.once('keydown-S', () => this.scene.start(SceneKeys.Settings));
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.startGame());
  }

  private startGame(): void {
    this.scene.start(SceneKeys.Game);
  }
}
