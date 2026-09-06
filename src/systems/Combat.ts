/**
 * Combat.ts - the deterministic turn-based AUTO-battle resolver (FEAT-003).
 *
 * Given two assembled {@link Team}s and a numeric seed, this resolves the whole
 * battle with NO clock and NO shared mutable global state, so the same seed +
 * same teams always produce the SAME {@link BattleResult} AND the SAME ordered
 * event timeline. FEAT-007 replays the timeline to animate the exact resolved
 * battle.
 *
 * TURN ORDER: at battle start every living combatant is sorted by descending
 * speed; ties break deterministically by side (attacker before defender) then
 * by original slot index. The order is fixed for the whole battle; dead units
 * are skipped. A full pass over the order is one ROUND.
 *
 * TARGETING: a combatant targets the enemy team's FRONT row first; only once no
 * front-row enemy is alive does it target the back row. Within the eligible row
 * it focuses the LOWEST current-HP enemy (deterministic; ties break by slot) so
 * damage is not wasted.
 *
 * DAMAGE FORMULA (documented, config-driven from {@link COMBAT}):
 *   typeMult = ADVANTAGE_MULT   if attacker.type beats defender.type
 *            = DISADVANTAGE_MULT if attacker.type loses to defender.type
 *            = NEUTRAL_MULT      otherwise
 *   roleMult = DEALER/TANK/SUPPORT_DAMAGE_MULT by attacker.role
 *   variance = 1 +/- VARIANCE, drawn from the seeded RNG per attack
 *   raw      = attacker.atk * typeMult * roleMult * variance
 *   damage   = max(MIN_DAMAGE, round(raw - defender.def * DEF_FACTOR))
 *
 * ROLE BEHAVIOR: a SUPPORT, on its turn, first HEALS the lowest-HP wounded ally
 * for `atk * SUPPORT_HEAL_FACTOR` (capped at that ally's maxHp) instead of, and
 * before deciding to, attacking - it only attacks if no ally needs healing.
 * Tanks and dealers always attack (their role multiplier differentiates them).
 *
 * TERMINATION: the battle ends when one side has no living combatant, or when
 * {@link COMBAT.MAX_ROUNDS} is reached (the side with more total remaining HP
 * wins; exact ties resolve to the defender).
 */

import { COMBAT, TYPE_ADVANTAGE } from '../config/GameConfig';
import type { HeroType } from '../types';
import type { Combatant, Team } from './Formation';
import { makeRng, type Rng } from './Rng';

/** Which side of the battle a combatant belongs to. */
export type Side = 'attacker' | 'defender';

/** A live combatant during resolution (a mutable copy of a {@link Combatant}). */
interface Unit extends Combatant {
  /** Side of the battle. */
  side: Side;
  /** Current HP (0 = dead). */
  hp: number;
  /** Original index within its team (stable tie-breaker). */
  slot: number;
}

/** A single ordered battle event (the animation timeline). */
export type BattleEvent =
  | {
      kind: 'attack';
      round: number;
      attacker: string;
      attackerSide: Side;
      target: string;
      targetSide: Side;
      damage: number;
      /** The type-advantage multiplier applied (for FX cues). */
      typeMult: number;
      /** True if this attack reduced the target to 0 HP. */
      lethal: boolean;
    }
  | {
      kind: 'heal';
      round: number;
      healer: string;
      healerSide: Side;
      target: string;
      targetSide: Side;
      amount: number;
    }
  | {
      kind: 'death';
      round: number;
      unit: string;
      side: Side;
    };

/** The final outcome of a resolved battle. */
export interface BattleResult {
  /** The winning side. */
  winner: Side;
  /** Rounds elapsed before resolution. */
  rounds: number;
  /** Whether the battle hit the round cap (decided by remaining HP). */
  timedOut: boolean;
  /** Surviving hero ids on the attacker side. */
  attackerSurvivors: string[];
  /** Surviving hero ids on the defender side. */
  defenderSurvivors: string[];
  /** The ordered event timeline FEAT-007 animates. */
  timeline: BattleEvent[];
}

/** Does attacker type beat defender type per the triangle? */
export function beats(attacker: HeroType, defender: HeroType): boolean {
  return TYPE_ADVANTAGE[attacker] === defender;
}

/** The type multiplier for an attacker-vs-defender type matchup. */
export function typeMultiplier(attacker: HeroType, defender: HeroType): number {
  if (beats(attacker, defender)) return COMBAT.ADVANTAGE_MULT;
  if (beats(defender, attacker)) return COMBAT.DISADVANTAGE_MULT;
  return COMBAT.NEUTRAL_MULT;
}

/** The outgoing-damage role multiplier for a combatant's role. */
function roleMultiplier(role: Combatant['role']): number {
  switch (role) {
    case 'dealer':
      return COMBAT.DEALER_DAMAGE_MULT;
    case 'tank':
      return COMBAT.TANK_DAMAGE_MULT;
    case 'support':
      return COMBAT.SUPPORT_DAMAGE_MULT;
    default:
      return COMBAT.NEUTRAL_MULT;
  }
}

/**
 * Compute the damage a single attack deals. Exposed for testing the formula in
 * isolation. `variance` is the pre-drawn multiplier (1 +/- VARIANCE).
 */
export function attackDamage(attacker: Combatant, defender: Combatant, variance: number): number {
  const typeMult = typeMultiplier(attacker.type, defender.type);
  const roleMult = roleMultiplier(attacker.role);
  const raw = attacker.atk * typeMult * roleMult * variance;
  return Math.max(COMBAT.MIN_DAMAGE, Math.round(raw - defender.def * COMBAT.DEF_FACTOR));
}

/** Build the mutable unit list for a side from a team. */
function toUnits(team: Team, side: Side): Unit[] {
  return team.members.map((m, slot) => ({ ...m, side, slot, hp: m.maxHp }));
}

/** Living units of a side. */
function living(units: Unit[]): Unit[] {
  return units.filter((u) => u.hp > 0);
}

/**
 * Choose an attack target from the enemy units: front-row-living first, else
 * back-row-living; within the eligible row the lowest-HP unit (ties by slot).
 * Returns null when the enemy has no living unit.
 */
function chooseTarget(enemies: Unit[]): Unit | null {
  const alive = living(enemies);
  if (alive.length === 0) return null;
  const front = alive.filter((u) => u.row === 'front');
  const pool = front.length > 0 ? front : alive;
  return pool.reduce((best, u) => {
    if (u.hp < best.hp) return u;
    if (u.hp === best.hp && u.slot < best.slot) return u;
    return best;
  });
}

/** Choose the lowest-HP wounded ally (hp < maxHp) for a support to heal. */
function chooseHealTarget(allies: Unit[], self: Unit): Unit | null {
  const wounded = living(allies).filter((u) => u.hp < u.maxHp);
  if (wounded.length === 0) return null;
  // Prefer the lowest current HP; ties by slot. Self is eligible.
  void self;
  return wounded.reduce((best, u) => {
    if (u.hp < best.hp) return u;
    if (u.hp === best.hp && u.slot < best.slot) return u;
    return best;
  });
}

/**
 * Resolve a full auto-battle between two teams with a seed. Deterministic: same
 * seed + same teams => identical {@link BattleResult} (winner, survivors,
 * rounds) and identical timeline. Front-row-before-back-row targeting, the type
 * triangle, and role behavior are all applied.
 */
export function resolveBattle(attacker: Team, defender: Team, seed: number): BattleResult {
  const rng: Rng = makeRng(seed);
  const atk = toUnits(attacker, 'attacker');
  const def = toUnits(defender, 'defender');
  const all = [...atk, ...def];

  // Fixed turn order: descending speed; ties -> attacker side first, then slot.
  const sideRank: Record<Side, number> = { attacker: 0, defender: 1 };
  const order = [...all].sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    if (sideRank[a.side] !== sideRank[b.side]) return sideRank[a.side] - sideRank[b.side];
    return a.slot - b.slot;
  });

  const timeline: BattleEvent[] = [];
  const alliesOf = (u: Unit): Unit[] => (u.side === 'attacker' ? atk : def);
  const enemiesOf = (u: Unit): Unit[] => (u.side === 'attacker' ? def : atk);

  let round = 0;
  let timedOut = false;

  while (true) {
    if (living(atk).length === 0 || living(def).length === 0) break;
    if (round >= COMBAT.MAX_ROUNDS) {
      timedOut = true;
      break;
    }
    round += 1;

    for (const unit of order) {
      if (unit.hp <= 0) continue;
      // Stop mid-round the instant one side is wiped.
      if (living(atk).length === 0 || living(def).length === 0) break;

      // SUPPORT: heal the lowest-HP wounded ally first; only attack if none.
      if (unit.role === 'support') {
        const healTarget = chooseHealTarget(alliesOf(unit), unit);
        if (healTarget) {
          const amount = Math.max(
            COMBAT.MIN_DAMAGE,
            Math.round(unit.atk * COMBAT.SUPPORT_HEAL_FACTOR),
          );
          const healed = Math.min(healTarget.maxHp, healTarget.hp + amount);
          const applied = healed - healTarget.hp;
          healTarget.hp = healed;
          timeline.push({
            kind: 'heal',
            round,
            healer: unit.id,
            healerSide: unit.side,
            target: healTarget.id,
            targetSide: healTarget.side,
            amount: applied,
          });
          continue;
        }
      }

      // Otherwise attack the chosen enemy target.
      const target = chooseTarget(enemiesOf(unit));
      if (!target) continue;
      const variance = rng.range(1 - COMBAT.VARIANCE, 1 + COMBAT.VARIANCE);
      const damage = attackDamage(unit, target, variance);
      target.hp = Math.max(0, target.hp - damage);
      const lethal = target.hp === 0;
      timeline.push({
        kind: 'attack',
        round,
        attacker: unit.id,
        attackerSide: unit.side,
        target: target.id,
        targetSide: target.side,
        damage,
        typeMult: typeMultiplier(unit.type, target.type),
        lethal,
      });
      if (lethal) {
        timeline.push({ kind: 'death', round, unit: target.id, side: target.side });
      }
    }
  }

  const atkAlive = living(atk);
  const defAlive = living(def);
  let winner: Side;
  if (timedOut) {
    const atkHp = atkAlive.reduce((s, u) => s + u.hp, 0);
    const defHp = defAlive.reduce((s, u) => s + u.hp, 0);
    winner = atkHp > defHp ? 'attacker' : 'defender';
  } else {
    winner = defAlive.length === 0 ? 'attacker' : 'defender';
  }

  return {
    winner,
    rounds: round,
    timedOut,
    attackerSurvivors: atkAlive.map((u) => u.id),
    defenderSurvivors: defAlive.map((u) => u.id),
    timeline,
  };
}
