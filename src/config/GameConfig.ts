/**
 * GameConfig - centralized, config-driven tuning for Frosthold: Last Ember.
 *
 * Frosthold: Last Ember (서리성채: 마지막 불씨) is an ORIGINAL frozen-survival
 * city-builder / idle game, merely INSPIRED BY the genre - no existing IP. The
 * world is locked in an endless winter and the settlement survives around a
 * central Furnace whose Ember must never go out: resource buildings passively
 * generate food, wood, coal, and iron; the Furnace gates the level cap of every
 * other building; troops are trained in time-based queues; and periodic waves
 * of the Frozen Horde must be repelled in a light tower-defense-flavored
 * battle. All naming, lore, art, and audio are original and role-based.
 *
 * Keep balance numbers here so the whole game can be tuned in one place. Later
 * features (economy, buildings, training, combat, save/load, warmth) extend the
 * config modules under src/config/ rather than scattering magic numbers.
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
 * Cohesive frozen-survival pixel-art palette. Values are 0xRRGGBB integers for
 * Phaser tinting and graphics, plus CSS strings where the DOM / text needs them.
 * Cold blues / whites / steel for the frozen terrain + UI, warmed by the EMBER
 * orange accent radiating from the Furnace. Palette KEY NAMES are kept stable
 * to minimize churn even though the theme is now icy; the extra ICE/FROST/EMBER
 * keys give the frozen scenes room without renaming existing consumers.
 */
export const PALETTE = {
  // Backgrounds / terrain (frozen dusk sky, snow, ice, steel).
  BG_SKY: 0x1d2b3f,
  BG_SKY_CSS: '#1d2b3f',
  BG_DUSK: 0x2f3d5c,
  GRASS: 0xbcd2e4, // snowfield tone (kept key name to avoid churn)
  GRASS_DARK: 0x8fa9c2, // shadowed snow
  DIRT: 0x4a5568, // frozen ground / slate
  DIRT_DARK: 0x333d4d,
  STONE: 0x7f8a99, // frost-worn stone / steel
  STONE_DARK: 0x4c5563,
  STONE_LIGHT: 0xc3ced9,
  WOOD: 0x6a5138, // weathered timber against the snow
  WOOD_DARK: 0x453320,

  // Resource accents (rations, timber, coal, iron).
  FOOD: 0x8fd0c4,
  FOOD_CSS: '#8fd0c4',
  WOOD_RES: 0x9c6b3c,
  WOOD_RES_CSS: '#9c6b3c',
  STONE_RES: 0x4a4f57, // coal: dark charcoal
  STONE_RES_CSS: '#4a4f57',
  GOLD: 0xb9c4cf, // iron: cold steel grey (kept key name to avoid churn)
  GOLD_CSS: '#b9c4cf',

  // Signature frozen-survival tones.
  EMBER: 0xff7a3c,
  EMBER_CSS: '#ff7a3c',
  ICE: 0x9fd8ec,
  ICE_CSS: '#9fd8ec',
  FROST: 0xe6f2fb,
  FROST_CSS: '#e6f2fb',

  // UI / text.
  PANEL: 0x18202e,
  PANEL_CSS: '#18202e',
  ACCENT: 0xff7a3c, // warm ember glow against the cold UI
  ACCENT_CSS: '#ff7a3c',
  TEXT: 0xeef4fb,
  TEXT_CSS: '#eef4fb',
  MUTED_CSS: '#93a4b8',
  DANGER: 0x5fb6d6, // biting frost-blue danger
  DANGER_CSS: '#5fb6d6',
  SUCCESS: 0x7ad0a0,
  SUCCESS_CSS: '#7ad0a0',

  // Combat.
  BANNER_FRIENDLY: 0xff7a3c, // the settlement fights under the ember banner
  BANNER_ENEMY: 0x5fb6d6, // the Frozen Horde in cold blue
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
  /** Starting stockpile for a fresh save. */
  START: { food: 200, wood: 200, coal: 100, iron: 50 },
} as const;

/**
 * Building progression tuning. Every building's upgrade cost scales
 * geometrically with its level, and non-Furnace buildings may not exceed the
 * current Furnace level (the core gating mechanic). Per-building base
 * costs / outputs live in BuildingConfig.ts (added by the buildings feature);
 * these are the shared curve parameters.
 */
export const BUILDINGS = {
  /** Geometric cost growth per level (cost = base * GROWTH^(level-1)). */
  COST_GROWTH: 1.6,
  /** Output growth per level for producers. */
  OUTPUT_GROWTH: 1.35,
  /** Base seconds an upgrade takes at level 1 (scales with level). */
  BASE_BUILD_SECONDS: 5,
  /** Highest level any building can reach. */
  MAX_LEVEL: 20,
} as const;

/**
 * Troop training tuning. Troops are queued at the War Camp and complete after a
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
 * Wave / combat tuning. Frozen Horde waves grow in size and difficulty via
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
 * WARMTH - the signature frozen-survival mechanic. The Furnace burns fuel
 * (wood + coal) every tick to hold back a lethal cold, sustaining a Warmth
 * level. While fuel is available warmth climbs toward its max; when the
 * stockpile runs dry warmth decays and idle production is throttled toward a
 * floor. A higher Furnace level raises max warmth AND makes fuel burn more
 * efficiently, so investing in the Ember pays off twice.
 *
 * These are the shared tuning knobs; the pure WarmthSystem (src/systems) reads
 * them. Numbers are balanced so a base with steady wood/coal income stays warm
 * and at full output, while neglecting fuel visibly (but not fatally) bites:
 * production sinks toward WARMTH_PRODUCTION_FLOOR rather than stopping.
 */
export const WARMTH = {
  /** Baseline maximum warmth at Furnace level 1. */
  MAX_WARMTH: 100,
  /** Extra maximum warmth granted per Furnace level above 1. */
  MAX_WARMTH_PER_LEVEL: 20,
  /**
   * Base fuel burned per second at Furnace level 1 to sustain warmth, split
   * across wood and coal. Higher Furnace levels burn LESS via
   * FUEL_EFFICIENCY_PER_LEVEL (the Ember gets more out of every log).
   */
  FUEL_PER_SECOND: { wood: 0.6, coal: 0.4 },
  /**
   * Fractional reduction in fuel burn per Furnace level above 1 (e.g. 0.05 =
   * 5% cheaper per level). Clamped so burn never drops below FUEL_MIN_FACTOR of
   * the base, keeping fuel always meaningful.
   */
  FUEL_EFFICIENCY_PER_LEVEL: 0.05,
  /** Lower bound on the fuel-burn multiplier from efficiency (40% of base). */
  FUEL_MIN_FACTOR: 0.4,
  /** Warmth points gained per second while the Furnace is fueled. */
  WARMTH_GAIN_PER_SEC: 8,
  /** Warmth points lost per second while unfueled / cold. */
  WARMTH_DECAY_PER_SEC: 5,
  /**
   * Production-penalty curve: at full warmth (ratio 1) production runs at 1.0x;
   * at zero warmth it is throttled to WARMTH_PRODUCTION_FLOOR. In between the
   * multiplier scales LINEARLY between the floor and 1.0 with the warmth ratio.
   */
  WARMTH_PRODUCTION_FLOOR: 0.25,
} as const;

/**
 * Pure helper: the idle-production multiplier for a given warmth ratio
 * (current warmth / max warmth, expected in [0,1] but clamped defensively).
 * Linearly interpolates from WARMTH.WARMTH_PRODUCTION_FLOOR at ratio 0 to 1.0
 * at ratio 1, so callers (WarmthSystem, tests, UI) share one curve definition.
 */
export function warmthProductionMultiplier(warmthRatio: number): number {
  const ratio = Math.min(1, Math.max(0, warmthRatio));
  return WARMTH.WARMTH_PRODUCTION_FLOOR + (1 - WARMTH.WARMTH_PRODUCTION_FLOOR) * ratio;
}

/**
 * The four resource kinds, as an ordered tuple so UI and iteration share one
 * canonical order. The ResourceKind union type is derived in src/types.
 */
export const RESOURCE_ORDER = ['food', 'wood', 'coal', 'iron'] as const;

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
