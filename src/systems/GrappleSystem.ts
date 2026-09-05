import Phaser from 'phaser';
import { AudioKeys, type AudioKey } from '../config/AssetKeys';
import { GAS, GRAPPLE } from '../config/PlayerConfig';
import { AudioManager } from './AudioManager';
import type { Player } from '../entities/Player';
import type { GasSystem } from './GasSystem';

/** A surface the grapple can attach to (walls, terrain, large enemy bodies). */
export interface GrappleSurface {
  /** Axis-aligned world-space rectangle describing the attachable surface. */
  readonly bounds: Phaser.Geom.Rectangle;
}

/** Lifecycle phase of the wire. */
const enum WirePhase {
  Idle = 0,
  /** Hook is flying from the muzzle toward the target point. */
  Firing = 1,
  /** Hook is anchored; player swings / reels. */
  Attached = 2,
}

/** Reel intent passed in each frame. */
export interface GrappleInput {
  /** True while the fire button is held (keeps the wire attached). */
  fireHeld: boolean;
  /** World-space cursor position used to aim a new shot. */
  aimX: number;
  aimY: number;
  reelIn: boolean;
  reelOut: boolean;
}

/**
 * GrappleSystem - the mouse-aimed ODM wire and its swing physics.
 *
 * ## Momentum model
 * The wire is treated as a **taut rope** and the player as a bob on a
 * **pendulum**. Each frame while attached we:
 *   1. Integrate normal physics (gravity + air control run in Player).
 *   2. If the player is at/beyond the current rope length, apply a
 *      *position-based distance constraint*: snap the position back onto the
 *      rope circle and remove the velocity component ALONG the rope (radial),
 *      keeping only the component PERPENDICULAR to it (tangential). That
 *      projection is what conserves swing momentum and produces a believable
 *      pendulum arc - energy is preserved across the bottom of the swing and
 *      converted back to height on the way up.
 *   3. Add a small constant pull toward the anchor (PULL_ACCEL) so the player
 *      can "pump" the swing and climb, and apply light tangential damping.
 * Releasing simply stops constraining, so the player flies off along the
 * tangent with the velocity they had built up (conserved fling).
 *
 * A shot can be re-fired at any time (re-grapple) for continuous traversal.
 */
export class GrappleSystem {
  private readonly player: Player;
  private readonly gas: GasSystem;
  private readonly wire: Phaser.GameObjects.Graphics;
  private readonly audio: AudioManager;

  private phase: WirePhase = WirePhase.Idle;
  /** World-space anchor point once attached. */
  private anchor = new Phaser.Math.Vector2();
  /** Hook projectile position while firing. */
  private hookPos = new Phaser.Math.Vector2();
  /** Hook flight direction (unit). */
  private hookDir = new Phaser.Math.Vector2();
  /** Distance the hook still needs to travel while firing. */
  private hookRemaining = 0;
  /** Current enforced rope length (shrinks/grows with reeling). */
  private ropeLength = 0;

  private surfaces: GrappleSurface[] = [];

  constructor(scene: Phaser.Scene, player: Player, gas: GasSystem) {
    this.player = player;
    this.gas = gas;
    this.audio = AudioManager.get(scene);
    this.wire = scene.add.graphics();
    this.wire.setDepth(5);
  }

  /** Provide/refresh the set of attachable surfaces (walls, terrain, enemies). */
  setSurfaces(surfaces: GrappleSurface[]): void {
    this.surfaces = surfaces;
  }

  /** True when a wire is currently anchored and swinging. */
  get isAttached(): boolean {
    return this.phase === WirePhase.Attached;
  }

  /** True when the hook is in flight or attached (a shot is live). */
  get isActive(): boolean {
    return this.phase !== WirePhase.Idle;
  }

  /**
   * Attempt to fire a new grapple toward the aim point. Returns true if a shot
   * was launched (a valid surface within range was found and gas paid).
   * Re-grapple: any live wire is replaced by the new shot.
   */
  fire(aimX: number, aimY: number, nowMs: number): boolean {
    const originX = this.player.x;
    const originY = this.player.y;
    const target = this.raycast(originX, originY, aimX, aimY);
    if (!target) return false;
    if (!this.gas.spend(GAS.COST_GRAPPLE_FIRE, nowMs)) return false;

    // Launch the hook projectile toward the resolved anchor point.
    this.phase = WirePhase.Firing;
    this.anchor.set(target.x, target.y);
    this.hookPos.set(originX, originY);
    const dx = target.x - originX;
    const dy = target.y - originY;
    const dist = Math.hypot(dx, dy) || 1;
    this.hookDir.set(dx / dist, dy / dist);
    this.hookRemaining = dist;
    this.player.swinging = false;
    this.playSound(AudioKeys.GrappleFire);
    return true;
  }

  /** Release the wire; the player keeps their built-up velocity (fling). */
  release(): void {
    if (this.phase === WirePhase.Idle) return;
    if (this.phase === WirePhase.Attached) {
      const body = this.player.body;
      body.velocity.x *= GRAPPLE.RELEASE_VELOCITY_KEEP;
      body.velocity.y = body.velocity.y * GRAPPLE.RELEASE_VELOCITY_KEEP - GRAPPLE.RELEASE_UP_BOOST;
    }
    this.phase = WirePhase.Idle;
    this.player.swinging = false;
    this.wire.clear();
  }

  /**
   * Per-frame update. Handles hook travel, the pendulum constraint, reeling,
   * gas drain, and wire rendering.
   */
  update(input: GrappleInput, dtMs: number, nowMs: number): void {
    const dt = dtMs / 1000;

    if (this.phase === WirePhase.Firing) {
      this.advanceHook(dt);
    }

    if (this.phase === WirePhase.Attached) {
      // Releasing the fire button lets go.
      if (!input.fireHeld) {
        this.release();
      } else {
        this.applySwingPhysics(input, dt, dtMs, nowMs);
      }
    }

    this.render();
  }

  /** Move the hook projectile; on arrival, anchor and begin swinging. */
  private advanceHook(dt: number): void {
    const step = GRAPPLE.HOOK_TRAVEL_SPEED * dt;
    this.hookRemaining -= step;
    this.hookPos.x += this.hookDir.x * step;
    this.hookPos.y += this.hookDir.y * step;
    if (this.hookRemaining <= 0) {
      this.hookPos.set(this.anchor.x, this.anchor.y);
      this.phase = WirePhase.Attached;
      this.player.swinging = true;
      // Initialize rope length to the current player->anchor distance, clamped.
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.anchor.x, this.anchor.y);
      this.ropeLength = Phaser.Math.Clamp(d, GRAPPLE.MIN_LENGTH, GRAPPLE.MAX_LENGTH);
      this.playSound(AudioKeys.WireAttach);
    }
  }

  /**
   * The pendulum constraint + reeling + gas. See the class docblock for the
   * momentum model.
   */
  private applySwingPhysics(input: GrappleInput, dt: number, dtMs: number, nowMs: number): void {
    const body = this.player.body;

    // Passive swing tension always sips a little gas; if it runs dry, detach.
    if (this.gas.isEmpty) {
      this.release();
      return;
    }
    this.gas.drain(GAS.COST_SWING_PER_SEC, dtMs, nowMs);

    // --- reeling: change the enforced rope length ---
    if (input.reelIn && !this.gas.isEmpty) {
      if (this.gas.drain(GAS.COST_REEL_PER_SEC, dtMs, nowMs) > 0) {
        this.ropeLength = Math.max(GRAPPLE.MIN_LENGTH, this.ropeLength - GRAPPLE.REEL_IN_SPEED * dt);
        this.maybeWhoosh(nowMs);
      }
    } else if (input.reelOut) {
      if (this.gas.drain(GAS.COST_REEL_PER_SEC, dtMs, nowMs) > 0) {
        this.ropeLength = Math.min(GRAPPLE.MAX_LENGTH, this.ropeLength + GRAPPLE.REEL_OUT_SPEED * dt);
      }
    }

    // Vector from anchor to player.
    let rx = this.player.x - this.anchor.x;
    let ry = this.player.y - this.anchor.y;
    let dist = Math.hypot(rx, ry) || 0.0001;

    // Constant pull toward the anchor gives the swing "pump" energy + climb.
    const pull = GRAPPLE.PULL_ACCEL * dt;
    body.velocity.x -= (rx / dist) * pull;
    body.velocity.y -= (ry / dist) * pull;

    // --- position-based distance constraint (taut rope) ---
    if (dist > this.ropeLength) {
      const nx = rx / dist;
      const ny = ry / dist;

      // 1) Snap position back onto the rope circle (stiffness-scaled).
      const correction = (dist - this.ropeLength) * GRAPPLE.CONSTRAINT_STIFFNESS;
      this.player.x -= nx * correction;
      this.player.y -= ny * correction;

      // 2) Remove the radial (along-rope) velocity component, keep tangential.
      //    v_radial = (v . n) n ; keep v - v_radial. This conserves the
      //    tangential momentum that makes the pendulum swing believably.
      const vDotN = body.velocity.x * nx + body.velocity.y * ny;
      if (vDotN > 0) {
        // Only cancel outward radial motion (rope cannot push, only pull).
        body.velocity.x -= vDotN * nx;
        body.velocity.y -= vDotN * ny;
      }

      // Recompute after correction for damping below.
      rx = this.player.x - this.anchor.x;
      ry = this.player.y - this.anchor.y;
      dist = Math.hypot(rx, ry) || 0.0001;
    }

    // 3) Light tangential damping so swings eventually settle.
    if (GRAPPLE.SWING_DAMPING > 0) {
      const damp = Math.max(0, 1 - GRAPPLE.SWING_DAMPING * dt);
      const nx = rx / dist;
      const ny = ry / dist;
      const vDotN = body.velocity.x * nx + body.velocity.y * ny;
      const radialX = vDotN * nx;
      const radialY = vDotN * ny;
      const tanX = (body.velocity.x - radialX) * damp;
      const tanY = (body.velocity.y - radialY) * damp;
      body.velocity.x = radialX + tanX;
      body.velocity.y = radialY + tanY;
    }
  }

  /**
   * Raycast from origin toward the aim point and return the first attachable
   * surface intersection within {@link GRAPPLE.RANGE}. Returns null if the aim
   * hits nothing valid in range.
   */
  private raycast(originX: number, originY: number, aimX: number, aimY: number): Phaser.Math.Vector2 | null {
    const dx = aimX - originX;
    const dy = aimY - originY;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const nx = dx / len;
    const ny = dy / len;
    const reach = Math.min(GRAPPLE.RANGE, len + GRAPPLE.RANGE);

    // Cast a ray and test each attachable AABB surface for the nearest edge
    // crossing. Simple and robust for a handful of surfaces at this scale.
    const ray = new Phaser.Geom.Line(originX, originY, originX + nx * reach, originY + ny * reach);
    let best: Phaser.Math.Vector2 | null = null;
    let bestDist = Infinity;

    for (const surface of this.surfaces) {
      const points = Phaser.Geom.Intersects.GetLineToRectangle(ray, surface.bounds) as Phaser.Geom.Point[];
      for (const p of points) {
        const d = Phaser.Math.Distance.Between(originX, originY, p.x, p.y);
        if (d <= GRAPPLE.RANGE && d < bestDist) {
          bestDist = d;
          best = new Phaser.Math.Vector2(p.x, p.y);
        }
      }
    }
    return best;
  }

  /** Draw the wire (and hook in flight). */
  private render(): void {
    this.wire.clear();
    if (this.phase === WirePhase.Idle) return;

    const tip = this.phase === WirePhase.Firing ? this.hookPos : this.anchor;
    this.wire.lineStyle(GRAPPLE.WIRE_THICKNESS, GRAPPLE.WIRE_COLOR, 1);
    this.wire.beginPath();
    this.wire.moveTo(this.player.x, this.player.y - 4);
    this.wire.lineTo(tip.x, tip.y);
    this.wire.strokePath();

    if (this.phase === WirePhase.Attached) {
      this.wire.fillStyle(GRAPPLE.WIRE_COLOR, 1);
      this.wire.fillCircle(this.anchor.x, this.anchor.y, GRAPPLE.ANCHOR_RADIUS);
    }
  }

  private whooshAt = 0;
  private maybeWhoosh(nowMs: number): void {
    if (nowMs - this.whooshAt < 260) return;
    this.whooshAt = nowMs;
    this.playSound(AudioKeys.SwingWhoosh, 0.5);
  }

  private playSound(key: AudioKey, volume = 0.6): void {
    this.audio.playSfx(key, volume);
  }

  /** Free graphics resources. */
  destroy(): void {
    this.wire.destroy();
  }
}
