import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { textStyle } from './UiText';
import { accessibleControlVisible, registerAccessibleButton } from './Accessibility';

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
  /** Fixed height; if omitted the button hugs its label + padding. */
  height?: number;
  /** Accent (border/hover) colour override, 0xRRGGBB. */
  accent?: number;
}

/** The composite object returned for a button. */
export interface MenuButton {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  /** Semantic DOM mirror used for keyboard focus management. */
  readonly domElement: HTMLButtonElement | null;
  /** Replace the button's text. */
  setText(text: string): void;
  /** Enable/disable the button: disabled buttons grey out and ignore clicks. */
  setEnabled(enabled: boolean): void;
  /** Whether the button currently accepts input. */
  readonly enabled: boolean;
}

/** A drawable, updatable progress bar (fill 0..1). */
export interface ProgressBar {
  container: Phaser.GameObjects.Container;
  /** Set the fill fraction in [0..1]. */
  setProgress(fraction: number): void;
  /** Recolour the fill (e.g. green when complete). */
  setFillColor(color: number): void;
}

/**
 * Menu - shared pixel-UI helpers so Title / Town / Settings / battle screens
 * share one cohesive medieval look (palette, fonts, button feel, panels,
 * progress bars, fade transitions). Mirrors wirework's ui/Menu.ts.
 */
export const Menu = {
  /** Standard pixel title text. */
  title(scene: Phaser.Scene, x: number, y: number, text: string, size = 48): Phaser.GameObjects.Text {
    return scene.add
      .text(x, y, text, textStyle(size, { fontStyle: 'bold', color: PALETTE.TEXT_CSS }))
      .setOrigin(0.5)
      .setShadow(3, 3, '#000000', 4);
  },

  /** Muted body/label text. */
  label(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    size = 18,
    alpha = 0.9,
  ): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, textStyle(size)).setOrigin(0.5).setAlpha(alpha);
  },

  /**
   * A framed panel rectangle in the parchment/timber palette. Returns the
   * rectangle so callers can reposition/resize it.
   */
  panel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 0.96,
  ): Phaser.GameObjects.Rectangle {
    const panel = scene.add.rectangle(x, y, width, height, PALETTE.PANEL, alpha).setOrigin(0.5);
    panel.setStrokeStyle(2, PALETTE.ACCENT);
    return panel;
  },

  /**
   * A clickable pixel button: a bordered panel with a centered label that
   * lights up on hover and plays the UI click SFX on press. Returns a handle so
   * callers can relabel or enable/disable it (e.g. an unaffordable Upgrade).
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
    const accent = opts.accent ?? PALETTE.ACCENT;

    const label = scene.add.text(0, 0, text, textStyle(fontSize)).setOrigin(0.5);

    // The button (and its hit area) must always be at least as large as the
    // label, even when a caller passes a fixed width/height. Otherwise glyphs
    // can overflow the bg and a press directly over the visible text lands
    // outside the interactive rectangle and never registers. Padding keeps a
    // comfortable click margin around the text in both axes.
    const minW = Math.ceil(label.width) + padX * 2;
    const minH = Math.ceil(label.height) + padY * 2;
    const w = Math.max(opts.width ?? minW, minW);
    const h = Math.max(44, opts.height ?? minH, minH);

    const bg = scene.add.rectangle(0, 0, w, h, PALETTE.PANEL).setOrigin(0.5);
    bg.setStrokeStyle(2, accent);

    const container = scene.add.container(x, y, [bg, label]);
    // Size the container to the button box and let Phaser DERIVE the input hit
    // area from that size. A container's derived hit rectangle is composed
    // through the FULL parent-transform chain during pointer hit-testing, so
    // the button stays clickable at its true on-screen position even when it is
    // re-parented into a panel Container (upgrade panel, overlay panels). An
    // explicit local-origin Geom.Rectangle passed to setInteractive is NOT
    // re-composed the same way once nested, which is why re-parented buttons
    // used to miss clicks. setSize centres the derived hit box on the origin.
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });

    // Only the topmost interactive object under the pointer should fire, so a
    // passive/transparent rect under a button can never steal its press.
    scene.input.setTopOnly(true);

    let enabled = true;

    container.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (!enabled) return;
      bg.setFillStyle(PALETTE.STONE_DARK);
      bg.setStrokeStyle(2, PALETTE.TEXT);
      scene.tweens.add({ targets: container, scale: 1.05, duration: 90 });
    });
    container.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (!enabled) return;
      bg.setFillStyle(PALETTE.PANEL);
      bg.setStrokeStyle(2, accent);
      scene.tweens.add({ targets: container, scale: 1, duration: 90 });
    });

    // Fire onClick synchronously ON PRESS; the squash is purely cosmetic and
    // never gates the action (a hover tween sharing this target could otherwise
    // drop an onComplete-based click). A per-press latch guards against one
    // press dispatching twice within the same pointer cycle.
    //
    // The latch is re-armed (reset to fireable) on ANY pointer release in the
    // scene, not just this container's own POINTER_UP/OUT. Re-arming only on the
    // container's own events was fragile: when onClick starts a scene transition
    // (fadeTo -> scene.start/restart) or the pointer lifts off the container,
    // that container never receives its own POINTER_UP, so `fired` stayed stuck
    // true and swallowed the next genuine press until a hover-out/in re-armed
    // it. A scene-level pointerup always fires, so the button is guaranteed
    // pressable again on the next real press with no dead period.
    let fired = false;
    const arm = (): void => {
      fired = false;
    };
    container.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (!enabled || fired) return;
      fired = true;
      AudioManager.get(scene).playSfx(AudioKeys.UiClick, 0.7);
      scene.tweens.add({ targets: container, scale: 0.94, duration: 60, yoyo: true });
      onClick();
    });
    container.on(Phaser.Input.Events.POINTER_UP, arm);
    container.on(Phaser.Input.Events.POINTER_OUT, arm);
    // Re-arm on ANY release in the scene (covers releases off the container and
    // presses that triggered a scene transition before the container's own
    // POINTER_UP could fire).
    scene.input.on(Phaser.Input.Events.POINTER_UP, arm);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, arm);
    // The scene-level listeners outlive this container's own events, so drop
    // them when the button is destroyed to avoid leaks across scene restarts.
    container.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off(Phaser.Input.Events.POINTER_UP, arm);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, arm);
    });

    const domButton = registerAccessibleButton(scene, container, text, () => {
      if (!enabled) return;
      AudioManager.get(scene).playSfx(AudioKeys.UiClick, 0.7);
      onClick();
    });
    if (domButton) {
      const syncDomVisibility = (): void => {
        domButton.hidden = !accessibleControlVisible(container);
      };
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, syncDomVisibility);
      container.once(Phaser.GameObjects.Events.DESTROY, () => {
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, syncDomVisibility);
      });
      syncDomVisibility();
    }

    const setEnabled = (next: boolean): void => {
      enabled = next;
      container.setAlpha(next ? 1 : 0.45);
      bg.setFillStyle(PALETTE.PANEL);
      bg.setStrokeStyle(2, next ? accent : PALETTE.STONE_DARK);
      label.setColor(next ? PALETTE.TEXT_CSS : PALETTE.MUTED_CSS);
      if (domButton) domButton.disabled = !next;
      if (next) container.setInteractive();
      else container.disableInteractive();
    };

    return {
      container,
      label,
      domElement: domButton,
      setText: (t: string) => {
        label.setText(t);
        if (domButton) {
          domButton.textContent = t;
          domButton.setAttribute('aria-label', t);
        }
      },
      setEnabled,
      get enabled() {
        return enabled;
      },
    };
  },

  /**
   * A framed horizontal progress bar. `setProgress(0..1)` sets the fill width;
   * `setFillColor` recolours it. Used for build/train timers.
   */
  progressBar(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height = 12,
    fillColor: number = PALETTE.ACCENT,
  ): ProgressBar {
    const border = scene.add.rectangle(0, 0, width + 4, height + 4, PALETTE.STONE_DARK).setOrigin(0, 0.5);
    border.setStrokeStyle(2, PALETTE.STONE);
    const fill = scene.add.rectangle(2, 0, 1, height, fillColor).setOrigin(0, 0.5);
    const container = scene.add.container(x, y, [border, fill]);

    return {
      container,
      setProgress: (fraction: number) => {
        const clamped = Phaser.Math.Clamp(fraction, 0, 1);
        fill.width = Math.max(1, Math.floor(width * clamped));
      },
      setFillColor: (color: number) => fill.setFillStyle(color),
    };
  },

  /**
   * Fade the camera in from black on scene create. Call at the top of create().
   *
   * `resetFX()` runs first so a scene that was left faded-to-black by a prior
   * `fadeTo()` transition always starts from a clean camera. Without this a
   * destination scene can inherit the previous scene's completed fade-out and
   * render fully black (e.g. pressing Back). Centralising the reset here means
   * every scene using this shared helper is correct by construction.
   */
  fadeIn(scene: Phaser.Scene, durationMs = 350): void {
    scene.cameras.main.resetFX();
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) scene.cameras.main.fadeIn(durationMs, 0, 0, 0);
  },

  /**
   * Fade to black then run `then` (typically a scene.start). Guards against
   * double-fires so a button can't queue two transitions.
   */
  fadeTo(scene: Phaser.Scene, then: () => void, durationMs = 300): void {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      then();
      return;
    }
    const cam = scene.cameras.main;
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
    cam.fadeOut(durationMs, 0, 0, 0);
  },
} as const;
