import Phaser from 'phaser';
import { AudioKeys, type AudioKey } from '../config/AssetKeys';
import { setLanguage } from '../i18n/i18n';
import {
  applyPresentationSettings,
  isStorageAvailable,
  loadSettings,
  saveSettings,
  type GameSettings,
} from './Persistence';

export type { Difficulty, GameSettings } from './Persistence';

/** Single audio owner. Persistence is delegated to the schema repositories. */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private readonly sound: Phaser.Sound.BaseSoundManager;
  private settings: GameSettings;
  private music: Phaser.Sound.BaseSound | null = null;
  private readonly activeSfx = new Set<Phaser.Sound.BaseSound>();
  private paused = false;
  private unlockFailed = false;

  private constructor(game: Phaser.Game) {
    this.sound = game.sound;
    this.settings = loadSettings();
    this.sound.volume = this.settings.masterVolume;
    setLanguage(this.settings.language);
    applyPresentationSettings(this.settings);
  }

  static get(scene: Phaser.Scene): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager(scene.game);
    return AudioManager.instance;
  }

  static peekPersistedLanguage(): GameSettings['language'] {
    const settings = loadSettings();
    setLanguage(settings.language);
    applyPresentationSettings(settings);
    return settings.language;
  }

  getSettings(): GameSettings {
    return { ...this.settings, bindings: { ...this.settings.bindings } };
  }

  updateSettings(patch: Partial<GameSettings>): void {
    const next: GameSettings = {
      ...this.settings,
      ...patch,
      bindings: patch.bindings ? { ...this.settings.bindings, ...patch.bindings } : this.settings.bindings,
    };
    saveSettings(next);
    this.settings = loadSettings();
    this.sound.volume = this.settings.masterVolume;
    setLanguage(this.settings.language);
    applyPresentationSettings(this.settings);
    this.applyMusicVolume();
  }

  get storageAvailable(): boolean {
    return isStorageAvailable();
  }

  get audioUnavailable(): boolean {
    return this.unlockFailed;
  }

  /** Called from pointer and keyboard gestures; failure never blocks play. */
  unlock(): void {
    try {
      const manager = this.sound as Phaser.Sound.BaseSoundManager & { unlock?: () => void };
      manager.unlock?.();
      this.unlockFailed = this.sound.locked;
    } catch {
      this.unlockFailed = true;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const clip of this.activeSfx) {
      if (paused && clip.isPlaying) clip.pause();
      else if (!paused && clip.isPaused) clip.resume();
    }
    this.applyMusicVolume();
  }

  playSfx(key: AudioKey, volume = 1): void {
    if (this.paused || this.sound.locked || !this.hasClip(key)) return;
    const clip = this.sound.add(key, { volume: Phaser.Math.Clamp(volume * this.settings.sfxVolume, 0, 1) });
    this.activeSfx.add(clip);
    clip.once('complete', () => {
      this.activeSfx.delete(clip);
      clip.destroy();
    });
    clip.once('destroy', () => this.activeSfx.delete(clip));
    clip.play();
  }

  playMusic(key: AudioKey = AudioKeys.MusicLoop): void {
    if (!this.hasClip(key)) return;
    if (this.music && this.music.key === key && this.music.isPlaying) {
      this.applyMusicVolume();
      return;
    }
    this.stopMusic();
    this.music = this.sound.add(key, { loop: true, volume: this.musicVolume() });
    this.music.play();
  }

  stopMusic(): void {
    this.music?.stop();
    this.music?.destroy();
    this.music = null;
  }

  private musicVolume(): number {
    return this.settings.musicVolume * (this.paused ? 0.35 : 1);
  }

  private applyMusicVolume(): void {
    const live = this.music as (Phaser.Sound.BaseSound & { volume?: number }) | null;
    if (live && typeof live.volume === 'number') live.volume = this.musicVolume();
  }

  private hasClip(key: AudioKey): boolean {
    return this.sound.game.cache.audio.exists(key);
  }
}
