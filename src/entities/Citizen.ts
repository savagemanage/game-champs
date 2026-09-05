import Phaser from 'phaser';
import { TextureKeys } from '../config/AssetKeys';

/** The central safe zone the citizens cluster in: a 2D disc (center + radius). */
export interface CitizenHome {
  readonly centerX: number;
  readonly centerY: number;
  /** Radius of the wander disc, world px (kept inside the inner ring). */
  readonly radius: number;
}

/**
 * Citizen - a townsperson sheltering at the arena CENTER, inside the inner
 * ring. Citizens wander idly in 2D within a small central disc and FLEE (run
 * away, faster) in 2D from the nearest threat that has breached inward toward
 * them. When a giant reaches a citizen it is eaten: {@link devour} marks it
 * consumed and plays a small pop, and the scene decrements the survivor count.
 *
 * Three coat palette variants live in the citizen spritesheet (frames 0-2);
 * each citizen picks one for visual variety.
 */
export class Citizen extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;

  private readonly home: CitizenHome;
  /** Current wander heading, radians. */
  private wanderAngle = Math.random() * Math.PI * 2;
  private nextDecisionAt = 0;
  private consumed = false;

  private static readonly WANDER_SPEED = 22;
  private static readonly FLEE_SPEED = 70;
  /** Distance at which a citizen notices a threat and flees, px. */
  private static readonly FLEE_RADIUS = 130;

  constructor(scene: Phaser.Scene, x: number, y: number, home: CitizenHome) {
    const variant = Phaser.Math.Between(0, 2);
    super(scene, x, y, TextureKeys.Citizen, variant);
    this.home = home;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.9);
    this.setDepth(4);
    this.body.setAllowGravity(false);
  }

  /** True once this citizen has been eaten and should be removed. */
  get isConsumed(): boolean {
    return this.consumed;
  }

  /**
   * Per-frame behaviour. If a threat is within the flee radius, run directly
   * away from it in 2D; otherwise idle-wander within the central disc. Movement
   * is clamped so citizens never drift outside their home radius.
   *
   * @param threat nearest breached-inward threat position, or null when safe.
   */
  updateCitizen(nowMs: number, dtMs: number, threat: { x: number; y: number } | null): void {
    if (this.consumed) return;

    let vx: number;
    let vy: number;
    if (threat && Phaser.Math.Distance.Between(threat.x, threat.y, this.x, this.y) < Citizen.FLEE_RADIUS) {
      // Flee: head directly away from the threat.
      let ax = this.x - threat.x;
      let ay = this.y - threat.y;
      const len = Math.hypot(ax, ay) || 1;
      ax /= len;
      ay /= len;
      this.wanderAngle = Math.atan2(ay, ax);
      vx = ax * Citizen.FLEE_SPEED;
      vy = ay * Citizen.FLEE_SPEED;
    } else {
      // Idle wander: occasionally pick a new heading.
      if (nowMs >= this.nextDecisionAt) {
        this.nextDecisionAt = nowMs + 800 + Math.random() * 1400;
        if (Math.random() < 0.5) this.wanderAngle = Math.random() * Math.PI * 2;
      }
      vx = Math.cos(this.wanderAngle) * Citizen.WANDER_SPEED;
      vy = Math.sin(this.wanderAngle) * Citizen.WANDER_SPEED;
    }

    // Keep inside the home disc: if pushing past the edge, steer back inward.
    const fromCenter = Phaser.Math.Distance.Between(this.x, this.y, this.home.centerX, this.home.centerY);
    if (fromCenter >= this.home.radius) {
      const inwardX = this.home.centerX - this.x;
      const inwardY = this.home.centerY - this.y;
      const len = Math.hypot(inwardX, inwardY) || 1;
      vx = (inwardX / len) * Citizen.WANDER_SPEED;
      vy = (inwardY / len) * Citizen.WANDER_SPEED;
      this.wanderAngle = Math.atan2(inwardY, inwardX);
    }

    this.body.setVelocity(vx, vy);
    if (Math.abs(vx) > 1) this.setFlipX(vx < 0);
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
