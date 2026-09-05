import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { AudioManager, type GameSettings } from '../systems/AudioManager';
import { DIFFICULTY_ORDER, stepDifficulty } from '../config/Difficulty';
import { LANGUAGES } from '../i18n/strings';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching Settings as an overlay (e.g. from Pause). */
export interface SettingsData {
  /** Scene key to wake/return to when Settings closes. Defaults to Title. */
  returnTo?: string;
}

/**
 * SettingsScene - master / SFX / music volume sliders + bidirectional
 * difficulty + language selectors.
 *
 * Changes route through the AudioManager singleton, which applies volumes live
 * and PERSISTS every change to localStorage. The scene can be launched two ways:
 *   - As a full screen from the Title (returnTo = Title, the default).
 *   - As an overlay from Pause (returnTo = Pause); on close it wakes that scene.
 *
 * Difficulty and language are each a value label flanked by prev (◀) / next (▶)
 * buttons, so both move in either direction. Switching the language rebuilds
 * the scene (via scene.restart, preserving returnTo) so every visible label
 * flips to the new language immediately.
 */
export class SettingsScene extends Phaser.Scene {
  private audio!: AudioManager;
  private settings!: GameSettings;
  private returnTo: string = SceneKeys.Title;
  private difficultyValueLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: SceneKeys.Settings });
  }

  create(data: SettingsData): void {
    this.audio = AudioManager.get(this);
    this.settings = this.audio.getSettings();
    this.returnTo = data?.returnTo ?? SceneKeys.Title;

    const overlay = this.returnTo !== SceneKeys.Title;
    if (overlay) {
      // Dim backdrop when floating over the Pause/Game scenes.
      this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.6).setOrigin(0, 0);
    } else {
      this.cameras.main.setBackgroundColor(PALETTE.BG_FAR);
      Menu.fadeIn(this);
    }

    const cx = CANVAS.WIDTH / 2;
    Menu.title(this, cx, CANVAS.HEIGHT * 0.14, tr('settings.title'), 40);

    let y = CANVAS.HEIGHT * 0.28;
    const step = 60;
    this.buildSlider(tr('settings.master'), y, this.settings.masterVolume, (v) => {
      this.settings.masterVolume = v;
      this.audio.updateSettings({ masterVolume: v });
    });
    y += step;
    this.buildSlider(tr('settings.sfx'), y, this.settings.sfxVolume, (v) => {
      this.settings.sfxVolume = v;
      this.audio.updateSettings({ sfxVolume: v });
      this.audio.playSfx(AudioKeys.UiClick, 0.7); // audition the new level
    });
    y += step;
    this.buildSlider(tr('settings.music'), y, this.settings.musicVolume, (v) => {
      this.settings.musicVolume = v;
      this.audio.updateSettings({ musicVolume: v });
    });
    y += step;

    // Difficulty selector: ◀ VALUE ▶ (bidirectional).
    this.difficultyValueLabel = this.buildStepper(
      tr('settings.difficulty'),
      y,
      this.difficultyText(),
      (dir) => this.stepDifficulty(dir),
    );
    y += step;

    // Language selector: ◀ VALUE ▶ (bidirectional). Rebuilds on change.
    this.buildStepper(tr('settings.language'), y, this.languageText(), (dir) => this.stepLanguage(dir));

    Menu.button(this, cx, CANVAS.HEIGHT * 0.9, tr('settings.back'), () => this.close(), { width: 200 });

    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  /**
   * A labelled horizontal slider. Drag the handle (or click anywhere on the
   * track) to set the value in [0..1]; `onChange` fires with the new value.
   */
  private buildSlider(name: string, y: number, initial: number, onChange: (v: number) => void): void {
    const trackX = CANVAS.WIDTH / 2 - 80;
    const trackW = 260;

    Menu.label(this, trackX - 24, y, name, 18, 0.9).setOrigin(1, 0.5);

    // Track.
    this.add.rectangle(trackX, y, trackW, 8, PALETTE.WALL_DARK).setOrigin(0, 0.5);
    const fill = this.add.rectangle(trackX, y, trackW * initial, 8, PALETTE.ACCENT).setOrigin(0, 0.5);

    // Value readout.
    const readout = this.add
      .text(trackX + trackW + 16, y, `${Math.round(initial * 100)}`, textStyle(16))
      .setOrigin(0, 0.5);

    // Handle.
    const handle = this.add
      .rectangle(trackX + trackW * initial, y, 12, 24, PALETTE.TEXT)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true, draggable: true });
    handle.setStrokeStyle(2, PALETTE.BG_NEAR);

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

    // Click the track to jump the handle.
    const hitZone = this.add
      .rectangle(trackX, y, trackW, 32, 0x000000, 0)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    hitZone.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => apply(p.worldX));
  }

  /**
   * A labelled bidirectional stepper: a left label, then a ◀ prev button, a
   * centered value, and a ▶ next button. `onStep(dir)` fires with -1 (prev) or
   * +1 (next). Returns the value Text so callers can relabel it after a step.
   */
  private buildStepper(
    name: string,
    y: number,
    initialValue: string,
    onStep: (dir: -1 | 1) => void,
  ): Phaser.GameObjects.Text {
    const cx = CANVAS.WIDTH / 2;

    Menu.label(this, cx - 240, y, name, 18, 0.9).setOrigin(0, 0.5);

    const valueLabel = this.add.text(cx + 120, y, initialValue, textStyle(18)).setOrigin(0.5);

    Menu.button(this, cx + 40, y, '\u25C0', () => onStep(-1), { width: 44, fontSize: 18 });
    Menu.button(this, cx + 200, y, '\u25B6', () => onStep(1), { width: 44, fontSize: 18 });

    return valueLabel;
  }

  private difficultyText(): string {
    return tr(`difficulty.${this.settings.difficulty}`);
  }

  private languageText(): string {
    return tr(`language.${this.settings.language}`);
  }

  /** Step difficulty in either direction across relaxed/standard/brutal. */
  private stepDifficulty(dir: -1 | 1): void {
    const next = stepDifficulty(this.settings.difficulty, dir);
    if (next === this.settings.difficulty && DIFFICULTY_ORDER.length > 1) {
      // Shouldn't happen with wrapping, but guard against no-op relabels.
      return;
    }
    this.settings.difficulty = next;
    this.audio.updateSettings({ difficulty: next });
    this.difficultyValueLabel?.setText(this.difficultyText());
  }

  /** Step language and rebuild so every visible label switches immediately. */
  private stepLanguage(dir: -1 | 1): void {
    const len = LANGUAGES.length;
    const idx = LANGUAGES.indexOf(this.settings.language);
    const next = LANGUAGES[(((idx + dir) % len) + len) % len];
    if (next === this.settings.language) return;
    this.settings.language = next;
    // updateSettings persists AND mirrors into the i18n runtime via setLanguage.
    this.audio.updateSettings({ language: next });
    // Rebuild the scene so all tr()-backed labels re-render in the new language.
    this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
  }

  private close(): void {
    if (this.returnTo === SceneKeys.Title) {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title));
    } else {
      // Overlay mode: stop ourselves and wake the launcher (e.g. Pause).
      this.scene.stop();
      this.scene.wake(this.returnTo);
    }
  }
}
