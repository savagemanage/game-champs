import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import type { RunResult } from '../types';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data handed to ResultsScene from a finished run. */
export interface ResultsData {
  result: RunResult;
  newBestDistance: boolean;
  newBestScore: boolean;
}

/**
 * ResultsScene - the post-run summary. Shows VICTORY or DEFEAT, the run's
 * distance / score / peak squad, coins earned, and a NEW BEST highlight when a
 * personal best was set. The RunResult was already persisted by the RunScene
 * (via MetaStore.recordRun); this scene only reports it and offers the next
 * actions: Redeploy (new run), Upgrades, or the Main Menu. Keyboard shortcuts
 * mirror the buttons.
 */
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Results });
  }

  create(data: ResultsData): void {
    const result = data.result;
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    const win = result.win;
    const headColor = win ? PALETTE.SUCCESS_CSS : PALETTE.DANGER_CSS;
    Menu.title(this, cx, CANVAS.HEIGHT * 0.16, tr(win ? 'result.victory' : 'result.defeat'), 46).setColor(headColor);
    Menu.label(this, cx, CANVAS.HEIGHT * 0.16 + 42, tr(win ? 'result.victoryDesc' : 'result.defeatDesc'), 14, 0.85);

    // Stats panel.
    const panelY = CANVAS.HEIGHT * 0.44;
    Menu.panel(this, cx, panelY, CANVAS.WIDTH * 0.82, 200);

    const lines: Array<{ text: string; color?: string }> = [
      { text: tr('result.distance', { meters: result.distance }) },
      { text: tr('result.score', { score: result.score }) },
      { text: tr('result.squadPeak', { count: result.squadPeak }) },
      { text: tr('result.coinsEarned', { coins: result.coinsEarned }), color: PALETTE.COIN_CSS },
    ];
    let ly = panelY - 72;
    for (const line of lines) {
      this.add.text(cx, ly, line.text, textStyle(20, { color: line.color ?? PALETTE.TEXT_CSS })).setOrigin(0.5);
      ly += 42;
    }

    // New-best highlight.
    if (data.newBestDistance || data.newBestScore) {
      const badge = this.add
        .text(cx, panelY + 118, tr('result.newBest'), textStyle(22, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
        .setOrigin(0.5);
      this.tweens.add({ targets: badge, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // Actions.
    let by = CANVAS.HEIGHT * 0.72;
    const step = 60;
    Menu.button(this, cx, by, tr('result.retry'), () => this.redeploy(), { width: 260, accent: PALETTE.SQUAD, fontSize: 22 });
    by += step;
    Menu.button(this, cx, by, tr('result.upgrades'), () => this.go(SceneKeys.Upgrade), { width: 260 });
    by += step;
    Menu.button(this, cx, by, tr('result.title'), () => this.go(SceneKeys.Title), { width: 260 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.955, tr('result.keyhint'), 13, 0.6);

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => this.redeploy());
    kb?.on('keydown-U', () => this.go(SceneKeys.Upgrade));
    kb?.on('keydown-SPACE', () => this.go(SceneKeys.Title));
    kb?.on('keydown-ENTER', () => this.redeploy());
  }

  private redeploy(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Run));
  }

  private go(scene: string): void {
    Menu.fadeTo(this, () => this.scene.start(scene, { returnTo: SceneKeys.Title }));
  }
}
