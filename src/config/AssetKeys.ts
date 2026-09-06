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
 * import.meta.env.BASE_URL ('/game-whiteout/' in production, '/' in dev). Always
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
  // Buildings (each is a 2-tier sheet: worn -> upgraded look).
  Furnace: 'b_furnace',
  HuntersHut: 'b_hunters_hut',
  Sawmill: 'b_sawmill',
  CoalPit: 'b_coal_pit',
  IronMine: 'b_iron_mine',
  WarCamp: 'b_war_camp',

  // Troop unit sprites (player-side).
  TroopTrapper: 'u_trapper',
  TroopMarksman: 'u_marksman',
  TroopVanguard: 'u_vanguard',

  // Frozen Horde enemy sprites (battle).
  EnemyFrostWolf: 'e_frost_wolf',
  EnemyRavager: 'e_ravager',
  EnemyFrostTitan: 'e_frost_titan',

  // Resource icons (packed 16x16 sheet: food, wood, coal, iron).
  ResourceIcons: 'ui_resource_icons',

  // Backgrounds.
  BgSky: 'bg_sky',
  BgTown: 'bg_town',
  BgBattle: 'bg_battle',

  // FX sheets.
  FxSpark: 'fx_spark',
  FxDust: 'fx_dust',

  // UI kit (9-slice + icon sheet).
  UiPanel: 'ui_panel',
  UiButton: 'ui_button',
  UiBarFrame: 'ui_bar_frame',
  UiIcons: 'ui_icons',
} as const;

export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];

/** Audio keys. */
export const AudioKeys = {
  UiClick: 'sfx_ui_click',
  BuildComplete: 'sfx_build_complete',
  TrainComplete: 'sfx_train_complete',
  BattleHit: 'sfx_battle_hit',
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
 * tools/gen_sprites.py exactly. Each building sheet has 2 frames (tier 0/1).
 */
export const SHEETS: readonly SheetAsset[] = [
  { key: TextureKeys.Furnace, url: 'assets/sprites/furnace.png', frame: { frameWidth: 64, frameHeight: 64 } },
  { key: TextureKeys.HuntersHut, url: 'assets/sprites/hunters_hut.png', frame: { frameWidth: 48, frameHeight: 48 } },
  { key: TextureKeys.Sawmill, url: 'assets/sprites/sawmill.png', frame: { frameWidth: 48, frameHeight: 48 } },
  { key: TextureKeys.CoalPit, url: 'assets/sprites/coal_pit.png', frame: { frameWidth: 48, frameHeight: 48 } },
  { key: TextureKeys.IronMine, url: 'assets/sprites/iron_mine.png', frame: { frameWidth: 48, frameHeight: 48 } },
  { key: TextureKeys.WarCamp, url: 'assets/sprites/war_camp.png', frame: { frameWidth: 48, frameHeight: 48 } },
  { key: TextureKeys.TroopTrapper, url: 'assets/sprites/troop_trapper.png', frame: { frameWidth: 24, frameHeight: 28 } },
  { key: TextureKeys.TroopMarksman, url: 'assets/sprites/troop_marksman.png', frame: { frameWidth: 24, frameHeight: 28 } },
  { key: TextureKeys.TroopVanguard, url: 'assets/sprites/troop_vanguard.png', frame: { frameWidth: 24, frameHeight: 28 } },
  { key: TextureKeys.EnemyFrostWolf, url: 'assets/sprites/enemy_frost_wolf.png', frame: { frameWidth: 24, frameHeight: 28 } },
  { key: TextureKeys.EnemyRavager, url: 'assets/sprites/enemy_ravager.png', frame: { frameWidth: 32, frameHeight: 36 } },
  { key: TextureKeys.EnemyFrostTitan, url: 'assets/sprites/enemy_frost_titan.png', frame: { frameWidth: 40, frameHeight: 32 } },
  { key: TextureKeys.ResourceIcons, url: 'assets/ui/resource_icons.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxSpark, url: 'assets/fx/spark.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxDust, url: 'assets/fx/dust.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.UiIcons, url: 'assets/ui/icons.png', frame: { frameWidth: 16, frameHeight: 16 } },
] as const;

/** Plain single-frame images (backgrounds, 9-slice UI). */
export const IMAGES: readonly ImageAsset[] = [
  { key: TextureKeys.BgSky, url: 'assets/backgrounds/sky.png' },
  { key: TextureKeys.BgTown, url: 'assets/backgrounds/town.png' },
  { key: TextureKeys.BgBattle, url: 'assets/backgrounds/battle.png' },
  { key: TextureKeys.UiPanel, url: 'assets/ui/panel.png' },
  { key: TextureKeys.UiButton, url: 'assets/ui/button.png' },
  { key: TextureKeys.UiBarFrame, url: 'assets/ui/bar_frame.png' },
] as const;

/** Audio assets (WAV plays natively in all evergreen browsers + Phaser WebAudio). */
export const AUDIO: readonly AudioAsset[] = [
  { key: AudioKeys.UiClick, urls: ['assets/audio/ui_click.wav'] },
  { key: AudioKeys.BuildComplete, urls: ['assets/audio/build_complete.wav'] },
  { key: AudioKeys.TrainComplete, urls: ['assets/audio/train_complete.wav'] },
  { key: AudioKeys.BattleHit, urls: ['assets/audio/battle_hit.wav'] },
  { key: AudioKeys.Victory, urls: ['assets/audio/victory.wav'] },
  { key: AudioKeys.Defeat, urls: ['assets/audio/defeat.wav'] },
  { key: AudioKeys.MusicLoop, urls: ['assets/audio/music_loop.wav'] },
] as const;

/**
 * Maps a BuildingKind value to its spritesheet texture key. The buildings
 * feature consumes this so the roster stays in sync with the config.
 */
export const BUILDING_TEXTURE_BY_KIND: Record<string, TextureKey> = {
  furnace: TextureKeys.Furnace,
  hunters_hut: TextureKeys.HuntersHut,
  sawmill: TextureKeys.Sawmill,
  coal_pit: TextureKeys.CoalPit,
  iron_mine: TextureKeys.IronMine,
  war_camp: TextureKeys.WarCamp,
};

/** Maps a TroopKind value to its spritesheet texture key. */
export const TROOP_TEXTURE_BY_KIND: Record<string, TextureKey> = {
  trapper: TextureKeys.TroopTrapper,
  marksman: TextureKeys.TroopMarksman,
  vanguard: TextureKeys.TroopVanguard,
};

/** Maps a resource kind to its frame index in the packed resource-icon sheet. */
export const RESOURCE_ICON_FRAME: Record<string, number> = {
  food: 0,
  wood: 1,
  coal: 2,
  iron: 3,
};
