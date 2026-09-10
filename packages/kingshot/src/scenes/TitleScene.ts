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
 * title, and Continue / New Kingdom / Settings buttons, and kicks off the music
 * bed. Deploys into the TownScene with a fade transition.
 *
 * "Continue" is shown only when a save exists; "New Kingdom" wipes any existing
 * progress before entering the town. Either way the shared GameState singleton
 * backs the town from here on.
 */
export class TitleScene extends Phaser.Scene {
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
    // no dead margin: the sky fills the whole rect and the town skyline is
    // anchored to the rect BOTTOM so the ground reaches the bottom edge. UI
    // below stays authored in the unchanged 960x540 band. Both layers re-fit on
    // resize/orientationchange via the shared provider.
    this.bgSky = this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky).setOrigin(0, 0);
    // Full opacity: the town plate is now a complete 960x540 composition with
    // its own sky, so blending it 92% over the DIFFERENT sky behind it just
    // desaturated the art into mud. The sky layer still shows in the overflow
    // above the plate on a taller-than-540 viewport, and still drifts.
    this.bgTown = this.add.image(cx, CANVAS.HEIGHT, TextureKeys.BgTown).setOrigin(0.5, 1);
    this.scrim = this.add.graphics();
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));

    // Title + tagline.
    const title = Menu.title(this, cx, CANVAS.HEIGHT * 0.3, tr('brand.name'), 64);
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) this.tweens.add({ targets: title, y: title.y - 4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // The tagline lands on the skyline, the busiest part of the backdrop, so it
    // carries its own dark outline on top of the scrim rather than relying on
    // colour contrast alone.
    Menu.label(this, cx, CANVAS.HEIGHT * 0.44, tr('title.tagline'), 20, 0.95)
      .setColor(PALETTE.ACCENT_CSS)
      .setStroke('#05080f', 5)
      .setShadow(0, 2, '#05080f', 4, true, true);

    // Detect an existing save without mutating global state.
    const state = GameState.get();
    const hasSave = state.loaded;

    if (state.loadIssue && ['corrupt-json', 'invalid-shape', 'future-version'].includes(state.loadIssue.kind)) {
      this.add.text(cx, CANVAS.HEIGHT * 0.54, tr('save.recoveryNeeded'), textStyle(15, {
        color: PALETTE.DANGER_CSS,
        align: 'center',
        wordWrap: { width: 600 },
      })).setOrigin(0.5);
      Menu.button(this, cx - 145, CANVAS.HEIGHT * 0.7, tr('save.exportBackup'), () => this.exportBackup(), { width: 250 });
      Menu.button(this, cx + 145, CANVAS.HEIGHT * 0.7, tr('save.startFresh'), () => this.enterTown(true), { width: 250, accent: PALETTE.DANGER });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.83, tr('title.settings'), () => this.openSettings(), { width: 260 });
    } else if (hasSave) {
      Menu.button(this, cx, CANVAS.HEIGHT * 0.6, tr('title.continue'), () => this.enterTown(false), { width: 260 });
      let confirmsReset = false;
      const newKingdom = Menu.button(this, cx, CANVAS.HEIGHT * 0.72, tr('title.newGame'), () => {
        if (!confirmsReset) {
          confirmsReset = true;
          newKingdom.setText(tr('settings.resetConfirm'));
          return;
        }
        this.enterTown(true);
      }, { width: 300, accent: PALETTE.DANGER });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.84, tr('title.settings'), () => this.openSettings(), { width: 260 });
    } else {
      Menu.button(this, cx, CANVAS.HEIGHT * 0.64, tr('title.play'), () => this.enterTown(false), { width: 260 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.78, tr('title.settings'), () => this.openSettings(), { width: 260 });
    }

    // Compact language toggle in the top-right so players can switch language
    // straight from the front door without opening Settings. Reuses the
    // Settings ◀ value ▶ stepper feel and persists via the AudioManager.
    this.buildLanguageToggle(36);

    Menu.label(this, cx, CANVAS.HEIGHT * 0.94, tr('title.hint'), 14, 0.55);

    // Keyboard shortcuts mirror the buttons.
    this.input.keyboard?.on('keydown-SPACE', () => {
      const issue = GameState.get().loadIssue;
      if (!issue || !['corrupt-json', 'invalid-shape', 'future-version'].includes(issue.kind)) this.enterTown(false);
    });
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
   * Runs at create() and on every resize/orientationchange so a mid-scene
   * rotate never leaves a dead margin.
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
    this.drift += delta * 0.003;
    this.bgSky.tilePositionX = this.drift;
  }

  private exportBackup(): void {
    const raw = GameState.get().loadIssue?.backupRaw;
    if (!raw || typeof document === 'undefined') return;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'kingdom-rise-save-backup.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Enter the town; when `fresh`, wipe any existing save first. */
  private enterTown(fresh: boolean): void {
    const state = GameState.get();
    if (fresh) {
      state.reset();
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
      return;
    }
    const pending = state.lastBattleReceipt;
    if (pending && !pending.acknowledged) {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.GameOver, { receipt: pending }));
    } else {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
    }
  }

  private openSettings(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Settings));
  }

  /**
   * A compact language toggle in the top-right corner: a small label, a prev
   * button, the current language name, and a next button. Mirrors the Settings
   * stepper so the front-door control feels identical.
   *
   * The whole cluster is anchored to a right edge (RIGHT_EDGE) and laid out
   * leftward from there so the right-most element (the ▶ button) always stays a
   * comfortable margin inside the 960px-wide canvas rather than clipping off.
   */
  private buildLanguageToggle(y: number): void {
    const lang = AudioManager.get(this).getSettings().language;

    // Keep the whole control inside the 960-wide canvas with room to spare: the
    // ▶ button (34px wide) is centered so its right edge sits well under 944.
    // The ◀ and ▶ buttons are spaced ~120px apart so the centered value
    // ("한국어" / "English", ~86px wide) fits fully between them with clear
    // space and never overlaps either button.
    const nextX = CANVAS.WIDTH - 34; // 926 -> right edge 943 (>=16px margin)
    const prevX = nextX - 120; // 806: ◀ button, 120px gap from ▶
    const valueX = (prevX + nextX) / 2; // 866: current-language name centered in the gap
    const labelX = prevX - 30; // 776: right-aligned label ends here

    Menu.label(this, labelX, y, tr('settings.language'), 14, 0.7).setOrigin(1, 0.5);
    this.add.text(valueX, y, tr(`language.${lang}`), textStyle(16)).setOrigin(0.5);
    Menu.button(this, prevX, y, '\u25C0', () => this.stepLanguage(-1), { width: 34, fontSize: 14, padY: 6 });
    Menu.button(this, nextX, y, '\u25B6', () => this.stepLanguage(1), { width: 34, fontSize: 14, padY: 6 });
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
