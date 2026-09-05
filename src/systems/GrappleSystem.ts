import Phaser from 'phaser';
import { AudioKeys, type AudioKey } from '../config/AssetKeys';
import { GAS, GRAPPLE } from '../config/PlayerConfig';
import { isNapeHook, napeFlingAccel } from './SiegeGeometry';
import { AudioManager } from './AudioManager';
import type { Player } from '../entities/Player';
import type { GasSystem } from './GasSystem';

/** A surface the grapple can attach to (walls, terrain, large enemy bodies). */
export interface GrappleSurface {
  /** Axis-aligned world-space rectangle describing the attachable surface. */
  readonly bounds: Phaser.Geom.Rectangle;
}

/**
 * A MOVING grapple target: a giant the hook can attach to. Because giants move
 * (and die), the anchor tracks {@link x}/{@link y} every frame while attached
 * and the wire detaches gracefully once {@link isValid} goes false (the giant
 * died / despawned). The GrappleSystem holds only this small adapter, never a
 * hard Enemy reference, so a freed giant can't dangle.
 */
export interface GrappleTarget {
  /** Live world position of the giant's grapple point (its centre-ish). */
  readonly x: number;
  readonly y: number;
  /** AABB used to hit-test the aim ray against the giant. */
  readonly bounds: Phaser.Geom.Rectangle;
  /** False once the giant is dying / destroyed - the wire must let go. */
  readonly isValid: boolean;
  /**
   * Live world position of the giant's WEAK POINT (nape), if it has one. When a
   * shot's ray strikes within GRAPPLE.NAPE_ANCHOR_SNAP_DIST of this point the
   * wire hooks the weak point and flings the hero toward it (FEAT-003); the
   * anchor then tracks this live position each frame. Absent = no weak point.
   */
  readonly getNape?: () => { x: number; y: number };
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
 * GrappleSystem - the mouse-aimed ODM wire for the TOP-DOWN plane.
 *
 * ## Momentum model (no gravity)
 * The wire is treated as a **taut rope** and, with zero gravity, becomes a
 * fling/pull line rather than a pendulum. Each frame while attached we:
 *   1. Add a constant pull toward the anchor (PULL_ACCEL) so firing hauls the
 *      hero across the plane toward the ring - this is the primary traversal.
 *   2. If the hero is at/beyond the current rope length, apply a
 *      *position-based distance constraint*: snap the position back onto the
 *      rope circle and remove the outward radial velocity component, keeping
 *      the component PERPENDICULAR to the rope (tangential). That projection
 *      conserves the sideways momentum so arcing around an anchor feels fluid.
 *   3. Apply light tangential damping so an idle orbit eventually settles.
 * Releasing stops constraining, so the hero flies off with the velocity they
 * built up plus a small outward radial boost (conserved fling).
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
  /** Live giants the hook may attach to (refreshed each frame by the scene). */
  private targets: GrappleTarget[] = [];
  /**
   * The giant the wire is currently anchored to, if any. While set, the anchor
   * TRACKS this target's live position each frame (a moving anchor). Cleared on
   * release or when the target dies / moves out of MAX_LENGTH.
   */
  private attachedTarget: GrappleTarget | null = null;
  /**
   * True when the current shot hooked a giant's WEAK POINT (nape): the ray hit a
   * giant within GRAPPLE.NAPE_ANCHOR_SNAP_DIST of its live nape. While set, the
   * anchor tracks the LIVE nape, the pull uses the boosted NAPE_PULL_ACCEL, the
   * rope auto-reels toward NAPE_MIN_LENGTH, and release retains NAPE_RELEASE_KEEP
   * so the hero is flung into blade reach. Cleared on every release (FEAT-003).
   */
  private napeHooked = false;

  constructor(scene: Phaser.Scene, player: Player, gas: GasSystem) {
    this.player = player;
    this.gas = gas;
    this.audio = AudioManager.get(scene);
    this.wire = scene.add.graphics();
    this.wire.setDepth(5);
  }

  /** Provide/refresh the set of attachable static surfaces (walls, terrain). */
  setSurfaces(surfaces: GrappleSurface[]): void {
    this.surfaces = surfaces;
  }

  /**
   * Provide/refresh the set of MOVING giant targets the hook may attach to. The
   * scene rebuilds these adapters each frame from its live giant list; the
   * system keeps only the adapters for aim-raycasting. The currently-attached
   * target is NOT re-resolved from this list (the adapters are fresh objects
   * each frame): its own {@link GrappleTarget.isValid} getter - which reads the
   * live giant - drives graceful detach in {@link trackMovingAnchor}, so a
   * destroyed giant releases the wire without any dangling reference.
   */
  setTargets(targets: GrappleTarget[]): void {
    this.targets = targets;
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
    const hit = this.raycast(originX, originY, aimX, aimY);
    if (!hit) return false;
    if (!this.gas.spend(GAS.COST_GRAPPLE_FIRE, nowMs)) return false;

    // Launch the hook projectile toward the resolved anchor point. If the ray
    // struck a giant, remember it so the anchor tracks that moving target.
    this.phase = WirePhase.Firing;
    this.attachedTarget = hit.target;

    // Weak-point (nape) hook: if the ray struck a giant that exposes a nape AND
    // the hit landed within the snap distance of that live nape, anchor to the
    // nape (not the body hit point) and flag the boosted fling (FEAT-003).
    this.napeHooked = false;
    let anchorX = hit.point.x;
    let anchorY = hit.point.y;
    const nape = hit.target?.getNape?.();
    if (nape && isNapeHook(hit.point.x, hit.point.y, nape.x, nape.y, GRAPPLE.NAPE_ANCHOR_SNAP_DIST)) {
      this.napeHooked = true;
      anchorX = nape.x;
      anchorY = nape.y;
    }

    this.anchor.set(anchorX, anchorY);
    this.hookPos.set(originX, originY);
    const dx = anchorX - originX;
    const dy = anchorY - originY;
    const dist = Math.hypot(dx, dy) || 1;
    this.hookDir.set(dx / dist, dy / dist);
    this.hookRemaining = dist;
    this.player.swinging = false;
    this.playSound(AudioKeys.GrappleFire);
    return true;
  }

  /**
   * Release the wire; the player keeps their built-up velocity (fling). A small
   * radial boost AWAY from the anchor is added along the wire so a release off
   * a ring reads as a launch (the top-down replacement for the old up-boost).
   */
  release(): void {
    if (this.phase === WirePhase.Idle) return;
    if (this.phase === WirePhase.Attached) {
      const body = this.player.body;
      // A weak-point hook retains its own (typically higher) momentum so the
      // hero keeps speed heading INTO the nape for the finishing slash.
      const keep = this.napeHooked ? GRAPPLE.NAPE_RELEASE_KEEP : GRAPPLE.RELEASE_VELOCITY_KEEP;
      body.velocity.x *= keep;
      body.velocity.y *= keep;
      // Outward radial direction (anchor -> player), normalized.
      const rx = this.player.x - this.anchor.x;
      const ry = this.player.y - this.anchor.y;
      const len = Math.hypot(rx, ry) || 1;
      body.velocity.x += (rx / len) * GRAPPLE.RELEASE_RADIAL_BOOST;
      body.velocity.y += (ry / len) * GRAPPLE.RELEASE_RADIAL_BOOST;
    }
    this.phase = WirePhase.Idle;
    this.player.swinging = false;
    this.attachedTarget = null;
    this.napeHooked = false;
    this.wire.clear();
  }

  /**
   * Per-frame update. Handles hook travel, the pendulum constraint, reeling,
   * gas drain, and wire rendering.
   */
  update(input: GrappleInput, dtMs: number, nowMs: number): void {
    const dt = dtMs / 1000;

    // Moving anchor: if the wire is hooked to a giant, keep the anchor glued to
    // that giant's live position, and detach gracefully if it died or slipped
    // out of reach. Done before physics so this frame swings around the giant's
    // CURRENT position; returns early if it forced a release.
    if (this.attachedTarget && !this.trackMovingAnchor()) {
      this.render();
      return;
    }

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

  /**
   * Keep the anchor tracking the attached giant's live position and enforce the
   * graceful-detach rules for a MOVING target. Returns false (after releasing)
   * when the wire had to let go, true when it remains attached to the giant.
   *
   * Detach conditions:
   *  - the giant died / despawned ({@link GrappleTarget.isValid} is false), or
   *  - the giant carried the anchor beyond GRAPPLE.MAX_LENGTH from the hero.
   * While firing, the hook simply retargets the giant's new position (no length
   * check yet - the hook is still travelling).
   */
  private trackMovingAnchor(): boolean {
    const target = this.attachedTarget;
    if (!target) return true;

    // Target died/despawned: drop the wire (release() also clears the ref).
    if (!target.isValid) {
      this.release();
      return false;
    }

    // Glue the anchor to the giant's current position (the moving anchor). When
    // the shot hooked the weak point, track the LIVE nape instead of the body
    // centre so the fling homes on the moving weak point (FEAT-003).
    if (this.napeHooked && target.getNape) {
      const nape = target.getNape();
      this.anchor.set(nape.x, nape.y);
    } else {
      this.anchor.set(target.x, target.y);
    }

    if (this.phase === WirePhase.Attached) {
      // A moving giant can drag the anchor out of reach: let go past MAX_LENGTH.
      // Measure to the live anchor (nape when weak-point hooked, else body).
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.anchor.x, this.anchor.y);
      if (d > GRAPPLE.MAX_LENGTH) {
        this.release();
        return false;
      }
    }
    return true;
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

    // --- weak-point auto-reel: a nape hook draws the hero IN toward the nape ---
    // The rope shrinks toward NAPE_MIN_LENGTH every frame (independent of manual
    // reeling, no gas cost) so the boosted pull lands the hero in blade reach.
    if (this.napeHooked && this.ropeLength > GRAPPLE.NAPE_MIN_LENGTH) {
      this.ropeLength = Math.max(
        GRAPPLE.NAPE_MIN_LENGTH,
        this.ropeLength - GRAPPLE.NAPE_REEL_SPEED * dt,
      );
    }

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

    // Constant pull toward the anchor gives the swing "pump" energy + climb. A
    // weak-point hook uses the boosted NAPE_PULL_ACCEL so the hero is visibly
    // flung at the nape rather than lazily reeled (FEAT-003).
    const accel = napeFlingAccel(GRAPPLE.PULL_ACCEL, GRAPPLE.NAPE_PULL_ACCEL, this.napeHooked);
    const pull = accel * dt;
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
   * Raycast from origin toward the aim point and return the nearest attachable
   * intersection within {@link GRAPPLE.RANGE} - a static surface (wall/terrain)
   * OR a giant. Returns null if the aim hits nothing valid in range. When the
   * nearest hit is a giant, its {@link GrappleTarget} rides along so the caller
   * can set up the moving anchor.
   */
  private raycast(
    originX: number,
    originY: number,
    aimX: number,
    aimY: number,
  ): { point: Phaser.Math.Vector2; target: GrappleTarget | null } | null {
    const dx = aimX - originX;
    const dy = aimY - originY;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    const nx = dx / len;
    const ny = dy / len;
    // Cast the ray out to the full grapple range; intersections are re-clamped
    // to GRAPPLE.RANGE below so nothing beyond reach can anchor.
    const reach = GRAPPLE.RANGE;

    // Cast a ray and test each attachable AABB (static surfaces AND giants) for
    // the nearest edge crossing. Simple and robust at this scale.
    const ray = new Phaser.Geom.Line(originX, originY, originX + nx * reach, originY + ny * reach);
    let bestPoint: Phaser.Math.Vector2 | null = null;
    let bestTarget: GrappleTarget | null = null;
    let bestDist = Infinity;

    const consider = (bounds: Phaser.Geom.Rectangle, target: GrappleTarget | null): void => {
      const points = Phaser.Geom.Intersects.GetLineToRectangle(ray, bounds) as Phaser.Geom.Point[];
      for (const p of points) {
        const d = Phaser.Math.Distance.Between(originX, originY, p.x, p.y);
        if (d <= GRAPPLE.RANGE && d < bestDist) {
          bestDist = d;
          bestPoint = new Phaser.Math.Vector2(p.x, p.y);
          bestTarget = target;
        }
      }
    };

    for (const surface of this.surfaces) consider(surface.bounds, null);
    for (const target of this.targets) {
      if (!target.isValid) continue;
      consider(target.bounds, target);
    }

    if (!bestPoint) return null;
    return { point: bestPoint, target: bestTarget };
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
