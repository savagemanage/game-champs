import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { AudioManager, type Difficulty, type GameSettings } from '../systems/AudioManager';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching Settings as an overlay (e.g. from Pause). */
export interface SettingsData {
  /** Scene key to wake/return to when Settings closes. Defaults to Title. */
  returnTo?: string;
}

/** The next difficulty in the relaxed -> standard -> brutal -> relaxed cycle. */
const DIFFICULTY_CYCLE: Difficulty[] = ['relaxed', 'standard', 'brutal'];

/**
 * SettingsScene - master / SFX / music volume sliders + a difficulty selector.
 *
 * Changes route through the AudioManager singleton, which applies volumes live
 * and PERSISTS every change to localStorage. The scene can be launched two ways:
 *   - As a full screen from the Title (returnTo = Title, the default).
 *   - As an overlay from Pause (returnTo = Pause); on close it wakes that scene.
 */
export class SettingsScene extends Phaser.Scene {
  private audio!: AudioManager;
  private settings!: GameSettings;
  private returnTo: string = SceneKeys.Title;
  private difficultyBtnLabel: Phaser.GameObjects.Text | null = null;

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
    Menu.title(this, cx, CANVAS.HEIGHT * 0.14, 'SETTINGS', 40);

    let y = CANVAS.HEIGHT * 0.3;
    const step = 68;
    this.buildSlider('Master', y, this.settings.masterVolume, (v) => {
      this.settings.masterVolume = v;
      this.audio.updateSettings({ masterVolume: v });
    });
    y += step;
    this.buildSlider('SFX', y, this.settings.sfxVolume, (v) => {
      this.settings.sfxVolume = v;
      this.audio.updateSettings({ sfxVolume: v });
      this.audio.playSfx(AudioKeys.UiClick, 0.7); // audition the new level
    });
    y += step;
    this.buildSlider('Music', y, this.settings.musicVolume, (v) => {
      this.settings.musicVolume = v;
      this.audio.updateSettings({ musicVolume: v });
    });
    y += step;

    // Difficulty selector (cycles on click).
    Menu.label(this, cx - 240, y, 'Difficulty', 18, 0.9).setOrigin(0, 0.5);
    const diffBtn = Menu.button(this, cx + 120, y, this.difficultyText(), () => this.cycleDifficulty(), {
      width: 220,
    });
    this.difficultyBtnLabel = diffBtn.label;

    Menu.button(this, cx, CANVAS.HEIGHT * 0.88, 'Back', () => this.close(), { width: 200 });

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

  private difficultyText(): string {
    return this.settings.difficulty.toUpperCase();
  }

  private cycleDifficulty(): void {
    const idx = DIFFICULTY_CYCLE.indexOf(this.settings.difficulty);
    const next = DIFFICULTY_CYCLE[(idx + 1) % DIFFICULTY_CYCLE.length];
    this.settings.difficulty = next;
    this.audio.updateSettings({ difficulty: next });
    this.difficultyBtnLabel?.setText(this.difficultyText());
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
