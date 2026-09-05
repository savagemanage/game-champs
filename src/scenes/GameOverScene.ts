import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

export interface GameOverData {
  victory?: boolean;
  wavesSurvived?: number;
  citizensSaved?: number;
  /** Total score accrued from giant kills during the run. */
  score?: number;
}

/**
 * GameOverScene - the run summary. Shows outcome, final score, waves survived,
 * and citizens saved, then offers Retry (straight back into a fresh run) or
 * Return to Title. Fades in on show and fades out on either choice.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.GameOver });
  }

  create(data: GameOverData): void {
    this.cameras.main.setBackgroundColor(PALETTE.GROUND);
    Menu.fadeIn(this, 500);

    const cx = CANVAS.WIDTH / 2;
    const victory = data.victory ?? false;

    this.add
      .text(
        cx,
        CANVAS.HEIGHT * 0.22,
        victory ? 'CITY HELD' : 'THE WALL HAS FALLEN',
        textStyle(40, {
          color: victory ? PALETTE.TEXT_CSS : PALETTE.DANGER_CSS,
          fontStyle: 'bold',
        }),
      )
      .setOrigin(0.5);

    const waves = data.wavesSurvived ?? 0;
    const saved = data.citizensSaved ?? 0;
    const score = data.score ?? 0;

    this.add
      .text(
        cx,
        CANVAS.HEIGHT * 0.46,
        `SCORE   ${score}\nWAVES SURVIVED   ${waves}\nCITIZENS SAVED   ${saved}`,
        textStyle(20, { align: 'center', lineSpacing: 8 }),
      )
      .setOrigin(0.5)
      .setAlpha(0.9);

    Menu.button(this, cx - 124, CANVAS.HEIGHT * 0.78, 'Retry', () => this.retry(), { width: 200 });
    Menu.button(this, cx + 124, CANVAS.HEIGHT * 0.78, 'Title', () => this.toTitle(), { width: 200 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.92, 'R Retry    SPACE Title', 14, 0.5);

    this.input.keyboard?.on('keydown-R', () => this.retry());
    this.input.keyboard?.on('keydown-SPACE', () => this.toTitle());
  }

  private retry(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Game));
  }

  private toTitle(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title));
  }
}
