import { rulesForMode } from '../config/matchRules';
import type { GameMode } from './battleStore';
import type { MapSide } from './rift/map';

export interface MatchTeamSnapshot {
  nexusHp: number;
  nexusMaxHp: number;
  structuresStanding: number;
  structuresTotal: number;
  championKills: number;
  objectivePoints: number;
  gold: number;
}

export interface MatchResolutionSnapshot {
  elapsedSeconds: number;
  ally: MatchTeamSnapshot;
  enemy: MatchTeamSnapshot;
}

export type MatchPhase = 'regulation' | 'sudden-death' | 'hard-cap';
export type MatchResolutionReason = 'nexus-destroyed' | 'hard-cap-score' | 'surrendered';
export type MatchWinner = MapSide | 'draw' | null;

export interface MatchResolution {
  phase: MatchPhase;
  winner: MatchWinner;
  reason: Exclude<MatchResolutionReason, 'surrendered'> | null;
  allyScore: number;
  enemyScore: number;
}

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

/** Nexus destruction and hard-cap judgment use the same frozen snapshot. */
export function resolveMatch(
  snapshot: MatchResolutionSnapshot,
  mode: GameMode = 'conquest',
): MatchResolution {
  const phase = matchPhaseAt(snapshot.elapsedSeconds, mode);
  const allyScore = scoreTeamForHardResolution(snapshot.ally, mode);
  const enemyScore = scoreTeamForHardResolution(snapshot.enemy, mode);
  const allyNexusDestroyed = positive(snapshot.ally.nexusHp) === 0;
  const enemyNexusDestroyed = positive(snapshot.enemy.nexusHp) === 0;

  if (allyNexusDestroyed || enemyNexusDestroyed) {
    const winner = allyNexusDestroyed === enemyNexusDestroyed
      ? winnerFromSnapshot(snapshot.ally, snapshot.enemy, allyScore, enemyScore)
      : allyNexusDestroyed ? 'enemy' : 'ally';
    return { phase, winner, reason: 'nexus-destroyed', allyScore, enemyScore };
  }

  if (phase !== 'hard-cap') {
    return { phase, winner: null, reason: null, allyScore, enemyScore };
  }

  return {
    phase,
    winner: winnerFromSnapshot(snapshot.ally, snapshot.enemy, allyScore, enemyScore),
    reason: 'hard-cap-score',
    allyScore,
    enemyScore,
  };
}

function winnerFromSnapshot(
  ally: MatchTeamSnapshot,
  enemy: MatchTeamSnapshot,
  allyScore: number,
  enemyScore: number,
): Exclude<MatchWinner, null> {
  const comparisons: Array<[number, number]> = [
    [allyScore, enemyScore],
    [fraction(ally.nexusHp, ally.nexusMaxHp), fraction(enemy.nexusHp, enemy.nexusMaxHp)],
    [fraction(ally.structuresStanding, ally.structuresTotal), fraction(enemy.structuresStanding, enemy.structuresTotal)],
    [positive(ally.championKills), positive(enemy.championKills)],
    [positive(ally.objectivePoints), positive(enemy.objectivePoints)],
    [positive(ally.gold), positive(enemy.gold)],
  ];
  for (const [allyValue, enemyValue] of comparisons) {
    if (allyValue > enemyValue) return 'ally';
    if (enemyValue > allyValue) return 'enemy';
  }
  return 'draw';
}

function fraction(value: number, maximum: number): number {
  const safeMaximum = positive(maximum);
  if (safeMaximum === 0) return 0;
  return Math.min(1, positive(value) / safeMaximum);
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
