import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { AudioManager, type GameSettings } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { LANGUAGES } from '../i18n/strings';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching Settings (e.g. from the Town). */
export interface SettingsData {
  /** Scene key to return to when Settings closes. Defaults to Title. */
  returnTo?: string;
}

/**
 * SettingsScene - master / SFX / music volume sliders, a bidirectional
 * language selector (ko/en), and a reset-progress option.
 *
 * Volume + language changes route through the {@link AudioManager} singleton,
 * which applies volumes live and PERSISTS every change to localStorage; the
 * language is mirrored into the i18n runtime. Switching the language rebuilds
 * the scene (scene.restart, preserving returnTo) so every visible label flips
 * language immediately. Reset clears the save through {@link GameState} and
 * returns to the Title with a fresh kingdom. Mirrors wirework's SettingsScene.
 */
export class SettingsScene extends Phaser.Scene {
  private audioMgr!: AudioManager;
  private settings!: GameSettings;
  private returnTo: string = SceneKeys.Title;
  private confirmingReset = false;
  private resetButtonText: ((t: string) => void) | null = null;

  constructor() {
    super({ key: SceneKeys.Settings });
  }

  create(data: SettingsData): void {
    this.audioMgr = AudioManager.get(this);
    this.settings = this.audioMgr.getSettings();
    this.returnTo = data?.returnTo ?? SceneKeys.Title;
    this.confirmingReset = false;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    const cx = CANVAS.WIDTH / 2;
    Menu.title(this, cx, CANVAS.HEIGHT * 0.12, tr('settings.title'), 40);

    let y = CANVAS.HEIGHT * 0.28;
    const step = 58;
    this.buildSlider(tr('settings.master'), y, this.settings.masterVolume, (v) => {
      this.settings.masterVolume = v;
      this.audioMgr.updateSettings({ masterVolume: v });
    });
    y += step;
    this.buildSlider(tr('settings.sfx'), y, this.settings.sfxVolume, (v) => {
      this.settings.sfxVolume = v;
      this.audioMgr.updateSettings({ sfxVolume: v });
      this.audioMgr.playSfx(AudioKeys.UiClick, 0.7); // audition the new level
    });
    y += step;
    this.buildSlider(tr('settings.music'), y, this.settings.musicVolume, (v) => {
      this.settings.musicVolume = v;
      this.audioMgr.updateSettings({ musicVolume: v });
    });
    y += step;

    // Language selector: prev VALUE next (bidirectional). Rebuilds on change.
    this.buildStepper(tr('settings.language'), y, this.languageText(), (dir) => this.stepLanguage(dir));
    y += step;

    // Replay the first-run tutorial: clears the tutorial-done flag (in memory,
    // re-armed even for a returning player) and returns to Town, where the
    // guided tour runs again from step 0. Placed above the reset row so the two
    // never overlap.
    Menu.button(this, cx, y + 10, tr('settings.replayTutorial'), () => this.onReplayTutorial(), {
      width: 300,
      fontSize: 18,
    });
    y += step;

    // Reset progress (two-press confirm).
    const reset = Menu.button(this, cx, y + 10, tr('settings.reset'), () => this.onResetPressed(), {
      width: 300,
      accent: PALETTE.DANGER,
    });
    this.resetButtonText = reset.setText;

    Menu.button(this, cx, CANVAS.HEIGHT * 0.94, tr('settings.back'), () => this.close(), { width: 220 });

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  /**
   * A labelled horizontal slider. Drag the handle (or click the track) to set
   * the value in [0..1]; `onChange` fires with the new value.
   */
  private buildSlider(name: string, y: number, initial: number, onChange: (v: number) => void): void {
    const trackX = CANVAS.WIDTH / 2 - 60;
    const trackW = 260;

    Menu.label(this, trackX - 24, y, name, 18, 0.9).setOrigin(1, 0.5);

    this.add.rectangle(trackX, y, trackW, 8, PALETTE.STONE_DARK).setOrigin(0, 0.5);
    const fill = this.add.rectangle(trackX, y, trackW * initial, 8, PALETTE.ACCENT).setOrigin(0, 0.5);

    const readout = this.add.text(trackX + trackW + 16, y, `${Math.round(initial * 100)}`, textStyle(16)).setOrigin(0, 0.5);

    const handle = this.add
      .rectangle(trackX + trackW * initial, y, 12, 24, PALETTE.TEXT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true, draggable: true });
    handle.setStrokeStyle(2, PALETTE.PANEL);

    const apply = (px: number): void => {
      const clamped = Phaser.Math.Clamp(px, trackX, trackX + trackW);
      const v = (clamped - trackX) / trackW;
      handle.x = clamped;
      fill.width = trackW * v;
      readout.setText(`${Math.round(v * 100)}`);
      onChange(v);
    };

    this.input.setDraggable(handle);
    handle.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, dragX: number) => apply(dragX));

    const hitZone = this.add
      .rectangle(trackX, y, trackW, 32, 0x000000, 0)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    hitZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => apply(p.worldX));
  }

  /**
   * A labelled bidirectional stepper: a left label, a prev button, a centered
   * value, and a next button. `onStep(dir)` fires with -1 (prev) or +1 (next).
   */
  private buildStepper(name: string, y: number, initialValue: string, onStep: (dir: -1 | 1) => void): void {
    const cx = CANVAS.WIDTH / 2;
    Menu.label(this, cx - 240, y, name, 18, 0.9).setOrigin(0, 0.5);
    this.add.text(cx + 120, y, initialValue, textStyle(18)).setOrigin(0.5);
    Menu.button(this, cx + 40, y, '\u25C0', () => onStep(-1), { width: 44, fontSize: 18 });
    Menu.button(this, cx + 200, y, '\u25B6', () => onStep(1), { width: 44, fontSize: 18 });
  }

  private languageText(): string {
    return tr(`language.${this.settings.language}`);
  }

  /** Step language and rebuild so every visible label switches immediately. */
  private stepLanguage(dir: -1 | 1): void {
    const len = LANGUAGES.length;
    const idx = LANGUAGES.indexOf(this.settings.language);
    const next = LANGUAGES[(((idx + dir) % len) + len) % len];
    if (next === this.settings.language) return;
    this.settings.language = next;
    // updateSettings persists AND mirrors into the i18n runtime via setLanguage.
    this.audioMgr.updateSettings({ language: next });
    this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
  }

  /** Reset requires two presses: the first arms it, the second wipes progress. */
  private onResetPressed(): void {
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      this.resetButtonText?.(tr('settings.resetConfirm'));
      return;
    }
    GameState.get().reset();
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title));
  }

  /**
   * Replay the tutorial: clear the tutorial-done flag (re-armed even for a
   * returning player) and go to Town, where TownScene.create runs the guided
   * tour again from step 0.
   */
  private onReplayTutorial(): void {
    GameState.get().resetTutorial();
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
  }

  private close(): void {
    if (this.returnTo === SceneKeys.Title) {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title));
    } else {
      Menu.fadeTo(this, () => this.scene.start(this.returnTo));
    }
  }
}
