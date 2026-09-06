import { describe, it, expect } from 'vitest';
import {
  TUTORIAL_STEPS,
  firstStep,
  isLastStep,
  nextStep,
  prevStep,
  shouldShowStartHint,
  shouldShowTutorialOnFirstRun,
  startCtaSubKeys,
  stepById,
  stepIndex,
  totalSteps,
} from './Tutorial';
import { STRINGS } from '../i18n/strings';

/**
 * Pure-logic tests for the onboarding tutorial data + helpers (FEAT-003). No
 * Phaser runtime: the ordering and first-run gating are plain functions, and
 * every step's i18n keys must exist in the STRINGS table.
 */
describe('Tutorial', () => {
  it('exposes a non-empty ordered step sequence', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThan(0);
    expect(totalSteps()).toBe(TUTORIAL_STEPS.length);
    // Ids are unique and stable.
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Covers the core loop + the gate-runner controls.
    expect(ids).toEqual(['welcome', 'base', 'heroes', 'battle', 'runner']);
  });

  it('firstStep is the first element of the sequence', () => {
    expect(firstStep()).toBe(TUTORIAL_STEPS[0]);
    expect(firstStep().id).toBe('welcome');
    expect(stepIndex(firstStep().id)).toBe(0);
  });

  it('nextStep chains through every step then returns null at the end', () => {
    let step = firstStep();
    const visited: string[] = [step.id];
    let guard = 0;
    while (guard++ < 100) {
      const next = nextStep(step.id);
      if (!next) break;
      visited.push(next.id);
      step = next;
    }
    // Walked the whole ordered sequence exactly once.
    expect(visited).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    // The final step has no next.
    expect(nextStep(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].id)).toBeNull();
    // An unknown id has no next.
    expect(nextStep('does-not-exist')).toBeNull();
  });

  it('prevStep steps backward and returns null before the first step', () => {
    const second = TUTORIAL_STEPS[1];
    expect(prevStep(second.id)).toBe(TUTORIAL_STEPS[0]);
    expect(prevStep(firstStep().id)).toBeNull();
    expect(prevStep('does-not-exist')).toBeNull();
  });

  it('isLastStep is true only for the final step', () => {
    const last = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
    expect(isLastStep(last.id)).toBe(true);
    expect(isLastStep(firstStep().id)).toBe(false);
    expect(isLastStep('does-not-exist')).toBe(false);
  });

  it('stepById resolves known ids and rejects unknown ones', () => {
    expect(stepById('heroes')?.id).toBe('heroes');
    expect(stepById('nope')).toBeUndefined();
  });

  it('shouldShowTutorialOnFirstRun is true only when unseen', () => {
    expect(shouldShowTutorialOnFirstRun(false)).toBe(true);
    expect(shouldShowTutorialOnFirstRun(true)).toBe(false);
  });

  it('shouldShowStartHint (FEAT-004) is true only for a fresh, unseen save', () => {
    expect(shouldShowStartHint(false)).toBe(true);
    expect(shouldShowStartHint(true)).toBe(false);
  });

  it('startCtaSubKeys (FEAT-003) lists the explainer + desktop key cue, both in STRINGS', () => {
    const keys = startCtaSubKeys();
    // Ordered: the one-line explainer first, then the compact SPACE cue.
    expect(keys).toEqual(['title.startSub', 'title.startKey']);
    for (const key of keys) {
      const entry = STRINGS[key];
      expect(entry, `missing entry for ${key}`).toBeTruthy();
      expect(entry.ko, `ko missing for ${key}`).toBeTruthy();
      expect(entry.en, `en missing for ${key}`).toBeTruthy();
    }
    // The explainer makes clear the CTA enters the base to build the squad.
    expect(STRINGS['title.startSub'].ko).toBe('기지에 입장해 분대를 편성하고 출격합니다');
  });

  it('every step title/body i18n key exists in STRINGS', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(STRINGS[step.titleKey], `missing title ${step.titleKey}`).toBeTruthy();
      expect(STRINGS[step.bodyKey], `missing body ${step.bodyKey}`).toBeTruthy();
    }
  });
});
