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
 * Enemy giant roles. These are the SIX authoritative, ORIGINAL, role-based
 * giant types (no IP names). Values are lowercased role strings that key the
 * FEAT-002 sprite roster (see AssetKeys.ENEMY_TEXTURE_BY_ROLE) and the
 * per-type fixed base stats in src/config/EnemyConfig.ts.
 *
 * Behaviour and tuning live in EnemyConfig.ts + the per-role subclasses under
 * src/entities/enemies/. Base stats are FIXED at design time; difficulty rises
 * only through wave composition (see WaveConfig.ts), never by mutating stats.
 */
export const enum EnemyRole {
  /** Standard size/speed; basic pathing to the wall/citizens. */
  Wanderer = 'wanderer',
  /** Small, fast, quadrupedal charge; reaches the wall quickly. */
  Sprinter = 'sprinter',
  /** Huge, slow, high HP; smashes the wall. */
  Breaker = 'breaker',
  /** Erratic/unpredictable movement; ignores normal pathing. */
  Aberrant = 'aberrant',
  /** Armored front, only weak points exposed; tanky from the front. */
  Armored = 'armored',
  /** Ranged; lobs debris at the wall/hero. */
  Thrower = 'thrower',
}

/** Scene keys used across the game. Centralized to avoid magic strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  Settings: 'SettingsScene',
  Game: 'GameScene',
  Pause: 'PauseScene',
  GameOver: 'GameOverScene',
} as const;
