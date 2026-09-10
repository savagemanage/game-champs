export function assetPath(relative: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${base.endsWith('/') ? '' : '/'}${relative.replace(/^\/+/, '')}`;
}
export interface FrameConfig { frameWidth: number; frameHeight: number }
export const TextureKeys = {
  Hero: 'arc_guardian',
  MachineSurveyor: 'machine_surveyor', MachineSkitter: 'machine_skitter', MachineRammer: 'machine_rammer',
  MachineFluxborn: 'machine_fluxborn', MachineBastion: 'machine_bastion', MachineBombard: 'machine_bombard',
  Citizen: 'citizen', Tiles: 'tiles', Hook: 'tether_probe',
  BgSky: 'bg_sky', BgGround: 'bg_ground', BgHills: 'bg_hills', BgWall: 'bg_wall',
  FxSlash: 'fx_arc_cut', FxSpark: 'fx_spark', FxDust: 'fx_dust', FxCoolant: 'fx_coolant',
  UiPanel: 'ui_panel', UiButton: 'ui_button', UiBarFrame: 'ui_bar_frame', UiIcons: 'ui_icons',
} as const;
export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];

export const AudioKeys = {
  TetherFire: 'sfx_tether_fire', WireAttach: 'sfx_wire_attach', SwingWhoosh: 'sfx_swing_whoosh',
  Slash: 'sfx_arc_cut', Hit: 'sfx_machine_hit', MachineShutdown: 'sfx_machine_shutdown',
  AttackSurveyor: 'sfx_attack_surveyor', AttackSkitter: 'sfx_attack_skitter', AttackRammer: 'sfx_attack_rammer',
  AttackFluxborn: 'sfx_attack_fluxborn', AttackBastion: 'sfx_attack_bastion', AttackBombard: 'sfx_attack_bombard',
  CitizenAlarm: 'sfx_citizen_alarm', UiClick: 'sfx_ui_click', MusicLoop: 'music_loop',
} as const;
export type AudioKey = (typeof AudioKeys)[keyof typeof AudioKeys];
export interface ImageAsset { key: TextureKey; url: string }
export interface SheetAsset extends ImageAsset { frame: FrameConfig }
export interface AudioAsset { key: AudioKey; urls: string[] }

export const SHEETS: readonly SheetAsset[] = [
  { key: TextureKeys.Hero, url: 'assets/sprites/arc_guardian.png', frame: { frameWidth: 32, frameHeight: 32 } },
  { key: TextureKeys.MachineSurveyor, url: 'assets/sprites/machine_surveyor.png', frame: { frameWidth: 40, frameHeight: 48 } },
  { key: TextureKeys.MachineSkitter, url: 'assets/sprites/machine_skitter.png', frame: { frameWidth: 40, frameHeight: 32 } },
  { key: TextureKeys.MachineRammer, url: 'assets/sprites/machine_rammer.png', frame: { frameWidth: 56, frameHeight: 72 } },
  { key: TextureKeys.MachineFluxborn, url: 'assets/sprites/machine_fluxborn.png', frame: { frameWidth: 40, frameHeight: 44 } },
  { key: TextureKeys.MachineBastion, url: 'assets/sprites/machine_bastion.png', frame: { frameWidth: 44, frameHeight: 52 } },
  { key: TextureKeys.MachineBombard, url: 'assets/sprites/machine_bombard.png', frame: { frameWidth: 46, frameHeight: 54 } },
  { key: TextureKeys.Citizen, url: 'assets/sprites/citizen.png', frame: { frameWidth: 16, frameHeight: 20 } },
  { key: TextureKeys.Tiles, url: 'assets/sprites/tiles.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxSlash, url: 'assets/fx/arc_cut.png', frame: { frameWidth: 24, frameHeight: 24 } },
  { key: TextureKeys.FxSpark, url: 'assets/fx/spark.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxDust, url: 'assets/fx/dust.png', frame: { frameWidth: 16, frameHeight: 16 } },
  { key: TextureKeys.FxCoolant, url: 'assets/fx/coolant.png', frame: { frameWidth: 24, frameHeight: 24 } },
  { key: TextureKeys.UiIcons, url: 'assets/ui/icons.png', frame: { frameWidth: 16, frameHeight: 16 } },
];
export const IMAGES: readonly ImageAsset[] = [
  { key: TextureKeys.Hook, url: 'assets/sprites/tether_probe.png' },
  { key: TextureKeys.BgSky, url: 'assets/backgrounds/sky.png' }, { key: TextureKeys.BgGround, url: 'assets/backgrounds/ground.png' },
  { key: TextureKeys.BgHills, url: 'assets/backgrounds/hills.png' }, { key: TextureKeys.BgWall, url: 'assets/backgrounds/wall.png' },
  { key: TextureKeys.UiPanel, url: 'assets/ui/panel.png' }, { key: TextureKeys.UiButton, url: 'assets/ui/button.png' },
  { key: TextureKeys.UiBarFrame, url: 'assets/ui/bar_frame.png' },
];
export const AUDIO: readonly AudioAsset[] = [
  { key: AudioKeys.TetherFire, urls: ['assets/audio/tether_fire.wav'] },
  { key: AudioKeys.WireAttach, urls: ['assets/audio/wire_attach.wav'] },
  { key: AudioKeys.SwingWhoosh, urls: ['assets/audio/swing_whoosh.wav'] },
  { key: AudioKeys.Slash, urls: ['assets/audio/arc_cut.wav'] },
  { key: AudioKeys.Hit, urls: ['assets/audio/machine_hit.wav'] },
  { key: AudioKeys.MachineShutdown, urls: ['assets/audio/machine_shutdown.wav'] },
  { key: AudioKeys.AttackSurveyor, urls: ['assets/audio/attack_surveyor.wav'] },
  { key: AudioKeys.AttackSkitter, urls: ['assets/audio/attack_skitter.wav'] },
  { key: AudioKeys.AttackRammer, urls: ['assets/audio/attack_rammer.wav'] },
  { key: AudioKeys.AttackFluxborn, urls: ['assets/audio/attack_fluxborn.wav'] },
  { key: AudioKeys.AttackBastion, urls: ['assets/audio/attack_bastion.wav'] },
  { key: AudioKeys.AttackBombard, urls: ['assets/audio/attack_bombard.wav'] },
  { key: AudioKeys.CitizenAlarm, urls: ['assets/audio/citizen_alarm.wav'] },
  { key: AudioKeys.UiClick, urls: ['assets/audio/ui_click.wav'] },
  { key: AudioKeys.MusicLoop, urls: ['assets/audio/music_loop.wav'] },
];
export const ENEMY_TEXTURE_BY_ROLE: Record<string, TextureKey> = {
  surveyor: TextureKeys.MachineSurveyor, skitter: TextureKeys.MachineSkitter, rammer: TextureKeys.MachineRammer,
  fluxborn: TextureKeys.MachineFluxborn, bastion: TextureKeys.MachineBastion, bombard: TextureKeys.MachineBombard,
};
