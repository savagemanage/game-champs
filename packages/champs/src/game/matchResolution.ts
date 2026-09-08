import { rulesForMode } from '../config/matchRules';
import type { GameMode } from './battleStore';
import type { MapSide } from './rift/map';

/** Scoring inputs for one side at a forced hard-cap resolution. */
export interface MatchTeamSnapshot {
  nexusHp: number;
  nexusMaxHp: number;
  structuresStanding: number;
  structuresTotal: number;
  championKills: number;
  objectivePoints: number;
  gold: number;
}

/** Complete pure snapshot required to determine whether the match has ended. */
export interface MatchResolutionSnapshot {
  elapsedSeconds: number;
  ally: MatchTeamSnapshot;
  enemy: MatchTeamSnapshot;
}

export type MatchPhase = 'regulation' | 'sudden-death' | 'hard-cap';
export type MatchResolutionReason = 'nexus-destroyed' | 'hard-cap-score';

/** Deterministic result; a null winner means play continues. */
export interface MatchResolution {
  phase: MatchPhase;
  winner: MapSide | null;
  reason: MatchResolutionReason | null;
  allyScore: number;
  enemyScore: number;
}

/** Current match phase from elapsed time and mode tuning. */
export function matchPhaseAt(
  elapsedSeconds: number,
  mode: GameMode = 'conquest',
): MatchPhase {
  const elapsed = positive(elapsedSeconds);
  const rules = rulesForMode(mode);
  if (elapsed >= rules.hardCapSeconds) return 'hard-cap';
  if (elapsed >= rules.suddenDeathSeconds) return 'sudden-death';
  return 'regulation';
}

/** Weighted, normalized score used only when the hard cap is reached. */
export function scoreTeamForHardResolution(
  team: MatchTeamSnapshot,
  mode: GameMode = 'conquest',
): number {
  const weights = rulesForMode(mode).hardResolutionWeights;
  const nexusHealth = fraction(team.nexusHp, team.nexusMaxHp);
  const structures = fraction(team.structuresStanding, team.structuresTotal);
  return (
    nexusHealth * weights.nexusHealth +
    structures * weights.structures +
    positive(team.championKills) * weights.championKills +
    positive(team.objectivePoints) * weights.objectives +
    positive(team.gold) * weights.gold
  );
}

/**
 * Resolve immediate nexus destruction first, then force a deterministic winner
 * from normalized scores at the hard cap. Exact ties use `tieWinner` so callers
 * can choose a stable policy; the default avoids granting a free player win.
 */
export function resolveMatch(
  snapshot: MatchResolutionSnapshot,
  mode: GameMode = 'conquest',
  tieWinner: MapSide = 'enemy',
): MatchResolution {
  const phase = matchPhaseAt(snapshot.elapsedSeconds, mode);
  const allyScore = scoreTeamForHardResolution(snapshot.ally, mode);
  const enemyScore = scoreTeamForHardResolution(snapshot.enemy, mode);
  const allyNexusDestroyed = positive(snapshot.ally.nexusHp) === 0;
  const enemyNexusDestroyed = positive(snapshot.enemy.nexusHp) === 0;

  if (allyNexusDestroyed || enemyNexusDestroyed) {
    const winner = allyNexusDestroyed === enemyNexusDestroyed
      ? winnerFromScores(allyScore, enemyScore, tieWinner)
      : allyNexusDestroyed
        ? 'enemy'
        : 'ally';
    return {
      phase,
      winner,
      reason: 'nexus-destroyed',
      allyScore,
      enemyScore,
    };
  }

  if (phase !== 'hard-cap') {
    return { phase, winner: null, reason: null, allyScore, enemyScore };
  }

  return {
    phase,
    winner: winnerFromScores(allyScore, enemyScore, tieWinner),
    reason: 'hard-cap-score',
    allyScore,
    enemyScore,
  };
}

function winnerFromScores(
  allyScore: number,
  enemyScore: number,
  tieWinner: MapSide,
): MapSide {
  if (allyScore > enemyScore) return 'ally';
  if (enemyScore > allyScore) return 'enemy';
  return tieWinner;
}

function fraction(value: number, maximum: number): number {
  const safeMaximum = positive(maximum);
  if (safeMaximum === 0) return 0;
  return Math.min(1, positive(value) / safeMaximum);
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
