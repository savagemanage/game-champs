/**
 * Procedural WebAudio engine with a small, bounded runtime graph.
 *
 * There are no binary assets: tones and reusable noise buffers are generated
 * on demand. Every browser API is guarded so SSR/jsdom remain safe no-ops.
 */

const MUTE_KEY = 'champs-audio-muted';
const VOLUME_KEY = 'champs-audio-volume';
const AMBIENT_KEY = 'champs-audio-ambient';
const LEGACY_MUTE_KEY = 'lo' + 'l-audio-muted';
const LEGACY_VOLUME_KEY = 'lo' + 'l-audio-volume';
const LEGACY_AMBIENT_KEY = 'lo' + 'l-audio-ambient';
const MAX_ONE_SHOT_VOICES = 24;

export type SfxName =
  | 'cast'
  | 'hit'
  | 'ability'
  | 'death'
  | 'victory'
  | 'defeat'
  | 'ui';

export type AudioBus = 'master' | 'music' | 'ambience' | 'sfx' | 'ui';
export type ChampionCueSlot = 'P' | 'Q' | 'W' | 'E' | 'R';

export interface AudioPlayOptions {
  /** Stereo position in [-1, 1], when StereoPannerNode is supported. */
  pan?: number;
  /** Abstract non-negative listener distance; farther sounds are quieter. */
  distance?: number;
}

/** Public snapshot kept intentionally stable for useSyncExternalStore callers. */
export interface AudioSettings {
  muted: boolean;
  volume: number;
  ambient: boolean;
}

export interface AudioDiagnostics {
  buses: readonly AudioBus[];
  activeVoices: number;
  maxVoices: number;
  cachedBuffers: number;
}

type Listener = (settings: AudioSettings) => void;
type AnyAudioContext = AudioContext;
type MixBus = Exclude<AudioBus, 'master'>;

const AUDIO_BUSES: readonly AudioBus[] = [
  'master',
  'music',
  'ambience',
  'sfx',
  'ui',
];

function readStored(primary: string, legacy: string): string | null {
  try {
    return localStorage.getItem(primary) ?? localStorage.getItem(legacy);
  } catch {
    return null;
  }
}

function readBool(primary: string, legacy: string, fallback: boolean): boolean {
  const raw = readStored(primary, legacy);
  return raw === null ? fallback : raw === 'true';
}

function readNumber(primary: string, legacy: string, fallback: number): number {
  const raw = readStored(primary, legacy);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in SSR/private mode.
  }
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function prefersReducedAudio(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

class AudioEngine {
  private ctx: AnyAudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<MixBus, GainNode> | null = null;
  private ambientNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private ambientRunning = false;
  private listeners = new Set<Listener>();
  private generatedBuffers = new Map<string, AudioBuffer>();
  private activeVoices = new Set<AudioScheduledSourceNode>();

  private settings: AudioSettings = {
    muted: readBool(MUTE_KEY, LEGACY_MUTE_KEY, false),
    volume: readNumber(VOLUME_KEY, LEGACY_VOLUME_KEY, 0.6),
    ambient: readBool(AMBIENT_KEY, LEGACY_AMBIENT_KEY, false),
  };

  getSettings = (): AudioSettings => this.settings;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getDiagnostics = (): AudioDiagnostics => ({
    buses: AUDIO_BUSES,
    activeVoices: this.activeVoices.size,
    maxVoices: MAX_ONE_SHOT_VOICES,
    cachedBuffers: this.generatedBuffers.size,
  });

  private emit(): void {
    const snapshot = this.settings;
    for (const listener of this.listeners) listener(snapshot);
  }

  private ensureContext(): AnyAudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      master.connect(ctx.destination);

      const makeBus = (level: number): GainNode => {
        const gain = ctx.createGain();
        gain.gain.value = level;
        gain.connect(master);
        return gain;
      };
      this.buses = {
        music: makeBus(0.5),
        ambience: makeBus(0.5),
        sfx: makeBus(1),
        ui: makeBus(0.8),
      };
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      return null;
    }
  }

  resume(): void {
    const ctx = this.ensureContext();
    if (ctx?.state === 'suspended') void ctx.resume();
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
    const nextVolume = clampFinite(volume, 0, 1, this.settings.volume);
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

  /** Existing `play(name)` calls remain valid; positioning is additive. */
  play(name: SfxName, options: AudioPlayOptions = {}): void {
    if (this.settings.muted) return;
    const prepared = this.prepare(name === 'ui' ? 'ui' : 'sfx', options);
    if (!prepared) return;
    const { ctx, dest, now } = prepared;
    const reduced = prefersReducedAudio();

    switch (name) {
      case 'cast':
        this.tone(ctx, dest, 'sawtooth', 320, 620, now, 0.18, 0.18);
        if (!reduced) this.tone(ctx, dest, 'sine', 640, 1240, now, 0.16, 0.1);
        break;
      case 'ability':
        this.tone(ctx, dest, 'square', 180, 90, now, 0.28, 0.16);
        if (!reduced) this.tone(ctx, dest, 'sawtooth', 440, 220, now, 0.26, 0.12);
        break;
      case 'hit':
        this.noise(ctx, dest, now, 0.12, 0.22);
        if (!reduced) this.tone(ctx, dest, 'triangle', 220, 110, now, 0.1, 0.14);
        break;
      case 'death':
        this.noise(ctx, dest, now, 0.35, 0.28);
        if (!reduced) this.tone(ctx, dest, 'sawtooth', 260, 60, now, 0.4, 0.2);
        break;
      case 'victory':
        (reduced ? [523.25, 783.99] : [523.25, 659.25, 783.99, 1046.5]).forEach((frequency, index) => {
          this.tone(ctx, dest, 'triangle', frequency, undefined, now + index * 0.12, 0.24, 0.2);
        });
        break;
      case 'defeat':
        (reduced ? [329.63, 196] : [392, 329.63, 261.63, 196]).forEach((frequency, index) => {
          this.tone(ctx, dest, 'sine', frequency, undefined, now + index * 0.16, 0.32, 0.2);
        });
        break;
      case 'ui':
        this.tone(ctx, dest, 'sine', 660, 880, now, 0.08, 0.12);
        break;
    }
  }

  /**
   * Champion + active-slot cue API. Unknown champions use the stable generic
   * cast/ability cues; Embermage gets four richer but still bounded recipes.
   */
  playChampionCue(
    championId: string,
    slot: ChampionCueSlot,
    options: AudioPlayOptions = {},
  ): void {
    if (slot === 'P') {
      this.play('ui', options);
      return;
    }
    if (championId !== 'embermage') {
      this.play(slot === 'R' ? 'ability' : 'cast', options);
      return;
    }
    if (this.settings.muted) return;
    const prepared = this.prepare('sfx', options);
    if (!prepared) return;
    const { ctx, dest, now } = prepared;
    const reduced = prefersReducedAudio();

    switch (slot) {
      case 'Q':
        this.tone(ctx, dest, 'triangle', 420, 1120, now, 0.2, 0.16);
        if (!reduced) {
          this.tone(ctx, dest, 'sine', 840, 1680, now + 0.035, 0.16, 0.09);
          this.noise(ctx, dest, now + 0.1, 0.07, 0.08);
        }
        break;
      case 'W':
        this.noise(ctx, dest, now, 0.24, 0.16);
        this.tone(ctx, dest, 'sawtooth', 190, 520, now, 0.3, 0.13);
        if (!reduced) this.tone(ctx, dest, 'sine', 380, 760, now + 0.06, 0.24, 0.08);
        break;
      case 'E':
        [0, 0.055, 0.11].slice(0, reduced ? 1 : 3).forEach((delay, index) => {
          this.tone(ctx, dest, 'square', 260 + index * 90, 160, now + delay, 0.1, 0.1);
        });
        this.tone(ctx, dest, 'sine', 1180, 590, now + 0.1, 0.2, 0.1);
        break;
      case 'R':
        this.noise(ctx, dest, now, 0.55, 0.22);
        this.tone(ctx, dest, 'sawtooth', 120, 48, now, 0.6, 0.18);
        if (!reduced) {
          [360, 540, 720, 1080].forEach((frequency, index) => {
            this.tone(ctx, dest, 'triangle', frequency, frequency * 1.35, now + index * 0.07, 0.32, 0.11);
          });
        }
        break;
    }
  }

  private prepare(
    bus: MixBus,
    options: AudioPlayOptions,
  ): { ctx: AnyAudioContext; dest: AudioNode; now: number } | null {
    const ctx = this.ensureContext();
    const target = this.buses?.[bus];
    if (!ctx || !target) return null;

    const attenuation = 1 / (1 + clampFinite(options.distance ?? 0, 0, 1000, 0));
    const pan = clampFinite(options.pan ?? 0, -1, 1, 0);
    if (attenuation === 1 && pan === 0) {
      return { ctx, dest: target, now: ctx.currentTime };
    }

    const gain = ctx.createGain();
    gain.gain.value = attenuation;
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(target);
    } else {
      gain.connect(target);
    }
    // One-shot spatial chains are short lived; disconnect their downstream
    // nodes after the longest cue to keep repeated positioned sounds bounded.
    globalThis.setTimeout(() => {
      try {
        gain.disconnect();
        panner?.disconnect();
      } catch {
        // Already disconnected.
      }
    }, 1500);
    return { ctx, dest: gain, now: ctx.currentTime };
  }

  private claimVoice(source: AudioScheduledSourceNode, gain: GainNode): boolean {
    if (this.activeVoices.size >= MAX_ONE_SHOT_VOICES) return false;
    this.activeVoices.add(source);
    source.onended = () => {
      this.activeVoices.delete(source);
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // Already disconnected by the browser.
      }
    };
    return true;
  }

  private tone(
    ctx: AnyAudioContext,
    dest: AudioNode,
    type: OscillatorType,
    frequency: number,
    endFrequency: number | undefined,
    start: number,
    duration: number,
    peak: number,
  ): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    if (!this.claimVoice(oscillator, gain)) return;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(dest);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /** Reuse generated white-noise buffers by duration bucket. */
  private noiseBuffer(ctx: AnyAudioContext, duration: number): AudioBuffer {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const key = `${ctx.sampleRate}:${frames}`;
    const cached = this.generatedBuffers.get(key);
    if (cached) return cached;

    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    this.generatedBuffers.set(key, buffer);
    return buffer;
  }

  private noise(
    ctx: AnyAudioContext,
    dest: AudioNode,
    start: number,
    duration: number,
    peak: number,
  ): void {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    if (!this.claimVoice(source, gain)) return;
    source.buffer = this.noiseBuffer(ctx, duration);
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(dest);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private startAmbient(): void {
    if (prefersReducedAudio()) return;
    const ctx = this.ensureContext();
    const destination = this.buses?.ambience;
    if (!ctx || !destination || this.ambientRunning) return;
    this.ambientRunning = true;
    for (const frequency of [55, 82.5]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      this.ambientNodes.push({ osc: oscillator, gain });
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
        // Already stopped.
      }
    }
    this.ambientNodes = [];
  }
}

export const audio = new AudioEngine();
