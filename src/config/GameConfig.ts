/**
 * GameConfig - centralized, config-driven tuning for LAST SQUAD (라스트 스쿼드).
 *
 * LAST SQUAD is an ORIGINAL, modern military-survival lane gate-runner. A small
 * squad of soldiers auto-runs forward down two lanes; the player slides the
 * squad left/right between lanes; rows of math "gates" (x2, +10, -5, /2) grow
 * or shrink the crowd; periodic enemy clusters are auto-shot by the squad; and
 * a boss waits at the end of the run. Between runs the player spends earned
 * coins on meta-upgrades. All naming, lore, art, and audio are original and
 * role-based; nothing is drawn from any existing IP or trademark.
 *
 * Keep balance numbers here so the whole game can be tuned in one place. Later
 * features (scenes, entities, UI) read this config rather than scattering magic
 * numbers. Everything in this module is Phaser-free `as const` data.
 */

/**
 * Logical (design) resolution. Portrait, phone-friendly runner layout; the
 * canvas scales to fit while preserving this aspect. 540x960 integer-scales
 * cleanly and gives the two lanes plus a top HUD comfortable room.
 */
export const CANVAS = {
  WIDTH: 540,
  HEIGHT: 960,
} as const;

/**
 * Physics tuning (arcade). This is a top-down-ish forward-runner view, so there
 * is no gravity; motion is planar and driven directly by velocity.
 */
export const PHYSICS = {
  GRAVITY_Y: 0,
} as const;

/**
 * Original modern / military-survival palette. Values are 0xRRGGBB integers for
 * Phaser tinting and graphics, plus `*_CSS` strings where the DOM / text needs
 * them. Cool steel + asphalt with a hazard-amber accent and squad-teal.
 */
export const PALETTE = {
  // Backgrounds / terrain.
  BG_SKY: 0x11151c,
  BG_SKY_CSS: '#11151c',
  BG_HORIZON: 0x1c2733,
  BG_HORIZON_CSS: '#1c2733',
  ROAD: 0x2b323c,
  ROAD_CSS: '#2b323c',
  ROAD_DARK: 0x1e242c,
  ROAD_DARK_CSS: '#1e242c',
  LANE_LINE: 0x4a5666,
  LANE_LINE_CSS: '#4a5666',

  // Squad / friendly accents.
  SQUAD: 0x3fd6c2,
  SQUAD_CSS: '#3fd6c2',
  SQUAD_DARK: 0x1f9b8c,
  SQUAD_DARK_CSS: '#1f9b8c',
  MUZZLE: 0xffe08a,
  MUZZLE_CSS: '#ffe08a',

  // Enemy accents.
  ENEMY: 0xd8564b,
  ENEMY_CSS: '#d8564b',
  ENEMY_DARK: 0x8f322b,
  ENEMY_DARK_CSS: '#8f322b',
  BOSS: 0xb148d8,
  BOSS_CSS: '#b148d8',

  // Gates: good (buff) vs bad (nerf) tinting.
  GATE_GOOD: 0x5fd36a,
  GATE_GOOD_CSS: '#5fd36a',
  GATE_BAD: 0xd85466,
  GATE_BAD_CSS: '#d85466',

  // UI / text.
  PANEL: 0x161b23,
  PANEL_CSS: '#161b23',
  ACCENT: 0xffb347,
  ACCENT_CSS: '#ffb347',
  TEXT: 0xf2f5f8,
  TEXT_CSS: '#f2f5f8',
  MUTED_CSS: '#9aa7b4',
  DANGER: 0xd8564b,
  DANGER_CSS: '#d8564b',
  SUCCESS: 0x5fd36a,
  SUCCESS_CSS: '#5fd36a',
  COIN: 0xffcf4a,
  COIN_CSS: '#ffcf4a',
} as const;

/**
 * Run / track tuning. The squad runs forward along a fixed distance; rows of
 * gates and enemy clusters are placed along that distance. Difficulty ramps
 * with distance travelled.
 */
export const RUN = {
  /** Number of lanes the squad can occupy. */
  LANE_COUNT: 2,
  /** Horizontal centre (fraction of canvas width) of lane 0 and lane 1. */
  LANE_CENTERS: [0.3, 0.7] as const,
  /** World distance units in a full run before the boss. */
  RUN_DISTANCE: 2000,
  /** Forward scroll speed, distance units per second. */
  SCROLL_SPEED: 120,
  /** Distance travelled before difficulty is considered "max ramped". */
  DIFFICULTY_RAMP_DISTANCE: 2000,
  /** Difficulty multiplier range across a run [start, end]. */
  DIFFICULTY_RANGE: [1, 3] as const,
} as const;

/**
 * Squad tuning. The squad is a crowd of little soldiers; only a capped number
 * are individually rendered, the rest are implied by the count. Firepower is a
 * function of the (rendered-capped) soldier count.
 */
export const SQUAD = {
  /** Soldiers a fresh run starts with (before meta-upgrades). */
  START_SIZE: 5,
  /** Hard floor; hitting 0 ends the run. */
  MIN_SIZE: 0,
  /** Hard ceiling on the logical squad count. */
  MAX_SIZE: 9999,
  /** Maximum soldiers individually drawn (formation cap). */
  MAX_RENDERED: 60,
  /** Base shots-per-second per soldier (before meta-upgrades). */
  FIRE_RATE: 2,
  /** Base damage per shot per soldier (before meta-upgrades). */
  DAMAGE: 1,
} as const;

/**
 * Gate tuning. Each gate row presents one gate per lane. A gate applies a math
 * operation to the squad size. Value ranges are per-operation; the pair
 * generator guarantees at least one non-catastrophic choice per row.
 */
export const GATES = {
  /** Distance units between consecutive gate rows. */
  ROW_SPACING: 260,
  /** Distance before the first gate row. */
  FIRST_ROW_AT: 200,
  /** Additive gate value range [min, max] (inclusive). */
  ADD_RANGE: [5, 25] as const,
  /** Subtractive gate value range [min, max] (inclusive). */
  SUB_RANGE: [3, 15] as const,
  /** Multiplicative gate factor range [min, max] (inclusive). */
  MUL_RANGE: [2, 3] as const,
  /** Divisive gate divisor range [min, max] (inclusive). */
  DIV_RANGE: [2, 3] as const,
} as const;

/**
 * Enemy / obstacle tuning. Enemy clusters have HP that the squad's firepower
 * whittles down while passing; leftover cluster HP costs squad members. A boss
 * caps the run.
 */
export const ENEMIES = {
  /** Distance units between enemy clusters. */
  CLUSTER_SPACING: 520,
  /** Distance before the first enemy cluster. */
  FIRST_CLUSTER_AT: 420,
  /** Base cluster HP at difficulty 1. */
  CLUSTER_BASE_HP: 40,
  /** Cluster HP added per difficulty unit above 1. */
  CLUSTER_HP_PER_DIFFICULTY: 60,
  /** Squad members lost per unit of unblocked (leftover) cluster HP. */
  DAMAGE_PER_LEFTOVER_HP: 0.25,
  /** Boss HP (fixed encounter at run end). */
  BOSS_HP: 1200,
  /** Squad members lost per unit of unblocked boss HP if the boss survives. */
  BOSS_DAMAGE_PER_HP: 0.05,
  /** Seconds the squad shoots the boss before resolution. */
  BOSS_DURATION: 6,
} as const;

/**
 * Meta-progression tuning. Coins earned across runs buy permanent upgrades with
 * a geometric cost curve. Each upgrade level nudges a derived stat.
 */
export const META = {
  /** Coins earned per surviving squad member at run end. */
  COINS_PER_SURVIVOR: 2,
  /** Coins earned per 100 distance units travelled. */
  COINS_PER_DISTANCE: 0.05,
  /** Bonus coins for reaching / beating the boss (winning the run). */
  COINS_WIN_BONUS: 100,
  /**
   * Upgrade definitions. `base` is the level-1 cost; cost of level L is
   * `round(base * GROWTH^(L-1))`. `perLevel` is the additive stat gain per
   * purchased level applied on top of the base config value. `max` is the
   * highest purchasable level.
   */
  GROWTH: 1.55,
  UPGRADES: {
    /** Bigger starting squad. */
    start_size: { base: 40, perLevel: 2, max: 20 },
    /** More damage per shot. */
    damage: { base: 60, perLevel: 0.5, max: 20 },
    /** Faster fire rate. */
    fire_rate: { base: 60, perLevel: 0.35, max: 20 },
    /** Coin multiplier (perLevel is added to a 1.0 base multiplier). */
    coin_bonus: { base: 80, perLevel: 0.1, max: 15 },
  },
} as const;

/**
 * Expanded single-player game state tuning. FEAT-001 only needs the shape of a
 * fresh save (empty-but-valid sub-states); later features flesh out each
 * system's real tuning. Kept here so the fresh-default builder never hardcodes
 * magic numbers. The squad formation is a 5-slot layout: 2 front + 3 back.
 */
export const GAME_STATE = {
  /** Squad-formation slot counts (front row + back row). */
  FORMATION: {
    /** Front-row slots. */
    FRONT_SLOTS: 2,
    /** Back-row slots. */
    BACK_SLOTS: 3,
  },
  /** Season progression starting point (0 = no season started yet). */
  SEASON: {
    /** Current season id for a fresh game. */
    START_SEASON: 0,
    /** Season progress points for a fresh game. */
    START_PROGRESS: 0,
  },
} as const;

/**
 * Ordered tuple of meta-upgrade kinds so UI and iteration share one canonical
 * order. The MetaUpgradeKind union type is derived in src/types.
 */
export const UPGRADE_ORDER = ['start_size', 'damage', 'fire_rate', 'coin_bonus'] as const;

/**
 * Ordered tuple of gate operation kinds. The GateOp union type is derived in
 * src/types.
 */
export const GATE_OPS = ['add', 'sub', 'mul', 'div'] as const;

/** Scene keys used across the game. Centralized to avoid magic strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  Run: 'RunScene',
  Results: 'ResultsScene',
  Upgrade: 'UpgradeScene',
  Settings: 'SettingsScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
