import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys, TextureKeys } from '../config/AssetKeys';
import { AudioManager, type GameSettings } from '../systems/AudioManager';
import {
  DEFAULT_BINDINGS,
  isBindingTokenValid,
  type Bindings,
  type ColorMode,
  type InputAction,
  type ReducedMotion,
} from '../systems/Persistence';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';
import { stepDifficulty } from '../config/Difficulty';
import { LANGUAGES } from '../i18n/strings';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

export interface SettingsData { returnTo?: string }
const ACTIONS: readonly InputAction[] = ['moveLeft', 'moveRight', 'moveUp', 'moveDown', 'dash', 'tether', 'slash', 'reelIn', 'reelOut', 'pause'];
const REDUCED: readonly ReducedMotion[] = ['system', 'on', 'off'];
const COLORS: readonly ColorMode[] = ['default', 'deuteranopia', 'protanopia', 'tritanopia', 'high-contrast'];

export class SettingsScene extends Phaser.Scene {
  private audio!: AudioManager;
  private settings!: GameSettings;
  private returnTo: string = SceneKeys.Title;
  private backdrop!: Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite;
  private bindingButtons = new Map<InputAction, MenuButton>();
  private capturingBinding = false;

  constructor() { super({ key: SceneKeys.Settings }); }

  create(data: SettingsData = {}): void {
    this.audio = AudioManager.get(this);
    this.settings = this.audio.getSettings();
    this.returnTo = data.returnTo ?? SceneKeys.Title;
    const overlay = this.returnTo !== SceneKeys.Title;
    this.backdrop = overlay
      ? this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.72).setOrigin(0)
      : this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky).setOrigin(0).setDepth(-30);
    this.input.mouse?.disableContextMenu();
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));
    if (!overlay) Menu.fadeIn(this);
    Menu.title(this, CANVAS.WIDTH / 2, 38, tr('settings.title'), 34);
    this.buildGeneralColumn();
    this.buildBindingsColumn();
    Menu.button(this, CANVAS.WIDTH / 2, 508, tr('settings.back'), () => this.close(), { width: 190, fontSize: 17, padY: 6 });
    this.input.keyboard?.on('keydown-ESC', () => { if (!this.capturingBinding) this.close(); });
  }

  private buildGeneralColumn(): void {
    const x = 255;
    let y = 88;
    this.buildNumberStepper(x, y, tr('settings.master'), this.settings.masterVolume, 0, 1, 0.05, (value) => this.applySettings({ masterVolume: value }));
    y += 48;
    this.buildNumberStepper(x, y, tr('settings.sfx'), this.settings.sfxVolume, 0, 1, 0.05, (value) => { this.applySettings({ sfxVolume: value }); this.audio.playSfx(AudioKeys.UiClick); });
    y += 48;
    this.buildNumberStepper(x, y, tr('settings.music'), this.settings.musicVolume, 0, 1, 0.05, (value) => this.applySettings({ musicVolume: value }));
    y += 48;
    this.buildChoiceStepper(x, y, tr('settings.difficulty'), () => tr(`difficulty.${this.settings.difficulty}`), (direction) => {
      this.applySettings({ difficulty: stepDifficulty(this.settings.difficulty, direction) });
    });
    y += 48;
    this.buildChoiceStepper(x, y, tr('settings.language'), () => tr(`language.${this.settings.language}`), (direction) => {
      const index = LANGUAGES.indexOf(this.settings.language);
      this.applySettings({ language: LANGUAGES[(index + direction + LANGUAGES.length) % LANGUAGES.length] });
      this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
    });
    y += 48;
    this.buildChoiceStepper(x, y, tr('settings.reducedMotion'), () => tr(`reduced.${this.settings.reducedMotion}`), (direction) => {
      const index = REDUCED.indexOf(this.settings.reducedMotion);
      this.applySettings({ reducedMotion: REDUCED[(index + direction + REDUCED.length) % REDUCED.length] });
      this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
    });
    y += 48;
    this.buildChoiceStepper(x, y, tr('settings.colorMode'), () => tr(`color.${this.settings.colorMode}`), (direction) => {
      const index = COLORS.indexOf(this.settings.colorMode);
      this.applySettings({ colorMode: COLORS[(index + direction + COLORS.length) % COLORS.length] });
      this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
    });
    y += 48;
    this.buildNumberStepper(x, y, tr('settings.deadzone'), this.settings.gamepadDeadzone, 0.1, 0.35, 0.01, (value) => this.applySettings({ gamepadDeadzone: value }));
    if (!this.audio.storageAvailable) Menu.label(this, x, 464, tr('storage.unavailable'), 12, 1).setColor(PALETTE.DANGER_CSS);
    if (this.audio.audioUnavailable) Menu.label(this, x, 484, tr('audio.unavailable'), 12, 1).setColor(PALETTE.DANGER_CSS);
  }

  private buildBindingsColumn(): void {
    const x = 705;
    Menu.label(this, x, 75, tr('settings.bindings'), 18, 1);
    ACTIONS.forEach((action, index) => {
      const y = 105 + index * 34;
      const actionLabel = tr(`action.${action}`);
      Menu.label(this, x - 130, y, actionLabel, 14, 0.9).setOrigin(0, 0.5);
      const button = Menu.button(this, x + 65, y, this.settings.bindings[action], () => this.captureBinding(action), {
        width: 145, fontSize: 14, padY: 3, accessibleLabel: actionLabel,
      });
      this.bindingButtons.set(action, button);
    });
    Menu.button(this, x, 466, tr('settings.restoreBindings'), () => {
      this.applySettings({ bindings: { ...DEFAULT_BINDINGS } });
      for (const action of ACTIONS) this.bindingButtons.get(action)?.setText(this.settings.bindings[action]);
    }, { width: 220, fontSize: 14, padY: 5 });
  }

  private buildNumberStepper(
    x: number, y: number, label: string, initial: number, min: number, max: number, step: number,
    onChange: (value: number) => void,
  ): void {
    Menu.label(this, x - 180, y, label, 15, 0.9).setOrigin(0, 0.5);
    const value = this.add.text(x + 65, y, initial.toFixed(step < 0.05 ? 2 : 1), textStyle(15)).setOrigin(0.5);
    let current = initial;
    const format = (): string => current.toFixed(step < 0.05 ? 2 : 1);
    const apply = (direction: -1 | 1): void => {
      current = Phaser.Math.Clamp(Math.round((current + direction * step) * 100) / 100, min, max);
      value.setText(format());
      decrease.setAccessibleLabel(`${tr('settings.decrease', { setting: label })}: ${format()}`);
      increase.setAccessibleLabel(`${tr('settings.increase', { setting: label })}: ${format()}`);
      onChange(current);
    };
    const decrease = Menu.button(this, x, y, '◀', () => apply(-1), {
      width: 38, fontSize: 14, padY: 3, accessibleLabel: tr('settings.decrease', { setting: label }),
    });
    const increase = Menu.button(this, x + 130, y, '▶', () => apply(1), {
      width: 38, fontSize: 14, padY: 3, accessibleLabel: tr('settings.increase', { setting: label }),
    });
    decrease.setAccessibleLabel(`${tr('settings.decrease', { setting: label })}: ${format()}`);
    increase.setAccessibleLabel(`${tr('settings.increase', { setting: label })}: ${format()}`);
  }

  private buildChoiceStepper(x: number, y: number, label: string, text: () => string, onStep: (direction: -1 | 1) => void): void {
    Menu.label(this, x - 180, y, label, 15, 0.9).setOrigin(0, 0.5);
    const value = this.add.text(x + 65, y, text(), textStyle(14)).setOrigin(0.5);
    const apply = (direction: -1 | 1): void => {
      onStep(direction);
      value.setText(text());
      decrease.setAccessibleLabel(`${tr('settings.decrease', { setting: label })}: ${text()}`);
      increase.setAccessibleLabel(`${tr('settings.increase', { setting: label })}: ${text()}`);
    };
    const decrease = Menu.button(this, x, y, '◀', () => apply(-1), {
      width: 38, fontSize: 14, padY: 3, accessibleLabel: tr('settings.decrease', { setting: label }),
    });
    const increase = Menu.button(this, x + 130, y, '▶', () => apply(1), {
      width: 38, fontSize: 14, padY: 3, accessibleLabel: tr('settings.increase', { setting: label }),
    });
    decrease.setAccessibleLabel(`${tr('settings.decrease', { setting: label })}: ${text()}`);
    increase.setAccessibleLabel(`${tr('settings.increase', { setting: label })}: ${text()}`);
  }

  private captureBinding(action: InputAction): void {
    if (this.capturingBinding) return;
    this.capturingBinding = true;
    this.bindingButtons.get(action)?.setText(tr('settings.pressKey'));
    const keyboard = this.input.keyboard;
    const cancel = (): void => {
      this.capturingBinding = false;
      this.bindingButtons.get(action)?.setText(this.settings.bindings[action]);
      keyboard?.off('keydown', onKey);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, onPointer);
    };
    const apply = (next: string): void => {
      const conflict = ACTIONS.find((candidate) => candidate !== action && this.settings.bindings[candidate] === next);
      const bindings: Bindings = { ...this.settings.bindings };
      if (conflict && !isBindingTokenValid(conflict, bindings[action])) {
        window.alert(tr('settings.bindingIncompatible'));
        cancel();
        return;
      }
      if (conflict && !window.confirm(tr('settings.bindingConflict', { action: tr(`action.${conflict}`) }))) {
        cancel();
        return;
      }
      if (conflict) bindings[conflict] = bindings[action];
      bindings[action] = next;
      this.applySettings({ bindings });
      cancel();
      for (const candidate of ACTIONS) this.bindingButtons.get(candidate)?.setText(this.settings.bindings[candidate]);
    };
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      if (event.key === 'Escape') { cancel(); return; }
      apply(event.key === ' ' ? 'SPACE' : event.key.toUpperCase());
    };
    const onPointer = (pointer: Phaser.Input.Pointer): void => {
      if (action !== 'tether' && action !== 'slash') return;
      const token = pointer.button === 0 ? 'MOUSE_LEFT' : pointer.button === 2 ? 'MOUSE_RIGHT' : null;
      if (token) apply(token);
    };
    keyboard?.on('keydown', onKey);
    this.time.delayedCall(0, () => {
      if (this.capturingBinding) this.input.on(Phaser.Input.Events.POINTER_DOWN, onPointer);
    });
  }

  private applySettings(patch: Partial<GameSettings>): void {
    this.audio.updateSettings(patch);
    this.settings = this.audio.getSettings();
  }

  private refitBackdrop(rect: VisibleWorldRect): void { this.backdrop.setPosition(rect.x, rect.y).setSize(rect.width, rect.height); }
  private close(): void {
    if (this.returnTo === SceneKeys.Title) Menu.fadeTo(this, () => this.scene.start(SceneKeys.Title));
    else { this.scene.stop(); this.scene.wake(this.returnTo); }
  }
}
