import Phaser from 'phaser';
import { SceneKeys, CANVAS } from '../config/GameConfig';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';
import { GameScene } from './GameScene';
import { AudioManager } from '../systems/AudioManager';

export interface PauseData { confirmAbandon?: boolean }

/** Paused overlay and the only abandon-confirmation path. */
export class PauseScene extends Phaser.Scene {
  private bgDim!: Phaser.GameObjects.Rectangle;
  private confirming = false;
  private gamepadMenuHeld = false;
  private gamepadArmed = false;

  constructor() { super({ key: SceneKeys.Pause }); }

  create(data: PauseData = {}): void {
    this.confirming = data.confirmAbandon === true;
    this.bgDim = this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.65).setOrigin(0);
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));
    const cx = CANVAS.WIDTH / 2;
    if (this.confirming) {
      Menu.title(this, cx, CANVAS.HEIGHT * 0.27, tr('abandon.title'), 38);
      Menu.label(this, cx, CANVAS.HEIGHT * 0.39, tr('abandon.body'), 18, 0.9);
      Menu.button(this, cx, CANVAS.HEIGHT * 0.56, tr('abandon.continue'), () => this.resume(), { width: 260 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.72, tr('abandon.confirm'), () => this.abandon(), { width: 260 });
    } else {
      Menu.title(this, cx, CANVAS.HEIGHT * 0.24, tr('pause.title'), 44);
      Menu.button(this, cx, CANVAS.HEIGHT * 0.43, tr('pause.resume'), () => this.resume(), { width: 240 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.58, tr('pause.settings'), () => this.openSettings(), { width: 240 });
      Menu.button(this, cx, CANVAS.HEIGHT * 0.73, tr('pause.quit'), () => this.requestAbandon(), { width: 240 });
      Menu.label(this, cx, CANVAS.HEIGHT * 0.9, tr('pause.hint'), 14, 0.5);
    }
    const pauseBinding = AudioManager.get(this).getSettings().bindings.pause;
    if (!pauseBinding.startsWith('MOUSE_')) this.input.keyboard?.on(`keydown-${pauseBinding}`, () => this.resume());
    this.input.keyboard?.on('keydown-ESC', () => this.resume());
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.scene.restart({ confirmAbandon: this.confirming } satisfies PauseData));
  }

  update(): void {
    const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
    const pad = Array.from(pads ?? []).find((candidate): candidate is Gamepad => Boolean(candidate?.connected && candidate.mapping === 'standard')) ?? null;
    const held = Boolean(pad?.buttons[9]?.pressed);
    if (!pad) {
      this.gamepadArmed = false;
      this.gamepadMenuHeld = false;
      return;
    }
    if (!held) this.gamepadArmed = true;
    if (held && !this.gamepadMenuHeld && this.gamepadArmed) this.resume();
    this.gamepadMenuHeld = held;
  }

  private refitBackdrop(rect: VisibleWorldRect): void { this.bgDim.setPosition(rect.x, rect.y).setSize(rect.width, rect.height); }

  private gameScene(): GameScene { return this.scene.get(SceneKeys.Game) as GameScene; }

  private resume(): void {
    this.gameScene().resumeFromPause();
    this.scene.stop();
    this.scene.resume(SceneKeys.Game);
  }

  private openSettings(): void {
    this.scene.launch(SceneKeys.Settings, { returnTo: SceneKeys.Pause });
    this.scene.setVisible(false);
    this.scene.sleep();
  }

  private requestAbandon(): void { this.scene.restart({ confirmAbandon: true } satisfies PauseData); }

  private abandon(): void {
    const game = this.gameScene();
    this.scene.resume(SceneKeys.Game);
    game.resumeFromPause();
    this.scene.stop();
    game.abandonRun();
  }
}
