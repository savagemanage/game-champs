import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { GameStore } from '../systems/GameStore';
import {
  firstStep,
  isLastStep,
  nextStep,
  prevStep,
  stepById,
  stepIndex,
  totalSteps,
  type TutorialStep,
} from '../systems/Tutorial';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { HomeScene } from './HomeScene';

/**
 * TutorialScene - the first-run onboarding overlay (FEAT-003).
 *
 * Launched with `scene.launch` ON TOP of the current scene (typically the
 * HomeScene base hub), so it dims and draws over what is behind without
 * replacing it; dismissing it reveals the underlying scene unchanged. It walks
 * the player through the ordered {@link TUTORIAL_STEPS}: each step shows a
 * Korean-first title + body in a framed panel with a "3/5" progress readout,
 * 이전(Back)/다음(Next) navigation, a 건너뛰기(Skip) that ends immediately, and
 * 완료(Done) on the last step. A simple coach-mark (a pulsing ring) points at
 * the on-screen area a step is about when a target anchor is known.
 *
 * All tutorial ORDERING lives in the pure {@link Tutorial} module; this scene
 * only presents it and, on finish or skip, calls
 * {@link GameStore.markTutorialSeen} so it never auto-shows again.
 */
export class TutorialScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private coach!: Phaser.GameObjects.Graphics;
  private currentId = firstStep().id;

  constructor() {
    super({ key: SceneKeys.Tutorial });
  }

  create(): void {
    this.currentId = firstStep().id;
    // Draw above everything (the launching scene and its own HUD).
    this.coach = this.add.graphics().setDepth(1);
    this.renderStep();
  }

  /**
   * Coach-mark anchor for a step target id, or null when there is none.
   * Delegates to {@link HomeScene.navAnchorFor} so the ring tracks the real
   * bottom-nav geometry instead of a hand-copied duplicate that could drift.
   */
  private anchorFor(target: string | undefined): { x: number; y: number } | null {
    if (!target) return null;
    return HomeScene.navAnchorFor(target);
  }

  /** Rebuild the overlay for the current step. */
  private renderStep(): void {
    this.layer?.destroy(true);
    const step = stepById(this.currentId) ?? firstStep();
    const cx = CANVAS.WIDTH / 2;

    // Full-screen dim so the underlying scene reads as "paused" behind the guide.
    const dim = this.add
      .rectangle(cx, CANVAS.HEIGHT / 2, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.68)
      .setInteractive(); // swallow taps behind the overlay

    // A coach-mark ring pointing at this step's target, if any.
    this.drawCoachMark(step);

    // Panel with the step copy near the vertical centre.
    const panelW = CANVAS.WIDTH * 0.86;
    const panelH = CANVAS.HEIGHT * 0.42;
    const panelY = CANVAS.HEIGHT * 0.4;
    const panel = Menu.panel(this, cx, panelY, panelW, panelH);

    const idx = stepIndex(step.id);
    const progress = this.add
      .text(cx, panelY - panelH / 2 + 24, tr('tutorial.progress', { step: idx + 1, total: totalSteps() }), textStyle(18, { color: PALETTE.ACCENT_CSS }))
      .setOrigin(0.5);

    const title = this.add
      .text(cx, panelY - panelH / 2 + 60, tr(step.titleKey), textStyle(24, { fontStyle: 'bold', align: 'center' }))
      .setOrigin(0.5);

    const body = this.add
      .text(cx, panelY - panelH / 2 + 104, tr(step.bodyKey), textStyle(20, { align: 'center', wordWrap: { width: panelW - 48 } }))
      .setOrigin(0.5, 0);

    const children: Phaser.GameObjects.GameObject[] = [dim, panel, progress, title, body];

    // Bottom action row: Back (when not first) / Next-or-Done, plus Skip.
    const rowY = panelY + panelH / 2 - 34;
    const back = prevStep(step.id);
    if (back) {
      const backBtn = Menu.button(this, cx - 84, rowY, tr('tutorial.back'), () => this.goPrev(), { width: 150, fontSize: 18 });
      children.push(backBtn.container);
    }
    const advanceLabel = isLastStep(step.id) ? tr('tutorial.done') : tr('tutorial.next');
    const advanceX = back ? cx + 84 : cx;
    const advanceBtn = Menu.button(this, advanceX, rowY, advanceLabel, () => this.goNext(), {
      width: 150,
      fontSize: 18,
      accent: PALETTE.SQUAD,
    });
    children.push(advanceBtn.container);

    // Skip is always available (dismisses the whole tutorial).
    const skip = Menu.button(this, cx, panelY + panelH / 2 + 30, tr('tutorial.skip'), () => this.finish(), {
      width: 160,
      fontSize: 18,
      accent: PALETTE.ROAD,
    });
    children.push(skip.container);

    this.layer = this.add.container(0, 0, children).setDepth(2);
  }

  /** Draw (or clear) the pulsing coach-mark ring for a step's target. */
  private drawCoachMark(step: TutorialStep): void {
    this.coach.clear();
    this.tweens.killTweensOf(this.coach);
    this.coach.setAlpha(1);
    const anchor = this.anchorFor(step.target);
    if (!anchor) return;
    this.coach.lineStyle(4, PALETTE.ACCENT, 1);
    this.coach.strokeCircle(anchor.x, anchor.y, 30);
    this.coach.lineStyle(2, PALETTE.SQUAD, 0.8);
    this.coach.strokeCircle(anchor.x, anchor.y, 40);
    // A gentle pulse to draw the eye to the highlighted tab.
    this.tweens.add({
      targets: this.coach,
      alpha: { from: 1, to: 0.35 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  /** Advance to the next step, or finish when on the last step. */
  private goNext(): void {
    GameStore.get().markTutorialStep(this.currentId);
    const next = nextStep(this.currentId);
    if (!next) {
      this.finish();
      return;
    }
    this.currentId = next.id;
    this.renderStep();
  }

  /** Step back to the previous step (no-op on the first step). */
  private goPrev(): void {
    const prev = prevStep(this.currentId);
    if (!prev) return;
    this.currentId = prev.id;
    this.renderStep();
  }

  /**
   * End the tutorial (from Skip or completing the last step): persist that it
   * has been seen so it never auto-shows again, then stop this overlay scene to
   * reveal the underlying scene untouched.
   */
  private finish(): void {
    const store = GameStore.get();
    store.markTutorialStep(this.currentId);
    store.markTutorialSeen();
    this.tweens.killTweensOf(this.coach);
    // Resume the hub we paused on launch so it ticks/handles input again, then
    // stop this overlay to reveal it untouched.
    if (this.scene.isPaused(SceneKeys.Home)) {
      this.scene.resume(SceneKeys.Home);
    }
    this.scene.stop();
  }
}
