import Phaser from 'phaser';
import { TextureKeys } from '../config/AssetKeys';
import { CITIZEN } from '../config/GameConfig';
import type { RandomSource } from '../systems/DeterministicRng';

export interface CitizenHome { readonly centerX: number; readonly centerY: number; readonly radius: number }

/** Deterministic protected resident movement. */
export class Citizen extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;
  private wanderAngle: number;
  private nextDecisionAt = 0;
  private consumed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly home: CitizenHome,
    private readonly rng: RandomSource,
  ) {
    super(scene, x, y, TextureKeys.Citizen, rng.int(0, 2));
    this.wanderAngle = rng.next() * Math.PI * 2;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.9).setDepth(4);
    this.body.setAllowGravity(false);
  }

  get isConsumed(): boolean { return this.consumed; }

  updateCitizen(nowMs: number, _dtMs: number, threat: { x: number; y: number } | null): void {
    if (this.consumed) return;
    let vx: number;
    let vy: number;
    if (threat && Phaser.Math.Distance.Between(threat.x, threat.y, this.x, this.y) < CITIZEN.FLEE_RADIUS) {
      const length = Math.hypot(this.x - threat.x, this.y - threat.y) || 1;
      vx = ((this.x - threat.x) / length) * CITIZEN.FLEE_SPEED;
      vy = ((this.y - threat.y) / length) * CITIZEN.FLEE_SPEED;
      this.wanderAngle = Math.atan2(vy, vx);
    } else {
      if (nowMs >= this.nextDecisionAt) {
        this.nextDecisionAt = nowMs + CITIZEN.DECISION_MIN_MS + this.rng.next() * CITIZEN.DECISION_SPAN_MS;
        if (this.rng.chance(0.5)) this.wanderAngle = this.rng.next() * Math.PI * 2;
      }
      vx = Math.cos(this.wanderAngle) * CITIZEN.WANDER_SPEED;
      vy = Math.sin(this.wanderAngle) * CITIZEN.WANDER_SPEED;
    }
    if (Phaser.Math.Distance.Between(this.x, this.y, this.home.centerX, this.home.centerY) >= this.home.radius) {
      const length = Math.hypot(this.home.centerX - this.x, this.home.centerY - this.y) || 1;
      vx = ((this.home.centerX - this.x) / length) * CITIZEN.WANDER_SPEED;
      vy = ((this.home.centerY - this.y) / length) * CITIZEN.WANDER_SPEED;
      this.wanderAngle = Math.atan2(vy, vx);
    }
    this.body.setVelocity(vx, vy);
    if (Math.abs(vx) > 1) this.setFlipX(vx < 0);
  }

  devour(): void {
    if (this.consumed) return;
    this.consumed = true;
    this.body.enable = false;
    const reducedMotion = typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'on';
    if (reducedMotion) {
      this.setAlpha(0);
      this.scene.time.delayedCall(80, () => this.destroy());
    } else {
      this.scene.tweens.add({ targets: this, alpha: 0, scaleY: 0.4, duration: 160, onComplete: () => this.destroy() });
    }
  }
}
