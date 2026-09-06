/**
 * GameConfig - centralized, config-driven tuning for Kingdom Rise.
 *
 * Kingdom Rise is an ORIGINAL-world medieval strategy / idle game. The player
 * grows a small settlement: resource buildings passively generate food, wood,
 * stone, and gold; a central Town Center gates the level cap of every other
 * building; troops are trained in time-based queues; and periodic waves of
 * raiders must be repelled in a light tower-defense-flavored battle. All
 * naming, lore, art, and audio are original and role-based; nothing is drawn
 * from any existing IP.
 *
 * Keep balance numbers here so the whole game can be tuned in one place. Later
 * features (economy, buildings, training, combat, save/load) extend the config
 * modules under src/config/ rather than scattering magic numbers.
 */

/**
 * Logical (design) resolution. The canvas scales to fit while preserving this.
 * 960x540 integer-scales nicely to common 1080p/1440p displays and gives the
 * town/battle HUD enough room for panels and resource readouts.
 */
export const CANVAS = {
  WIDTH: 960,
  HEIGHT: 540,
} as const;

/**
 * Physics tuning (arcade). This is a top-down / management view, so there is no
 * gravity; any in-battle movement is planar and driven directly by velocity.
 */
export const PHYSICS = {
  GRAVITY_Y: 0,
} as const;

/**
 * Cohesive medieval pixel-art palette. Values are 0xRRGGBB integers for Phaser
 * tinting and graphics, plus CSS strings where the DOM / text needs them.
 * Warm parchment + stone + timber tones with metallic resource accents.
 */
export const PALETTE = {
  // Backgrounds / terrain.
  BG_SKY: 0x2a3b52,
  BG_SKY_CSS: '#2a3b52',
  BG_DUSK: 0x54415a,
  GRASS: 0x4f7a3a,
  GRASS_DARK: 0x386028,
  DIRT: 0x6b4f30,
  DIRT_DARK: 0x4a3620,
  STONE: 0x8a8378,
  STONE_DARK: 0x5c564d,
  STONE_LIGHT: 0xb4ac9c,
  WOOD: 0x8a5a34,
  WOOD_DARK: 0x5f3d22,

  // Resource accents.
  FOOD: 0xe0b04a,
  FOOD_CSS: '#e0b04a',
  WOOD_RES: 0x9c6b3c,
  WOOD_RES_CSS: '#9c6b3c',
  STONE_RES: 0xb0b0b8,
  STONE_RES_CSS: '#b0b0b8',
  GOLD: 0xf4cf4a,
  GOLD_CSS: '#f4cf4a',

  // UI / text.
  PANEL: 0x2a2418,
  PANEL_CSS: '#2a2418',
  ACCENT: 0xe0b04a,
  ACCENT_CSS: '#e0b04a',
  TEXT: 0xf4ecd8,
  TEXT_CSS: '#f4ecd8',
  MUTED_CSS: '#b9ad93',
  DANGER: 0xc6503c,
  DANGER_CSS: '#c6503c',
  SUCCESS: 0x6fae4f,
  SUCCESS_CSS: '#6fae4f',

  // Combat.
  BANNER_FRIENDLY: 0x5c86c6,
  BANNER_ENEMY: 0xc6503c,
} as const;

/**
 * Idle economy tuning. Resources accrue continuously from building output; the
 * loop ticks on a fixed cadence and offline gains are reconciled on load
 * (implemented in the economy / save features). Values here are the shared
 * baseline the later systems read.
 */
export const ECONOMY = {
  /** Simulation tick length, milliseconds. Output is scaled per tick. */
  TICK_MS: 1000,
  /** Maximum offline time credited on load, seconds (8 hours). */
  MAX_OFFLINE_SECONDS: 8 * 60 * 60,
  /** Fraction of full production rate granted for offline time (idle games cap this). */
  OFFLINE_EFFICIENCY: 0.5,
  /**
   * Starting stockpile for a fresh save. Sized so a new player can reach the
   * early "Town Center Lv.2 -> Barracks -> train first troops" loop within a
   * couple of minutes without hitting a silent resource wall.
   */
  START: { food: 300, wood: 400, stone: 250, gold: 50 },
} as const;

/**
 * Building progression tuning. Every building's upgrade cost scales
 * geometrically with its level, and non-Town-Center buildings may not exceed
 * the current Town Center level (the core gating mechanic). Per-building base
 * costs / outputs live in BuildingConfig.ts (added by the buildings feature);
 * these are the shared curve parameters.
 */
export const BUILDINGS = {
  /** Geometric cost growth per level (cost = base * GROWTH^(level-1)). */
  COST_GROWTH: 1.6,
  /** Output growth per level for producers. */
  OUTPUT_GROWTH: 1.35,
  /** Base seconds an upgrade takes at level 1 (scales with level). */
  BASE_BUILD_SECONDS: 4,
  /** Highest level any building can reach. */
  MAX_LEVEL: 20,
} as const;

/**
 * Troop training tuning. Troops are queued at the Barracks and complete after a
 * per-type training time; per-troop stats/costs live in TroopConfig.ts. These
 * are the shared queue parameters.
 */
export const TRAINING = {
  /** Maximum number of batches that can be queued at once. */
  MAX_QUEUE: 6,
  /** Maximum troops in a single batch. */
  MAX_BATCH: 20,
} as const;

/**
 * Wave / combat tuning. Raider waves grow in size and difficulty via
 * composition (never by mutating per-unit stats). Per-wave composition lives in
 * WaveConfig.ts (added by the combat feature).
 */
export const COMBAT = {
  /** Seconds of preparation before the first wave of a battle. */
  PREP_SECONDS: 8,
  /** Lane length in world px that attackers traverse toward the gate. */
  LANE_LENGTH: 820,
} as const;

/**
 * The four resource kinds, as an ordered tuple so UI and iteration share one
 * canonical order. The ResourceKind union type is derived in src/types.
 */
export const RESOURCE_ORDER = ['food', 'wood', 'stone', 'gold'] as const;

/** Scene keys used across the game. Centralized to avoid magic strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  Town: 'TownScene',
  Battle: 'BattleScene',
  Settings: 'SettingsScene',
  Pause: 'PauseScene',
  GameOver: 'GameOverScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
