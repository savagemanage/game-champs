/**
 * EnemyConfig - FIXED base stats and tuning for the six original, role-based
 * giant types.
 *
 * DESIGN RULE (enforced across the codebase): these base stats are FIXED. The
 * game gets harder ONLY through wave COMPOSITION (see src/config/WaveConfig.ts)
 * - i.e. by spawning more/tougher-role giants together - and NEVER by mutating
 * an individual giant's HP / speed / damage at runtime. The enemy entities read
 * these numbers once at spawn and treat them as immutable.
 *
 * Weak-point (nape) model: every giant has a nape hitbox on the back of the
 * neck. A body hit deals normal HP damage; a nape hit deals damage multiplied
 * by {@link napeCritMultiplier} (a big/critical bonus). The nape is NOT the
 * sole kill point - stacking body hits also kills - but it is by far the
 * fastest way down. Armored giants additionally take reduced damage from the
 * front (see {@link frontalResist}); their nape and rear are still fully
 * vulnerable, so hitting them from behind/above is the intended counter.
 */

import { EnemyRole } from './GameConfig';

/** Immutable per-role base stats. Consumed once at spawn; never mutated. */
export interface EnemyStats {
  readonly role: EnemyRole;
  /** Display name for HUD / codex (original naming). */
  readonly name: string;
  /** Fixed maximum hit points. */
  readonly maxHp: number;
  /** Horizontal ground move speed toward the wall, px/s. */
  readonly moveSpeed: number;
  /** Contact/attack damage dealt to the wall (or hero) per hit. */
  readonly attack: number;
  /** Damage multiplier applied when the nape/weak-point is struck (>1). */
  readonly napeCritMultiplier: number;
  /**
   * Fraction [0..1] of incoming damage BLOCKED on a frontal body hit. 0 = no
   * frontal armor. Only meaningful for the Armored role; nape/rear hits always
   * ignore this. Kept per-role so the rule lives in config, not code.
   */
  readonly frontalResist: number;
  /** Rendered sprite scale multiplier (silhouette size). */
  readonly scale: number;
  /** Milliseconds between successive attacks once in range of a target. */
  readonly attackCooldownMs: number;
  /** Horizontal reach (px) at which the giant can attack the wall/citizen. */
  readonly attackRange: number;
  /** Score awarded to the player for a kill. */
  readonly scoreValue: number;
}

/**
 * The six authoritative giants with FIXED base stats. Balanced so that lone
 * early giants are manageable but mixed later compositions are lethal.
 */
export const ENEMY_STATS: Record<EnemyRole, EnemyStats> = {
  // 1) Wanderer - the baseline giant: standard size, standard speed.
  [EnemyRole.Wanderer]: {
    role: EnemyRole.Wanderer,
    name: 'Wanderer',
    maxHp: 90,
    moveSpeed: 42,
    attack: 8,
    napeCritMultiplier: 3,
    frontalResist: 0,
    scale: 1,
    attackCooldownMs: 1100,
    attackRange: 46,
    scoreValue: 100,
  },
  // 2) Sprinter - small, fast, quadrupedal charge; low HP glass cannon on legs.
  [EnemyRole.Sprinter]: {
    role: EnemyRole.Sprinter,
    name: 'Sprinter',
    maxHp: 50,
    moveSpeed: 120,
    attack: 6,
    napeCritMultiplier: 3.5,
    frontalResist: 0,
    scale: 1,
    attackCooldownMs: 850,
    attackRange: 40,
    scoreValue: 120,
  },
  // 3) Breaker - huge, slow, high HP; the dedicated wall-smasher.
  [EnemyRole.Breaker]: {
    role: EnemyRole.Breaker,
    name: 'Breaker',
    maxHp: 260,
    moveSpeed: 26,
    attack: 26,
    napeCritMultiplier: 2.4,
    frontalResist: 0,
    scale: 1,
    attackCooldownMs: 1600,
    attackRange: 58,
    scoreValue: 260,
  },
  // 4) Aberrant - erratic, unpredictable; ignores normal pathing, weaves.
  [EnemyRole.Aberrant]: {
    role: EnemyRole.Aberrant,
    name: 'Aberrant',
    maxHp: 70,
    moveSpeed: 88,
    attack: 10,
    napeCritMultiplier: 3.5,
    frontalResist: 0,
    scale: 1,
    attackCooldownMs: 700,
    attackRange: 42,
    scoreValue: 160,
  },
  // 5) Armored - heavy frontal plate; near-immune from the front, weak at nape.
  [EnemyRole.Armored]: {
    role: EnemyRole.Armored,
    name: 'Armored',
    maxHp: 150,
    moveSpeed: 40,
    attack: 14,
    napeCritMultiplier: 3,
    frontalResist: 0.9,
    scale: 1,
    attackCooldownMs: 1300,
    attackRange: 48,
    scoreValue: 220,
  },
  // 6) Thrower - ranged; lobs debris at the wall/hero from a standoff distance.
  [EnemyRole.Thrower]: {
    role: EnemyRole.Thrower,
    name: 'Thrower',
    maxHp: 80,
    moveSpeed: 34,
    attack: 12,
    napeCritMultiplier: 3,
    frontalResist: 0,
    scale: 1,
    attackCooldownMs: 2200,
    attackRange: 520,
    scoreValue: 180,
  },
};

/** Shared combat/behaviour constants for giants (not per-role). */
export const ENEMY_COMBAT = {
  /**
   * Angular half-window (degrees) around the giant's facing direction inside
   * which an incoming blade hit counts as "frontal" for Armored resistance.
   * A hit landing outside this cone (from behind/above) bypasses frontal armor.
   */
  FRONTAL_CONE_DEG: 70,
  /** Nape hitbox radius (px, in local sprite space before scaling). */
  NAPE_RADIUS: 8,
  /** Duration a giant is staggered (movement halted) after a solid hit, ms. */
  STAGGER_MS: 260,
  /** Duration a giant is staggered after a critical nape hit, ms. */
  STAGGER_CRIT_MS: 520,
  /** Death fade/steam animation duration before the entity is destroyed, ms. */
  DEATH_MS: 420,
  /** Thrower projectile speed, px/s (used to compute a lob arc). */
  PROJECTILE_SPEED: 300,
  /** Thrower projectile gravity, px/s^2 (arc drop). */
  PROJECTILE_GRAVITY: 420,
  /** Thrower projectile damage to the wall on impact. */
  PROJECTILE_WALL_DAMAGE: 10,
  /** Thrower projectile damage to the hero on a direct hit. */
  PROJECTILE_HERO_DAMAGE: 12,
} as const;

/**
 * Hero-threat tuning (fix for reported issue 4 - "giants ignore the hero").
 *
 * When the hero strays within {@link THREAT_RADIUS} of a giant, the giant may
 * DIVERT from its ring/citizen target to hunt the hero: it lunges in and, once
 * within {@link MELEE_HERO_RANGE}, its attack is aimed at the hero (routed
 * through GameScene.damageHero, which owns proximity + i-frames). How readily a
 * giant diverts is role-dependent via {@link HERO_AGGRESSION} (a probability
 * per attack-decision plus a divert bias), so each role keeps its identity: the
 * Breaker almost never looks up from the wall, the Sprinter/Aberrant pounce.
 *
 * These are BEHAVIOUR/COMPOSITION numbers, not base stats: they never mutate
 * ENEMY_STATS, they only steer targeting.
 */
export const HERO_THREAT = {
  /** Distance within which a giant will consider diverting to the hero, px. */
  THREAT_RADIUS: 150,
  /** Planar reach at which a diverting melee giant can strike the hero, px. */
  MELEE_HERO_RANGE: 60,
  /**
   * Forward lunge distance of the telegraphed hero-swipe tween, px. Gives the
   * attack a readable wind-up so the player can dodge.
   */
  LUNGE_DISTANCE: 14,
  /** Duration of the lunge tween (out-and-back), ms. */
  LUNGE_MS: 130,
} as const;

/**
 * Per-role hero aggression. `divertChance` is the probability, evaluated when a
 * giant is eligible (hero inside THREAT_RADIUS), that it commits to hunting the
 * hero this decision window rather than the wall. `stickiness` keeps a
 * committed giant locked onto the hero for a short time so it does not flip-flop
 * every frame. Kept in config so the wall-vs-hero balance is tunable centrally.
 */
export interface HeroAggression {
  /** Probability [0..1] of diverting to the hero when eligible. */
  readonly divertChance: number;
  /** How long a hero-hunt commitment persists once taken, ms. */
  readonly stickinessMs: number;
}

export const HERO_AGGRESSION: Record<EnemyRole, HeroAggression> = {
  // Baseline: swipes opportunistically when the hero is adjacent.
  [EnemyRole.Wanderer]: { divertChance: 0.45, stickinessMs: 900 },
  // Pouncer: most likely to break off and lunge at a nearby hero.
  [EnemyRole.Sprinter]: { divertChance: 0.85, stickinessMs: 1100 },
  // Wall-smasher: fixated on the rings, barely notices the hero.
  [EnemyRole.Breaker]: { divertChance: 0.08, stickinessMs: 500 },
  // Erratic: unpredictable pounces at the hero.
  [EnemyRole.Aberrant]: { divertChance: 0.7, stickinessMs: 800 },
  // Armored: defensive, low hero aggression (hero must flank it anyway).
  [EnemyRole.Armored]: { divertChance: 0.25, stickinessMs: 700 },
  // Ranged: lobs at the hero when close but does not chase in melee.
  [EnemyRole.Thrower]: { divertChance: 0.0, stickinessMs: 0 },
} as const;
