import type { TrKey } from '../i18n/strings';

/**
 * TutorialFlow - the pure, Phaser-free state machine that drives the first-run
 * interactive tutorial.
 *
 * It owns the ORDERED sequence of coach-mark steps and the rules for advancing
 * between them, but knows nothing about rendering: the Phaser overlay (in
 * TownScene) reads {@link TutorialFlow.step} to know what to draw and which
 * on-screen control to anchor to, and calls {@link TutorialFlow.advance} /
 * {@link TutorialFlow.skip} as the player acts. Every advancement decision is a
 * pure function of either a "next" button press (informational steps) or a
 * plain {@link TutorialProgress} snapshot (gameplay steps), so the whole
 * sequence is deterministic and fully unit-testable with no Phaser runtime.
 *
 * The machine is once-only by construction: it starts at step 0, advances
 * monotonically, and once it passes the last step it is {@link isComplete} and
 * never re-activates. {@link skip} jumps straight to complete from any step.
 */

/**
 * A plain, serializable snapshot of the bits of game progress the tutorial's
 * gameplay steps watch. Derived by the caller from the live GameState; kept a
 * pure data object so this module never imports a live system.
 */
export interface TutorialProgress {
  /** Whether the upgrade panel is currently open for the Town Center. */
  townCenterPanelOpen: boolean;
  /** Whether a Town Center upgrade is currently in progress (a build started). */
  townCenterUpgrading: boolean;
  /** The current Town Center level. */
  townCenterLevel: number;
  /** Whether the Lumber Mill has been built (level >= 1) — the wood-income step. */
  lumberMillBuilt: boolean;
  /** Whether the Barracks has been built (level >= 1). */
  barracksBuilt: boolean;
  /** Cumulative troops trained over the game's lifetime. */
  troopsTrained: number;
}

/**
 * Where a step's coach-mark should point. The renderer maps each descriptor to
 * a concrete screen anchor:
 *  - 'town_center'      -> the Town Center building sprite.
 *  - 'training'/'battle'/'quests' -> the matching bottom-bar button slot.
 *  - 'upgrade_button'   -> the (now-clickable) Upgrade button in the open panel.
 *  - 'center'           -> screen centre (informational, no specific target).
 */
export type TutorialAnchor =
  | 'center'
  | 'town_center'
  | 'lumber_mill'
  | 'upgrade_button'
  | 'training'
  | 'battle'
  | 'quests';

/**
 * How a step advances:
 *  - 'next': informational — advances only when the player presses Next.
 *  - a predicate over a {@link TutorialProgress} snapshot: a gameplay step that
 *    advances the moment the predicate is satisfied.
 */
export type TutorialAdvance = 'next' | ((p: TutorialProgress) => boolean);

/** One tutorial step: what to say, where to point, and how to move on. */
export interface TutorialStep {
  /** Stable id (used by tests and the renderer). */
  id: string;
  /** i18n body key rendered in the coach-mark card. */
  bodyKey: TrKey;
  /** Where the coach-mark points. */
  anchor: TutorialAnchor;
  /** Advancement rule: 'next' (informational) or a progress predicate. */
  advance: TutorialAdvance;
  /**
   * When true, the step needs UNRESTRICTED interaction with the town and its
   * overlay panels to be satisfied (not just a single click on the anchored
   * control). The renderer must NOT draw a blocking dim frame for such a step —
   * only a non-occluding highlight + guidance card — so every control the
   * player must operate stays clickable.
   *
   * `build_and_train` is the canonical case: the player has to open the
   * Barracks building's upgrade panel to build it, then open the Training panel
   * (which renders BELOW the tutorial overlay) to train a troop. A dim frame
   * pinned to a single bottom-bar slot would occlude all of that and make the
   * step unwinnable, so it opts out of the dim entirely.
   */
  freeInteraction?: boolean;
}

/**
 * The ordered tutorial sequence. The design walks a brand-new player through
 * the core loop exactly once:
 *   0. welcome + the goal of the game               [Next]
 *   1. "this is the Town Center, tap it"            -> its upgrade panel opens
 *   2. "upgrade it to Lv.2"                         -> an upgrade STARTS
 *   3. resources accrue over time + warmth (온기)   [Next]
 *   4. "build the Lumber Mill for wood (needed by upgrades)" -> Lumber Mill built
 *   5. "build a Barracks (needs TC Lv.2) then train a troop" -> a troop trained
 *   6. "march To Battle — and check 임무(Quests)"  [Next]
 *
 * The Lumber Mill step comes early (right after warmth, before the Barracks)
 * because almost every upgrade costs wood: a brand-new player who does not
 * build it first quickly stalls. It sits after the Town Center upgrade so the
 * player has already met the mill's Town-Center-Lv.1 prerequisite (which a
 * fresh game does), keeping the sequence winnable.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    bodyKey: 'tutorial.welcome',
    anchor: 'center',
    advance: 'next',
  },
  {
    id: 'select_town_center',
    bodyKey: 'tutorial.selectTownCenter',
    anchor: 'town_center',
    advance: (p) => p.townCenterPanelOpen,
  },
  {
    id: 'upgrade_town_center',
    bodyKey: 'tutorial.upgradeTownCenter',
    anchor: 'upgrade_button',
    // Advance the moment an upgrade STARTS (build in progress) or once the Town
    // Center has already reached Lv.2 (covers a fast tick completing it).
    advance: (p) => p.townCenterUpgrading || p.townCenterLevel >= 2,
  },
  {
    id: 'resources_warmth',
    bodyKey: 'tutorial.resourcesWarmth',
    anchor: 'center',
    advance: 'next',
  },
  {
    id: 'build_lumber_mill',
    bodyKey: 'tutorial.buildLumberMill',
    anchor: 'lumber_mill',
    // Advance once the Lumber Mill is standing. Buildable immediately (it needs
    // only Town Center Lv.1), so this is a winnable early "wood first" step.
    advance: (p) => p.lumberMillBuilt,
    // The player must open the Lumber Mill's build panel and press Build, so the
    // step needs unrestricted town interaction (no blocking dim frame).
    freeInteraction: true,
  },
  {
    id: 'build_and_train',
    bodyKey: 'tutorial.buildAndTrain',
    anchor: 'training',
    // Advance once the player has trained at least one troop (which requires
    // building the Barracks first, itself gated on Town Center Lv.2).
    advance: (p) => p.troopsTrained > 0,
    // Needs to open the Barracks upgrade panel AND the Training panel, so the
    // dim frame must not block the town — highlight + card only.
    freeInteraction: true,
  },
  {
    id: 'battle_quests',
    bodyKey: 'tutorial.battleQuests',
    anchor: 'battle',
    advance: 'next',
  },
] as const;

/** Sentinel index meaning "past the last step" — the machine is complete. */
const COMPLETE_INDEX = TUTORIAL_STEPS.length;

/**
 * The tutorial state machine. Construct one when the tutorial should run, read
 * {@link step} to render, and call {@link advance}/{@link skip} as the player
 * acts.
 */
export class TutorialFlow {
  private index = 0;

  /** The ordered steps this flow walks (exposed for the renderer/tests). */
  get steps(): readonly TutorialStep[] {
    return TUTORIAL_STEPS;
  }

  /** The current step, or null once the tutorial is complete. */
  get step(): TutorialStep | null {
    return this.isComplete ? null : TUTORIAL_STEPS[this.index];
  }

  /** Zero-based index of the active step (equals the step count once complete). */
  get stepIndex(): number {
    return this.index;
  }

  /** Whether the tutorial has finished (advanced past the last step or skipped). */
  get isComplete(): boolean {
    return this.index >= COMPLETE_INDEX;
  }

  /** Whether the active step is informational (advances via a Next button). */
  get isInformational(): boolean {
    const s = this.step;
    return s !== null && s.advance === 'next';
  }

  /**
   * Whether the active step's advancement condition is currently satisfied by
   * `progress`. Informational ('next') steps are never satisfied by progress
   * alone — they need an explicit {@link advanceInformational}. A pure selector.
   */
  isStepSatisfied(progress: TutorialProgress): boolean {
    const s = this.step;
    if (!s) return false;
    if (s.advance === 'next') return false;
    return s.advance(progress);
  }

  /**
   * Advance an informational step via the Next button. No-op unless the active
   * step is informational (so a stray Next never skips a gameplay step).
   */
  advanceInformational(): void {
    if (this.isInformational) this.index += 1;
  }

  /**
   * Advance a gameplay step if `progress` satisfies its predicate. No-op for
   * informational steps or when the predicate is unmet. Returns true if it
   * advanced.
   */
  advanceIfSatisfied(progress: TutorialProgress): boolean {
    if (this.isComplete) return false;
    if (this.isStepSatisfied(progress)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  /**
   * Unified advance seam used by the renderer each tick / on Next press:
   *  - with no argument (or 'next'): advance an informational step.
   *  - with a progress snapshot: advance a gameplay step if satisfied.
   * Returns true if the active step advanced (so the renderer re-renders).
   */
  advance(input?: 'next' | TutorialProgress): boolean {
    if (this.isComplete) return false;
    if (input === undefined || input === 'next') {
      if (this.isInformational) {
        this.index += 1;
        return true;
      }
      return false;
    }
    return this.advanceIfSatisfied(input);
  }

  /** End the tutorial immediately from any step (Skip). Idempotent. */
  skip(): void {
    this.index = COMPLETE_INDEX;
  }
}
