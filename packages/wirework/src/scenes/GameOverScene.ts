import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys } from '../config/AssetKeys';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import { outcomeMessageKey, type LoseReason } from './GameOverReason';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';
import { createRunSeed } from '../systems/DeterministicRng';
import type { Difficulty } from '../systems/Persistence';

export interface GameOverData {
  victory?: boolean;
  reason?: LoseReason;
  wavesCompleted?: number;
  citizensSaved?: number;
  score?: number;
  activeMs?: number;
  difficulty?: Difficulty;
  seed?: number;
  bestScore?: number;
  isNewRecord?: boolean;
  storageAvailable?: boolean;
}

export class GameOverScene extends Phaser.Scene {
  private bgSky!: Phaser.GameObjects.TileSprite;
  private results!: Required<Omit<GameOverData, 'reason'>> & { reason?: LoseReason };

  constructor() { super({ key: SceneKeys.GameOver }); }

  create(input: GameOverData): void {
    this.results = {
      victory: input.victory ?? false,
      reason: input.reason,
      wavesCompleted: input.wavesCompleted ?? 0,
      citizensSaved: input.citizensSaved ?? 0,
      score: input.score ?? 0,
      activeMs: input.activeMs ?? 0,
      difficulty: input.difficulty ?? 'standard',
      seed: input.seed ?? 0,
      bestScore: input.bestScore ?? 0,
      isNewRecord: input.isNewRecord ?? false,
      storageAvailable: input.storageAvailable ?? true,
    };
    this.cameras.main.setBackgroundColor(PALETTE.GROUND);
    Menu.fadeIn(this, 500);
    this.bgSky = this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky)
      .setOrigin(0).setDepth(-30).setTint(PALETTE.GROUND);
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));
    const cx = CANVAS.WIDTH / 2;
    const outcome = Menu.title(
      this, cx, CANVAS.HEIGHT * 0.16, tr(outcomeMessageKey(this.results.victory, this.results.reason)), 38,
    );
    outcome.setColor(this.results.victory ? PALETTE.TEXT_CSS : PALETTE.DANGER_CSS);
    const seconds = (this.results.activeMs / 1000).toFixed(1);
    const stats = Menu.label(
      this,
      cx,
      CANVAS.HEIGHT * 0.42,
      tr('gameover.stats', {
        score: this.results.score,
        best: this.results.bestScore,
        waves: this.results.wavesCompleted,
        saved: this.results.citizensSaved,
        time: seconds,
        difficulty: tr(`difficulty.${this.results.difficulty}`),
        seed: this.results.seed,
      }),
      18,
      1,
    );
    stats.setAlign('center').setLineSpacing(6);
    if (this.results.isNewRecord) {
      Menu.label(this, cx, CANVAS.HEIGHT * 0.60, tr('gameover.newRecord'), 22, 1).setColor('#ffcf5c').setFontStyle('bold');
    }
    if (!this.results.storageAvailable) {
      Menu.label(this, cx, CANVAS.HEIGHT * 0.66, tr('storage.unavailable'), 15, 1).setColor(PALETTE.DANGER_CSS);
    }
    Menu.button(this, cx - 124, CANVAS.HEIGHT * 0.78, tr('gameover.retry'), () => this.retry(), { width: 200 });
    Menu.button(this, cx + 124, CANVAS.HEIGHT * 0.78, tr('gameover.title'), () => this.toTitle(), { width: 200 });
    Menu.label(this, cx, CANVAS.HEIGHT * 0.92, tr('gameover.keyhint'), 14, 0.5);
    this.input.keyboard?.on('keydown-R', () => this.retry());
    this.input.keyboard?.on('keydown-SPACE', () => this.toTitle());
  }

  private refitBackdrop(rect: VisibleWorldRect): void { this.bgSky.setPosition(rect.x, rect.y).setSize(rect.width, rect.height); }
  private retry(): void { Menu.fadeTo(this, () => this.scene.start(SceneKeys.Game, { difficulty: this.results.difficulty, seed: createRunSeed() })); }
  private toTitle(): void { Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title)); }
}
