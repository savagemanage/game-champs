import { rulesForMode } from '../config/matchRules';
import type { GameMode } from './battleStore';

/** Mutually exclusive phases in a champion's deterministic life cycle. */
export type ChampionLifePhase =
  | 'alive'
  | 'dead'
  | 'respawning'
  | 'invulnerable';

/** Serializable champion life state with absolute match-time deadlines. */
export interface ChampionLifeState {
  phase: ChampionLifePhase;
  diedAt: number | null;
  respawnsAt: number | null;
  invulnerableUntil: number | null;
}

/** A champion ready to participate in the match. */
export function createChampionLifeState(): ChampionLifeState {
  return {
    phase: 'alive',
    diedAt: null,
    respawnsAt: null,
    invulnerableUntil: null,
  };
}

/** Respawn delay for a level, capped by the selected mode's tuning. */
export function championRespawnDelay(
  level: number,
  mode: GameMode = 'conquest',
): number {
  const rules = rulesForMode(mode).respawn;
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.min(
    rules.maxSeconds,
    rules.baseSeconds + safeLevel * rules.secondsPerLevel,
  );
}

/** Record a lethal event. Non-living champions ignore duplicate lethal events. */
export function killChampion(
  state: ChampionLifeState,
  nowSeconds: number,
  level: number,
  mode: GameMode = 'conquest',
): ChampionLifeState {
  if (state.phase !== 'alive') return state;
  const diedAt = safeTime(nowSeconds);
  return {
    phase: 'dead',
    diedAt,
    respawnsAt: diedAt + championRespawnDelay(level, mode),
    invulnerableUntil: null,
  };
}

/**
 * Advance lifecycle deadlines using absolute match time. The transition path is
 * dead -> respawning -> invulnerable -> alive and never depends on frame rate.
 */
export function advanceChampionLife(
  state: ChampionLifeState,
  nowSeconds: number,
  mode: GameMode = 'conquest',
): ChampionLifeState {
  const now = safeTime(nowSeconds);

  if (state.phase === 'alive' || state.respawnsAt == null) return state;

  if (now < state.respawnsAt) {
    if (state.diedAt != null && now <= state.diedAt) return state;
    return state.phase === 'respawning'
      ? state
      : { ...state, phase: 'respawning' };
  }

  const invulnerabilitySeconds = rulesForMode(mode).respawn.invulnerabilitySeconds;
  const invulnerableUntil = state.respawnsAt + invulnerabilitySeconds;
  if (now < invulnerableUntil) {
    if (
      state.phase === 'invulnerable' &&
      state.invulnerableUntil === invulnerableUntil
    ) {
      return state;
    }
    return {
      ...state,
      phase: 'invulnerable',
      invulnerableUntil,
    };
  }

  return createChampionLifeState();
}

/** True only while a champion may receive attacks or hostile abilities. */
export function isChampionDamageable(state: ChampionLifeState): boolean {
  return state.phase === 'alive';
}

/** True while a champion should exist in the playable world. */
export function isChampionPresent(state: ChampionLifeState): boolean {
  return state.phase === 'alive' || state.phase === 'invulnerable';
}

/** Remaining seconds on the current respawn or invulnerability timer. */
export function championLifeTimerRemaining(
  state: ChampionLifeState,
  nowSeconds: number,
): number {
  const deadline = state.phase === 'invulnerable'
    ? state.invulnerableUntil
    : state.respawnsAt;
  if (deadline == null) return 0;
  return Math.max(0, deadline - safeTime(nowSeconds));
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
