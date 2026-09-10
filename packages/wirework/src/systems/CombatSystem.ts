import Phaser from 'phaser';
import { AudioKeys, type AudioKey, TextureKeys } from '../config/AssetKeys';
import { SLASH } from '../config/PlayerConfig';
import { AudioManager } from './AudioManager';
import { prefersReducedMotion } from './Persistence';
import { isRearNodeHit, makeSlashShape, slashIntersectsAabb, slashIntersectsCircle, type SlashShape } from './SiegeGeometry';
import type { Player } from '../entities/Player';
import type { Enemy, HitResult } from '../entities/enemies';

export interface CombatHooks {
  readonly onDamage: (result: HitResult, enemy: Enemy) => void;
  readonly onKill: (enemy: Enemy, score: number) => void;
}

/** Arc cutter using one authoritative closed oriented rectangle for visual, body, node, and cue. */
export class CombatSystem {
  private enemies: Enemy[] = [];
  private slashReadyAt = 0;
  private hitStopRemainingMs = 0;
  private lastAimX = 0;
  private lastAimY = -1;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly coolant: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly audio: AudioManager;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly hooks: CombatHooks,
  ) {
    this.audio = AudioManager.get(scene);
    this.sparks = scene.add.particles(0, 0, TextureKeys.FxSpark, {
      lifespan: 260, speed: { min: 40, max: 140 }, scale: { start: 1, end: 0 }, quantity: 8, emitting: false,
    }).setDepth(9);
    this.coolant = scene.add.particles(0, 0, TextureKeys.FxCoolant, {
      lifespan: 520, speed: { min: 10, max: 50 }, scale: { start: 1, end: 0 },
      alpha: { start: 0.9, end: 0 }, quantity: 12, emitting: false,
    }).setDepth(9);
  }

  setEnemies(enemies: Enemy[]): void { this.enemies = enemies; }
  canSlash(nowMs: number): boolean { return nowMs >= this.slashReadyAt; }
  consumeHitStop(dtMs: number): boolean {
    if (this.hitStopRemainingMs <= 0) return false;
    this.hitStopRemainingMs = Math.max(0, this.hitStopRemainingMs - dtMs);
    return true;
  }

  private shape(aimX: number, aimY: number): SlashShape {
    const shape = makeSlashShape(
      this.player.x, this.player.y, aimX, aimY, this.lastAimX, this.lastAimY, SLASH.REACH, SLASH.HALF_WIDTH,
    );
    this.lastAimX = shape.forwardX;
    this.lastAimY = shape.forwardY;
    return shape;
  }

  /** Exact predicate also consumed by the HUD hot cue without mutating attack aim state. */
  canCritical(enemy: Enemy, aimX: number, aimY: number): boolean {
    const shape = makeSlashShape(
      this.player.x,
      this.player.y,
      aimX,
      aimY,
      this.lastAimX,
      this.lastAimY,
      SLASH.REACH,
      SLASH.HALF_WIDTH,
    );
    const node = enemy.getCoolingNodeWorld();
    return slashIntersectsCircle(shape, node.x, node.y, enemy.getNodeRadius()) &&
      isRearNodeHit(this.player.x, this.player.y, enemy.x, enemy.y, enemy.facing.x, enemy.facing.y);
  }

  slash(aimX: number, aimY: number, nowMs: number): number {
    if (!this.canSlash(nowMs)) return 0;
    this.slashReadyAt = nowMs + SLASH.COOLDOWN_MS;
    const shape = this.shape(aimX, aimY);
    this.player.playSlash();
    this.spawnSlashVisual(shape);
    this.playSound(AudioKeys.Slash, 0.5);
    let hits = 0;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDying) continue;
      const bodyHit = slashIntersectsAabb(shape, enemy.getBodyAabb());
      const node = enemy.getCoolingNodeWorld();
      const nodeHit = slashIntersectsCircle(shape, node.x, node.y, enemy.getNodeRadius()) &&
        isRearNodeHit(this.player.x, this.player.y, enemy.x, enemy.y, enemy.facing.x, enemy.facing.y);
      if (!bodyHit && !nodeHit) continue;
      const result = enemy.applyHit(SLASH.DAMAGE, this.player.x, this.player.y, nodeHit, nowMs);
      if (result.blocked) this.armorClang(enemy.x, enemy.y, result, enemy);
      else this.onSolidHit(result, enemy, nodeHit ? node.x : enemy.x, nodeHit ? node.y : enemy.y);
      hits += 1;
    }
    return hits;
  }

  private onSolidHit(result: HitResult, enemy: Enemy, x: number, y: number): void {
    this.sparks.emitParticleAt(x, y, result.crit ? 14 : 8);
    this.playSound(AudioKeys.Hit, result.crit ? 0.75 : 0.5);
    if (result.killed) {
      this.hitStop(SLASH.HIT_STOP_KILL_MS);
      this.shake(220, 0.012);
      this.coolant.emitParticleAt(enemy.x, enemy.y, 16);
      this.playSound(AudioKeys.MachineShutdown, 0.7);
      this.hooks.onKill(enemy, enemy.stats.scoreValue);
    } else if (result.crit) {
      this.hitStop(SLASH.HIT_STOP_CRITICAL_MS);
      this.shake(140, 0.008);
    } else {
      this.hitStop(SLASH.HIT_STOP_NORMAL_MS);
      this.shake(90, 0.004);
    }
    this.hooks.onDamage(result, enemy);
  }

  private armorClang(x: number, y: number, result: HitResult, enemy: Enemy): void {
    this.sparks.emitParticleAt(x, y, 6);
    this.hitStop(SLASH.HIT_STOP_NORMAL_MS);
    this.shake(60, 0.003);
    this.playSound(AudioKeys.Hit, 0.3);
    this.hooks.onDamage(result, enemy);
  }

  private spawnSlashVisual(shape: SlashShape): void {
    const rightX = -shape.forwardY * shape.halfWidth;
    const rightY = shape.forwardX * shape.halfWidth;
    const endX = shape.originX + shape.forwardX * shape.reach;
    const endY = shape.originY + shape.forwardY * shape.reach;
    const graphics = this.scene.add.graphics().setDepth(9);
    graphics.fillStyle(0xdff8ff, 0.48);
    graphics.fillPoints([
      new Phaser.Geom.Point(shape.originX + rightX, shape.originY + rightY),
      new Phaser.Geom.Point(endX + rightX, endY + rightY),
      new Phaser.Geom.Point(endX - rightX, endY - rightY),
      new Phaser.Geom.Point(shape.originX - rightX, shape.originY - rightY),
    ], true);
    this.scene.time.delayedCall(SLASH.VISUAL_MS, () => graphics.destroy());
  }

  private hitStop(durationMs: number): void {
    this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, durationMs);
  }

  private shake(durationMs: number, intensity: number): void {
    if (!prefersReducedMotion(this.audio.getSettings())) this.scene.cameras.main.shake(durationMs, intensity);
  }

  private playSound(key: AudioKey, volume: number): void { this.audio.playSfx(key, volume); }
  destroy(): void { this.sparks.destroy(); this.coolant.destroy(); }
}
