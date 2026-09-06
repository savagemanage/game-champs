/**
 * A tiny framework-agnostic store the Phaser BattleScene pushes live HUD data
 * into, and the React HUD overlay subscribes to. Keeping this Phaser-free (it
 * only holds plain data) means the scene can update it every frame without the
 * React tree re-rendering Phaser, and the HUD stays perfectly in sync via
 * `useSyncExternalStore`.
 */

import type { CooldownKey } from './combat';

/** Per-ability HUD state: cooldown fill 0..1 and remaining seconds. */
export interface AbilityHudState {
  slot: CooldownKey;
  /** 0 (just cast) .. 1 (ready). */
  progress: number;
  /** Whole seconds remaining, for the numeric overlay (0 when ready). */
  remaining: number;
  ready: boolean;
}

/** The complete snapshot the HUD renders each frame. */
export interface BattleHudState {
  playerChampionId: string;
  enemyChampionId: string;
  playerHp: number;
  playerMaxHp: number;
  playerResource: number;
  playerMaxResource: number;
  enemyHp: number;
  enemyMaxHp: number;
  /** Remaining structure health per team, 0..1, for the objective bar. */
  allyNexusPct: number;
  enemyNexusPct: number;
  abilities: AbilityHudState[];
  /** Elapsed match time in seconds. */
  elapsed: number;
}

/** The outcome handed to React when the match ends. */
export interface BattleOutcome {
  win: boolean;
  playerChampionId: string;
  enemyChampionId: string;
  /** Match stats surfaced on the results screen. */
  stats: {
    durationSeconds: number;
    championKills: number;
    minionKills: number;
    damageDealt: number;
  };
}

function emptyState(
  playerChampionId = '',
  enemyChampionId = '',
): BattleHudState {
  return {
    playerChampionId,
    enemyChampionId,
    playerHp: 0,
    playerMaxHp: 1,
    playerResource: 0,
    playerMaxResource: 1,
    enemyHp: 0,
    enemyMaxHp: 1,
    allyNexusPct: 1,
    enemyNexusPct: 1,
    abilities: [],
    elapsed: 0,
  };
}

type Listener = () => void;

/** Minimal external store with a stable snapshot reference for React. */
export class BattleStore {
  private state: BattleHudState = emptyState();
  private listeners = new Set<Listener>();

  getSnapshot = (): BattleHudState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replace the snapshot (a new object ref) and notify subscribers. */
  set(next: BattleHudState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  reset(playerChampionId: string, enemyChampionId: string): void {
    this.set(emptyState(playerChampionId, enemyChampionId));
  }
}

/** A single shared store instance for the active battle. */
export const battleStore = new BattleStore();
