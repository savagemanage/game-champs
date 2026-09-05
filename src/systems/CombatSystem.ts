import Phaser from 'phaser';
import { AudioKeys, type AudioKey, TextureKeys } from '../config/AssetKeys';
import { PLAYER } from '../config/GameConfig';
import { AudioManager } from './AudioManager';
import type { Player } from '../entities/Player';
import type { Enemy, HitResult } from '../entities/enemies';

/** Callbacks the CombatSystem raises so the scene can update score/HUD. */
export interface CombatHooks {
  /** Called with score to add and the killed enemy (null for a non-kill hit). */
  readonly onDamage: (result: HitResult, enemy: Enemy) => void;
  /** Called when a giant is killed, with its score value. */
  readonly onKill: (enemy: Enemy, score: number) => void;
}

/**
 * CombatSystem - the player's blade combat and its game-feel.
 *
 * On attack the player performs an aimed slash: a short-lived arc hitbox in the
 * facing/aim direction. Any giant overlapping the arc takes HP damage; if the
 * slash lands within the giant's nape hitbox it is a CRITICAL (big bonus), and
 * Armored giants shrug off frontal body hits (handled in Enemy.applyHit).
 *
 * Game feel ("juice") on every solid hit: a slash FX sprite, a spark/blood
 * particle burst, a brief HIT-STOP (time scale dip) and screen shake scaled to
 * whether the hit was a crit, plus layered slash/hit SFX. Kills add a steam
 * burst and the enemy's death animation (owned by the enemy).
 */
export class CombatSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly hooks: CombatHooks;

  /** Live enemy list the scene keeps in sync via {@link setEnemies}. */
  private enemies: Enemy[] = [];

  private slashReadyAt = 0;
  private hitStopUntil = 0;
  /**
   * Monotonic token identifying the CURRENT hit-stop window. Every hitStop()
   * call bumps this and captures it in its restore timer; a timer only restores
   * the world if its token is still the latest, so stale (shorter) timers from
   * an earlier stacked hit can't snap the freeze back before the window ends.
   */
  private hitStopToken = 0;

  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly steam: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly audio: AudioManager;

  /** Cooldown between slashes, ms. */
  private static readonly SLASH_COOLDOWN_MS = 300;
  /** Slash reach forward from the player centre, px. */
  private static readonly SLASH_REACH = PLAYER.BLADE_RANGE;
  /** Half-height of the slash arc, px. */
  private static readonly SLASH_HALF_H = 22;

  constructor(scene: Phaser.Scene, player: Player, hooks: CombatHooks) {
    this.scene = scene;
    this.player = player;
    this.hooks = hooks;
    this.audio = AudioManager.get(scene);

    // Particle emitters (created stopped; we burst on demand).
    this.sparks = scene.add.particles(0, 0, TextureKeys.FxSpark, {
      lifespan: 260,
      speed: { min: 40, max: 140 },
      scale: { start: 1, end: 0 },
      quantity: 8,
      emitting: false,
    });
    this.sparks.setDepth(9);

    this.steam = scene.add.particles(0, 0, TextureKeys.FxSteam, {
      lifespan: 520,
      speed: { min: 10, max: 50 },
      angle: { min: 250, max: 290 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      quantity: 12,
      emitting: false,
    });
    this.steam.setDepth(9);
  }

  /** Refresh the set of targetable giants (scene calls this each frame). */
  setEnemies(enemies: Enemy[]): void {
    this.enemies = enemies;
  }

  /** Whether a slash can currently be fired. */
  canSlash(nowMs: number): boolean {
    return nowMs >= this.slashReadyAt;
  }

  /**
   * Approximate distance from the player at which a slash can still connect
   * with a nape. Used by the HUD weak-point cue to decide when to go "hot".
   */
  get napeStrikeRange(): number {
    return CombatSystem.SLASH_REACH + CombatSystem.SLASH_HALF_H;
  }

  /** True while the brief hit-stop window is active (scene may gate input). */
  isHitStopped(nowMs: number): boolean {
    return nowMs < this.hitStopUntil;
  }

  /**
   * Perform an aimed slash toward (aimX, aimY). Builds a small arc rectangle in
   * front of the player, tests every live giant for overlap + nape, applies
   * damage, and fires the juice. Returns the number of giants hit.
   */
  slash(aimX: number, aimY: number, nowMs: number): number {
    if (!this.canSlash(nowMs)) return 0;
    this.slashReadyAt = nowMs + CombatSystem.SLASH_COOLDOWN_MS;

    // Aim direction: prefer the pointer, fall back to facing.
    let dx = aimX - this.player.x;
    let dy = aimY - this.player.y;
    if (Math.hypot(dx, dy) < 4) {
      dx = this.player.facingDir;
      dy = 0;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    // Slash contact point a little in front of the player.
    const reach = CombatSystem.SLASH_REACH;
    const cxp = this.player.x + nx * reach * 0.6;
    const cyp = this.player.y + ny * reach * 0.6;

    this.player.playSlash();
    this.spawnSlashFx(cxp, cyp, Math.atan2(ny, nx));
    this.playSound(AudioKeys.Slash, 0.5);

    // Test giants: overlap a circle of radius = reach around the contact point.
    let hits = 0;
    for (const enemy of this.enemies) {
      if (enemy.isDying) continue;
      const b = enemy.body;
      if (!b) continue;
      // Closest point on the enemy's AABB to the slash contact point.
      const ex = Phaser.Math.Clamp(cxp, b.left, b.right);
      const ey = Phaser.Math.Clamp(cyp, b.top, b.bottom);
      const dist = Phaser.Math.Distance.Between(cxp, cyp, ex, ey);
      if (dist > reach + CombatSystem.SLASH_HALF_H) continue;

      // Nape check: did the slash contact land within the nape hitbox?
      const nape = enemy.getNapeWorld();
      const napeDist = Phaser.Math.Distance.Between(cxp, cyp, nape.x, nape.y);
      const onNape = napeDist <= enemy.getNapeRadius() + reach * 0.4;

      const result = enemy.applyHit(PLAYER.BLADE_DAMAGE, cxp, cyp, onNape);
      if (result.damage <= 0 && result.blocked) {
        // Armor fully absorbed: a clang, no blood.
        this.armorClang(cxp, cyp);
        hits += 1;
        continue;
      }
      this.onSolidHit(result, enemy, cxp, cyp);
      hits += 1;
    }
    return hits;
  }

  /** Apply juice + score for a hit that dealt damage (crit or normal). */
  private onSolidHit(result: HitResult, enemy: Enemy, x: number, y: number): void {
    // Spark/blood burst.
    this.sparks.emitParticleAt(x, y, result.crit ? 14 : 8);
    this.playSound(AudioKeys.Hit, result.crit ? 0.75 : 0.5);

    // Hit-stop + screen shake, stronger on a crit or a kill.
    const cam = this.scene.cameras.main;
    if (result.killed) {
      this.hitStop(90, nowSafe(this.scene));
      cam.shake(220, 0.012);
      this.steam.emitParticleAt(enemy.x, enemy.y - enemy.displayHeight * 0.5, 16);
      this.playSound(AudioKeys.EnemyDeath, 0.7);
      this.hooks.onKill(enemy, enemy.stats.scoreValue);
    } else if (result.crit) {
      this.hitStop(60, nowSafe(this.scene));
      cam.shake(140, 0.008);
    } else {
      this.hitStop(35, nowSafe(this.scene));
      cam.shake(90, 0.004);
    }

    this.hooks.onDamage(result, enemy);
  }

  /** A frontal-armor clang: small spark, tiny shake, no damage. */
  private armorClang(x: number, y: number): void {
    this.sparks.emitParticleAt(x, y, 4);
    this.scene.cameras.main.shake(60, 0.003);
    this.playSound(AudioKeys.Hit, 0.3);
  }

  /** Spawn a one-shot slash arc sprite oriented along the swing. */
  private spawnSlashFx(x: number, y: number, angle: number): void {
    if (!this.scene.textures.exists(TextureKeys.FxSlash)) return;
    const fx = this.scene.add.sprite(x, y, TextureKeys.FxSlash, 0);
    fx.setDepth(9);
    fx.setRotation(angle);
    fx.setFlipX(this.player.facingDir < 0);
    const key = 'fx_slash_play';
    if (!this.scene.anims.exists(key)) {
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers(TextureKeys.FxSlash, { start: 0, end: 3 }),
        frameRate: 30,
        repeat: 0,
      });
    }
    fx.play(key);
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
  }

  /**
   * Briefly slow physics for weighty impact, then restore. We slow only the
   * arcade physics world (giants/projectiles freeze for a beat) and NOT the
   * tween system, so death/hit animations keep playing through the hit-stop.
   * Arcade's world.timeScale is inverse: larger = slower.
   */
  private hitStop(durationMs: number, nowMs: number): void {
    // Extend the freeze window to cover the later of the two hits.
    this.hitStopUntil = Math.max(this.hitStopUntil, nowMs + durationMs);
    this.scene.physics.world.timeScale = 5;

    // Tag this restore with a fresh token; only the newest window may restore.
    // A stacked second hit bumps the token, so the earlier (shorter) timer that
    // fires first sees a stale token and does nothing, leaving the freeze on
    // until the extended window truly ends.
    this.hitStopToken += 1;
    const token = this.hitStopToken;
    const restoreDelay = this.hitStopUntil - nowMs;
    this.scene.time.delayedCall(restoreDelay, () => {
      if (token !== this.hitStopToken) return;
      this.scene.physics.world.timeScale = 1;
    });
  }

  private playSound(key: AudioKey, volume: number): void {
    this.audio.playSfx(key, volume);
  }

  /** Release particle resources. */
  destroy(): void {
    this.sparks.destroy();
    this.steam.destroy();
  }
}

/** Safe accessor for scene time.now (kept tiny for readability above). */
function nowSafe(scene: Phaser.Scene): number {
  return scene.time.now;
}
