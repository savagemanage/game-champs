import {
  ENEMY_DEFS,
  TROOP_ORDER,
  enemyPower,
  troopDef,
  troopVsEnemyMultiplier,
} from '../config/TroopConfig';
import { waveComposition, waveReward } from '../config/WaveConfig';
import type { Army, ResourceCost, TroopKind } from '../types';

/** The result of resolving a single battle. */
export interface CombatResult {
  /** True when the player's army destroyed the whole wave. */
  win: boolean;
  /** The wave number that was fought. */
  wave: number;
  /** Surviving player troops (only meaningful on a win; all-zero on a loss). */
  survivors: Army;
  /** Player troops lost in the battle. */
  casualties: Army;
  /** Resource reward paid out (empty bundle on a loss). */
  reward: ResourceCost;
  /** Total effective power the army brought (for HUD / debugging). */
  armyPower: number;
  /** Total effective power the wave brought. */
  wavePower: number;
}

/**
 * CombatSystem - a pure, DETERMINISTIC battle resolver.
 *
 * Given the player's standing army and a wave number, it computes total
 * effective power on each side (from the per-unit stats in TroopConfig and the
 * composition in WaveConfig), decides win/lose, and distributes casualties.
 *
 * Determinism: the outcome is a pure function of `(army, wave)`. There is no
 * Math.random. A seed is accepted for future variability but the default
 * resolution is fully reproducible, so unit tests are stable.
 *
 * Composition matters: each troop kind's power is scaled by the soft-RPS
 * {@link troopVsEnemyMultiplier} counter against the wave's enemy roles
 * (weighted by each enemy role's share of the wave power). Fielding the troop
 * that counters a wave's dominant enemy is worth more than an equal-cost
 * off-counter stack, so army mix changes outcomes. The comparison stays a pure,
 * deterministic function of `(army, wave)`.
 *
 * Casualty model: the loser is wiped out; the winner loses troops in proportion
 * to how close the fight was (a lopsided win costs almost nothing, a squeaker
 * costs a large share). Losses are distributed across troop kinds in proportion
 * to how many of each the army fielded.
 */
export class CombatSystem {
  /**
   * Raw total power of an army bundle, IGNORING matchups. Sums each troop
   * kind's `count * troopPower`. Pure and monotonic in troop counts. Used for
   * coarse sizing/UI; the battle decision uses {@link effectiveArmyPower}.
   */
  static armyPower(army: Army): number {
    let total = 0;
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count > 0) total += count * troopUnitPower(kind);
    }
    return total;
  }

  /**
   * Composition-aware effective power of `army` against wave `n`. Each troop
   * kind's raw power is multiplied by the wave-power-weighted average of its
   * soft-RPS counter multiplier against every enemy role in the wave. This is
   * the value the resolver compares against {@link wavePower}, so a stack that
   * counters the wave's dominant enemy outperforms an equal raw-power stack
   * that does not. Pure and deterministic.
   */
  static effectiveArmyPower(army: Army, n: number, attackMult = 1): number {
    const composition = waveComposition(n);
    // Wave power share per enemy kind (weights for the average multiplier).
    let waveTotal = 0;
    const share: { kind: (typeof composition)[number]['kind']; power: number }[] = [];
    for (const entry of composition) {
      const power = entry.count * enemyPower(entry.kind);
      waveTotal += power;
      share.push({ kind: entry.kind, power });
    }

    let total = 0;
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count <= 0) continue;
      const raw = count * troopUnitPower(kind);
      if (waveTotal <= 0) {
        // No wave to counter (empty/degenerate): matchups are neutral.
        total += raw;
        continue;
      }
      let weighted = 0;
      for (const s of share) {
        weighted += (s.power / waveTotal) * troopVsEnemyMultiplier(kind, s.kind);
      }
      total += raw * weighted;
    }
    // Research "combat attack" techs scale the whole effective power (>1 =
    // stronger). Defaults to 1 (neutral) so untouched callers are unaffected.
    return total * Math.max(0, attackMult);
  }

  /** Total effective power of the wave `n`'s composition. */
  static wavePower(n: number): number {
    let total = 0;
    for (const entry of waveComposition(n)) {
      total += entry.count * enemyPower(entry.kind);
    }
    return total;
  }

  /**
   * Optional combat bonuses applied by the research feature. Both default to 1
   * (neutral) so existing callers/tests resolve identically:
   *   - attackMult:  scales the army's effective power (>1 wins more fights).
   *   - defenseMult: reduces the casualty fraction on a win (>1 loses fewer
   *                  troops). It divides the loss fraction, so 1.1 => ~9% fewer.
   */
  static resolve(
    army: Army,
    wave: number,
    bonuses: { attackMult?: number; defenseMult?: number } = {},
  ): CombatResult {
    const attackMult = Math.max(0, bonuses.attackMult ?? 1);
    const defenseMult = Math.max(1, bonuses.defenseMult ?? 1);
    // The decision uses COMPOSITION-AWARE effective power (matchups applied),
    // reported as `armyPower` so the HUD/result reflect what actually decided
    // the battle. `wavePower` is the raw enemy total to beat.
    const armyPower = CombatSystem.effectiveArmyPower(army, wave, attackMult);
    const wavePower = CombatSystem.wavePower(wave);

    const casualties = emptyArmy();
    const survivors = emptyArmy();

    const win = armyPower >= wavePower && armyPower > 0;

    if (!win) {
      // Loss: the army is spent entirely. No reward.
      for (const kind of TROOP_ORDER) {
        casualties[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
      }
      return {
        win: false,
        wave: Math.max(1, Math.floor(wave)),
        survivors,
        casualties,
        reward: {},
        armyPower,
        wavePower,
      };
    }

    // Win: casualty FRACTION is the ratio of wave power to army power, so a
    // dominant win (wavePower << armyPower) costs little, a near-tie costs a lot.
    // Research "combat defense" techs divide the loss fraction (>1 = fewer
    // losses); defaults to 1 so untouched callers are unaffected.
    const lossFraction =
      armyPower > 0 ? Math.min(1, wavePower / armyPower / defenseMult) : 0;
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count <= 0) continue;
      // At least one casualty when the fight was non-trivial, but never the
      // whole stack on a win.
      let lost = Math.floor(count * lossFraction);
      if (lossFraction > 0 && lost >= count) lost = count - 1;
      casualties[kind] = lost;
      survivors[kind] = count - lost;
    }

    return {
      win: true,
      wave: Math.max(1, Math.floor(wave)),
      survivors,
      casualties,
      reward: waveReward(wave),
      armyPower,
      wavePower,
    };
  }
}

/**
 * Per-unit power used by the resolver. Kept module-local (re-derived from the
 * troop's stat block) so CombatSystem does not need to import troopPower under a
 * different name; identical formula shape to TroopConfig.troopPower.
 */
function troopUnitPower(kind: TroopKind): number {
  const s = troopDef(kind).stats;
  return s.attack * s.attackSpeed + s.hp * 0.25;
}

/**
 * A fresh, all-zero {@link Army}, built from {@link TROOP_ORDER} so every troop
 * kind is present. Keeping this derived from the canonical order means new
 * troop kinds never drift out of sync with the survivor/casualty bundles.
 */
function emptyArmy(): Army {
  const out = {} as Army;
  for (const kind of TROOP_ORDER) out[kind] = 0;
  return out;
}

// Re-export for callers that want the enemy stat table alongside combat logic.
export { ENEMY_DEFS };
