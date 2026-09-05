import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';

/**
 * TitleScene - the front door. Renders the layered pixel backdrop, the game
 * title, and Continue / New Kingdom / Settings buttons, and kicks off the music
 * bed. Deploys into the TownScene with a fade transition.
 *
 * "Continue" is shown only when a save exists; "New Kingdom" wipes any existing
 * progress before entering the town. Either way the shared GameState singleton
 * backs the town from here on.
 */
export class TitleScene extends Phaser.Scene {
  private bgSky!: Phaser.GameObjects.TileSprite;
  private drift = 0;

  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Parallax sky + a settled town skyline beneath the title.
    this.bgSky = this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky).setOrigin(0, 0);
    this.add
      .image(cx, CANVAS.HEIGHT / 2 + 60, TextureKeys.BgTown)
      .setDisplaySize(CANVAS.WIDTH, CANVAS.HEIGHT)
      .setAlpha(0.92);

    // Title + tagline.
    const title = Menu.title(this, cx, CANVAS.HEIGHT * 0.3, tr('brand.name'), 64);
    this.tweens.add({ targets: title, y: title.y - 4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    Menu.label(this, cx, CANVAS.HEIGHT * 0.44, tr('title.tagline'), 20, 0.9).setColor(PALETTE.ACCENT_CSS);

    // Detect an existing save without mutating global state.
    const hasSave = GameState.get().loaded;

    if (hasSave) {
      Menu.button(this, cx, CANVAS.HEIGHT * 0.6, tr('title.continue'), () => this.enterTown(false), { width: 260 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.72, tr('title.newGame'), () => this.enterTown(true), { width: 260 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.84, tr('title.settings'), () => this.openSettings(), { width: 260 });
    } else {
      Menu.button(this, cx, CANVAS.HEIGHT * 0.64, tr('title.play'), () => this.enterTown(false), { width: 260 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.78, tr('title.settings'), () => this.openSettings(), { width: 260 });
    }

    Menu.label(this, cx, CANVAS.HEIGHT * 0.94, tr('title.hint'), 14, 0.55);

    // Keyboard shortcuts mirror the buttons.
    this.input.keyboard?.on('keydown-SPACE', () => this.enterTown(false));
    this.input.keyboard?.on('keydown-S', () => this.openSettings());

    // Start the music bed. The browser may hold audio locked until the first
    // gesture, so retry on the first pointer press.
    const audio = AudioManager.get(this);
    audio.playMusic(AudioKeys.MusicLoop);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.playMusic(AudioKeys.MusicLoop));
  }

  update(_time: number, delta: number): void {
    this.drift += delta * 0.003;
    this.bgSky.tilePositionX = this.drift;
  }

  /** Enter the town; when `fresh`, wipe any existing save first. */
  private enterTown(fresh: boolean): void {
    if (fresh) GameState.get().reset();
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
  }

  private openSettings(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Settings));
  }
}
