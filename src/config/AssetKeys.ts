/**
 * AssetKeys - centralized, typed registry of every runtime asset for LAST SQUAD.
 *
 * The rest of the codebase references these keys (and their frame configs)
 * instead of raw strings, so a rename is a single edit here and TypeScript
 * catches typos. All art/audio is ORIGINAL to this project (see
 * assets/CREDITS.md); files live under public/assets/ and are produced by the
 * generators in tools/ (gen_sprites.py, gen_audio.py). Nothing is drawn from
 * any existing IP or trademark.
 *
 * NOTE on paths: files in public/ are served at the site root, which is
 * import.meta.env.BASE_URL ('/game-lastwar/' in production, '/' in dev). Always
 * build load URLs with assetPath() so they resolve under the base path.
 *
 * FRAME SIZES BELOW MUST MATCH tools/gen_sprites.py OUTPUT EXACTLY:
 *   soldier.png       32x20 sheet -> 2 frames of 16x20 (run cycle)
 *   enemy_walker.png  32x20 sheet -> 2 frames of 16x20
 *   enemy_runner.png  32x20 sheet -> 2 frames of 16x20
 *   boss.png          128x72 sheet -> 2 frames of 64x72
 *   gate.png          96x120 single image (scene tints + labels it)
 *   skyline.png       540x480 single image (distant static backdrop)
 *   road.png          540x270 single image (seamless vertical scroll tile)
 *   muzzle/hit/sparkle 64x16 sheet -> 4 frames of 16x16
 *   panel.png         24x24 (9-slice), button.png 24x16 (9-slice),
 *   bar_frame.png     64x12, icons.png 64x16 -> 4 frames of 16x16
 */

/** Prefix a public/ asset path with the Vite base URL. */
export function assetPath(rel: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmed = rel.replace(/^\/+/, '');
  return `${base}${base.endsWith('/') ? '' : '/'}${trimmed}`;
}

/** Spritesheet frame configuration (Phaser.Types.Loader.FileTypes.ImageFrameConfig). */
export interface FrameConfig {
  frameWidth: number;
  frameHeight: number;
}

/** Texture (image / spritesheet) keys. */
export const TextureKeys = {
  // Squad unit (player crowd). 2-frame run cycle.
  Soldier: 'u_soldier',

  // Enemy survivor/zombie units. 2-frame shamble cycles.
  EnemyWalker: 'e_walker',
  EnemyRunner: 'e_runner',

  // Boss (large armored brute). 2-frame idle/attack.
  Boss: 'e_boss',

  // Math gate panel (neutral frame the scene tints good/bad and labels).
  Gate: 'gate_panel',

  // Backgrounds.
  BgSkyline: 'bg_skyline',
  BgRoad: 'bg_road',

  // FX sheets (4 frames each).
  FxMuzzle: 'fx_muzzle',
  FxHit: 'fx_hit',
  FxSparkle: 'fx_sparkle',

  // UI kit.
  UiPanel: 'ui_panel',
  UiButton: 'ui_button',
  UiBarFrame: 'ui_bar_frame',
  UiIcons: 'ui_icons',
} as const;

export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];

/** Audio keys. */
export const AudioKeys = {
  UiClick: 'sfx_ui_click',
  GatePass: 'sfx_gate_pass',
  Shoot: 'sfx_shoot',
  Hit: 'sfx_hit',
  LevelUp: 'sfx_level_up',
  Victory: 'sfx_victory',
  Defeat: 'sfx_defeat',
  MusicLoop: 'music_loop',
} as const;

export type AudioKey = (typeof AudioKeys)[keyof typeof AudioKeys];

/** Single-image asset descriptor. */
export interface ImageAsset {
  key: TextureKey;
  url: string;
}

/** Spritesheet asset descriptor with frame config. */
export interface SheetAsset extends ImageAsset {
  frame: FrameConfig;
}

/** Audio asset descriptor (may list multiple formats for browser fallback). */
export interface AudioAsset {
  key: AudioKey;
  urls: string[];
}

/**
 * Spritesheets and their frame sizes. Frame sizes match the output of
 * tools/gen_sprites.py exactly.
 */
export const SHEETS: readonly SheetAsset[] = [
  { key: TextureKeys.Soldier, url: 'assets/sprites/soldier.png', frame: { frameWidth: 16, frameHeight: 20 } },
  { key: TextureKeys.EnemyWalker, url: 'assets/sprites/enemy_walker.png', frame: { frameWidth: 16, frameHeight: 20 } },
  { key: TextureKeys.EnemyRunner, url: 'assets/sprites/enemy_runner.png', frame: { frameWidth: 16, frameHeight: 20 } },
  { key: TextureKeys.Boss, url: 'assets/sprites/boss.png', frame: { frameWidth: 64, frameHeight: 72 } },
  { key: TextureKeys.FxMuzzle, url: 'assets/fx/muzzle.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxHit, url: 'assets/fx/hit.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxSparkle, url: 'assets/fx/sparkle.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.UiIcons, url: 'assets/ui/icons.png', frame: { frameWidth: 16, frameHeight: 16 } },
] as const;

/** Plain single-frame images (gate panel, backgrounds, 9-slice UI). */
export const IMAGES: readonly ImageAsset[] = [
  { key: TextureKeys.Gate, url: 'assets/sprites/gate.png' },
  { key: TextureKeys.BgSkyline, url: 'assets/backgrounds/skyline.png' },
  { key: TextureKeys.BgRoad, url: 'assets/backgrounds/road.png' },
  { key: TextureKeys.UiPanel, url: 'assets/ui/panel.png' },
  { key: TextureKeys.UiButton, url: 'assets/ui/button.png' },
  { key: TextureKeys.UiBarFrame, url: 'assets/ui/bar_frame.png' },
] as const;

/** Audio assets (WAV plays natively in all evergreen browsers + Phaser WebAudio). */
export const AUDIO: readonly AudioAsset[] = [
  { key: AudioKeys.UiClick, urls: ['assets/audio/ui_click.wav'] },
  { key: AudioKeys.GatePass, urls: ['assets/audio/gate_pass.wav'] },
  { key: AudioKeys.Shoot, urls: ['assets/audio/shoot.wav'] },
  { key: AudioKeys.Hit, urls: ['assets/audio/hit.wav'] },
  { key: AudioKeys.LevelUp, urls: ['assets/audio/level_up.wav'] },
  { key: AudioKeys.Victory, urls: ['assets/audio/victory.wav'] },
  { key: AudioKeys.Defeat, urls: ['assets/audio/defeat.wav'] },
  { key: AudioKeys.MusicLoop, urls: ['assets/audio/music_loop.wav'] },
] as const;

/**
 * Maps an enemy cluster kind to its spritesheet texture key. The run/scene
 * layer (FEAT-003) uses this to pick a unit sprite per cluster. 'walker' and
 * 'runner' are the two rank-and-file survivor kinds; 'boss' is the finale.
 */
export type EnemyKind = 'walker' | 'runner' | 'boss';

export const ENEMY_TEXTURE_BY_KIND: Record<EnemyKind, TextureKey> = {
  walker: TextureKeys.EnemyWalker,
  runner: TextureKeys.EnemyRunner,
  boss: TextureKeys.Boss,
};

/**
 * Frame indices into the packed 16x16 HUD icon sheet (icons.png), in the order
 * drawn by tools/gen_sprites.py: coin, distance, squad, boss.
 */
export const HUD_ICON_FRAME = {
  coin: 0,
  distance: 1,
  squad: 2,
  boss: 3,
} as const;

export type HudIconName = keyof typeof HUD_ICON_FRAME;
