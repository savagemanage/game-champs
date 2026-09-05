import Phaser from 'phaser';
import { TextureKeys } from '../config/AssetKeys';

/** Bounds (world x range + ground y) of the settlement the citizens roam. */
export interface CitizenHome {
  readonly minX: number;
  readonly maxX: number;
  readonly groundY: number;
}

/**
 * Citizen - a townsperson inside the walls the player defends. Citizens wander
 * idly within the settlement and FLEE (run away, faster) when a giant is near.
 * When a giant reaches a citizen it is eaten: {@link devour} marks it consumed
 * and plays a small pop, and the scene decrements the survivor count.
 *
 * Three coat palette variants live in the citizen spritesheet (frames 0-2);
 * each citizen picks one for visual variety.
 */
export class Citizen extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;

  private readonly home: CitizenHome;
  private wanderDir: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
  private nextDecisionAt = 0;
  private consumed = false;

  private static readonly WANDER_SPEED = 22;
  private static readonly FLEE_SPEED = 64;
  /** Distance at which a citizen notices a threat and flees, px. */
  private static readonly FLEE_RADIUS = 120;

  constructor(scene: Phaser.Scene, x: number, home: CitizenHome) {
    const variant = Phaser.Math.Between(0, 2);
    super(scene, x, home.groundY, TextureKeys.Citizen, variant);
    this.home = home;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(4);
    this.body.setAllowGravity(false);
    this.setFlipX(this.wanderDir < 0);
  }

  /** True once this citizen has been eaten and should be removed. */
  get isConsumed(): boolean {
    return this.consumed;
  }

  /**
   * Per-frame behaviour. If any threat is within the flee radius, run away from
   * the nearest one; otherwise idle-wander within the settlement bounds.
   */
  updateCitizen(nowMs: number, dtMs: number, nearestThreatX: number | null): void {
    if (this.consumed) return;
    this.y = this.home.groundY;

    if (nearestThreatX !== null && Math.abs(nearestThreatX - this.x) < Citizen.FLEE_RADIUS) {
      // Flee away from the threat, clamped to the settlement.
      const away: 1 | -1 = this.x >= nearestThreatX ? 1 : -1;
      this.wanderDir = away;
      this.body.setVelocityX(away * Citizen.FLEE_SPEED);
    } else {
      // Idle wander: occasionally flip direction.
      if (nowMs >= this.nextDecisionAt) {
        this.nextDecisionAt = nowMs + 800 + Math.random() * 1400;
        if (Math.random() < 0.4) this.wanderDir = (-this.wanderDir) as 1 | -1;
      }
      this.body.setVelocityX(this.wanderDir * Citizen.WANDER_SPEED);
    }

    // Keep inside the settlement; bounce off the edges.
    if (this.x <= this.home.minX) {
      this.x = this.home.minX;
      this.wanderDir = 1;
    } else if (this.x >= this.home.maxX) {
      this.x = this.home.maxX;
      this.wanderDir = -1;
    }
    this.setFlipX(this.body.velocity.x < 0);
    void dtMs;
  }

  /** Mark this citizen eaten; a quick shrink pop then destroy. */
  devour(): void {
    if (this.consumed) return;
    this.consumed = true;
    this.body.enable = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleY: 0.4,
      duration: 160,
      onComplete: () => this.destroy(),
    });
  }
}
