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
