import { GameState } from './GameState';

export type RuntimeTickResult = ReturnType<GameState['tick']>;
export type RuntimeListener = (result: RuntimeTickResult) => void;

/** One global wall-clock driver shared across every scene and reset state. */
export class RuntimeCoordinator {
  private lastNow: number;
  private readonly listeners = new Set<RuntimeListener>();

  constructor(private readonly clock: () => number = () => Date.now()) {
    this.lastNow = clock();
  }

  step(): RuntimeTickResult {
    const now = this.clock();
    const delta = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    const result = GameState.get().tick(now, delta);
    this.emit(result);
    return result;
  }

  save(): boolean {
    return GameState.get().save(this.clock());
  }

  resume(): RuntimeTickResult {
    const now = this.clock();
    const receipt = GameState.get().reconcileAbsence(now);
    this.lastNow = now;
    const result: RuntimeTickResult = {
      buildingsDone: receipt.buildingsDone,
      trainingDone: receipt.trainingDone,
      researchDone: receipt.researchDone,
    };
    this.emit(result);
    return result;
  }

  resetClock(): void {
    this.lastNow = this.clock();
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(result: RuntimeTickResult): void {
    if (
      result.buildingsDone.length === 0 &&
      result.researchDone.length === 0 &&
      Object.keys(result.trainingDone).length === 0
    ) return;
    for (const listener of this.listeners) listener(result);
  }

  destroy(): void {
    this.listeners.clear();
  }
}
