import { ENEMY_DEFS, TROOP_ORDER, enemyPower, troopDef } from '../config/TroopConfig';
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
 * Casualty model: the loser is wiped out; the winner loses troops in proportion
 * to how close the fight was (a lopsided win costs almost nothing, a squeaker
 * costs a large share). Losses are distributed across troop kinds in proportion
 * to how many of each the army fielded.
 */
export class CombatSystem {
  /**
   * Total effective power of an army bundle. Sums each troop kind's
   * `count * troopPower`. Pure and monotonic in troop counts.
   */
  static armyPower(army: Army): number {
    let total = 0;
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count > 0) total += count * troopUnitPower(kind);
    }
    return total;
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
   * Resolve a battle of `army` against wave `wave`. Deterministic. Returns a
   * full {@link CombatResult}. The army passed in is NOT mutated; the caller
   * applies survivors/reward from the result.
   */
  static resolve(army: Army, wave: number): CombatResult {
    const armyPower = CombatSystem.armyPower(army);
    const wavePower = CombatSystem.wavePower(wave);

    const casualties: Army = { spearman: 0, archer: 0, knight: 0 };
    const survivors: Army = { spearman: 0, archer: 0, knight: 0 };

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
    const lossFraction = armyPower > 0 ? Math.min(1, wavePower / armyPower) : 0;
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

// Re-export for callers that want the enemy stat table alongside combat logic.
export { ENEMY_DEFS };
