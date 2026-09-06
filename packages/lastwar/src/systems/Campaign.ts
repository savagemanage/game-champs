/**
 * Campaign.ts - PvE campaign stages + endless zombie waves (FEAT-004).
 *
 * This is a Phaser-free, deterministic pure module. It turns the config-driven
 * {@link CAMPAIGN_STAGES} / {@link ZOMBIE_WAVES} blueprints into concrete combat
 * {@link Team}s and resolves them with the FEAT-003 {@link resolveBattle} engine
 * - it NEVER re-implements combat. A stage resolution returns win/loss, the
 * reward bundle to grant on a first clear, and the full battle timeline so
 * FEAT-007 can animate the exact resolved fight.
 *
 * GATING: a campaign stage is unlockable only when (a) the previous stage in
 * {@link CAMPAIGN_ORDER} has been cleared and (b) the player's seasonal virus-
 * resistance level meets the stage's {@link StageDef.requiredResistance}. The
 * first stage has no prerequisite stage. Zombie waves are endless and only
 * require the previous wave (index) to be cleared.
 */

import {
  CAMPAIGN_ORDER,
  CAMPAIGN_STAGES,
  ENEMY_FORMATIONS,
  ZOMBIE_WAVES,
  type EnemyFormationDef,
  type RewardBundle,
  type StageDef,
} from '../config/Progression';
import type { CampaignState } from '../types';
import type { Combatant, Team } from './Formation';
import { resolveBattle, type BattleResult } from './Combat';

/** Look up a campaign stage definition by id (undefined if unknown). */
export function stageDef(id: string): StageDef | undefined {
  return CAMPAIGN_STAGES.find((s) => s.id === id);
}

/**
 * Build a battle-ready {@link Team} from an enemy formation blueprint, scaling
 * every unit's HP/ATK/DEF by `scale` (speed is left unscaled so turn order
 * stays readable). Front-row units are ordered before back-row units, matching
 * the player-team convention the combat resolver expects.
 */
export function buildEnemyTeam(blueprint: EnemyFormationDef, scale: number): Team {
  const scaleStat = (v: number): number => Math.max(1, Math.round(v * scale));
  const toCombatant = (u: EnemyFormationDef[number]): Combatant => ({
    id: u.id,
    row: u.row,
    type: u.type,
    role: u.role,
    maxHp: scaleStat(u.hp),
    atk: scaleStat(u.atk),
    def: scaleStat(u.def),
    speed: u.speed,
  });
  const front = blueprint.filter((u) => u.row === 'front').map(toCombatant);
  const back = blueprint.filter((u) => u.row === 'back').map(toCombatant);
  return { members: [...front, ...back], sameTypeBuff: false };
}

/** Build the enemy team a given campaign stage fields. */
export function stageEnemyTeam(stage: StageDef): Team {
  return buildEnemyTeam(ENEMY_FORMATIONS[stage.formation], stage.scale);
}

/**
 * Whether a campaign stage is currently unlocked given the cleared-stage set
 * and the player's seasonal virus-resistance level. Enforces BOTH the
 * previous-stage-cleared rule and the seasonal resistance gate. An unknown
 * stage id is never unlocked.
 */
export function isStageUnlocked(
  stageId: string,
  clearedStages: readonly string[],
  resistance: number,
): boolean {
  const index = (CAMPAIGN_ORDER as readonly string[]).indexOf(stageId);
  if (index < 0) return false;
  const stage = CAMPAIGN_STAGES[index];
  if (resistance < stage.requiredResistance) return false;
  if (index === 0) return true;
  const prev = CAMPAIGN_ORDER[index - 1];
  return clearedStages.includes(prev);
}

/** The id of the next uncleared, currently-unlockable stage (null if none). */
export function nextStage(clearedStages: readonly string[], resistance: number): string | null {
  for (const id of CAMPAIGN_ORDER) {
    if (clearedStages.includes(id)) continue;
    if (isStageUnlocked(id, clearedStages, resistance)) return id;
    // The first unlockable-but-blocked stage stops the search (ordered chain).
    return null;
  }
  return null;
}

/** The outcome of resolving a campaign stage. */
export interface StageOutcome {
  /** True when the player (attacker) won. */
  win: boolean;
  /** Rewards to grant (only meaningful on a first clear; empty on loss). */
  reward: RewardBundle;
  /** The full battle result + timeline for animation. */
  battle: BattleResult;
}

/** Why a stage attempt was rejected before combat. */
export type StageBlockReason = 'unknown_stage' | 'locked' | 'no_squad';

/**
 * Resolve a campaign stage: build the seeded enemy team from config and run the
 * FEAT-003 combat resolver with `stageSeed`. Returns `{ ok: false, reason }`
 * when the stage is unknown, still locked (prior clear + resistance gate), or
 * the player has no assembled squad; otherwise `{ ok: true, outcome }`.
 *
 * The reward bundle is returned only for a NEW clear (win on a stage not
 * already in `clearedStages`); replaying a cleared stage yields an empty reward
 * so farms do not double-pay. The caller (GameStore) applies the reward and
 * marks the stage cleared.
 */
export function resolveStage(
  playerTeam: Team,
  stageId: string,
  clearedStages: readonly string[],
  resistance: number,
  stageSeed: number,
): { ok: true; outcome: StageOutcome } | { ok: false; reason: StageBlockReason } {
  const stage = stageDef(stageId);
  if (!stage) return { ok: false, reason: 'unknown_stage' };
  if (!isStageUnlocked(stageId, clearedStages, resistance)) {
    return { ok: false, reason: 'locked' };
  }
  if (playerTeam.members.length === 0) return { ok: false, reason: 'no_squad' };

  const enemy = stageEnemyTeam(stage);
  const battle = resolveBattle(playerTeam, enemy, stageSeed);
  const win = battle.winner === 'attacker';
  const firstClear = win && !clearedStages.includes(stageId);
  return {
    ok: true,
    outcome: {
      win,
      reward: firstClear ? stage.reward : {},
      battle,
    },
  };
}

/** The scale multiplier applied to a zombie wave at the given 0-based index. */
export function zombieWaveScale(waveIndex: number): number {
  const def = ZOMBIE_WAVES.DEFS[waveIndex % ZOMBIE_WAVES.DEFS.length];
  return def.baseScale * (1 + waveIndex * ZOMBIE_WAVES.SCALE_PER_WAVE);
}

/** Build the enemy team for a zombie wave at the given 0-based index. */
export function zombieWaveTeam(waveIndex: number): Team {
  const def = ZOMBIE_WAVES.DEFS[waveIndex % ZOMBIE_WAVES.DEFS.length];
  return buildEnemyTeam(ENEMY_FORMATIONS[def.formation], zombieWaveScale(waveIndex));
}

/** The reward granted for clearing the zombie wave at the given index. */
export function zombieWaveReward(waveIndex: number): RewardBundle {
  const base = ZOMBIE_WAVES.BASE_REWARD;
  const growth = 1 + waveIndex * ZOMBIE_WAVES.REWARD_PER_WAVE;
  const scale = (v: number | undefined): number | undefined =>
    v === undefined ? undefined : Math.round(v * growth);
  return {
    shards: scale(base.shards),
    seasonXp: scale(base.seasonXp),
    coins: scale(base.coins),
  };
}

/**
 * Resolve the next zombie wave. A wave requires the previous wave to have been
 * cleared (`highestWave` is the highest cleared index, or -1 for none); passing
 * a `waveIndex` beyond `highestWave + 1` is rejected as locked. On a win the
 * scaled reward is returned; on a loss the reward is empty.
 */
export function resolveZombieWave(
  playerTeam: Team,
  waveIndex: number,
  highestWave: number,
  waveSeed: number,
): { ok: true; outcome: StageOutcome } | { ok: false; reason: StageBlockReason } {
  if (waveIndex < 0 || waveIndex > highestWave + 1) return { ok: false, reason: 'locked' };
  if (playerTeam.members.length === 0) return { ok: false, reason: 'no_squad' };
  const enemy = zombieWaveTeam(waveIndex);
  const battle = resolveBattle(playerTeam, enemy, waveSeed);
  const win = battle.winner === 'attacker';
  const firstClear = win && waveIndex > highestWave;
  return {
    ok: true,
    outcome: {
      win,
      reward: firstClear ? zombieWaveReward(waveIndex) : {},
      battle,
    },
  };
}

/** A fresh campaign state (nothing cleared, no zombie waves). */
export function freshCampaign(): CampaignState {
  return { clearedStages: [], highestWave: -1 };
}
