import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RUN } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { MetaStore } from '../systems/MetaStore';
import { GameStore } from '../systems/GameStore';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/**
 * TitleScene - the LAST SQUAD front end. Shows the original brand name, a
 * tagline, the player's best distance/score from the persisted save, and the
 * primary actions: Deploy (start a run), Upgrades, How to Play, and Settings.
 * A slow-scrolling road and a couple of idle soldier sprites give the screen
 * some life. Keyboard shortcuts mirror the buttons.
 */
export class TitleScene extends Phaser.Scene {
  private road?: Phaser.GameObjects.TileSprite;
  private howtoOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Backdrop: static skyline + scrolling road.
    this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setAlpha(0.85);
    this.road = this.add
      .tileSprite(cx, CANVAS.HEIGHT, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgRoad)
      .setOrigin(0.5, 1)
      .setAlpha(0.6);

    // A small idle squad marching in place near the bottom.
    this.spawnIdleSquad();

    // Start the music bed once (survives across scenes via the singleton).
    AudioManager.get(this).playMusic();

    // Brand + tagline.
    Menu.title(this, cx, CANVAS.HEIGHT * 0.2, tr('brand.name'), 52).setColor(PALETTE.SQUAD_CSS);
    Menu.label(this, cx, CANVAS.HEIGHT * 0.2 + 46, tr('title.tagline'), 16, 0.85);

    // Best readouts from the save.
    const meta = MetaStore.get();
    Menu.label(this, cx, CANVAS.HEIGHT * 0.31, tr('title.best', { meters: meta.bestDistance }), 15, 0.75).setColor(
      PALETTE.ACCENT_CSS,
    );
    Menu.label(this, cx, CANVAS.HEIGHT * 0.31 + 24, tr('title.bestScore', { score: meta.bestScore }), 15, 0.75);

    // Primary actions. The primary action now enters the base-hub HomeScene;
    // the Falcon Rescue mini-game (the gate-runner Run) stays reachable from the
    // Home bottom-nav and via the direct SPACE/ENTER shortcut below.
    let y = CANVAS.HEIGHT * 0.46;
    const step = 66;
    Menu.button(this, cx, y, tr('title.play'), () => this.enterHome(), { width: 260, fontSize: 24, accent: PALETTE.SQUAD });
    y += step;
    Menu.button(this, cx, y, tr('title.upgrades'), () => this.go(SceneKeys.Upgrade), { width: 260 });
    y += step;
    Menu.button(this, cx, y, tr('title.howto'), () => this.toggleHowTo(), { width: 260 });
    y += step;
    Menu.button(this, cx, y, tr('title.settings'), () => this.go(SceneKeys.Settings), { width: 260 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.95, tr('title.hint'), 13, 0.6);

    // Keyboard shortcuts.
    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => this.enterHome());
    kb?.on('keydown-ENTER', () => this.enterHome());
    kb?.on('keydown-U', () => this.go(SceneKeys.Upgrade));
    kb?.on('keydown-H', () => this.toggleHowTo());
    kb?.on('keydown-S', () => this.go(SceneKeys.Settings));
  }

  update(_time: number, delta: number): void {
    if (this.road) this.road.tilePositionY -= (RUN.SCROLL_SPEED * 0.4 * delta) / 1000;
  }

  private spawnIdleSquad(): void {
    const key = 'title_soldier_march';
    if (!this.anims.exists(key)) {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(TextureKeys.Soldier, { start: 0, end: 1 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    const baseY = CANVAS.HEIGHT * 0.86;
    for (let i = 0; i < 5; i++) {
      const col = i % 3;
      const rowOff = Math.floor(i / 3);
      const s = this.add
        .sprite(CANVAS.WIDTH / 2 + (col - 1) * 34, baseY + rowOff * 26, TextureKeys.Soldier)
        .setScale(2.2)
        .play(key);
      s.anims.setProgress((i % 3) / 3);
    }
  }

  /** Enter the base-hub HomeScene (the new primary action). */
  private enterHome(): void {
    AudioManager.get(this).playSfx(AudioKeys.UiClick, 0.8);
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Home));
  }

  private go(scene: string): void {
    Menu.fadeTo(this, () => this.scene.start(scene, { returnTo: SceneKeys.Title }));
  }

  /** Toggle a How-to-Play overlay panel built from the howto.* strings. */
  private toggleHowTo(): void {
    if (this.howtoOverlay) {
      this.howtoOverlay.destroy(true);
      this.howtoOverlay = null;
      return;
    }
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const panel = Menu.panel(this, cx, cy, CANVAS.WIDTH * 0.86, CANVAS.HEIGHT * 0.6);
    const title = this.add.text(cx, cy - CANVAS.HEIGHT * 0.26, tr('howto.title'), textStyle(24, { fontStyle: 'bold' })).setOrigin(0.5);

    const lines = [tr('howto.move'), tr('howto.gates'), tr('howto.autofire'), tr('howto.boss'), tr('howto.meta')];
    const texts: Phaser.GameObjects.Text[] = [];
    let ly = cy - CANVAS.HEIGHT * 0.16;
    for (const line of lines) {
      const t = this.add
        .text(cx, ly, `• ${line}`, textStyle(14, { wordWrap: { width: CANVAS.WIDTH * 0.74 }, align: 'left' }))
        .setOrigin(0.5, 0);
      texts.push(t);
      ly += t.height + 14;
    }

    const overlay = this.add.container(0, 0, [panel, title, ...texts]);
    // Always-available REPLAY entry point for the guided tutorial (FEAT-003).
    const replay = Menu.button(this, cx, cy + CANVAS.HEIGHT * 0.18, tr('tutorial.replay'), () => this.replayTutorial(), {
      width: 260,
      accent: PALETTE.SQUAD,
    });
    overlay.add(replay.container);
    const close = Menu.button(this, cx, cy + CANVAS.HEIGHT * 0.24, tr('common.close'), () => this.toggleHowTo(), {
      width: 160,
    });
    overlay.add(close.container);
    overlay.setDepth(50);
    this.howtoOverlay = overlay;
  }

  /**
   * Replay the guided tutorial: reset the persisted "seen" flag so the tutorial
   * is unseen again, then enter the base hub where HomeScene auto-launches the
   * onboarding overlay from the first step.
   */
  private replayTutorial(): void {
    GameStore.get().resetTutorial();
    if (this.howtoOverlay) {
      this.howtoOverlay.destroy(true);
      this.howtoOverlay = null;
    }
    this.enterHome();
  }
}
