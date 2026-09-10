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
  type WaveDef,
} from '../config/WaveConfig';
import type { Difficulty } from './Persistence';
import type { RandomSource } from './DeterministicRng';
import { radialPoint, spawnRadius } from './SiegeGeometry';
import { createEnemy, type Enemy } from '../entities/enemies';
import type { DebrisProjectile } from '../entities/enemies/DebrisProjectile';

export type WavePhase = 'countdown' | 'spawning' | 'clearing' | 'done';
export interface WaveHooks {
  readonly spawnDebris: (projectile: DebrisProjectile) => void;
  readonly onSpawn: (enemy: Enemy) => void;
  readonly canSpawn: (x: number, y: number) => boolean;
  readonly onWaveStart: (wave: number, size: number) => void;
  readonly onAllWavesCleared: () => void;
}

export class WaveSystem {
  private phaseValue: WavePhase = 'countdown';
  private waveIndex = 0;
  private spawnQueue: EnemyRole[] = [];
  private nextEventAt = 0;
  private started = false;
  private completed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    difficulty: Difficulty,
    private readonly rng: RandomSource,
    private readonly hooks: WaveHooks,
  ) {
    this.difficulty = DIFFICULTY_TUNING[difficulty];
  }

  private readonly difficulty;

  get currentWave(): number { return Math.min(this.waveIndex + 1, WAVES.length); }
  get totalWaves(): number { return WAVES.length; }
  get wavesCompleted(): number { return this.completed; }
  get phase(): WavePhase { return this.phaseValue; }
  countdownMs(nowMs: number): number {
    return this.phaseValue === 'countdown' ? Math.max(0, this.nextEventAt - nowMs) : 0;
  }

  start(nowMs: number): void {
    this.started = true;
    this.phaseValue = 'countdown';
    this.waveIndex = 0;
    this.completed = 0;
    this.nextEventAt = nowMs + scaledStartDelayMs(WAVES[0], this.difficulty);
  }

  update(nowMs: number, activeOrDyingCount: number): void {
    if (!this.started || this.phaseValue === 'done') return;
    if (this.phaseValue === 'countdown' && nowMs >= this.nextEventAt) this.beginWave(nowMs);
    else if (this.phaseValue === 'spawning' && nowMs >= this.nextEventAt) this.spawnNext(nowMs);
    else if (this.phaseValue === 'clearing' && activeOrDyingCount === 0) this.advanceWave(nowMs);
  }

  private currentDef(): WaveDef { return WAVES[this.waveIndex]; }

  private beginWave(nowMs: number): void {
    const definition = this.currentDef();
    this.spawnQueue = expandWave(definition, this.difficulty);
    this.phaseValue = 'spawning';
    this.nextEventAt = nowMs;
    this.hooks.onWaveStart(definition.wave, this.spawnQueue.length);
  }

  private spawnNext(nowMs: number): void {
    const role = this.spawnQueue.shift();
    if (role === undefined) { this.phaseValue = 'clearing'; return; }
    if (!this.spawnOne(role)) {
      this.spawnQueue.unshift(role);
      this.nextEventAt = nowMs + WAVE_TUNING.SPAWN_RETRY_MS;
      return;
    }
    if (this.spawnQueue.length === 0) {
      this.phaseValue = 'clearing';
      return;
    }
    const interval = scaledSpawnIntervalMs(this.currentDef(), this.difficulty);
    const signedJitter = (this.rng.next() * 2 - 1) * WAVE_TUNING.SPAWN_JITTER;
    this.nextEventAt = nowMs + Math.round(interval * (1 + signedJitter));
  }

  private spawnOne(role: EnemyRole): boolean {
    let point: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < WAVE_TUNING.SPAWN_RANDOM_ATTEMPTS; attempt += 1) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = spawnRadius(WALL.OUTER_RADIUS, this.rng.next());
      const candidate = radialPoint(ARENA.CENTER_X, ARENA.CENTER_Y, angle, radius);
      if (this.hooks.canSpawn(candidate.x, candidate.y)) {
        point = candidate;
        break;
      }
    }
    if (!point) {
      const offset = this.rng.next() * Math.PI * 2;
      const radii = [spawnRadius(WALL.OUTER_RADIUS, 0), spawnRadius(WALL.OUTER_RADIUS, 0.5), spawnRadius(WALL.OUTER_RADIUS, 0.999_999)] as const;
      for (const radius of radii) {
        for (let index = 0; index < WAVE_TUNING.SPAWN_FALLBACK_ANGLES; index += 1) {
          const candidate = radialPoint(
            ARENA.CENTER_X,
            ARENA.CENTER_Y,
            offset + index * Math.PI * 2 / WAVE_TUNING.SPAWN_FALLBACK_ANGLES,
            radius,
          );
          if (!this.hooks.canSpawn(candidate.x, candidate.y)) continue;
          point = candidate;
          break;
        }
        if (point) break;
      }
    }
    if (!point) return false;
    const enemy = createEnemy(this.scene, role, point.x, point.y, {
      spawnDebris: this.hooks.spawnDebris,
      rng: this.rng,
    });
    this.hooks.onSpawn(enemy);
    return true;
  }

  private advanceWave(nowMs: number): void {
    this.completed = this.waveIndex + 1;
    this.waveIndex += 1;
    if (this.waveIndex >= WAVES.length) {
      this.phaseValue = 'done';
      this.hooks.onAllWavesCleared();
      return;
    }
    this.phaseValue = 'countdown';
    this.nextEventAt = nowMs + scaledStartDelayMs(this.currentDef(), this.difficulty);
  }
}
