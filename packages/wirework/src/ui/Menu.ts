import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { textStyle } from './UiText';

/** Options for a pixel-styled menu button. */
export interface ButtonOptions {
  /** Font size in px (default 20). */
  fontSize?: number;
  /** Horizontal padding around the label, px (default 20). */
  padX?: number;
  /** Vertical padding around the label, px (default 10). */
  padY?: number;
  /** Fixed width; if omitted the button hugs its label + padding. */
  width?: number;
}

/** The composite object returned for a button (container + updatable label). */
export interface MenuButton {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  /** Replace the button's text. */
  setText(text: string): void;
}

/**
 * Menu - shared pixel-UI helpers so Title/Settings/Pause/GameOver share one
 * cohesive look (palette, fonts, button feel, fade transitions).
 */
export const Menu = {
  /** Standard pixel title text. */
  title(scene: Phaser.Scene, x: number, y: number, text: string, size = 56): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, textStyle(size, { fontStyle: 'bold' })).setOrigin(0.5);
  },

  /** Muted body/label text. */
  label(scene: Phaser.Scene, x: number, y: number, text: string, size = 18, alpha = 0.85): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, textStyle(size)).setOrigin(0.5).setAlpha(alpha);
  },

  /**
   * A clickable pixel button: a bordered panel with a centered label that
   * lights up on hover and plays the UI click SFX on press. Returns a handle so
   * callers can relabel it (e.g. difficulty cycling).
   */
  button(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ): MenuButton {
    const fontSize = opts.fontSize ?? 20;
    const padX = opts.padX ?? 20;
    const padY = opts.padY ?? 10;

    const label = scene.add.text(0, 0, text, textStyle(fontSize)).setOrigin(0.5);

    const w = opts.width ?? Math.ceil(label.width) + padX * 2;
    const h = Math.ceil(label.height) + padY * 2;

    const bg = scene.add.rectangle(0, 0, w, h, PALETTE.BG_NEAR).setOrigin(0.5);
    bg.setStrokeStyle(2, PALETTE.ACCENT);

    const container = scene.add.container(x, y, [bg, label]);
    container.setSize(w, h);
    container.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);

    // Only the topmost interactive object under the pointer should fire, so a
    // passive/transparent rect that happens to sit under a button can never
    // steal its press. Safe to set once per scene from any button.
    scene.input.setTopOnly(true);

    container.on(Phaser.Input.Events.POINTER_OVER, () => {
      bg.setFillStyle(PALETTE.BG_FAR);
      bg.setStrokeStyle(2, PALETTE.TEXT);
      label.setColor(PALETTE.TEXT_CSS);
      scene.tweens.add({ targets: container, scale: 1.06, duration: 90 });
    });
    container.on(Phaser.Input.Events.POINTER_OUT, () => {
      bg.setFillStyle(PALETTE.BG_NEAR);
      bg.setStrokeStyle(2, PALETTE.ACCENT);
      scene.tweens.add({ targets: container, scale: 1, duration: 90 });
    });
    // Fire onClick synchronously ON PRESS. Previously onClick was invoked only
    // from the squash tween's onComplete; the hover scale tween shares the same
    // `container` target, so a POINTER_OVER/OUT tween starting a frame later
    // could override (and drop the onComplete of) the press tween, silently
    // eating the click ("가끔 버튼이 클릭이 안돼"). The squash is now PURELY
    // cosmetic feedback and no longer gates the action. A per-press latch guards
    // against a double-fire if the same press is delivered twice; it is cleared
    // on POINTER_UP / POINTER_OUT so the button remains reusable.
    let fired = false;
    const arm = (): void => {
      fired = false;
    };
    container.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (fired) return;
      fired = true;
      AudioManager.get(scene).playSfx(AudioKeys.UiClick, 0.7);
      scene.tweens.add({ targets: container, scale: 0.94, duration: 60, yoyo: true });
      onClick();
    });
    container.on(Phaser.Input.Events.POINTER_UP, arm);
    container.on(Phaser.Input.Events.POINTER_OUT, arm);

    return {
      container,
      label,
      setText: (t: string) => label.setText(t),
    };
  },

  /**
   * Fade the camera in from black on scene create. Call at the top of create().
   */
  fadeIn(scene: Phaser.Scene, durationMs = 350): void {
    scene.cameras.main.fadeIn(durationMs, 0, 0, 0);
  },

  /**
   * Fade to black then run `then` (typically a scene.start). Guards against
   * double-fires so a button can't queue two transitions.
   */
  fadeTo(scene: Phaser.Scene, then: () => void, durationMs = 300): void {
    const cam = scene.cameras.main;
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
    cam.fadeOut(durationMs, 0, 0, 0);
  },
} as const;
