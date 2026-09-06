import {
  armyBattleMultiplier,
  classBattleMultiplier,
  emptyModifiers,
} from '../config/StatModifiers';
import {
  ENEMY_DEFS,
  TROOP_ORDER,
  enemyPower,
  troopClass,
  troopTierPower,
  troopVsEnemyMultiplier,
} from '../config/TroopConfig';
import { waveComposition, waveReward } from '../config/WaveConfig';
import type { Army, ArmyTiers, ResourceCost, StatModifiers, TroopKind } from '../types';

/** The result of resolving a single battle. */
export interface CombatResult {
  /** True when the player's army destroyed the whole wave. */
  win: boolean;
  /** The wave number that was fought. */
  wave: number;
  /** Surviving player troops (only meaningful on a win; all-zero on a loss). */
  survivors: Army;
  /**
   * Surviving player troops broken down BY TIER (kind -> tier -> count), so the
   * town's tiered army can be updated after a battle without losing tier
   * information. Casualties are taken proportionally within each kind.
   */
  survivorTiers: ArmyTiers;
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
 * The battle modifiers a resolve/effective-power call applies. Optional
 * everywhere so the resolver stays a pure function of `(army, wave)` by default
 * (all existing call-sites and tests keep working with no modifiers), while
 * GameState can thread the combined research + gear + hero bundle in so combat
 * genuinely scales with progression. Bundling this in the config layer keeps
 * CombatSystem free of any systems import.
 */
export type BattleModifiers = StatModifiers;

/**
 * CombatSystem - a pure, DETERMINISTIC battle resolver.
 *
 * Given the player's standing army and a wave number, it computes total
 * effective power on each side (from the per-unit stats in TroopConfig and the
 * composition in WaveConfig), decides win/lose, and distributes casualties.
 *
 * Determinism: the outcome is a pure function of `(army, wave, modifiers)`.
 * There is no Math.random, so unit tests are stable.
 *
 * Two things scale a stack's effective power:
 *   1. the Infantry > Lancer > Marksman TRIANGLE — each troop kind's power is
 *      multiplied by the wave-power-weighted average of its soft-RPS
 *      {@link troopVsEnemyMultiplier} against every enemy role in the wave, so
 *      fielding the class that counters a wave's dominant enemy is worth more
 *      than an equal-cost off-counter stack, and
 *   2. the combined {@link StatModifiers} bundle — army-wide attack/hp/defense
 *      via {@link armyBattleMultiplier} and per-class (infantry/lancer/marksman)
 *      bonuses via {@link classBattleMultiplier}, so research, gear and hero
 *      bonuses make troops hit harder without changing the deterministic shape.
 */
export class CombatSystem {
  /**
   * Raw total power of an army bundle, IGNORING matchups but INCLUDING the
   * optional battle modifiers (army-wide + per-class). Sums each troop kind's
   * `count * troopPower * armyMult * classMult`. Pure and monotonic in troop
   * counts. Used for coarse sizing/UI and campaign validation; the wave battle
   * decision uses {@link effectiveArmyPower}.
   */
  static armyPower(army: Army, modifiers?: BattleModifiers, tiers?: ArmyTiers): number {
    const mods = modifiers ?? emptyModifiers();
    const armyMult = armyBattleMultiplier(mods);
    let total = 0;
    for (const kind of TROOP_ORDER) {
      const count = Math.max(0, Math.floor(army[kind] ?? 0));
      if (count > 0) {
        // The tier-weighted per-unit power (higher-tier units are stronger); a
        // missing tier breakdown falls back to tier 1 for the whole kind.
        const perKind = tieredKindPower(kind, count, tiers);
        total += perKind * armyMult * classBattleMultiplier(mods, troopClass(kind));
      }
    }
    return total;
  }

  /**
   * Composition-aware effective power of `army` against wave `n`. Each troop
   * kind's raw power is multiplied by the wave-power-weighted average of its
   * soft-RPS counter multiplier against every enemy role in the wave AND by the
   * optional battle modifiers (army-wide + per-class). This is the value the
   * resolver compares against {@link wavePower}, so a stack that counters the
   * wave's dominant enemy — and one buffed by research/gear/heroes —
   * outperforms an equal raw-power stack that is not. Pure and deterministic.
   */
  static effectiveArmyPower(
    army: Army,
    n: number,
    modifiers?: BattleModifiers,
    tiers?: ArmyTiers,
  ): number {
    const mods = modifiers ?? emptyModifiers();
    const armyMult = armyBattleMultiplier(mods);
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
      const classMult = classBattleMultiplier(mods, troopClass(kind));
      const raw = tieredKindPower(kind, count, tiers) * armyMult * classMult;
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
   * applies survivors/reward from the result. Optional `modifiers` scale the
   * player's effective power (research + gear + hero battle bonuses).
   */
  static resolve(
    army: Army,
    wave: number,
    modifiers?: BattleModifiers,
    tiers?: ArmyTiers,
  ): CombatResult {
    // The decision uses COMPOSITION-AWARE effective power (matchups + modifiers
    // + troop tiers applied), reported as `armyPower` so the HUD/result reflect
    // what actually decided the battle. `wavePower` is the raw enemy total.
    const armyPower = CombatSystem.effectiveArmyPower(army, wave, modifiers, tiers);
    const wavePower = CombatSystem.wavePower(wave);

    const casualties: Army = { trapper: 0, marksman: 0, vanguard: 0 };
    const survivors: Army = { trapper: 0, marksman: 0, vanguard: 0 };
    const survivorTiers: ArmyTiers = {};

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
        survivorTiers,
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
      // Distribute the survivors back across the kind's tiers proportionally,
      // so the standing tiered army keeps its higher-tier units where possible.
      const perTierSurv = distributeSurvivors(kind, count, survivors[kind], tiers);
      if (Object.keys(perTierSurv).length > 0) survivorTiers[kind] = perTierSurv;
    }

    return {
      win: true,
      wave: Math.max(1, Math.floor(wave)),
      survivors,
      survivorTiers,
      casualties,
      reward: waveReward(wave),
      armyPower,
      wavePower,
    };
  }
}

/**
 * The total power of `count` units of a kind, respecting the per-tier
 * breakdown when supplied: each tier's units contribute {@link troopTierPower}
 * at that tier. A missing/short breakdown lands the remaining units at tier 1,
 * so the tier-blind callers (all existing tests) behave exactly as before.
 */
function tieredKindPower(kind: TroopKind, count: number, tiers?: ArmyTiers): number {
  const perTier = tiers?.[kind];
  if (!perTier) return count * troopTierPower(kind, 1);
  let power = 0;
  let accounted = 0;
  for (const [tierStr, n] of Object.entries(perTier)) {
    const c = Math.max(0, Math.floor(n ?? 0));
    if (c <= 0) continue;
    power += c * troopTierPower(kind, Number(tierStr));
    accounted += c;
  }
  // Any units not covered by the breakdown default to tier 1.
  const remainder = Math.max(0, count - accounted);
  if (remainder > 0) power += remainder * troopTierPower(kind, 1);
  return power;
}

/**
 * Distribute `survivorCount` survivors of a kind back across the tiers it was
 * fielded at (proportionally, floored, remainder to the highest tiers so strong
 * units are preferentially kept). Falls back to a single tier-1 bucket when no
 * breakdown is supplied.
 */
function distributeSurvivors(
  kind: TroopKind,
  originalCount: number,
  survivorCount: number,
  tiers?: ArmyTiers,
): Record<number, number> {
  const out: Record<number, number> = {};
  if (survivorCount <= 0) return out;
  const perTier = tiers?.[kind];
  if (!perTier || originalCount <= 0) {
    out[1] = survivorCount;
    return out;
  }
  const entries = Object.entries(perTier)
    .map(([t, n]) => [Number(t), Math.max(0, Math.floor(n ?? 0))] as [number, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[0] - a[0]); // highest tier first
  let assigned = 0;
  for (const [tier, n] of entries) {
    const share = Math.floor((n / originalCount) * survivorCount);
    if (share > 0) {
      out[tier] = share;
      assigned += share;
    }
  }
  // Remainder (from flooring) goes to the highest tiers first.
  let remainder = survivorCount - assigned;
  for (const [tier] of entries) {
    if (remainder <= 0) break;
    out[tier] = (out[tier] ?? 0) + 1;
    remainder--;
  }
  return out;
}

// Re-export for callers that want the enemy stat table alongside combat logic.
export { ENEMY_DEFS };
