export type LearningAction =
  | 'move'
  | 'basic-attack'
  | 'cast-Q'
  | 'cast-W'
  | 'cast-E'
  | 'cast-R'
  | 'recall-shop'
  | 'level-up'
  | 'destroy-turret'
  | 'victory-condition';

export interface LearningStep {
  id: LearningAction;
  required: boolean;
}

export const LEARNING_STEPS: readonly LearningStep[] = [
  { id: 'move', required: true },
  { id: 'basic-attack', required: true },
  { id: 'cast-Q', required: true },
  { id: 'cast-W', required: true },
  { id: 'cast-E', required: true },
  { id: 'cast-R', required: true },
  { id: 'recall-shop', required: true },
  { id: 'level-up', required: true },
  { id: 'destroy-turret', required: true },
  { id: 'victory-condition', required: true },
] as const;

export interface LearningState {
  completed: LearningAction[];
  skipped: LearningAction[];
}

export function createLearningState(): LearningState {
  return { completed: [], skipped: [] };
}

export function recordLearningAction(
  state: LearningState,
  action: LearningAction,
): LearningState {
  if (state.completed.includes(action)) return state;
  return { ...state, completed: [...state.completed, action] };
}

export function skipCurrentLearningStep(state: LearningState): LearningState {
  const current = currentLearningStep(state);
  if (!current || state.skipped.includes(current.id)) return state;
  return { ...state, skipped: [...state.skipped, current.id] };
}

export function currentLearningStep(state: LearningState): LearningStep | undefined {
  return LEARNING_STEPS.find(
    (step) => !state.completed.includes(step.id) && !state.skipped.includes(step.id),
  );
}

/** Skipped mandatory coaching remains incomplete by design. */
export function learningRequirementsCompleted(state: LearningState): boolean {
  return LEARNING_STEPS.every(
    (step) => !step.required || state.completed.includes(step.id),
  );
}
