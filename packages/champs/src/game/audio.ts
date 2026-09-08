/**
 * Procedural WebAudio SFX engine.
 *
 * All sound effects are synthesized at runtime from oscillators and noise, so
 * the game ships with ZERO binary audio assets - nothing to download, nothing
 * to bundle. Each effect is a short envelope over one or more oscillators.
 *
 * The whole module is defensively guarded so it is safe in headless / SSR /
 * unit-test environments: if `AudioContext` is unavailable, or the context
 * cannot be created, every method degrades to a no-op instead of throwing.
 * This keeps the Vitest (jsdom) suite and the production build green while a
 * real browser gets full audio.
 *
 * Mute state and master volume are persisted to `localStorage` so a player's
 * preference survives reloads. A lightweight subscription API lets React
 * components (the Settings panel) reflect and mutate the current settings.
 */

const MUTE_KEY = 'lol-audio-muted';
const VOLUME_KEY = 'lol-audio-volume';
const AMBIENT_KEY = 'lol-audio-ambient';

/** The named one-shot effects the game can trigger. */
export type SfxName =
  | 'cast'
  | 'hit'
  | 'ability'
  | 'death'
  | 'victory'
  | 'defeat'
  | 'ui';

/** Public snapshot of the mutable audio settings. */
export interface AudioSettings {
  muted: boolean;
  /** Master volume, 0..1. */
  volume: number;
  /** Whether the subtle looped ambient drone is enabled. */
  ambient: boolean;
}

type Listener = (settings: AudioSettings) => void;

/** Minimal shape we rely on so tests can run without lib.dom AudioContext. */
type AnyAudioContext = AudioContext;

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / SSR) - ignore. */
  }
}

/** Resolve a usable AudioContext constructor, or null when unsupported. */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

class AudioEngine {
  private ctx: AnyAudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private ambientRunning = false;
  private listeners = new Set<Listener>();

  private settings: AudioSettings = {
    muted: readBool(MUTE_KEY, false),
    volume: readNumber(VOLUME_KEY, 0.6),
    ambient: readBool(AMBIENT_KEY, false),
  };

  /**
   * Stable snapshot for React's useSyncExternalStore. The function is an arrow
   * so it keeps its instance binding when passed directly to React, and the
   * returned object only changes when a setting actually changes.
   */
  getSettings = (): AudioSettings => this.settings;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    const snap = this.getSettings();
    for (const l of this.listeners) l(snap);
  }

  /**
   * Lazily create the AudioContext. Browsers require this to happen after a
   * user gesture, so callers invoke it from click / keydown handlers. Returns
   * null (a no-op signal) whenever audio is unsupported.
   */
  private ensureContext(): AnyAudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  /** Call from a user gesture to unlock/resume a suspended context. */
  resume(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (this.settings.ambient) this.startAmbient();
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.settings.muted ? 0 : this.settings.volume;
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    } catch {
      this.master.gain.value = target;
    }
  }

  setMuted(muted: boolean): void {
    if (this.settings.muted === muted) return;
    this.settings = { ...this.settings, muted };
    writeStorage(MUTE_KEY, String(muted));
    this.applyMasterGain();
    if (muted) this.stopAmbient();
    else if (this.settings.ambient) this.startAmbient();
    this.emit();
  }

  toggleMuted(): void {
    this.setMuted(!this.settings.muted);
  }

  setVolume(volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    if (this.settings.volume === nextVolume) return;
    this.settings = { ...this.settings, volume: nextVolume };
    writeStorage(VOLUME_KEY, String(nextVolume));
    this.applyMasterGain();
    this.emit();
  }

  setAmbient(enabled: boolean): void {
    if (this.settings.ambient === enabled) return;
    this.settings = { ...this.settings, ambient: enabled };
    writeStorage(AMBIENT_KEY, String(enabled));
    if (enabled && !this.settings.muted) this.startAmbient();
    else this.stopAmbient();
    this.emit();
  }

  toggleAmbient(): void {
    this.setAmbient(!this.settings.ambient);
  }

  /** Schedule a single enveloped oscillator tone. */
  private tone(opts: {
    ctx: AnyAudioContext;
    dest: AudioNode;
    type: OscillatorType;
    freq: number;
    endFreq?: number;
    start: number;
    duration: number;
    peak: number;
  }): void {
    const { ctx } = opts;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, opts.start);
    if (opts.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.endFreq),
        opts.start + opts.duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, opts.start);
    gain.gain.exponentialRampToValueAtTime(opts.peak, opts.start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.duration);
    osc.connect(gain);
    gain.connect(opts.dest);
    osc.start(opts.start);
    osc.stop(opts.start + opts.duration + 0.02);
  }

  /** A short burst of filtered white noise (impacts, deaths). */
  private noise(opts: {
    ctx: AnyAudioContext;
    dest: AudioNode;
    start: number;
    duration: number;
    peak: number;
  }): void {
    const { ctx } = opts;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * opts.duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Decaying noise burst.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.peak, opts.start);
    gain.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.duration);
    src.connect(gain);
    gain.connect(opts.dest);
    src.start(opts.start);
    src.stop(opts.start + opts.duration + 0.02);
  }

  /** Play a named one-shot SFX. No-op when audio is muted/unsupported. */
  play(name: SfxName): void {
    if (this.settings.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const dest = this.master;

    switch (name) {
      case 'cast':
        this.tone({ ctx, dest, type: 'sawtooth', freq: 320, endFreq: 620, start: now, duration: 0.18, peak: 0.18 });
        this.tone({ ctx, dest, type: 'sine', freq: 640, endFreq: 1240, start: now, duration: 0.16, peak: 0.1 });
        break;
      case 'ability':
        this.tone({ ctx, dest, type: 'square', freq: 180, endFreq: 90, start: now, duration: 0.28, peak: 0.16 });
        this.tone({ ctx, dest, type: 'sawtooth', freq: 440, endFreq: 220, start: now, duration: 0.26, peak: 0.12 });
        break;
      case 'hit':
        this.noise({ ctx, dest, start: now, duration: 0.12, peak: 0.22 });
        this.tone({ ctx, dest, type: 'triangle', freq: 220, endFreq: 110, start: now, duration: 0.1, peak: 0.14 });
        break;
      case 'death':
        this.noise({ ctx, dest, start: now, duration: 0.35, peak: 0.28 });
        this.tone({ ctx, dest, type: 'sawtooth', freq: 260, endFreq: 60, start: now, duration: 0.4, peak: 0.2 });
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone({ ctx, dest, type: 'triangle', freq: f, start: now + i * 0.12, duration: 0.24, peak: 0.2 });
        });
        break;
      case 'defeat':
        [392, 329.63, 261.63, 196].forEach((f, i) => {
          this.tone({ ctx, dest, type: 'sine', freq: f, start: now + i * 0.16, duration: 0.32, peak: 0.2 });
        });
        break;
      case 'ui':
        this.tone({ ctx, dest, type: 'sine', freq: 660, endFreq: 880, start: now, duration: 0.08, peak: 0.12 });
        break;
    }
  }

  private startAmbient(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || this.ambientRunning) return;
    this.ambientRunning = true;
    // Two detuned low drones for a subtle arena hum.
    for (const freq of [55, 82.5]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.ambientNodes.push({ osc, gain });
    }
  }

  private stopAmbient(): void {
    if (!this.ambientRunning) return;
    this.ambientRunning = false;
    for (const { osc, gain } of this.ambientNodes) {
      try {
        gain.gain.value = 0;
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.ambientNodes = [];
  }
}

/** Single shared audio engine for the whole app. */
export const audio = new AudioEngine();
