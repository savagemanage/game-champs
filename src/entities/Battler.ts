import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { TextureKeys, AudioKeys, TROOP_TEXTURE_BY_KIND, type TextureKey } from '../config/AssetKeys';
import { troopDef, ENEMY_DEFS } from '../config/TroopConfig';
import { AudioManager } from '../systems/AudioManager';
import type { EnemyKind, TroopKind, UnitStats } from '../types';

/** Which side of the field a battler fights for. */
export type Side = 'friendly' | 'enemy';

/** Texture key for each enemy kind (mirrors the sprite registry). */
const ENEMY_TEXTURE_BY_KIND: Record<EnemyKind, TextureKey> = {
  raider: TextureKeys.EnemyRaider,
  brute: TextureKeys.EnemyBrute,
  ram: TextureKeys.EnemyRam,
};

/**
 * Battler - one animated combatant sprite (a troop or a raider) on the battle
 * field, with a small floating HP bar.
 *
 * A Battler is PURELY a visualization: it holds a display `hp` for its bar and
 * plays march / attack / hit / death animations, but the battle's OUTCOME is
 * owned entirely by CombatSystem (surfaced to the scene as a casualty
 * timeline). The scene spawns one Battler per living unit, marches the two
 * lines toward each other, and calls {@link Battler.fall} on the units the
 * timeline kills so the counts on screen always end on the deterministic
 * resolution. Death spawns spark/dust FX and plays the hit SFX.
 */
export class Battler {
  readonly side: Side;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly stats: UnitStats;

  private readonly scene: Phaser.Scene;
  private readonly hpBg: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private dead = false;
  private attackTween?: Phaser.Tweens.Tween;

  private static readonly BAR_W = 20;
  private static readonly BAR_H = 3;

  constructor(scene: Phaser.Scene, side: Side, kind: TroopKind | EnemyKind, x: number, y: number) {
    this.scene = scene;
    this.side = side;

    const isFriendly = side === 'friendly';
    const tex = isFriendly
      ? TROOP_TEXTURE_BY_KIND[kind as TroopKind]
      : ENEMY_TEXTURE_BY_KIND[kind as EnemyKind];
    this.stats = isFriendly ? troopDef(kind as TroopKind).stats : ENEMY_DEFS[kind as EnemyKind];

    this.sprite = scene.add.sprite(x, y, tex, 0).setOrigin(0.5, 1);
    // Enemies face left (toward the player's line); friendlies face right.
    this.sprite.setFlipX(!isFriendly);
    this.sprite.setDepth(y);

    // Floating HP bar just above the sprite head.
    const barY = y - this.sprite.displayHeight - 4;
    this.hpBg = scene.add
      .rectangle(x, barY, Battler.BAR_W, Battler.BAR_H, PALETTE.STONE_DARK)
      .setOrigin(0.5)
      .setDepth(y + 1);
    this.hpFill = scene.add
      .rectangle(x - Battler.BAR_W / 2, barY, Battler.BAR_W, Battler.BAR_H, isFriendly ? PALETTE.BANNER_FRIENDLY : PALETTE.BANNER_ENEMY)
      .setOrigin(0, 0.5)
      .setDepth(y + 2);
  }

  /** Whether this battler has been killed/removed. */
  get isDead(): boolean {
    return this.dead;
  }

  /** Current x position of the sprite (for aiming FX). */
  get x(): number {
    return this.sprite.x;
  }

  /** Current y position of the sprite. */
  get y(): number {
    return this.sprite.y;
  }

  /**
   * March this battler toward a target x over `durationMs`, keeping its HP bar
   * pinned above it. Returns the tween so callers can chain/await it.
   */
  march(targetX: number, durationMs: number): Phaser.Tweens.Tween {
    return this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      duration: durationMs,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.syncBar(),
    });
  }

  /**
   * Play a short lunge toward the enemy line to read as an attack, then settle
   * back. Cosmetic only. Idempotent while a lunge is in flight.
   */
  attack(): void {
    if (this.dead) return;
    const dir = this.side === 'friendly' ? 1 : -1;
    this.attackTween?.stop();
    this.attackTween = this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + dir * 6,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onUpdate: () => this.syncBar(),
    });
  }

  /**
   * Reduce the DISPLAY hp to `ratio` of max (0..1). Purely visual; drives the
   * shrinking HP bar as the fight wears the unit down.
   */
  setHpRatio(ratio: number): void {
    if (this.dead) return;
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    this.hpFill.width = Math.max(0, Math.floor(Battler.BAR_W * clamped));
    if (clamped < 0.35) this.hpFill.setFillStyle(PALETTE.DANGER);
  }

  /**
   * Kill this battler: spawn a spark + dust burst at its position, play the hit
   * SFX, fade/topple the sprite out, and remove the HP bar. Safe to call once;
   * repeat calls no-op.
   */
  fall(): void {
    if (this.dead) return;
    this.dead = true;

    this.spawnDeathFx();
    AudioManager.get(this.scene).playSfx(AudioKeys.BattleHit, 0.5);

    this.hpBg.destroy();
    this.hpFill.destroy();
    this.attackTween?.stop();

    const dir = this.side === 'friendly' ? -1 : 1;
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      angle: dir * 70,
      y: this.sprite.y + 6,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => this.sprite.destroy(),
    });
  }

  /** Tear the battler down immediately (scene shutdown / skip). */
  destroy(): void {
    this.attackTween?.stop();
    this.sprite.destroy();
    if (!this.dead) {
      this.hpBg.destroy();
      this.hpFill.destroy();
    }
    this.dead = true;
  }

  private syncBar(): void {
    const barY = this.sprite.y - this.sprite.displayHeight - 4;
    this.hpBg.setPosition(this.sprite.x, barY);
    this.hpFill.setPosition(this.sprite.x - Battler.BAR_W / 2, barY);
  }

  private spawnDeathFx(): void {
    const x = this.sprite.x;
    const y = this.sprite.y - this.sprite.displayHeight * 0.5;

    const spark = this.scene.add.sprite(x, y, TextureKeys.FxSpark, 0).setDepth(this.sprite.depth + 5);
    this.scene.tweens.add({
      targets: spark,
      scale: { from: 1, to: 2.2 },
      alpha: { from: 1, to: 0 },
      duration: 240,
      onComplete: () => spark.destroy(),
    });

    const dust = this.scene.add
      .sprite(x, this.sprite.y, TextureKeys.FxDust, 0)
      .setDepth(this.sprite.depth + 4)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: dust,
      scale: { from: 0.8, to: 1.8 },
      alpha: { from: 0.9, to: 0 },
      y: dust.y - 8,
      duration: 360,
      onComplete: () => dust.destroy(),
    });
  }
}
