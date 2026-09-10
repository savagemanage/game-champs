/**
 * VipConfig - the ORIGINAL VIP progression curve (FEAT-005).
 *
 * VIP points accumulate from spending / activity and map to a VIP LEVEL; each
 * level grants a permanent QoL / stat bonus expressed as the shared
 * StatModifiers bundle (VIP.BONUS_PER_LEVEL per level). PURE math (no Phaser):
 * the point thresholds are a geometric curve so later levels take more points,
 * and vipModifiers() folds a level into the shared bundle. All labels live in
 * i18n keyed `vip.*`.
 */

import { VIP } from './GameConfig';
import { combineModifiers } from './StatModifiers';
import type { StatModifiers } from '../types';

/**
 * The cumulative VIP points required to REACH a given level. Level 0 needs 0;
 * each level L needs BASE_POINTS_PER_LEVEL * (1 + growth + growth^2 + ...), a
 * geometric partial sum, clamped to MAX_LEVEL. Pure + monotonic.
 */
export function pointsForLevel(level: number): number {
  const lvl = Math.max(0, Math.min(VIP.MAX_LEVEL, Math.floor(level)));
  return lvl === 0 ? 0 : VIP.THRESHOLDS[lvl - 1];
}

/**
 * The VIP LEVEL a given cumulative point total earns: the highest level whose
 * {@link pointsForLevel} threshold is met, clamped to VIP.MAX_LEVEL. Pure +
 * monotonic so more points never lowers the level.
 */
export function levelForPoints(points: number): number {
  const p = Math.max(0, points);
  let level = 0;
  while (level < VIP.MAX_LEVEL && p >= pointsForLevel(level + 1)) level++;
  return level;
}

/**
 * The permanent StatModifiers bonus a given VIP level grants: the per-level
 * bonus (VIP.BONUS_PER_LEVEL) scaled by the level. Level 0 grants nothing.
 * Pure; VipSystem returns this and GameState folds it into the combined bundle.
 */
export function vipModifiers(level: number): StatModifiers {
  const lvl = Math.max(0, Math.min(VIP.MAX_LEVEL, Math.floor(level)));
  if (lvl <= 0) return combineModifiers();
  return combineModifiers({
    economyOutput: VIP.BONUS_PER_LEVEL.economyOutput * lvl,
    buildSpeed: VIP.BONUS_PER_LEVEL.buildSpeed * lvl,
  });
}
