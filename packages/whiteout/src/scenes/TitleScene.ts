import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import { LANGUAGES } from '../i18n/strings';
import { textStyle } from '../ui/UiText';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';

/**
 * TitleScene - the front door. Renders the layered pixel backdrop, the game
 * title, and Continue / New Hold / Settings buttons, and kicks off the music
 * bed. Deploys into the TownScene with a fade transition.
 *
 * "Continue" is shown only when a save exists; "New Hold" wipes any existing
 * progress before entering the town. Either way the shared GameState singleton
 * backs the town from here on.
 */
export class TitleScene extends Phaser.Scene {
  /**
   * The one explicit outer margin for this screen. The language toggle's right
   * edge sits exactly at 960 - MARGIN so the front-door control shares the same
   * inset as every other screen instead of touching the canvas edge.
   */
  private static readonly MARGIN = 24;

  private bgSky!: Phaser.GameObjects.TileSprite;
  private bgTown!: Phaser.GameObjects.Image;
  private drift = 0;

  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Parallax sky + a settled town skyline beneath the title. Paint across the
    // full visible world rect (taller than 540 on a portrait phone) so there is
    // no flat dead margin: the sky fills the whole rect and the town skyline is
    // anchored to the rect BOTTOM. UI below stays in the unchanged 960x540 band.
    this.bgSky = this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky).setOrigin(0, 0);
    this.bgTown = this.add.image(cx, CANVAS.HEIGHT, TextureKeys.BgTown).setOrigin(0.5, 1).setAlpha(0.92);
    // Size/position both backdrop layers to the live visible rect now AND on
    // every resize/orientationchange (shared provider) so a mid-scene rotate
    // never leaves a dead margin.
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));

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
    // Settings ◀ value ▶ stepper feel and persists via the AudioManager. The
    // group is anchored to the shared outer margin M so its right edge lines up
    // with 960 - M (the same inset used elsewhere) instead of jamming the '>'
    // arrow against the far edge.
    this.buildLanguageToggle(TitleScene.MARGIN, 36);

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

  /**
   * Re-fit the sky tileSprite + town skyline to the live visible-world rect.
   * Called once at create() and again on every resize/orientationchange so the
   * backdrop always covers the current (possibly rotated) viewport.
   */
  private refitBackdrop(rect: VisibleWorldRect): void {
    this.bgSky.setPosition(rect.x, rect.y).setSize(rect.width, rect.height);
    this.bgTown
      .setPosition(CANVAS.WIDTH / 2, rect.y + rect.height)
      .setDisplaySize(rect.width, CANVAS.HEIGHT);
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
   * language name, and a next button. Mirrors the Settings stepper so the
   * front-door control feels identical.
   *
   * The group is laid out RIGHT-TO-LEFT anchored to the outer margin so its
   * right edge lands at exactly 960 - `margin`, matching the inset used by the
   * rest of the UI. Reading right to left the run is:
   *   [언어]  [<]  한국어  [>]
   * with even, symmetric gaps between the stepper glyphs and the value. The
   * stepper glyphs use ASCII '<' / '>' (both in the bundled subset) so they
   * always render; the arrow codepoints (U+25C0/U+25B6) are not in the font
   * subset and would render as tofu boxes.
   */
  private buildLanguageToggle(margin: number, y: number): void {
    const lang = AudioManager.get(this).getSettings().language;

    const arrowW = 30; // stepper button width
    const gap = 12; // even gap between the value and each arrow
    const valueHalf = 42; // half-width reserved for the language name

    // Anchor the '>' arrow so the group's right edge == 960 - margin.
    const nextX = CANVAS.WIDTH - margin - arrowW / 2;
    const valueX = nextX - arrowW / 2 - gap - valueHalf;
    const prevX = valueX - valueHalf - gap - arrowW / 2;
    // The "Language" label sits a small, fixed gap to the left of the '<' arrow
    // (right-aligned so the gap stays constant regardless of the label width).
    const labelX = prevX - arrowW / 2 - gap;

    Menu.label(this, labelX, y, tr('settings.language'), 14, 0.7).setOrigin(1, 0.5);
    Menu.button(this, prevX, y, '<', () => this.stepLanguage(-1), { width: arrowW, fontSize: 14, padY: 6 });
    this.add.text(valueX, y, tr(`language.${lang}`), textStyle(16)).setOrigin(0.5);
    Menu.button(this, nextX, y, '>', () => this.stepLanguage(1), { width: arrowW, fontSize: 14, padY: 6 });
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
