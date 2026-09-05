import Phaser from 'phaser';
import { TextureKeys } from '../config/AssetKeys';
import { AIR, DASH, HERO_ANIMS, HERO_COMBAT, HERO_FRAMES, MOVEMENT } from '../config/PlayerConfig';
import type { Damageable } from '../types';

/** 8-direction planar move intent for a frame (WASD / arrows). */
export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Player - the ODM hero as a typed Arcade Physics sprite for the TOP-DOWN
 * arena.
 *
 * Owns planar 8-direction movement (accelerate toward a target velocity with
 * friction), facing (for sprite flip and nape-side logic), the omnidirectional
 * dash burst, hurt/i-frames/knockback, and the animation state machine wired to
 * the 32x32 hero spritesheet. The grapple system drives the same body while a
 * wire is attached; this class exposes helpers ({@link body}, {@link swinging},
 * {@link applyImpulse}) it uses. There is no gravity or jump in the plane.
 */
export class Player extends Phaser.Physics.Arcade.Sprite implements Damageable {
  declare public body: Phaser.Physics.Arcade.Body;

  /** +1 facing right, -1 facing left (drives sprite flip + nape side). */
  private facing: 1 | -1 = 1;

  /** Health pool (Damageable contract). */
  public readonly maxHp: number = MOVEMENT.MAX_HP;
  public hp: number = MOVEMENT.MAX_HP;
  /** End of the current invulnerability (i-frame) window, ms. */
  private invulnUntil = 0;
  /** End of the brief hurt-animation lock, ms. */
  private hurtUntil = 0;

  /** Dash state. */
  private dashUntil = 0;
  private dashReadyAt = 0;

  /** When true (grapple attached), movement defers to the wire fling/pull. */
  public swinging = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKeys.Hero, HERO_FRAMES.IDLE);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.body.setSize(MOVEMENT.BODY_WIDTH, MOVEMENT.BODY_HEIGHT);
    this.body.setOffset(MOVEMENT.BODY_OFFSET_X, MOVEMENT.BODY_OFFSET_Y);
    // Top-down: clamp to the arena world bounds (no floor to stand on).
    this.body.setCollideWorldBounds(true);
    this.body.setAllowGravity(false);
    this.body.setMaxVelocity(MOVEMENT.MAX_H_SPEED, MOVEMENT.MAX_V_SPEED);

    Player.ensureAnimations(scene);
    this.play(HERO_ANIMS.IDLE);
  }

  /** Register hero animations once per scene (idempotent). */
  private static ensureAnimations(scene: Phaser.Scene): void {
    const anims = scene.anims;
    if (anims.exists(HERO_ANIMS.IDLE)) return;
    const key = TextureKeys.Hero;
    anims.create({ key: HERO_ANIMS.IDLE, frames: [{ key, frame: HERO_FRAMES.IDLE }], frameRate: 1, repeat: -1 });
    anims.create({
      key: HERO_ANIMS.RUN,
      frames: [
        { key, frame: HERO_FRAMES.RUN_A },
        { key, frame: HERO_FRAMES.RUN_B },
      ],
      frameRate: 10,
      repeat: -1,
    });
    anims.create({ key: HERO_ANIMS.DASH, frames: [{ key, frame: HERO_FRAMES.SWING }], frameRate: 1, repeat: -1 });
    anims.create({ key: HERO_ANIMS.SWING, frames: [{ key, frame: HERO_FRAMES.SWING }], frameRate: 1, repeat: -1 });
    anims.create({ key: HERO_ANIMS.SLASH, frames: [{ key, frame: HERO_FRAMES.SLASH }], frameRate: 1, repeat: 0 });
    anims.create({ key: HERO_ANIMS.HURT, frames: [{ key, frame: HERO_FRAMES.HURT }], frameRate: 1, repeat: 0 });
  }

  /** Current facing direction (+1 right, -1 left). */
  get facingDir(): 1 | -1 {
    return this.facing;
  }

  /** Whether a dash is currently ready to fire (cooldown elapsed). */
  isDashReady(nowMs: number): boolean {
    return nowMs >= this.dashReadyAt;
  }

  /**
   * Fire an OMNIDIRECTIONAL dash toward the given direction vector. The vector
   * is normalized and applied directly as the burst velocity, so the hero
   * dashes exactly toward the passed aim/movement direction (no facing-based
   * inversion - this is the fix for the "Shift dashes backward" bug). Caller is
   * responsible for the gas cost.
   */
  startDash(dirX: number, dirY: number, nowMs: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    this.body.setVelocity(nx * DASH.IMPULSE, ny * DASH.IMPULSE);
    this.dashUntil = nowMs + DASH.DURATION_MS;
    this.dashReadyAt = nowMs + DASH.COOLDOWN_MS;
    // Face along the horizontal component of the dash for sprite readability.
    if (nx !== 0) this.setFacing(nx > 0 ? 1 : -1);
  }

  /** True while the dash burst window is active. */
  isDashing(nowMs: number): boolean {
    return nowMs < this.dashUntil;
  }

  /** Add a velocity impulse (used by grapple release / external forces). */
  applyImpulse(vx: number, vy: number): void {
    this.body.velocity.x += vx;
    this.body.velocity.y += vy;
  }

  /** True while the hero is dead (Damageable contract). */
  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** True while the post-hit invulnerability window is active. */
  isInvulnerable(nowMs: number): boolean {
    return nowMs < this.invulnUntil;
  }

  /**
   * Apply raw damage (Damageable contract). Prefer {@link hurt} from gameplay
   * so knockback + i-frames + the hurt animation fire together; this bare form
   * exists to satisfy the contract and clamps HP at zero.
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - Math.max(0, Math.round(amount)));
  }

  /**
   * Take a hit from a world source at (srcX, srcY): applies damage, opens the
   * i-frame window, knocks the hero back along the plane away from the source,
   * plays the HURT animation, and blinks the sprite. No-ops (returns false)
   * while still invulnerable or dead, so a lingering overlap can't drain HP
   * every frame.
   *
   * @returns true if the hit actually landed (damage was applied).
   */
  hurt(amount: number, srcX: number, srcY: number, nowMs: number): boolean {
    if (this.isDead || this.isInvulnerable(nowMs)) return false;

    this.takeDamage(amount);
    this.invulnUntil = nowMs + HERO_COMBAT.INVULN_MS;
    this.hurtUntil = nowMs + 260;

    // Knock the hero directly away from the source across the plane.
    let dx = this.x - srcX;
    let dy = this.y - srcY;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      // Degenerate (source on top of us): shove opposite our facing.
      dx = -this.facing;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    this.body.velocity.x = dx * HERO_COMBAT.HIT_KNOCKBACK;
    this.body.velocity.y = dy * HERO_COMBAT.HIT_KNOCKBACK;

    // Play the dedicated HURT frame and blink through the i-frame window.
    this.play(HERO_ANIMS.HURT, true);
    this.startInvulnBlink();
    return true;
  }

  /** Blink the sprite alpha for the duration of the i-frame window. */
  private startInvulnBlink(): void {
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(HERO_COMBAT.INVULN_MS / 180),
      onComplete: () => this.setAlpha(1),
    });
  }

  private setFacing(dir: number): void {
    this.facing = dir < 0 ? -1 : 1;
    this.setFlipX(this.facing < 0);
  }

  /**
   * Per-frame update. `input` carries 8-direction move intent. While a dash
   * burst is active, or while the grapple has us swinging, movement input is
   * suppressed so the burst/fling momentum reads cleanly; otherwise we
   * accelerate toward the input direction and apply friction on release.
   */
  updatePlayer(input: MoveInput, dtMs: number, nowMs: number): void {
    const dt = dtMs / 1000;
    const body = this.body;
    const dashing = this.isDashing(nowMs);

    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (ix !== 0) this.setFacing(ix > 0 ? 1 : -1);

    if (!dashing) {
      if (!this.swinging) {
        // Planar 8-dir movement: accelerate toward a normalized target
        // velocity, apply friction to a stop when there is no input.
        if (ix !== 0 || iy !== 0) {
          const len = Math.hypot(ix, iy) || 1;
          const targetX = (ix / len) * MOVEMENT.MOVE_SPEED;
          const targetY = (iy / len) * MOVEMENT.MOVE_SPEED;
          const k = 1 - Math.exp(-(MOVEMENT.MOVE_ACCEL / MOVEMENT.MOVE_SPEED) * dt);
          body.velocity.x = Phaser.Math.Linear(body.velocity.x, targetX, k);
          body.velocity.y = Phaser.Math.Linear(body.velocity.y, targetY, k);
        } else {
          this.applyFriction(body.velocity, MOVEMENT.MOVE_FRICTION * dt);
        }
      } else if (ix !== 0 || iy !== 0) {
        // Attached to a wire: input gently steers the fling without fighting it.
        const len = Math.hypot(ix, iy) || 1;
        body.velocity.x += (ix / len) * AIR.SWING_STEER_ACCEL * dt;
        body.velocity.y += (iy / len) * AIR.SWING_STEER_ACCEL * dt;
      }
    }

    this.updateAnimation(nowMs, ix, iy);
  }

  /** Bleed a velocity vector toward zero by up to `drop` px/s on each axis. */
  private applyFriction(v: Phaser.Math.Vector2, drop: number): void {
    const speed = Math.hypot(v.x, v.y);
    if (speed <= drop) {
      v.x = 0;
      v.y = 0;
    } else {
      const scale = (speed - drop) / speed;
      v.x *= scale;
      v.y *= scale;
    }
  }

  /** Drive the animation state machine from movement/dash/swing state. */
  private updateAnimation(nowMs: number, ix: number, iy: number): void {
    const current = this.anims.currentAnim?.key;
    // A one-shot slash keeps playing until finished.
    if (current === HERO_ANIMS.SLASH && this.anims.isPlaying) return;
    // Hold the HURT pose briefly after a hit so the reaction reads.
    if (nowMs < this.hurtUntil) {
      if (current !== HERO_ANIMS.HURT) this.play(HERO_ANIMS.HURT, true);
      return;
    }

    let next: string;
    if (this.swinging) {
      next = HERO_ANIMS.SWING;
    } else if (this.isDashing(nowMs)) {
      next = HERO_ANIMS.DASH;
    } else if ((ix !== 0 || iy !== 0) && Math.hypot(this.body.velocity.x, this.body.velocity.y) > 8) {
      next = HERO_ANIMS.RUN;
    } else {
      next = HERO_ANIMS.IDLE;
    }
    if (current !== next) this.play(next, true);
  }

  /** Play the one-shot slash animation. */
  playSlash(): void {
    this.play(HERO_ANIMS.SLASH, true);
  }
}
