import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';

/**
 * SettingsScene is a placeholder for audio/controls options. It returns to the
 * Title scene on ESC / click. Full options UI arrives in a later feature.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Settings });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_FAR);

    const cx = CANVAS.WIDTH / 2;

    this.add
      .text(cx, CANVAS.HEIGHT * 0.35, 'SETTINGS', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: PALETTE.TEXT_CSS,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, CANVAS.HEIGHT * 0.55, 'Options coming soon', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.8);

    this.add
      .text(cx, CANVAS.HEIGHT * 0.78, 'ESC / Click to go back', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.6);

    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SceneKeys.Title));
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start(SceneKeys.Title));
  }
}
