/**
 * AssetKeys - centralized, typed registry of every runtime asset.
 *
 * The rest of the codebase references these keys (and their frame configs)
 * instead of raw strings, so a rename is a single edit here and TypeScript
 * catches typos. All art/audio is ORIGINAL to this project (see
 * assets/CREDITS.md); files live under public/assets/ and are served under the
 * Vite base path.
 *
 * NOTE on paths: files in public/ are served at the site root, which is
 * import.meta.env.BASE_URL ('/wirework/' in production, '/' in dev). Always
 * build load URLs with assetPath() so they resolve under the base path.
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
  Hero: 'hero',
  GiantWanderer: 'giant_wanderer',
  GiantSprinter: 'giant_sprinter',
  GiantBreaker: 'giant_breaker',
  GiantAberrant: 'giant_aberrant',
  GiantArmored: 'giant_armored',
  GiantThrower: 'giant_thrower',
  Citizen: 'citizen',
  Tiles: 'tiles',
  Hook: 'hook',
  BgSky: 'bg_sky',
  BgGround: 'bg_ground',
  BgHills: 'bg_hills',
  BgWall: 'bg_wall',
  FxSlash: 'fx_slash',
  FxSpark: 'fx_spark',
  FxDust: 'fx_dust',
  FxSteam: 'fx_steam',
  UiPanel: 'ui_panel',
  UiButton: 'ui_button',
  UiBarFrame: 'ui_bar_frame',
  UiIcons: 'ui_icons',
} as const;

export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];

/** Audio keys. */
export const AudioKeys = {
  GrappleFire: 'sfx_grapple_fire',
  WireAttach: 'sfx_wire_attach',
  SwingWhoosh: 'sfx_swing_whoosh',
  Slash: 'sfx_slash',
  Hit: 'sfx_hit',
  EnemyDeath: 'sfx_enemy_death',
  CitizenScream: 'sfx_citizen_scream',
  UiClick: 'sfx_ui_click',
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
  { key: TextureKeys.Hero, url: 'assets/sprites/hero.png', frame: { frameWidth: 32, frameHeight: 32 } },
  { key: TextureKeys.GiantWanderer, url: 'assets/sprites/giant_wanderer.png', frame: { frameWidth: 40, frameHeight: 48 } },
  { key: TextureKeys.GiantSprinter, url: 'assets/sprites/giant_sprinter.png', frame: { frameWidth: 40, frameHeight: 32 } },
  { key: TextureKeys.GiantBreaker, url: 'assets/sprites/giant_breaker.png', frame: { frameWidth: 56, frameHeight: 72 } },
  { key: TextureKeys.GiantAberrant, url: 'assets/sprites/giant_aberrant.png', frame: { frameWidth: 40, frameHeight: 44 } },
  { key: TextureKeys.GiantArmored, url: 'assets/sprites/giant_armored.png', frame: { frameWidth: 44, frameHeight: 52 } },
  { key: TextureKeys.GiantThrower, url: 'assets/sprites/giant_thrower.png', frame: { frameWidth: 46, frameHeight: 54 } },
  { key: TextureKeys.Citizen, url: 'assets/sprites/citizen.png', frame: { frameWidth: 16, frameHeight: 20 } },
  { key: TextureKeys.Tiles, url: 'assets/sprites/tiles.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxSlash, url: 'assets/fx/slash.png', frame: { frameWidth: 24, frameHeight: 24 } },
  { key: TextureKeys.FxSpark, url: 'assets/fx/spark.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxDust, url: 'assets/fx/dust.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxSteam, url: 'assets/fx/steam.png', frame: { frameWidth: 24, frameHeight: 24 } },
  { key: TextureKeys.UiIcons, url: 'assets/ui/icons.png', frame: { frameWidth: 16, frameHeight: 16 } },
] as const;

/** Plain single-frame images (backgrounds, hook, 9-slice UI). */
export const IMAGES: readonly ImageAsset[] = [
  { key: TextureKeys.Hook, url: 'assets/sprites/hook.png' },
  { key: TextureKeys.BgSky, url: 'assets/backgrounds/sky.png' },
  { key: TextureKeys.BgGround, url: 'assets/backgrounds/ground.png' },
  { key: TextureKeys.BgHills, url: 'assets/backgrounds/hills.png' },
  { key: TextureKeys.BgWall, url: 'assets/backgrounds/wall.png' },
  { key: TextureKeys.UiPanel, url: 'assets/ui/panel.png' },
  { key: TextureKeys.UiButton, url: 'assets/ui/button.png' },
  { key: TextureKeys.UiBarFrame, url: 'assets/ui/bar_frame.png' },
] as const;

/** Audio assets (WAV plays natively in all evergreen browsers + Phaser WebAudio). */
export const AUDIO: readonly AudioAsset[] = [
  { key: AudioKeys.GrappleFire, urls: ['assets/audio/grapple_fire.wav'] },
  { key: AudioKeys.WireAttach, urls: ['assets/audio/wire_attach.wav'] },
  { key: AudioKeys.SwingWhoosh, urls: ['assets/audio/swing_whoosh.wav'] },
  { key: AudioKeys.Slash, urls: ['assets/audio/slash.wav'] },
  { key: AudioKeys.Hit, urls: ['assets/audio/hit.wav'] },
  { key: AudioKeys.EnemyDeath, urls: ['assets/audio/enemy_death.wav'] },
  { key: AudioKeys.CitizenScream, urls: ['assets/audio/citizen_scream.wav'] },
  { key: AudioKeys.UiClick, urls: ['assets/audio/ui_click.wav'] },
  { key: AudioKeys.MusicLoop, urls: ['assets/audio/music_loop.wav'] },
] as const;

/**
 * Maps an EnemyRole value to its spritesheet texture key. FEAT-004 (enemy AI)
 * consumes these so the six role designs stay in sync with the config.
 */
export const ENEMY_TEXTURE_BY_ROLE: Record<string, TextureKey> = {
  wanderer: TextureKeys.GiantWanderer,
  sprinter: TextureKeys.GiantSprinter,
  breaker: TextureKeys.GiantBreaker,
  aberrant: TextureKeys.GiantAberrant,
  armored: TextureKeys.GiantArmored,
  thrower: TextureKeys.GiantThrower,
};
