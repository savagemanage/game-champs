/**
 * GateMath.ts - pure math-gate helpers for LAST SQUAD.
 *
 * A gate applies one of four operations (add / sub / mul / div) with an operand
 * to the current squad size. Results are always integers clamped to
 * [SQUAD.MIN_SIZE, SQUAD.MAX_SIZE]. This module also formats gate labels and
 * deterministically generates the pair of gates for a row given a seeded RNG
 * and the current difficulty. Phaser-free and fully unit-testable.
 */

import { GATES, SQUAD } from '../config/GameConfig';
import type { Gate, GateOp } from '../types';
import type { Rng } from './Rng';

/**
 * Apply a gate operation to a squad size. The result is floored to an integer
 * and clamped to the configured squad bounds so it can never go negative or
 * overflow the logical cap.
 */
export function applyGate(size: number, op: GateOp, value: number): number {
  let next: number;
  switch (op) {
    case 'add':
      next = size + value;
      break;
    case 'sub':
      next = size - value;
      break;
    case 'mul':
      next = size * value;
      break;
    case 'div':
      // Guard against a zero/negative divisor; treat as no-op divisor of 1.
      next = value > 0 ? size / value : size;
      break;
    default: {
      // Exhaustiveness guard: unknown ops leave the size unchanged.
      const _never: never = op;
      return _never;
    }
  }
  next = Math.floor(next);
  if (next < SQUAD.MIN_SIZE) next = SQUAD.MIN_SIZE;
  if (next > SQUAD.MAX_SIZE) next = SQUAD.MAX_SIZE;
  return next;
}

/** Human-readable label for a gate, e.g. '+10', '-5', 'x2', '/2'. */
export function formatGate(op: GateOp, value: number): string {
  switch (op) {
    case 'add':
      return `+${value}`;
    case 'sub':
      return `-${value}`;
    case 'mul':
      return `x${value}`;
    case 'div':
      return `/${value}`;
    default: {
      const _never: never = op;
      return _never;
    }
  }
}

/** Convenience: format a whole gate object. */
export function gateLabel(gate: Gate): string {
  return formatGate(gate.op, gate.value);
}

/**
 * Whether applying a gate to `size` is "good" (does not shrink the squad).
 * Add and mul are always good; sub/div are good only when they leave the size
 * unchanged (e.g. sub 0 never happens, so effectively bad).
 */
export function isGoodGate(size: number, gate: Gate): boolean {
  return applyGate(size, gate.op, gate.value) >= size;
}

/** A single random gate for a lane at the given difficulty. */
function randomGate(rng: Rng, lane: number, kind: GateOp): Gate {
  let value: number;
  switch (kind) {
    case 'add':
      value = rng.int(GATES.ADD_RANGE[0], GATES.ADD_RANGE[1]);
      break;
    case 'sub':
      value = rng.int(GATES.SUB_RANGE[0], GATES.SUB_RANGE[1]);
      break;
    case 'mul':
      value = rng.int(GATES.MUL_RANGE[0], GATES.MUL_RANGE[1]);
      break;
    case 'div':
    default:
      value = rng.int(GATES.DIV_RANGE[0], GATES.DIV_RANGE[1]);
      break;
  }
  return { op: kind, value, lane };
}

/**
 * Deterministically generate the two gates for a row (one per lane) given a
 * seeded RNG, the current squad size, and difficulty (>= 1). Higher difficulty
 * makes bad gates more likely, but the row ALWAYS contains at least one
 * non-catastrophic choice: a gate that does not reduce the squad below its
 * current size. That guarantee keeps a run winnable with correct play.
 */
export function generateGateRow(rng: Rng, size: number, difficulty: number): Gate[] {
  // Probability that a given lane draws a "bad" (shrinking) op, scaled by
  // difficulty and capped so it never guarantees a double-bad row.
  const badChance = Math.min(0.7, 0.2 + (difficulty - 1) * 0.18);

  const goodOps: GateOp[] = ['add', 'mul'];
  const badOps: GateOp[] = ['sub', 'div'];

  const drawOp = (): GateOp => (rng.next() < badChance ? rng.pick(badOps) : rng.pick(goodOps));

  const laneA = randomGate(rng, 0, drawOp());
  const laneB = randomGate(rng, 1, drawOp());

  // Guarantee a safe choice: if BOTH lanes would shrink the squad, replace the
  // one with the smaller loss with a "good" additive gate.
  if (!isGoodGate(size, laneA) && !isGoodGate(size, laneB)) {
    const resultA = applyGate(size, laneA.op, laneA.value);
    const resultB = applyGate(size, laneB.op, laneB.value);
    const rescueLane = resultA >= resultB ? 0 : 1;
    const rescued = randomGate(rng, rescueLane, 'add');
    return rescueLane === 0 ? [rescued, laneB] : [laneA, rescued];
  }

  return [laneA, laneB];
}
