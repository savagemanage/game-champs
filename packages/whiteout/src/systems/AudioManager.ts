import Phaser from 'phaser';
import { AudioKeys, type AudioKey } from '../config/AssetKeys';
import { setLanguage } from '../i18n/i18n';
import { clamp01, loadSettings, persistSettings, type GameSettings } from './SettingsStore';

// Re-exported so existing importers (SettingsScene, etc.) keep their import
// site `../systems/AudioManager` unchanged.
export type { GameSettings } from './SettingsStore';

/**
 * AudioManager - the single owner of sound in Frosthold: Last Ember.
 *
 * Responsibilities:
 *   - Load/persist {@link GameSettings} to localStorage (survives reloads).
 *   - Play one-shot SFX with per-clip volume, scaled by master*sfx.
 *   - Own the looping music bed and keep its volume in sync (master*music).
 *   - React to live settings changes (from the Settings scene sliders) by
 *     re-applying volumes immediately.
 *
 * It is a singleton so every scene routes sound through the same instance
 * instead of calling `scene.sound.play` directly. Any scene reaches it with
 * {@link AudioManager.get}(this). Mirrors wirework's AudioManager singleton.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;

  /** The Phaser SoundManager (WebAudio/HTML5) shared by the whole game. */
  private readonly sound: Phaser.Sound.BaseSoundManager;
  private settings: GameSettings;
  private music: Phaser.Sound.BaseSound | null = null;

  private constructor(game: Phaser.Game) {
    this.sound = game.sound;
    this.settings = loadSettings();
    // Phaser master volume tracks our master slider directly.
    this.sound.volume = this.settings.masterVolume;
    // Mirror the persisted language into the i18n runtime at startup.
    setLanguage(this.settings.language);
  }

  /** Fetch (or lazily create) the singleton, keyed off the running Phaser.Game. */
  static get(scene: Phaser.Scene): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager(scene.game);
    }
    return AudioManager.instance;
  }

  /** Current settings snapshot (read-only copy). */
  getSettings(): GameSettings {
    return { ...this.settings };
  }

  /**
   * Merge in a settings patch, persist it, and immediately re-apply volumes so
   * changes made in the Settings scene are audible without a restart.
   */
  updateSettings(patch: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...patch,
      masterVolume:
        patch.masterVolume !== undefined ? clamp01(patch.masterVolume, this.settings.masterVolume) : this.settings.masterVolume,
      sfxVolume: patch.sfxVolume !== undefined ? clamp01(patch.sfxVolume, this.settings.sfxVolume) : this.settings.sfxVolume,
      musicVolume:
        patch.musicVolume !== undefined ? clamp01(patch.musicVolume, this.settings.musicVolume) : this.settings.musicVolume,
    };
    this.persist();
    this.sound.volume = this.settings.masterVolume;
    this.applyMusicVolume();
    if (patch.language !== undefined) {
      setLanguage(this.settings.language);
    }
  }

  private persist(): void {
    persistSettings(this.settings);
  }

  /**
   * Play a one-shot sound effect. `volume` is the clip's base gain [0..1]; the
   * final gain is base * sfxVolume (master is applied globally by Phaser).
   * No-ops safely if the clip was never loaded or the context is still locked.
   */
  playSfx(key: AudioKey, volume = 1): void {
    if (!this.sound.locked && this.hasClip(key)) {
      this.sound.play(key, { volume: Phaser.Math.Clamp(volume * this.settings.sfxVolume, 0, 1) });
    }
  }

  /**
   * Start (or restart) the looping music bed. Idempotent: if the same track is
   * already playing it just re-applies the current music volume.
   */
  playMusic(key: AudioKey = AudioKeys.MusicLoop): void {
    if (!this.hasClip(key)) return;
    if (this.music && this.music.key === key && this.music.isPlaying) {
      this.applyMusicVolume();
      return;
    }
    this.stopMusic();
    this.music = this.sound.add(key, { loop: true, volume: this.settings.musicVolume });
    this.music.play();
  }

  /** Stop and release the music bed. */
  stopMusic(): void {
    if (this.music) {
      this.music.stop();
      this.music.destroy();
      this.music = null;
    }
  }

  /** Push the current music volume onto the live music instance. */
  private applyMusicVolume(): void {
    const m = this.music as (Phaser.Sound.BaseSound & { volume?: number }) | null;
    if (m && typeof m.volume === 'number') {
      m.volume = this.settings.musicVolume;
    }
  }

  private hasClip(key: AudioKey): boolean {
    return this.sound.game.cache.audio.exists(key);
  }
}
