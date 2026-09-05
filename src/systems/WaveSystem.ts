import Phaser from 'phaser';
import { EnemyRole, WALL } from '../config/GameConfig';
import { ARENA } from '../config/PlayerConfig';
import {
  WAVES,
  WAVE_TUNING,
  DIFFICULTY_TUNING,
  expandWave,
  scaledSpawnIntervalMs,
  scaledStartDelayMs,
  type DifficultyTuning,
  type WaveDef,
} from '../config/WaveConfig';
import { AudioManager } from './AudioManager';
import { createEnemy, type Enemy, type EnemyFactoryDeps } from '../entities/enemies';

/** Callbacks the WaveSystem uses to hand spawned giants back to the scene. */
export interface WaveHooks extends EnemyFactoryDeps {
  /** Called with each freshly spawned giant so the scene can track it. */
  readonly onSpawn: (enemy: Enemy) => void;
  /** Called when a wave begins (1-based number) for HUD/announcements. */
  readonly onWaveStart: (wave: number, size: number) => void;
  /** Called when the final wave is cleared: the run is a victory. */
  readonly onAllWavesCleared: () => void;
}

/** Phase of the wave lifecycle. */
const enum Phase {
  /** Waiting out the inter-wave delay before spawning begins. */
  Countdown = 0,
  /** Actively spawning the current wave's giants. */
  Spawning = 1,
  /** All spawned; waiting for the arena to be cleared of giants. */
  Clearing = 2,
  /** Every wave cleared - run won. */
  Done = 3,
}

/**
 * WaveSystem - the data-driven spawner.
 *
 * It walks the {@link WAVES} table one wave at a time. For each wave it expands
 * the composition into a mixed spawn order, spaces spawns by the wave's pacing
 * (with jitter), and only advances to the next wave once the current wave is
 * both fully spawned AND cleared of living giants. Difficulty comes entirely
 * from the DATA in WaveConfig (more/tougher-role spawns), never from touching a
 * giant's base stats - this system reads composition and pacing only.
 */
export class WaveSystem {
  private readonly scene: Phaser.Scene;
  private readonly hooks: WaveHooks;

  private phase: Phase = Phase.Countdown;
  private waveIndex = 0;
  private spawnQueue: EnemyRole[] = [];
  private nextEventAt = 0;
  private started = false;
  /** Difficulty pacing/composition scaling, read once at run start. */
  private difficulty: DifficultyTuning = DIFFICULTY_TUNING.standard;

  constructor(scene: Phaser.Scene, hooks: WaveHooks) {
    this.scene = scene;
    this.hooks = hooks;
  }

  /** 1-based number of the wave currently in progress. */
  get currentWave(): number {
    return Math.min(this.waveIndex + 1, WAVES.length);
  }

  /** Total number of waves in the run. */
  get totalWaves(): number {
    return WAVES.length;
  }

  /** Kick off the first countdown. Call once from the scene's create(). */
  start(nowMs: number): void {
    this.started = true;
    this.phase = Phase.Countdown;
    this.waveIndex = 0;
    // Read the persisted difficulty ONCE at run start; it only scales pacing
    // and adds baseline filler - it never mutates any giant's base stats.
    const difficulty = AudioManager.get(this.scene).getSettings().difficulty;
    this.difficulty = DIFFICULTY_TUNING[difficulty];
    this.nextEventAt = nowMs + Math.max(500, Math.round(WAVE_TUNING.FIRST_WAVE_DELAY_MS * this.difficulty.startDelayScale));
  }

  /**
   * Advance the spawner. `aliveCount` is how many giants are still active in
   * the scene (used to detect a cleared wave). Returns nothing; spawns flow out
   * via the {@link WaveHooks.onSpawn} callback.
   */
  update(nowMs: number, aliveCount: number): void {
    if (!this.started || this.phase === Phase.Done) return;

    switch (this.phase) {
      case Phase.Countdown:
        if (nowMs >= this.nextEventAt) this.beginWave(nowMs);
        break;

      case Phase.Spawning:
        if (nowMs >= this.nextEventAt) this.spawnNext(nowMs);
        break;

      case Phase.Clearing:
        if (aliveCount <= 0) this.advanceWave(nowMs);
        break;
    }
  }

  private currentDef(): WaveDef {
    return WAVES[this.waveIndex];
  }

  private beginWave(nowMs: number): void {
    const def = this.currentDef();
    this.spawnQueue = expandWave(def, this.difficulty);
    this.phase = Phase.Spawning;
    this.nextEventAt = nowMs; // spawn the first immediately
    this.hooks.onWaveStart(def.wave, this.spawnQueue.length);
  }

  private spawnNext(nowMs: number): void {
    const role = this.spawnQueue.shift();
    if (role === undefined) {
      // Whole wave has been emitted; wait for it to be cleared.
      this.phase = Phase.Clearing;
      return;
    }
    this.spawnOne(role);

    const def = this.currentDef();
    const interval = scaledSpawnIntervalMs(def, this.difficulty);
    const jitter = interval * WAVE_TUNING.SPAWN_JITTER;
    this.nextEventAt = nowMs + interval + Phaser.Math.Between(-jitter, jitter);
  }

  /**
   * Instantiate one giant at a random angle around the OUTER ring perimeter
   * (just outside OUTER_RADIUS) and hand it to the scene, so giants besiege the
   * center from all sides. FEAT-003 layers the full radial siege AI on top; the
   * spawn position math is finalized here.
   */
  private spawnOne(role: EnemyRole): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = WALL.OUTER_RADIUS + 90 + Math.random() * 60; // just outside the outer ring
    const x = ARENA.CENTER_X + Math.cos(angle) * radius;
    const y = ARENA.CENTER_Y + Math.sin(angle) * radius;
    const enemy = createEnemy(this.scene, role, x, y, {
      spawnDebris: this.hooks.spawnDebris,
      heroPos: this.hooks.heroPos,
    });
    this.hooks.onSpawn(enemy);
  }

  private advanceWave(nowMs: number): void {
    this.waveIndex += 1;
    if (this.waveIndex >= WAVES.length) {
      this.phase = Phase.Done;
      this.hooks.onAllWavesCleared();
      return;
    }
    this.phase = Phase.Countdown;
    this.nextEventAt = nowMs + scaledStartDelayMs(this.currentDef(), this.difficulty);
  }
}
