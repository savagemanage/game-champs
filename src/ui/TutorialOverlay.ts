import Phaser from 'phaser';
import { CANVAS, PALETTE } from '../config/GameConfig';
import { Menu, type MenuButton } from './Menu';
import { textStyle } from './UiText';
import { tr } from '../i18n/i18n';
import type { TutorialFlow, TutorialAnchor, TutorialStep } from '../systems/TutorialFlow';

/** A screen-space rectangle a coach-mark can point at. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolves a step's anchor descriptor to a concrete on-screen rect. */
export type AnchorResolver = (anchor: TutorialAnchor) => AnchorRect;

/**
 * TutorialOverlay - the thin Phaser renderer for the first-run interactive
 * tutorial. It knows NOTHING about sequencing (that lives in the pure
 * {@link TutorialFlow}); it just draws the ACTIVE step as a coach-mark:
 *
 *  - a dimmed backdrop built from FOUR rectangles framing the target's rect, so
 *    the target itself is never covered by an interactive dim — the player can
 *    still click the highlighted building / bottom-bar button / Upgrade button
 *    underneath. The four frame pieces swallow clicks everywhere else.
 *  - a bright highlight border around the target rect.
 *  - an instruction card near the target with the step body text, a persistent
 *    Skip button, and (for informational steps) a Next button.
 *
 * The owning scene calls {@link render} whenever the active step changes and
 * {@link destroy} on completion/skip. Callbacks fire on Skip / Next presses.
 */
export class TutorialOverlay {
  private readonly scene: Phaser.Scene;
  private readonly flow: TutorialFlow;
  private readonly resolveAnchor: AnchorResolver;
  private readonly onNext: () => void;
  private readonly onSkip: () => void;

  /** Everything drawn for the CURRENT step; torn down and rebuilt on render. */
  private layer: Phaser.GameObjects.Container | null = null;
  private buttons: MenuButton[] = [];
  private destroyed = false;

  /**
   * The dim-frame rectangles + highlight border for the current step. These are
   * hidden while a gameplay panel (Training/Research/Hero/Quest) is open so the
   * panel — which renders BELOW this overlay — stays fully clickable. Kept
   * separate from the instruction card, which stays visible throughout.
   */
  private dimObjects: Phaser.GameObjects.GameObject[] = [];
  /** Whether the dim frame is currently suspended (a gameplay panel is open). */
  private dimSuspended = false;

  /**
   * The instruction card, held in its own container so it can be repositioned
   * as a unit. While the dim is suspended (a gameplay panel is open) the card
   * is lifted to the top strip so it never covers the panel's build/train
   * controls; otherwise it sits in its normal near-target position.
   */
  private cardContainer: Phaser.GameObjects.Container | null = null;
  /** The card's normal (non-suspended) y centre. */
  private cardBaseY = 0;
  /**
   * The card's y centre while suspended: high enough that its bottom edge stays
   * above an open panel's interactive rows.
   */
  private static readonly CARD_SUSPENDED_Y = 12;

  /** Depth for the dim frame; the highlight/card sit just above it. */
  private static readonly DIM_DEPTH = 80;
  private static readonly CARD_DEPTH = 82;

  constructor(
    scene: Phaser.Scene,
    flow: TutorialFlow,
    resolveAnchor: AnchorResolver,
    callbacks: { onNext: () => void; onSkip: () => void },
  ) {
    this.scene = scene;
    this.flow = flow;
    this.resolveAnchor = resolveAnchor;
    this.onNext = callbacks.onNext;
    this.onSkip = callbacks.onSkip;
  }

  /** (Re)draw the overlay for the flow's current step. No-op once destroyed. */
  render(): void {
    if (this.destroyed) return;
    this.clearLayer();
    const step = this.flow.step;
    if (!step) return;

    const container = this.scene.add.container(0, 0).setDepth(TutorialOverlay.DIM_DEPTH);
    this.layer = container;

    const target = this.resolveAnchor(step.anchor);
    const isCenter = step.anchor === 'center';

    if (isCenter) {
      // Informational step: a single full-screen dim (no cutout needed).
      const dim = this.scene.add
        .rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.6)
        .setOrigin(0, 0)
        .setInteractive();
      container.add(dim);
      this.dimObjects.push(dim);
    } else {
      // Gameplay step: frame the target with four dim rectangles so the target
      // rect stays clickable (never covered by an interactive dim), and draw a
      // highlight border around it. A `freeInteraction` step (e.g.
      // build_and_train) omits the blocking dim entirely — it must operate the
      // Barracks upgrade panel and the Training panel, both of which a dim would
      // occlude — leaving only the non-occluding highlight + guidance card.
      if (!step.freeInteraction) this.addDimFrame(container, target);
      const border = this.scene.add
        .rectangle(target.x, target.y, target.width + 8, target.height + 8)
        .setStrokeStyle(3, PALETTE.ACCENT)
        .setFillStyle(PALETTE.ACCENT, 0)
        .setDepth(TutorialOverlay.CARD_DEPTH);
      // A gentle pulse to draw the eye to the target.
      this.scene.tweens.add({
        targets: border,
        alpha: { from: 1, to: 0.4 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
      container.add(border);
      this.dimObjects.push(border);
    }

    this.addCard(container, step, target, isCenter);
    // Re-apply any active suspension to the freshly built dim (e.g. a re-render
    // triggered while a gameplay panel is still open).
    this.applyDimSuspension();
  }

  /**
   * Suspend or resume the dim frame + highlight border. Called by the owning
   * scene when a gameplay overlay panel (Training/Research/Hero/Quest) opens or
   * closes: those panels render at a depth BELOW this overlay, so while one is
   * open the dim would occlude the panel's own buttons and make the step
   * unwinnable (notably `build_and_train`, which needs the TrainingPanel's
   * build/train controls). Hiding the dim lets the panel receive clicks; the
   * instruction card stays visible so the player still sees the guidance.
   */
  setDimSuspended(suspended: boolean): void {
    if (this.dimSuspended === suspended) return;
    this.dimSuspended = suspended;
    this.applyDimSuspension();
  }

  /**
   * Apply the current suspension state to the dim objects of the active step.
   * Hiding a Phaser GameObject also removes it from input hit-testing, so an
   * invisible dim rectangle no longer swallows clicks meant for the panel
   * beneath the overlay.
   */
  private applyDimSuspension(): void {
    for (const obj of this.dimObjects) {
      const withVisible = obj as Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => unknown };
      withVisible.setVisible?.(!this.dimSuspended);
    }
    // Lift the card to the top strip while suspended so it never covers an open
    // panel's build/train controls; restore it to its near-target spot when the
    // panel closes. The container's y is a delta from the card's built-in
    // absolute child positions (built at cardBaseY).
    if (this.cardContainer) {
      this.cardContainer.y = this.dimSuspended
        ? TutorialOverlay.CARD_SUSPENDED_Y - this.cardBaseY
        : 0;
    }
  }

  /**
   * Four dim rectangles (top / bottom / left / right) that together cover the
   * whole canvas EXCEPT the target rect. Each is interactive so clicks outside
   * the target are swallowed by the overlay (they never reach the town behind).
   */
  private addDimFrame(container: Phaser.GameObjects.Container, r: AnchorRect): void {
    const pad = 4;
    const left = Math.max(0, r.x - r.width / 2 - pad);
    const right = Math.min(CANVAS.WIDTH, r.x + r.width / 2 + pad);
    const top = Math.max(0, r.y - r.height / 2 - pad);
    const bottom = Math.min(CANVAS.HEIGHT, r.y + r.height / 2 + pad);
    const alpha = 0.6;
    const pieces: [number, number, number, number][] = [
      // x, y, w, h (origin 0,0)
      [0, 0, CANVAS.WIDTH, top], // above target
      [0, bottom, CANVAS.WIDTH, CANVAS.HEIGHT - bottom], // below target
      [0, top, left, bottom - top], // left of target
      [right, top, CANVAS.WIDTH - right, bottom - top], // right of target
    ];
    for (const [x, y, w, h] of pieces) {
      if (w <= 0 || h <= 0) continue;
      const rect = this.scene.add.rectangle(x, y, w, h, 0x000000, alpha).setOrigin(0, 0).setInteractive();
      container.add(rect);
    }
  }

  /**
   * The instruction card: body text, a persistent Skip button, and a Next
   * button for informational steps. Positioned so it does not cover the target
   * (below it, or above if the target sits low on screen).
   */
  private addCard(
    container: Phaser.GameObjects.Container,
    step: TutorialStep,
    target: AnchorRect,
    isCenter: boolean,
  ): void {
    const cardW = 460;
    const cardH = 150;
    const cx = CANVAS.WIDTH / 2;

    // Place the card clear of the target: centre for info steps, otherwise on
    // the opposite vertical half from the target so the arrow can point to it.
    let cy: number;
    if (isCenter) {
      cy = CANVAS.HEIGHT / 2;
    } else if (target.y < CANVAS.HEIGHT / 2) {
      cy = CANVAS.HEIGHT - cardH / 2 - 24; // target high -> card low
    } else {
      cy = cardH / 2 + 70; // target low -> card high (clear of the top bar)
    }
    this.cardBaseY = cy;

    // Build the card in its own container so the whole card can be lifted to
    // the top strip when the dim is suspended (a gameplay panel is open),
    // keeping the guidance visible without covering the panel's controls.
    const card = this.scene.add.container(0, 0).setDepth(TutorialOverlay.CARD_DEPTH);
    this.cardContainer = card;
    container.add(card);

    const panel = Menu.panel(this.scene, cx, cy, cardW, cardH);
    panel.setInteractive(); // absorb clicks on the card body
    card.add(panel);

    const body = this.scene.add
      .text(cx, cy - 22, tr(step.bodyKey), textStyle(15, {
        align: 'center',
        color: PALETTE.TEXT_CSS,
        wordWrap: { width: cardW - 48 },
      }))
      .setOrigin(0.5)
      .setLineSpacing(5);
    card.add(body);

    const btnY = cy + cardH / 2 - 30;
    // Persistent Skip button (bottom-left of the card).
    const skip = Menu.button(this.scene, cx - cardW / 2 + 80, btnY, tr('tutorial.skip'), () => this.onSkip(), {
      width: 130,
      height: 40,
      fontSize: 15,
    });
    card.add(skip.container);
    this.buttons.push(skip);

    // Next button for informational steps only (gameplay steps advance on the
    // player's action, so no Next is shown).
    if (step.advance === 'next') {
      const next = Menu.button(this.scene, cx + cardW / 2 - 80, btnY, tr('tutorial.next'), () => this.onNext(), {
        width: 130,
        height: 40,
        fontSize: 15,
        accent: PALETTE.SUCCESS,
      });
      card.add(next.container);
      this.buttons.push(next);
    }
  }

  private clearLayer(): void {
    this.buttons = [];
    this.dimObjects = [];
    this.cardContainer = null;
    if (this.layer) {
      this.layer.destroy(true);
      this.layer = null;
    }
  }

  /** Tear down the whole overlay permanently. */
  destroy(): void {
    this.destroyed = true;
    this.clearLayer();
  }
}
