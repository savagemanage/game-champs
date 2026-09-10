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
  /**
   * The town-defense value that was factored into this battle (0 when the town
   * has no walls/watchtowers). Reported so the HUD/result can surface how much
   * the fortifications contributed.
   */
  townDefense: number;
  /**
   * Resource loot the raiders carry off on a LOSS. Empty ({}) on a win and on a
   * loss with adequate defense; a poorly-defended town that loses is sacked for
   * resources, so a low-defense loss costs strictly MORE than a well-defended
   * one. The battle call site subtracts this from the player's stockpile.
   */
  penalty: ResourceCost;
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
 *
 * Town-defense model (walls / watchtowers, see BuildingSystem.townDefense):
 * town defense is added FLAT to the army's effective power, so a fortified town
 * beats raid waves a bare army cannot, and it turns near-misses into wins. It
 * ALSO makes losing cheaper: on a loss, town defense both reduces the fraction
 * of the army wiped out (a walled garrison retreats instead of dying to the
 * last) and shields the town's stockpile from being sacked. A town that loses
 * with LOW/zero defense is sacked for a resource {@link CombatResult.penalty}
 * and loses its whole army, whereas a town that loses with ADEQUATE defense
 * keeps survivors and pays little or no loot - so a low-defense loss is
 * strictly more expensive than a high-defense one. All of it stays a pure,
 * deterministic function of `(army, wave, townDefense)`.
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
  static effectiveArmyContributions(army: Army, n: number, attackMult = 1): Partial<Record<TroopKind, number>> {
    const composition = waveComposition(n);
    let waveTotal = 0;
    const share: { kind: (typeof composition)[number]['kind']; power: number }[] = [];
    for (const entry of composition) {
      const power = entry.count * enemyPower(entry.kind);
      waveTotal += power;
      share.push({ kind: entry.kind, power });
    }
    const out: Partial<Record<TroopKind, number>> = {};
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count <= 0) continue;
      let weighted = 1;
      if (waveTotal > 0) {
        weighted = share.reduce(
          (sum, s) => sum + (s.power / waveTotal) * troopVsEnemyMultiplier(kind, s.kind),
          0,
        );
      }
      out[kind] = count * troopUnitPower(kind) * weighted * Math.max(0, attackMult);
    }
    return out;
  }

  static effectiveArmyPower(army: Army, n: number, attackMult = 1, townDefense = 0): number {
    const contributions = CombatSystem.effectiveArmyContributions(army, n, attackMult);
    const troops = TROOP_ORDER.reduce((sum, kind) => sum + (contributions[kind] ?? 0), 0);
    return troops + Math.max(0, townDefense);
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
   * Optional combat inputs. All default to neutral so existing callers/tests
   * resolve identically:
   *   - attackMult:   scales the army's effective power (>1 wins more fights).
   *   - defenseMult:  reduces the casualty fraction on a WIN (>1 loses fewer
   *                   troops). It divides the loss fraction, so 1.1 => ~9% fewer.
   *   - townDefense:  the town's aggregate wall/watchtower defense (>=0). Added
   *                   FLAT to the army's effective power (helping win otherwise-
   *                   lost raids), and on a LOSS it both keeps a garrison alive
   *                   (fewer casualties) and shields the stockpile from being
   *                   sacked, so a low-defense loss costs strictly more than a
   *                   well-defended one.
   */
  static resolve(
    army: Army,
    wave: number,
    bonuses: { attackMult?: number; defenseMult?: number; townDefense?: number } = {},
  ): CombatResult {
    const attackMult = Math.max(0, bonuses.attackMult ?? 1);
    const defenseMult = Math.max(1, bonuses.defenseMult ?? 1);
    const townDefense = Math.max(0, bonuses.townDefense ?? 0);
    // The decision uses COMPOSITION-AWARE effective power (matchups applied)
    // PLUS the flat town-defense contribution, reported as `armyPower` so the
    // HUD/result reflect what actually decided the battle. `wavePower` is the
    // raw enemy total to beat.
    const armyPower = CombatSystem.effectiveArmyPower(army, wave, attackMult, townDefense);
    const wavePower = CombatSystem.wavePower(wave);

    const casualties = emptyArmy();
    const survivors = emptyArmy();

    const win = armyPower >= wavePower && armyPower > 0;

    if (!win) {
      // Loss. Town defense determines how badly it hurts:
      //  - Casualties: without defense the whole army is wiped; walls let a
      //    fraction of the garrison retreat, scaling with how much of the
      //    shortfall the defense covers (defenseCover in [0,1)).
      //  - Sack penalty: a poorly-defended town is looted for resources scaled
      //    by the wave reward; defense reduces the loot, and enough defense
      //    reduces it to nothing. So a low-defense loss costs strictly more
      //    (more troops lost AND more resources sacked) than a high-defense one.
      // How much of the wave the town's power (army + walls) could hold off,
      // in [0,1); 1 would have been a win.
      const defenseCover = wavePower > 0 ? Math.min(1, armyPower / wavePower) : 0;
      // Survivors: up to HALF of each stack can retreat behind adequate walls,
      // scaling with cover. Rounded (not floored) so even small garrisons keep
      // someone once cover is meaningful, but never the whole stack on a loss.
      const survivorFraction = 0.5 * defenseCover;
      for (const kind of TROOP_ORDER) {
        const count = Math.max(0, Math.floor(army[kind] ?? 0));
        if (count <= 0) continue;
        let kept = Math.round(count * survivorFraction);
        if (kept >= count) kept = count - 1; // a loss is never fully survived
        survivors[kind] = kept;
        casualties[kind] = count - kept;
      }
      return {
        win: false,
        wave: Math.max(1, Math.floor(wave)),
        survivors,
        casualties,
        reward: {},
        armyPower,
        wavePower,
        townDefense,
        penalty: sackPenalty(wave, defenseCover),
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
      townDefense,
      penalty: {},
    };
  }
}

/**
 * Resources the raiders sack from a poorly-defended town on a LOSS. Scaled from
 * the wave's reward table (so a lost fight forfeits value comparable to what
 * winning would have paid) and reduced by `defenseCover` in [0,1): a town whose
 * defenses covered most of the wave loses little, a bare town (cover ~0) is
 * sacked for the full penalty, and adequate cover reduces it to nothing. Pure.
 */
function sackPenalty(wave: number, defenseCover: number): ResourceCost {
  const cover = Math.min(1, Math.max(0, defenseCover));
  // How much of the potential loot survives the defense (0 cover => full loot).
  const exposed = 1 - cover;
  if (exposed <= 0) return {};
  const reward = waveReward(wave);
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(reward) as [keyof ResourceCost, number][]) {
    const looted = Math.floor((amount ?? 0) * exposed);
    if (looted > 0) out[res] = looted;
  }
  return out;
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
