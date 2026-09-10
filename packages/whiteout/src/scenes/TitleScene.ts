import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import { LANGUAGES } from '../i18n/strings';
import { textStyle } from '../ui/UiText';
import { prefersReducedMotion } from '../ui/Motion';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';
import { announce } from '../ui/AccessibilityBridge';

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
  /**
   * Dark gradient laid over the backdrop, under the text.
   *
   * The title sits at 0.3H and the tagline at 0.44H, which is exactly where the
   * skyline and the lit horizon are busiest, so both were reading as noise. The
   * scrim darkens that band and fades out above and below, keeping the art
   * visible while giving the type something quiet to sit on.
   */
  private scrim!: Phaser.GameObjects.Graphics;
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
    // Full opacity: the town plate is now a complete 960x540 composition with
    // its own sky, so blending it 92% over the DIFFERENT sky behind it just
    // desaturated the art into mud. The sky layer still shows in the overflow
    // above the plate on a taller-than-540 viewport, and still drifts.
    this.bgTown = this.add.image(cx, CANVAS.HEIGHT, TextureKeys.BgTown).setOrigin(0.5, 1);
    // Size/position both backdrop layers to the live visible rect now AND on
    // every resize/orientationchange (shared provider) so a mid-scene rotate
    // never leaves a dead margin.
    this.scrim = this.add.graphics();
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));

    // Title + tagline.
    const title = Menu.title(this, cx, CANVAS.HEIGHT * 0.3, tr('brand.name'), 64);
    if (!prefersReducedMotion()) {
      this.tweens.add({ targets: title, y: title.y - 4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // The tagline lands on the skyline, the busiest part of the backdrop, so it
    // carries its own dark outline on top of the scrim rather than relying on
    // colour contrast alone.
    Menu.label(this, cx, CANVAS.HEIGHT * 0.44, tr('title.tagline'), 20, 0.95)
      .setColor(PALETTE.ACCENT_CSS)
      .setStroke('#05080f', 5)
      .setShadow(0, 2, '#05080f', 4, true, true);

    // Detect an existing or blocked save without mutating progress.
    const state = GameState.get();
    const hasSave = state.loaded;

    if (state.blockedSave) {
      this.add.text(cx, CANVAS.HEIGHT * 0.54, tr('save.blocked'),
        textStyle(14, { align: 'center', color: PALETTE.DANGER_CSS, wordWrap: { width: 620 } })).setOrigin(0.5);
      Menu.button(this, cx, CANVAS.HEIGHT * 0.64, tr('save.export'), () => this.exportBlockedSave(), { width: 260 });
      let confirmsNewHold = false;
      const newHold = Menu.button(this, cx, CANVAS.HEIGHT * 0.76, tr('title.newGame'), () => {
        if (!confirmsNewHold) {
          confirmsNewHold = true;
          newHold.setText(tr('settings.resetConfirm'));
          return;
        }
        this.enterTown(true);
      }, { width: 260, accent: PALETTE.DANGER });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.88, tr('title.settings'), () => this.openSettings(), { width: 260 });
    } else if (hasSave) {
      Menu.button(this, cx, CANVAS.HEIGHT * 0.6, tr('title.continue'), () => this.enterTown(false), { width: 260 });
      let confirmsNewHold = false;
      const newHold = Menu.button(this, cx, CANVAS.HEIGHT * 0.72, tr('title.newGame'), () => {
        if (!confirmsNewHold) {
          confirmsNewHold = true;
          newHold.setText(tr('settings.resetConfirm'));
          return;
        }
        this.enterTown(true);
      }, { width: 260 });
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
    this.input.keyboard?.on('keydown-SPACE', () => { if (!state.blockedSave) this.enterTown(false); });
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
    this.drawScrim(rect);
  }

  /** Repaint the readability scrim for the current visible rect. */
  private drawScrim(rect: VisibleWorldRect): void {
    // Kept tight around the title block. A broad scrim reads as the whole
    // screen being dimmed and washes the backdrop out; this one only quiets the
    // band the title and tagline actually sit on (0.24H-0.50H) and falls off to
    // nothing either side.
    const top = rect.y + rect.height * 0.16;
    const mid = rect.y + rect.height * 0.36;
    const bottom = rect.y + rect.height * 0.54;
    this.scrim.clear();
    this.scrim.fillGradientStyle(0x050a14, 0x050a14, 0x050a14, 0x050a14, 0, 0, 0.55, 0.55);
    this.scrim.fillRect(rect.x, top, rect.width, mid - top);
    this.scrim.fillGradientStyle(0x050a14, 0x050a14, 0x050a14, 0x050a14, 0.55, 0.55, 0, 0);
    this.scrim.fillRect(rect.x, mid, rect.width, bottom - mid);
  }

  update(_time: number, delta: number): void {
    if (prefersReducedMotion()) return;
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

  /** Download the quarantined payload before the player explicitly resets it. */
  private exportBlockedSave(): void {
    const payload = GameState.get().exportSave();
    if (!payload || typeof document === 'undefined') return;
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'frosthold-save-recovery.json';
    link.click();
    URL.revokeObjectURL(url);
    announce(tr('save.exported'));
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
