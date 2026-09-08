/**
 * Enemy champion decision logic. Pure TypeScript with no Phaser dependency so
 * the bot's behavior is deterministic and unit-testable: given the same
 * snapshot it always returns the same intent.
 *
 * The BattleScene builds an `AiSnapshot` each tick from live combat state,
 * calls `decideAction`, and applies the resulting `AiIntent` through the exact
 * same combat/ability systems the human player uses.
 */

import type { CooldownState, CooldownKey } from './combat';
import type {
  AbilityBehavior,
  ChampionRole,
} from '../data/champions';

/**
 * Behaviors that do not need an enemy in range to be worth casting: they act on
 * the caster (heals, self-buffs). Everything else is treated as offensive and
 * gated on target range.
 */
const NON_OFFENSIVE_BEHAVIORS: ReadonlySet<AbilityBehavior> = new Set([
  'heal',
  'buff',
]);

/** True for support-style abilities that target the caster rather than an enemy. */
export function isNonOffensive(behavior: AbilityBehavior): boolean {
  return NON_OFFENSIVE_BEHAVIORS.has(behavior);
}

/** The set of decisions the bot can make on a given tick. */
export type AiIntent =
  | 'approach'
  | 'attack'
  | 'castQ'
  | 'castW'
  | 'castE'
  | 'castR'
  | 'retreat';

/** Optional strategic signals used by the scored decision path. */
export interface AiContext {
  role?: ChampionRole;
  /** 0..1 exposure to hostile structure fire. */
  turretDanger?: number;
  /** -1..1: negative means a hostile wave is winning, positive means allied push. */
  wavePressure?: number;
  /** 0..1 urgency to contest or protect a neutral objective. */
  objectivePressure?: number;
  nearbyAllies?: number;
  nearbyEnemies?: number;
  gold?: number;
  nextPurchaseCost?: number;
  /** True while the unit can buy immediately at its shop. */
  shopAvailable?: boolean;
}

/** Everything the bot needs to reason about its next move. */
export interface AiSnapshot {
  /** Bot's current hp as a fraction of max (0..1). */
  selfHpPct: number;
  /** Bot's current resource/mana as a fraction of max (0..1). */
  selfResourcePct: number;
  /** Distance to the primary target (nearest enemy champion/unit), world units. */
  distanceToTarget: number;
  /** Whether a valid target currently exists. */
  hasTarget: boolean;
  /** Basic-attack range of the bot. */
  attackRange: number;
  /** Cooldowns for Q/W/E/R. */
  cooldowns: CooldownState;
  /** Cast ranges for each ability, indexed by slot. */
  abilityRanges: Record<CooldownKey, number>;
  /** Resource cost for each ability, indexed by slot. */
  abilityCosts: Record<CooldownKey, number>;
  /** Behavior tag for each ability, indexed by slot (drives offensive vs self). */
  abilityBehaviors: Record<CooldownKey, AbilityBehavior>;
  /** Max resource pool, used to convert costs into a fraction. */
  maxResource: number;
  /** True when the target's hp fraction is low enough to try to finish it. */
  targetLowHp: boolean;
  /** Optional strategic context. Omit it to retain the original priority policy. */
  context?: AiContext;
}

/** Below this hp fraction the bot prioritizes disengaging. */
export const RETREAT_HP_THRESHOLD = 0.28;

/**
 * At or below this hp fraction the bot is "hurt enough" to justify spending a
 * self-heal or self-buff even when no enemy is nearby. Above it, saving those
 * cooldowns is the better play.
 */
export const SELF_SUSTAIN_HP_THRESHOLD = 0.85;

/**
 * Decide the bot's next action from a snapshot.
 *
 * Priority order:
 *  1. No target -> approach (walk down the lane toward the enemy base).
 *  2. Very low hp -> retreat (unless it can execute a low-hp target it can reach).
 *  3. Cast the highest-impact ability that is ready, affordable, and in range
 *     (R > W > Q > E ordering favors burst/utility, then filler).
 *  4. In basic-attack range -> attack.
 *  5. Otherwise -> approach to close the gap.
 */
export function decideAction(snapshot: AiSnapshot): AiIntent {
  if (snapshot.context) {
    return decideScoredAction(snapshot);
  }

  const castOrder: { slot: CooldownKey; intent: AiIntent }[] = [
    { slot: 'R', intent: 'castR' },
    { slot: 'W', intent: 'castW' },
    { slot: 'Q', intent: 'castQ' },
    { slot: 'E', intent: 'castE' },
  ];

  // Self-sustain first: heals/buffs act on the caster, so they are worth
  // casting on self-state (being hurt) regardless of whether a target exists or
  // is in range. This lets support kits (e.g. an enemy enchanter) meaningfully
  // act instead of hoarding cooldowns until an enemy walks up.
  for (const { slot, intent } of castOrder) {
    if (isNonOffensive(snapshot.abilityBehaviors[slot]) && canCast(snapshot, slot)) {
      return intent;
    }
  }

  if (!snapshot.hasTarget) {
    return 'approach';
  }

  const canExecute =
    snapshot.targetLowHp &&
    snapshot.distanceToTarget <= snapshot.attackRange * 1.5;

  if (snapshot.selfHpPct <= RETREAT_HP_THRESHOLD && !canExecute) {
    return 'retreat';
  }

  // Then offensive abilities from most to least impactful. An offensive ability
  // is castable when it is off cooldown, affordable, and the target is in range.
  for (const { slot, intent } of castOrder) {
    if (!isNonOffensive(snapshot.abilityBehaviors[slot]) && canCast(snapshot, slot)) {
      return intent;
    }
  }

  if (snapshot.distanceToTarget <= snapshot.attackRange) {
    return 'attack';
  }

  return 'approach';
}

const SCORED_INTENT_ORDER: readonly AiIntent[] = [
  'castR',
  'castW',
  'castQ',
  'castE',
  'attack',
  'retreat',
  'approach',
];

const CAST_SLOTS: Readonly<Partial<Record<AiIntent, CooldownKey>>> = {
  castQ: 'Q',
  castW: 'W',
  castE: 'E',
  castR: 'R',
};

const ROLE_RETREAT_BIAS: Record<ChampionRole, number> = {
  marksman: 10,
  assassin: -8,
  bruiser: -10,
  mage: 7,
  enchanter: 13,
};

const ROLE_ENGAGE_BIAS: Record<ChampionRole, number> = {
  marksman: 2,
  assassin: 12,
  bruiser: 10,
  mage: 5,
  enchanter: -6,
};

/** Score every intent from tactical context; invalid actions stay at -Infinity. */
export function scoreAiIntents(snapshot: AiSnapshot): Record<AiIntent, number> {
  const context = snapshot.context ?? {};
  const canExecute =
    snapshot.hasTarget &&
    snapshot.targetLowHp &&
    snapshot.distanceToTarget <= snapshot.attackRange * 1.5;
  const scores: Record<AiIntent, number> = {
    approach: snapshot.hasTarget ? 12 : 40,
    attack:
      snapshot.hasTarget && snapshot.distanceToTarget <= snapshot.attackRange
        ? 52
        : Number.NEGATIVE_INFINITY,
    castQ: castScore(snapshot, 'Q', 72),
    castW: castScore(snapshot, 'W', 82),
    castE: castScore(snapshot, 'E', 62),
    castR: castScore(snapshot, 'R', 92),
    retreat:
      snapshot.selfHpPct <= RETREAT_HP_THRESHOLD && !canExecute ? 105 : 5,
  };

  const turretDanger = clamp(context.turretDanger ?? 0, 0, 1);
  const wavePressure = clamp(context.wavePressure ?? 0, -1, 1);
  const objectivePressure = clamp(context.objectivePressure ?? 0, 0, 1);
  const nearbyAllies = positive(context.nearbyAllies ?? 0);
  const nearbyEnemies = positive(context.nearbyEnemies ?? 0);
  const numberAdvantage = clamp((nearbyAllies - nearbyEnemies) / 3, -1, 1);
  const purchaseReady =
    positive(context.nextPurchaseCost ?? 0) > 0 &&
    positive(context.gold ?? 0) >= positive(context.nextPurchaseCost ?? 0);
  const hasDisengageSignal =
    snapshot.selfHpPct <= RETREAT_HP_THRESHOLD ||
    turretDanger > 0 ||
    wavePressure < 0 ||
    numberAdvantage < 0 ||
    (purchaseReady && !context.shopAvailable);
  const roleRetreat =
    context.role && hasDisengageSignal ? ROLE_RETREAT_BIAS[context.role] : 0;
  const roleEngage = context.role ? ROLE_ENGAGE_BIAS[context.role] : 0;

  scores.retreat +=
    turretDanger * 70 +
    Math.max(0, -wavePressure) * 24 +
    Math.max(0, -numberAdvantage) * 22 +
    roleRetreat;
  if (purchaseReady && !context.shopAvailable) {
    scores.retreat += 18 * (1 - objectivePressure * 0.75);
  }

  const engageModifier =
    Math.max(0, wavePressure) * 20 +
    objectivePressure * 24 +
    Math.max(0, numberAdvantage) * 18 -
    turretDanger * 65 +
    roleEngage;

  for (const intent of SCORED_INTENT_ORDER) {
    if (isEngageIntent(snapshot, intent) && Number.isFinite(scores[intent])) {
      scores[intent] += engageModifier;
      if (
        snapshot.targetLowHp &&
        (context.role === 'assassin' || context.role === 'bruiser')
      ) {
        scores[intent] += context.role === 'assassin' ? 18 : 10;
      }
    }
  }

  return scores;
}

/** Score one intent without changing the deterministic tie order. */
export function scoreAiIntent(snapshot: AiSnapshot, intent: AiIntent): number {
  return scoreAiIntents(snapshot)[intent];
}

/** Choose the highest-scoring action, with a stable order for exact ties. */
export function decideScoredAction(snapshot: AiSnapshot): AiIntent {
  const scores = scoreAiIntents(snapshot);
  let best = SCORED_INTENT_ORDER[0];
  for (const intent of SCORED_INTENT_ORDER.slice(1)) {
    if (scores[intent] > scores[best]) best = intent;
  }
  return best;
}

function castScore(
  snapshot: AiSnapshot,
  slot: CooldownKey,
  offensiveScore: number,
): number {
  if (!canCast(snapshot, slot)) return Number.NEGATIVE_INFINITY;
  return isNonOffensive(snapshot.abilityBehaviors[slot])
    ? 115
    : offensiveScore;
}

function isEngageIntent(snapshot: AiSnapshot, intent: AiIntent): boolean {
  if (intent === 'approach' || intent === 'attack') return true;
  const slot = CAST_SLOTS[intent];
  return slot != null && !isNonOffensive(snapshot.abilityBehaviors[slot]);
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * True when ability `slot` should be cast this tick.
 *
 * All abilities must be off cooldown and affordable. From there the gate splits
 * by behavior:
 *  - Non-offensive (heal/buff): act on the caster, so they need NO enemy in
 *    range. They are held until the bot is actually hurt (self hp at or below
 *    `SELF_SUSTAIN_HP_THRESHOLD`) to avoid burning them at full health.
 *  - Offensive (skillshot/aoe/dash/stun): require a valid target within the
 *    ability's range, as before.
 */
export function canCast(snapshot: AiSnapshot, slot: CooldownKey): boolean {
  const ready = snapshot.cooldowns[slot] <= 0;
  const cost = snapshot.abilityCosts[slot];
  const affordable =
    snapshot.maxResource <= 0
      ? true
      : snapshot.selfResourcePct * snapshot.maxResource >= cost;
  if (!ready || !affordable) return false;

  if (isNonOffensive(snapshot.abilityBehaviors[slot])) {
    // Self-heal / self-buff: gated on self-state, not target range.
    return snapshot.selfHpPct <= SELF_SUSTAIN_HP_THRESHOLD;
  }

  const inRange =
    snapshot.hasTarget &&
    snapshot.distanceToTarget <= snapshot.abilityRanges[slot];
  return inRange;
}
