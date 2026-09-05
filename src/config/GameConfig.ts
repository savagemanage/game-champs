/**
 * GameConfig - centralized, config-driven tuning for Wirework.
 *
 * Wirework is an ORIGINAL-world side-view wall-defense action game. The player
 * uses an ODM (omni-directional mobility) grapple rig to defend citizens from
 * waves of giant humanoids called "Ravagers". All naming, lore, and enemy
 * archetypes are original and role-based; nothing is drawn from any existing IP.
 *
 * Keep balance numbers here so the whole game can be tuned in one place.
 */

/** Logical (design) resolution. The canvas scales to fit while preserving this. */
export const CANVAS = {
  WIDTH: 480,
  HEIGHT: 270,
} as const;

/** Physics tuning (arcade). Positive Y is downward. */
export const PHYSICS = {
  GRAVITY_Y: 900,
} as const;

/**
 * Cohesive pixel-art palette. Values are 0xRRGGBB integers for Phaser tinting
 * and graphics, plus CSS strings where the DOM/text needs them.
 */
export const PALETTE = {
  BG_SKY: 0x1b2b3a,
  BG_SKY_CSS: '#1b2b3a',
  BG_FAR: 0x2c4257,
  BG_NEAR: 0x3a5670,
  GROUND: 0x2a2118,
  WALL: 0x6b6157,
  WALL_DARK: 0x4a423a,
  PLAYER: 0x8fd3ff,
  CITIZEN: 0xffd9a0,
  ENEMY: 0xc46a5a,
  ENEMY_WEAKPOINT: 0xff5a4d,
  ACCENT: 0xffcf5c,
  TEXT: 0xf2ede4,
  TEXT_CSS: '#f2ede4',
  DANGER_CSS: '#ff5a4d',
} as const;

/** Player / ODM grapple tuning. */
export const PLAYER = {
  MAX_HP: 100,
  MOVE_SPEED: 180,
  JUMP_VELOCITY: 420,
  GRAPPLE_RANGE: 260,
  GRAPPLE_PULL_ACCEL: 1200,
  GRAPPLE_MAX_LENGTH: 320,
  BLADE_DAMAGE: 34,
  BLADE_RANGE: 28,
} as const;

/** Wall / objective tuning. Citizens live behind the wall the player defends. */
export const WALL = {
  MAX_INTEGRITY: 100,
  START_CITIZENS: 12,
} as const;

/**
 * Enemy archetype roles. These are ORIGINAL, role-based enemy types (no IP
 * names). Each role describes distinct behaviour and stats so waves feel varied.
 */
export const enum EnemyRole {
  /** Small, quick swarmer. Rushes the wall in numbers. */
  Skitterer = 'skitterer',
  /** Standard mid-size bruiser. Balanced HP and speed. */
  Bruiser = 'bruiser',
  /** Tall, slow, high-HP wall-breaker. Heavy nape armor. */
  Colossus = 'colossus',
  /** Erratic sprinter with unpredictable movement. */
  Berserker = 'berserker',
  /** Lean climber that scales the wall to reach citizens directly. */
  Climber = 'climber',
}

/** Per-role tuning. The nape/weak-point is the only reliably lethal target. */
export interface EnemyArchetype {
  readonly role: EnemyRole;
  /** Display name shown in HUD / codex (original naming). */
  readonly name: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Body height in logical pixels; drives sprite scale and reach. */
  readonly height: number;
  /** Contact damage dealt to the wall per hit. */
  readonly wallDamage: number;
  /** Damage multiplier applied when the weak-point (nape) is struck. */
  readonly weakpointMultiplier: number;
  /** Relative spawn weight used by the wave composer. */
  readonly spawnWeight: number;
}

export const ENEMY_ARCHETYPES: Record<EnemyRole, EnemyArchetype> = {
  [EnemyRole.Skitterer]: {
    role: EnemyRole.Skitterer,
    name: 'Skitterer',
    maxHp: 40,
    moveSpeed: 120,
    height: 22,
    wallDamage: 4,
    weakpointMultiplier: 3,
    spawnWeight: 5,
  },
  [EnemyRole.Bruiser]: {
    role: EnemyRole.Bruiser,
    name: 'Bruiser',
    maxHp: 90,
    moveSpeed: 70,
    height: 40,
    wallDamage: 10,
    weakpointMultiplier: 3,
    spawnWeight: 4,
  },
  [EnemyRole.Colossus]: {
    role: EnemyRole.Colossus,
    name: 'Colossus',
    maxHp: 220,
    moveSpeed: 34,
    height: 64,
    wallDamage: 24,
    weakpointMultiplier: 2.2,
    spawnWeight: 1,
  },
  [EnemyRole.Berserker]: {
    role: EnemyRole.Berserker,
    name: 'Berserker',
    maxHp: 70,
    moveSpeed: 150,
    height: 34,
    wallDamage: 8,
    weakpointMultiplier: 3.5,
    spawnWeight: 2,
  },
  [EnemyRole.Climber]: {
    role: EnemyRole.Climber,
    name: 'Climber',
    maxHp: 55,
    moveSpeed: 95,
    height: 30,
    wallDamage: 6,
    weakpointMultiplier: 3,
    spawnWeight: 2,
  },
};

/** Wave / spawner tuning. */
export const WAVES = {
  START_DELAY_MS: 2000,
  SPAWN_INTERVAL_MS: 1400,
  BASE_ENEMIES_PER_WAVE: 6,
  ENEMIES_PER_WAVE_GROWTH: 2,
} as const;

/** Scene keys used across the game. Centralized to avoid magic strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  Settings: 'SettingsScene',
  Game: 'GameScene',
  GameOver: 'GameOverScene',
} as const;
