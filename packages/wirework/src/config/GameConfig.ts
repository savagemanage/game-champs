/**
 * GameConfig - centralized, config-driven tuning for Wirework.
 *
 * Wirework is an ORIGINAL-world TOP-DOWN wall-defense action game. The map is a
 * concentric double-ring fortification: a citizen core sits at the very center,
 * protected by an inner ring and an outer ring. The player uses an ODM
 * (omni-directional mobility) grapple rig to defend the rings and the citizens
 * from waves of giant humanoids called "Ravagers" that siege inward from every
 * angle of the outer perimeter. All naming, lore, and enemy archetypes are
 * original and role-based; nothing is drawn from any existing IP.
 *
 * Because the view is top-down there is no gravity; movement is planar.
 *
 * Keep balance numbers here so the whole game can be tuned in one place.
 */

/**
 * Logical (design) resolution. The canvas scales to fit while preserving this.
 * 960x540 is a clean 2x of the original 480x270 pixel-art grid, so existing
 * coordinates/scales carry over predictably while text and detail render at
 * roughly double the pixel density (fixing the crushed-text problem) and it
 * integer-scales nicely to common 1080p/1440p displays.
 */
export const CANVAS = {
  WIDTH: 960,
  HEIGHT: 540,
} as const;

/**
 * Physics tuning (arcade). Positive Y is downward. Top-down view: no gravity,
 * all movement is planar and driven directly by entity velocity.
 */
export const PHYSICS = {
  GRAVITY_Y: 0,
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
  /**
   * Blade slash reach forward from the hero centre, world px. Raised from the
   * old 28 (which read as a stubby poke on the 960x540 top-down plane) to a
   * longer, more reachable sweep so closing to strike a giant's nape connects
   * reliably without being absurd. CombatSystem.SLASH_REACH reads this constant
   * so the hit-detection arc grows with it; BLADE_DAMAGE and the nape-crit logic
   * are unchanged.
   */
  BLADE_RANGE: 48,
} as const;

/**
 * Ring / objective tuning. The settlement is defended by a CONCENTRIC DOUBLE
 * ring wall centred on the arena: an OUTER ring the giants reach first and an
 * INNER ring guarding the citizen core at the very center. Each ring is split
 * into breachable arc SEGMENTS with their own HP; a segment that runs out of HP
 * is breached and giants can path inward through the gap. Losing every inner
 * segment (the inner ring falls) is a lose condition, as is losing all
 * citizens. Radii are world px measured from the arena center (see
 * PLAYER_CONFIG ARENA.CENTER_X / CENTER_Y).
 */
export const WALL = {
  /** Outer ring radius from the arena center, world px. */
  OUTER_RADIUS: 360,
  /** Inner ring radius from the arena center, world px (guards the core). */
  INNER_RADIUS: 200,
  /** Number of breachable arc segments per ring. */
  OUTER_SEGMENTS: 24,
  INNER_SEGMENTS: 16,
  /** Per-segment HP for each ring (aggregate integrity is the sum). */
  OUTER_SEGMENT_HP: 60,
  INNER_SEGMENT_HP: 80,
  /** Radial thickness of each ring's rampart band, world px. */
  RING_THICKNESS: 22,
  /** Citizens present at the start of a run (clustered at the center). */
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
