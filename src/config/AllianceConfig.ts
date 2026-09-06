/**
 * AllianceConfig - the ORIGINAL simulated NPC-alliance curves (FEAT-005).
 *
 * The hold bands together with a fixed roster of AI survivors. They generate
 * "help" charges (each shaving a fixed slice off an active build/research
 * timer) and an alliance-tech contribution track (points -> level) that grants
 * a shared StatModifiers bonus. PURE math (no Phaser, no servers): the point
 * thresholds are a geometric curve and allianceTechModifiers() folds a level
 * into the shared bundle. NPC member names live in i18n keyed `alliance.*`.
 */

import { ALLIANCE } from './GameConfig';
import { combineModifiers } from './StatModifiers';
import type { StatModifiers } from '../types';

/**
 * Cumulative alliance-tech points required to REACH a given tech level: a
 * geometric partial sum (each level costs TECH_LEVEL_GROWTH more), clamped to
 * MAX_TECH_LEVEL. Pure + monotonic.
 */
export function pointsForTechLevel(level: number): number {
  const lvl = Math.max(0, Math.min(ALLIANCE.MAX_TECH_LEVEL, Math.floor(level)));
  let total = 0;
  for (let i = 0; i < lvl; i++) {
    total += ALLIANCE.TECH_POINTS_PER_LEVEL * Math.pow(ALLIANCE.TECH_LEVEL_GROWTH, i);
  }
  return Math.round(total);
}

/**
 * The alliance-tech LEVEL a given cumulative point total earns: the highest
 * level whose {@link pointsForTechLevel} threshold is met, clamped to
 * MAX_TECH_LEVEL. Pure + monotonic.
 */
export function techLevelForPoints(points: number): number {
  const p = Math.max(0, points);
  let level = 0;
  while (level < ALLIANCE.MAX_TECH_LEVEL && p >= pointsForTechLevel(level + 1)) level++;
  return level;
}

/**
 * The shared StatModifiers bonus a given alliance-tech level grants: the
 * per-level bonus (ALLIANCE.TECH_BONUS_PER_LEVEL) scaled by the level. Level 0
 * grants nothing. Pure; AllianceSystem returns this and GameState folds it into
 * the combined bundle so contributing to the alliance lifts the whole hold.
 */
export function allianceTechModifiers(level: number): StatModifiers {
  const lvl = Math.max(0, Math.min(ALLIANCE.MAX_TECH_LEVEL, Math.floor(level)));
  if (lvl <= 0) return combineModifiers();
  return combineModifiers({
    economyOutput: ALLIANCE.TECH_BONUS_PER_LEVEL.economyOutput * lvl,
    troopAttack: ALLIANCE.TECH_BONUS_PER_LEVEL.troopAttack * lvl,
  });
}
