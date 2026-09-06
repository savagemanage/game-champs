/**
 * Tutorial.ts - the pure, Phaser-free data + helpers behind LAST SQUAD's
 * first-run onboarding tutorial (FEAT-003).
 *
 * The tutorial is a short, linear, skippable sequence that teaches a brand-new
 * player the core loop (the base hub 기지, recruiting/forming heroes 영웅,
 * entering a battle or the Falcon Rescue runner) and the gate-runner controls
 * (slide the squad between two lanes through +/-/x/÷ gates, the squad auto-fires
 * at enemy clusters, reach and defeat the boss).
 *
 * Everything here is plain data + pure functions so it is fully unit-testable
 * with no Phaser runtime: the {@link TutorialScene} overlay reads this ordered
 * step list and drives its own presentation, while the {@link GameStore}
 * persists whether the tutorial has been seen.
 */

import type { TrKey } from '../i18n/strings';

/**
 * A scene hint for where a step's coach-mark conceptually points. Kept as a
 * loose union (not a Phaser scene key) so the pure layer never depends on the
 * scene registry; the overlay maps these to real on-screen anchors.
 */
export type TutorialSceneHint = 'home' | 'run';

/**
 * A single ordered tutorial step. `id` is a stable identifier persisted in the
 * save's `completedSteps`; `titleKey` / `bodyKey` are i18n keys resolved via
 * `tr()` (Korean-first); `scene` hints which screen the step is about; and the
 * optional `target` names the on-screen element the overlay should highlight
 * with a coach-mark.
 */
export interface TutorialStep {
  /** Stable step id (persisted; never reordered/renamed without a migration). */
  id: string;
  /** i18n key for the step's Korean-first title. */
  titleKey: TrKey;
  /** i18n key for the step's Korean-first body copy. */
  bodyKey: TrKey;
  /** Which screen this step is conceptually about. */
  scene: TutorialSceneHint;
  /** Optional identifier of the UI element the coach-mark points at. */
  target?: string;
}

/**
 * The ordered onboarding sequence. Covers, in order: (1) welcome + the goal,
 * (2) the base hub, (3) recruiting / forming heroes, (4) entering a battle or
 * the Falcon Rescue runner, and (5) the gate-runner controls (lanes, gates,
 * auto-fire, boss). The ids are stable and safe to persist.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    titleKey: 'tutorial.step.welcome.title',
    bodyKey: 'tutorial.step.welcome.body',
    scene: 'home',
  },
  {
    id: 'base',
    titleKey: 'tutorial.step.base.title',
    bodyKey: 'tutorial.step.base.body',
    scene: 'home',
    target: 'nav.base',
  },
  {
    id: 'heroes',
    titleKey: 'tutorial.step.heroes.title',
    bodyKey: 'tutorial.step.heroes.body',
    scene: 'home',
    target: 'nav.heroes',
  },
  {
    id: 'battle',
    titleKey: 'tutorial.step.battle.title',
    bodyKey: 'tutorial.step.battle.body',
    scene: 'home',
    target: 'nav.falcon',
  },
  {
    id: 'runner',
    titleKey: 'tutorial.step.runner.title',
    bodyKey: 'tutorial.step.runner.body',
    scene: 'run',
  },
] as const;

/** The first step of the sequence (the entry point for a fresh run). */
export function firstStep(): TutorialStep {
  return TUTORIAL_STEPS[0];
}

/** The zero-based index of a step id, or -1 if the id is unknown. */
export function stepIndex(id: string): number {
  return TUTORIAL_STEPS.findIndex((step) => step.id === id);
}

/** Look up a step by its stable id (undefined if unknown). */
export function stepById(id: string): TutorialStep | undefined {
  const idx = stepIndex(id);
  return idx >= 0 ? TUTORIAL_STEPS[idx] : undefined;
}

/**
 * The step AFTER `currentId`, or null when `currentId` is the last step (or is
 * unknown). Used to advance the linear overlay one step at a time.
 */
export function nextStep(currentId: string): TutorialStep | null {
  const idx = stepIndex(currentId);
  if (idx < 0 || idx >= TUTORIAL_STEPS.length - 1) return null;
  return TUTORIAL_STEPS[idx + 1];
}

/**
 * The step BEFORE `currentId`, or null when `currentId` is the first step (or
 * is unknown). Used to power an optional Back action in the overlay.
 */
export function prevStep(currentId: string): TutorialStep | null {
  const idx = stepIndex(currentId);
  if (idx <= 0) return null;
  return TUTORIAL_STEPS[idx - 1];
}

/** Whether `id` is the final step in the sequence (so the overlay shows 완료). */
export function isLastStep(id: string): boolean {
  const idx = stepIndex(id);
  return idx >= 0 && idx === TUTORIAL_STEPS.length - 1;
}

/** Total number of steps (for a "3/5" style progress readout). */
export function totalSteps(): number {
  return TUTORIAL_STEPS.length;
}

/**
 * Whether the first-run tutorial should auto-show on reaching the base hub,
 * given the persisted `seen` flag. A brand-new player (seen === false) is
 * onboarded once; a returning player (seen === true) never is.
 */
export function shouldShowTutorialOnFirstRun(seen: boolean): boolean {
  return seen === false;
}

/**
 * Whether the Title screen should show its first-run START hint (an animated
 * pointer + "여기를 눌러 시작하세요" line aimed at the primary Deploy button),
 * given the persisted `seen` flag (FEAT-004). Only a brand-new player who has
 * not yet seen the onboarding tutorial (seen === false) is nudged; a returning
 * player (seen === true) sees a clean Title with no hint.
 */
export function shouldShowStartHint(seen: boolean): boolean {
  return seen === false;
}
