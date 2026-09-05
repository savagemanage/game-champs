import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';

export interface GameOverData {
  victory?: boolean;
  wavesSurvived?: number;
  citizensSaved?: number;
}

/**
 * GameOverScene shows the run summary and lets the player return to the Title.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.GameOver });
  }

  create(data: GameOverData): void {
    this.cameras.main.setBackgroundColor(PALETTE.GROUND);

    const cx = CANVAS.WIDTH / 2;
    const victory = data.victory ?? false;

    this.add
      .text(cx, CANVAS.HEIGHT * 0.32, victory ? 'CITY HELD' : 'THE WALL HAS FALLEN', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: victory ? PALETTE.TEXT_CSS : PALETTE.DANGER_CSS,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const waves = data.wavesSurvived ?? 0;
    const saved = data.citizensSaved ?? 0;
    this.add
      .text(cx, CANVAS.HEIGHT * 0.52, `Waves survived: ${waves}    Citizens saved: ${saved}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.85);

    this.add
      .text(cx, CANVAS.HEIGHT * 0.76, 'Press SPACE / Click to return', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start(SceneKeys.Title));
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start(SceneKeys.Title));
  }
}
