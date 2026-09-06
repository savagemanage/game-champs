import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import { LANGUAGES } from '../i18n/strings';
import { textStyle } from '../ui/UiText';

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

    // Compact language toggle in the top-right so players can switch language
    // straight from the front door without opening Settings. Reuses the
    // Settings ◀ value ▶ stepper feel and persists via the AudioManager.
    this.buildLanguageToggle(CANVAS.WIDTH - 150, 36);

    Menu.label(this, cx, CANVAS.HEIGHT * 0.94, tr('title.hint'), 14, 0.55);

    // Keyboard shortcuts mirror the buttons.
    this.input.keyboard?.on('keydown-SPACE', () => this.enterTown(false));
    this.input.keyboard?.on('keydown-S', () => this.openSettings());
    // L cycles the language, mirroring the on-screen toggle.
    this.input.keyboard?.on('keydown-L', () => this.stepLanguage(1));

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

  /**
   * A compact language toggle: a small label, a prev button, the current
   * language name, and a next button, centered on (x, y). Mirrors the Settings
   * stepper so the front-door control feels identical.
   */
  private buildLanguageToggle(x: number, y: number): void {
    const lang = AudioManager.get(this).getSettings().language;
    Menu.label(this, x - 92, y, tr('settings.language'), 14, 0.7).setOrigin(0, 0.5);
    this.add.text(x + 44, y, tr(`language.${lang}`), textStyle(16)).setOrigin(0.5);
    Menu.button(this, x + 8, y, '\u25C0', () => this.stepLanguage(-1), { width: 34, fontSize: 14, padY: 6 });
    Menu.button(this, x + 96, y, '\u25B6', () => this.stepLanguage(1), { width: 34, fontSize: 14, padY: 6 });
  }

  /**
   * Cycle the UI language, persist + mirror it through the AudioManager, then
   * restart the scene so every Title label re-renders in the new language.
   */
  private stepLanguage(dir: -1 | 1): void {
    const audio = AudioManager.get(this);
    const current = audio.getSettings().language;
    const len = LANGUAGES.length;
    const idx = LANGUAGES.indexOf(current);
    const next = LANGUAGES[(((idx + dir) % len) + len) % len];
    if (next === current) return;
    // updateSettings persists AND mirrors into the i18n runtime via setLanguage.
    audio.updateSettings({ language: next });
    Menu.fadeTo(this, () => this.scene.restart());
  }
}
