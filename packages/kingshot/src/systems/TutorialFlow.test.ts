import { describe, it, expect } from 'vitest';
import { TutorialFlow, TUTORIAL_STEPS, type TutorialProgress } from './TutorialFlow';

/**
 * Pure-logic tests for the first-run tutorial state machine (Phaser-free), in
 * the existing co-located system-test style. They pin the step ORDER, the
 * informational-vs-gameplay advancement rules, skip-from-any-step, and the
 * once-only guarantee.
 */

/** A progress snapshot with all conditions unmet (deep-copyable base). */
const nothingDone = (): TutorialProgress => ({
  townCenterPanelOpen: false,
  townCenterUpgrading: false,
  townCenterLevel: 1,
  lumberMillBuilt: false,
  barracksBuilt: false,
  troopsTrained: 0,
});

describe('TutorialFlow step sequence', () => {
  it('exposes exactly the designed steps in order', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'select_town_center',
      'upgrade_town_center',
      'resources_warmth',
      'build_lumber_mill',
      'build_and_train',
      'battle_quests',
    ]);
  });

  it('starts on the first step and is not complete', () => {
    const flow = new TutorialFlow();
    expect(flow.isComplete).toBe(false);
    expect(flow.stepIndex).toBe(0);
    expect(flow.step?.id).toBe('welcome');
    expect(flow.step?.anchor).toBe('center');
    expect(flow.isInformational).toBe(true);
  });

  it('reports the correct anchor per step as it advances', () => {
    const flow = new TutorialFlow();
    expect(flow.step?.anchor).toBe('center'); // welcome
    flow.advance('next');
    expect(flow.step?.id).toBe('select_town_center');
    expect(flow.step?.anchor).toBe('town_center');
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true });
    expect(flow.step?.id).toBe('upgrade_town_center');
    expect(flow.step?.anchor).toBe('upgrade_button');
  });
});

describe('TutorialFlow advancement rules', () => {
  it('informational steps advance ONLY on next, never on progress', () => {
    const flow = new TutorialFlow();
    // A progress snapshot must not advance the informational welcome step.
    expect(flow.advance({ ...nothingDone(), townCenterPanelOpen: true })).toBe(false);
    expect(flow.step?.id).toBe('welcome');
    // Next advances it.
    expect(flow.advance('next')).toBe(true);
    expect(flow.step?.id).toBe('select_town_center');
  });

  it('gameplay steps advance ONLY when their predicate is satisfied, never on next', () => {
    const flow = new TutorialFlow();
    flow.advance('next'); // -> select_town_center (gameplay)
    // Next does nothing on a gameplay step.
    expect(flow.advance('next')).toBe(false);
    expect(flow.step?.id).toBe('select_town_center');
    // Unsatisfied progress does nothing.
    expect(flow.advance(nothingDone())).toBe(false);
    expect(flow.step?.id).toBe('select_town_center');
    // Satisfying the predicate advances.
    expect(flow.advance({ ...nothingDone(), townCenterPanelOpen: true })).toBe(true);
    expect(flow.step?.id).toBe('upgrade_town_center');
  });

  it('the upgrade step advances only when Town Center Lv.2 is complete', () => {
    const flow = new TutorialFlow();
    flow.advance('next');
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true });
    expect(flow.step?.id).toBe('upgrade_town_center');
    expect(flow.isStepSatisfied({ ...nothingDone(), townCenterPanelOpen: true })).toBe(false);
    expect(flow.advance({ ...nothingDone(), townCenterUpgrading: true })).toBe(false);
    expect(flow.advance({ ...nothingDone(), townCenterLevel: 2 })).toBe(true);
    expect(flow.step?.id).toBe('resources_warmth');
  });

  it('the wood step advances only when the Lumber Mill is built, and is a free-interaction gameplay step', () => {
    const flow = new TutorialFlow();
    flow.advance('next'); // welcome -> select
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true }); // -> upgrade
    flow.advance({ ...nothingDone(), townCenterLevel: 2 }); // -> resources_warmth
    flow.advance('next'); // -> build_lumber_mill
    expect(flow.step?.id).toBe('build_lumber_mill');
    // It is a gameplay step: Next does nothing.
    expect(flow.advance('next')).toBe(false);
    expect(flow.step?.id).toBe('build_lumber_mill');
    // Unmet progress does nothing.
    expect(flow.advance(nothingDone())).toBe(false);
    // It advances the moment the Lumber Mill is built.
    expect(flow.advance({ ...nothingDone(), lumberMillBuilt: true })).toBe(true);
    expect(flow.step?.id).toBe('build_and_train');
    // And it opts out of the blocking dim (it opens a build panel).
    const step = TUTORIAL_STEPS.find((s) => s.id === 'build_lumber_mill');
    expect(step?.freeInteraction).toBe(true);
  });

  it('the train step advances once at least one troop is trained', () => {
    const flow = new TutorialFlow();
    flow.advance('next'); // welcome -> select
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true }); // -> upgrade
    flow.advance({ ...nothingDone(), townCenterLevel: 2 }); // -> resources_warmth
    flow.advance('next'); // -> build_lumber_mill
    flow.advance({ ...nothingDone(), lumberMillBuilt: true }); // -> build_and_train
    expect(flow.step?.id).toBe('build_and_train');
    expect(flow.advance({ ...nothingDone(), troopsTrained: 0 })).toBe(false);
    expect(flow.advance({ ...nothingDone(), troopsTrained: 1 })).toBe(true);
    expect(flow.step?.id).toBe('battle_quests');
  });

  it('walks all the way to completion through the mixed advance seam', () => {
    const flow = new TutorialFlow();
    flow.advance('next'); // welcome
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true }); // select
    flow.advance({ ...nothingDone(), townCenterLevel: 2 }); // upgrade
    flow.advance('next'); // resources_warmth
    flow.advance({ ...nothingDone(), lumberMillBuilt: true }); // build_lumber_mill
    flow.advance({ ...nothingDone(), troopsTrained: 3 }); // build_and_train
    expect(flow.step?.id).toBe('battle_quests');
    expect(flow.isComplete).toBe(false);
    expect(flow.advance({ ...nothingDone(), questPanelOpen: true })).toBe(true); // battle/quest action -> complete
    expect(flow.isComplete).toBe(true);
    expect(flow.step).toBeNull();
  });
});

describe('TutorialFlow overlay-occlusion invariants', () => {
  // Regression guard for the build_and_train occlusion bug: the step that asks
  // the player to operate a below-overlay gameplay panel (the TrainingPanel,
  // depth 50, beneath the depth-80 tutorial overlay) MUST opt out of the
  // blocking dim frame via `freeInteraction`. Otherwise the dim would cover the
  // panel's build/train controls and the step could never be satisfied — the
  // exact bug this flag prevents. The renderer reads this flag to decide
  // whether to draw the dim, so pinning it here catches any future step that
  // points at a bottom-bar button whose action opens a depth-50 panel.
  const byId = (id: string) => {
    const step = TUTORIAL_STEPS.find((s) => s.id === id);
    if (!step) throw new Error(`missing step ${id}`);
    return step;
  };

  it('build_and_train needs unrestricted interaction (no blocking dim)', () => {
    const step = byId('build_and_train');
    // It is a gameplay step (advances on a progress predicate, not Next)...
    expect(typeof step.advance).toBe('function');
    // ...and it must flag free interaction so the renderer omits the dim frame.
    expect(step.freeInteraction).toBe(true);
  });

  it('single-click / informational steps do NOT request free interaction', () => {
    // Steps satisfied by a single click on their anchored control (or by Next)
    // keep the focusing dim frame; only panel-operating steps opt out.
    for (const id of ['welcome', 'select_town_center', 'upgrade_town_center', 'resources_warmth']) {
      expect(byId(id).freeInteraction ?? false).toBe(false);
    }
  });

  it('every free-interaction step is a gameplay step (never informational)', () => {
    // A `freeInteraction` step advances by observed progress, so it always has
    // a predicate; an informational (Next) step never needs town access.
    for (const step of TUTORIAL_STEPS) {
      if (step.freeInteraction) expect(step.advance).not.toBe('next');
    }
  });
});

describe('TutorialFlow skip + once-only', () => {
  it('skip jumps straight to complete from the first step', () => {
    const flow = new TutorialFlow();
    flow.skip();
    expect(flow.isComplete).toBe(true);
    expect(flow.step).toBeNull();
  });

  it('skip jumps straight to complete from any middle step', () => {
    const flow = new TutorialFlow();
    flow.advance('next');
    flow.advance({ ...nothingDone(), townCenterPanelOpen: true });
    expect(flow.step?.id).toBe('upgrade_town_center');
    flow.skip();
    expect(flow.isComplete).toBe(true);
    expect(flow.step).toBeNull();
  });

  it('once complete it never re-activates', () => {
    const flow = new TutorialFlow();
    flow.skip();
    expect(flow.isComplete).toBe(true);
    // No advance of any kind can revive it.
    expect(flow.advance('next')).toBe(false);
    expect(flow.advance({ ...nothingDone(), townCenterPanelOpen: true, troopsTrained: 99 })).toBe(false);
    flow.advanceInformational();
    expect(flow.isComplete).toBe(true);
    expect(flow.step).toBeNull();
    // A second skip is idempotent.
    flow.skip();
    expect(flow.stepIndex).toBe(TUTORIAL_STEPS.length);
  });

  it('isStepSatisfied is a pure selector (no state mutation)', () => {
    const flow = new TutorialFlow();
    flow.advance('next'); // gameplay step: select_town_center
    const p = { ...nothingDone(), townCenterPanelOpen: true };
    expect(flow.isStepSatisfied(p)).toBe(true);
    // Calling it repeatedly does not advance the machine.
    expect(flow.isStepSatisfied(p)).toBe(true);
    expect(flow.step?.id).toBe('select_town_center');
  });
});
