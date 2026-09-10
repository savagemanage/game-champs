/** Authoritative product-wide constants for Wirework. */
export const CANVAS = { WIDTH: 960, HEIGHT: 540, MAX_BACKBUFFER_PIXELS: 4_000_000 } as const;
export const PHYSICS = { GRAVITY_Y: 0, FIXED_FPS: 60, FIXED_STEP_MS: 1000 / 60 } as const;

export const PALETTE = {
  BG_SKY: 0x132333,
  BG_SKY_CSS: '#132333',
  BG_FAR: 0x263f57,
  BG_NEAR: 0x365a72,
  GROUND: 0x252a2d,
  WALL: 0x697078,
  WALL_DARK: 0x3e464f,
  PLAYER: 0x78ddff,
  CITIZEN: 0xffd9a0,
  ENEMY: 0xb87a48,
  ENEMY_WEAKPOINT: 0x59e6ff,
  ACCENT: 0xffcf5c,
  TEXT: 0xf2f5f7,
  TEXT_CSS: '#f2f5f7',
  DANGER_CSS: '#ff725c',
} as const;

export const WALL = {
  OUTER_RADIUS: 360,
  INNER_RADIUS: 200,
  OUTER_SEGMENTS: 24,
  INNER_SEGMENTS: 16,
  OUTER_SEGMENT_HP: 60,
  INNER_SEGMENT_HP: 80,
  RING_THICKNESS: 22,
  GRAPPLE_AABB_SIZE: 44,
  CRACKED_RATIO: 0.5,
  SEVERE_CRACK_RATIO: 0.25,
  START_CITIZENS: 12,
} as const;

export const CITIZEN = {
  HOME_RADIUS: 170,
  WANDER_SPEED: 22,
  FLEE_SPEED: 70,
  FLEE_RADIUS: 130,
  ATTACK_RANGE: 60,
  DECISION_MIN_MS: 800,
  DECISION_SPAN_MS: 1400,
} as const;

export const RUN = {
  GAME_OVER_DELAY_MS: 500,
  OUTCOME_PRIORITY: {
    hero_dead: 4,
    citizens_lost: 3,
    inner_breached: 2,
    abandoned: 1,
    victory: 0,
  },
} as const;

/** Original autonomous siege-machine roles. */
export const enum EnemyRole {
  Surveyor = 'surveyor',
  Skitter = 'skitter',
  Rammer = 'rammer',
  Fluxborn = 'fluxborn',
  Bastion = 'bastion',
  Bombard = 'bombard',
}

export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  Settings: 'SettingsScene',
  Game: 'GameScene',
  Pause: 'PauseScene',
  GameOver: 'GameOverScene',
} as const;
