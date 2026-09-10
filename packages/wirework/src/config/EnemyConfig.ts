import { EnemyRole } from './GameConfig';

export interface EnemyStats {
  readonly role: EnemyRole;
  readonly name: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly attack: number;
  readonly nodeCritMultiplier: number;
  readonly frontalResist: number;
  readonly attackCooldownMs: number;
  readonly attackRange: number;
  readonly scoreValue: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  readonly nodeDistance: number;
}

export const ENEMY_STATS: Record<EnemyRole, EnemyStats> = {
  [EnemyRole.Surveyor]: {
    role: EnemyRole.Surveyor, name: 'Surveyor', maxHp: 90, moveSpeed: 42, attack: 8,
    nodeCritMultiplier: 3, frontalResist: 0, attackCooldownMs: 1100, attackRange: 46,
    scoreValue: 100, bodyWidth: 32, bodyHeight: 48, nodeDistance: 18,
  },
  [EnemyRole.Skitter]: {
    role: EnemyRole.Skitter, name: 'Skitter', maxHp: 50, moveSpeed: 120, attack: 6,
    nodeCritMultiplier: 3.5, frontalResist: 0, attackCooldownMs: 850, attackRange: 40,
    scoreValue: 120, bodyWidth: 28, bodyHeight: 28, nodeDistance: 16,
  },
  [EnemyRole.Rammer]: {
    role: EnemyRole.Rammer, name: 'Rammer', maxHp: 260, moveSpeed: 26, attack: 26,
    nodeCritMultiplier: 2.4, frontalResist: 0, attackCooldownMs: 1600, attackRange: 58,
    scoreValue: 260, bodyWidth: 58, bodyHeight: 64, nodeDistance: 32,
  },
  [EnemyRole.Fluxborn]: {
    role: EnemyRole.Fluxborn, name: 'Fluxborn', maxHp: 70, moveSpeed: 88, attack: 10,
    nodeCritMultiplier: 3.5, frontalResist: 0, attackCooldownMs: 700, attackRange: 42,
    scoreValue: 160, bodyWidth: 30, bodyHeight: 44, nodeDistance: 17,
  },
  [EnemyRole.Bastion]: {
    role: EnemyRole.Bastion, name: 'Bastion', maxHp: 150, moveSpeed: 40, attack: 14,
    nodeCritMultiplier: 3, frontalResist: 0.9, attackCooldownMs: 1300, attackRange: 48,
    scoreValue: 220, bodyWidth: 48, bodyHeight: 60, nodeDistance: 27,
  },
  [EnemyRole.Bombard]: {
    role: EnemyRole.Bombard, name: 'Bombard', maxHp: 80, moveSpeed: 34, attack: 12,
    nodeCritMultiplier: 3, frontalResist: 0, attackCooldownMs: 2200, attackRange: 520,
    scoreValue: 180, bodyWidth: 34, bodyHeight: 44, nodeDistance: 19,
  },
};

export const ENEMY_COMBAT = {
  FRONTAL_CONE_DEG: 70,
  NODE_RADIUS: 8,
  STAGGER_MS: 260,
  STAGGER_CRIT_MS: 520,
  DEATH_MS: 420,
  ATTACK_WINDUP_MS: 130,
  ATTACK_CUE_MIN_MS: 100,
  PROJECTILE_SPEED: 300,
  PROJECTILE_WALL_DAMAGE: 10,
  PROJECTILE_HERO_DAMAGE: 12,
  PROJECTILE_LIFETIME_MS: 6000,
} as const;

export const HERO_THREAT = {
  THREAT_RADIUS: 150,
  MELEE_HERO_RANGE: 60,
  DECISION_CADENCE_MS: 240,
  LUNGE_DISTANCE: 14,
  LUNGE_MS: 130,
} as const;

export const ROLE_BEHAVIOUR = {
  SKITTER_CHARGE_RANGE: 360,
  SKITTER_CHARGE_MULTIPLIER: 1.6,
  BOMBARD_STANDOFF: 420,
  BOMBARD_HERO_RANGE: 540,
  FLUX_TWITCH_MIN_MS: 300,
  FLUX_TWITCH_SPAN_MS: 500,
} as const;

export interface HeroAggression {
  readonly divertChance: number;
  readonly stickinessMs: number;
}

export const HERO_AGGRESSION: Record<EnemyRole, HeroAggression> = {
  [EnemyRole.Surveyor]: { divertChance: 0.45, stickinessMs: 900 },
  [EnemyRole.Skitter]: { divertChance: 0.85, stickinessMs: 1100 },
  [EnemyRole.Rammer]: { divertChance: 0.08, stickinessMs: 500 },
  [EnemyRole.Fluxborn]: { divertChance: 0.7, stickinessMs: 800 },
  [EnemyRole.Bastion]: { divertChance: 0.25, stickinessMs: 700 },
  [EnemyRole.Bombard]: { divertChance: 0, stickinessMs: 0 },
} as const;

export const THEORETICAL_SCORE = { relaxed: 10_120, standard: 10_120, brutal: 11_720 } as const;
