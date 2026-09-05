import Phaser from 'phaser';
import { TextureKeys } from '../config/AssetKeys';
import { PHYSICS } from '../config/GameConfig';
import { AIR, DASH, HERO_ANIMS, HERO_COMBAT, HERO_FRAMES, MOVEMENT } from '../config/PlayerConfig';
import type { Damageable } from '../types';

/** Horizontal input intent for a frame. */
export interface MoveInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

/**
 * Player - the ODM hero as a typed Arcade Physics sprite.
 *
 * Owns ground movement (accel/friction run + variable-height jump with coyote
 * time and jump buffering), air control, gravity shaping, facing, and the
 * animation state machine wired to the 32x32 hero spritesheet. The grapple
 * swing and dash systems drive the same body; this class exposes helpers
 * ({@link body}, {@link setDashState}, {@link applyImpulse}) they use.
 */
export class Player extends Phaser.Physics.Arcade.Sprite implements Damageable {
  declare public body: Phaser.Physics.Arcade.Body;

  /** +1 facing right, -1 facing left. */
  private facing: 1 | -1 = 1;

  /** Health pool (Damageable contract). */
  public readonly maxHp: number = MOVEMENT.MAX_HP;
  public hp: number = MOVEMENT.MAX_HP;
  /** End of the current invulnerability (i-frame) window, ms. */
  private invulnUntil = 0;
  /** End of the brief hurt-animation lock, ms. */
  private hurtUntil = 0;

  /** Timestamps for coyote-time / jump-buffer bookkeeping (ms). */
  private lastGroundedAt = -Infinity;
  private jumpBufferedAt = -Infinity;

  /** Dash state. */
  private dashUntil = 0;
  private dashReadyAt = 0;
  private airDashesLeft: number = DASH.AIR_DASHES;

  /** When true (grapple attached), gravity shaping/air-control tweaks defer to the wire. */
  public swinging = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKeys.Hero, HERO_FRAMES.IDLE);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.body.setSize(MOVEMENT.BODY_WIDTH, MOVEMENT.BODY_HEIGHT);
    this.body.setOffset(MOVEMENT.BODY_OFFSET_X, MOVEMENT.BODY_OFFSET_Y);
    this.body.setCollideWorldBounds(true);
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
    anims.create({ key: HERO_ANIMS.JUMP, frames: [{ key, frame: HERO_FRAMES.RUN_A }], frameRate: 1, repeat: -1 });
    anims.create({ key: HERO_ANIMS.FALL, frames: [{ key, frame: HERO_FRAMES.RUN_B }], frameRate: 1, repeat: -1 });
    anims.create({ key: HERO_ANIMS.SWING, frames: [{ key, frame: HERO_FRAMES.SWING }], frameRate: 1, repeat: -1 });
    anims.create({ key: HERO_ANIMS.SLASH, frames: [{ key, frame: HERO_FRAMES.SLASH }], frameRate: 1, repeat: 0 });
    anims.create({ key: HERO_ANIMS.HURT, frames: [{ key, frame: HERO_FRAMES.HURT }], frameRate: 1, repeat: 0 });
  }

  /** Current facing direction (+1 right, -1 left). */
  get facingDir(): 1 | -1 {
    return this.facing;
  }

  /** True while standing on the ground (or hitting the world floor). */
  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  /** Whether a dash is currently ready to fire. */
  isDashReady(nowMs: number): boolean {
    if (nowMs < this.dashReadyAt) return false;
    if (this.grounded) return true;
    return this.airDashesLeft > 0;
  }

  /**
   * Fire a dash in a unit direction. Locks a short low-gravity burst window and
   * consumes an air-dash charge when airborne. Caller is responsible for gas.
   */
  startDash(dirX: number, dirY: number, nowMs: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    this.body.setVelocity(nx * DASH.IMPULSE, ny * DASH.IMPULSE);
    this.dashUntil = nowMs + DASH.DURATION_MS;
    this.dashReadyAt = nowMs + DASH.COOLDOWN_MS;
    if (!this.grounded) this.airDashesLeft = Math.max(0, this.airDashesLeft - 1);
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
   * i-frame window, knocks the hero back and up, plays the HURT animation, and
   * blinks the sprite. No-ops (returns false) while still invulnerable or dead,
   * so a lingering overlap can't drain HP every frame.
   *
   * @returns true if the hit actually landed (damage was applied).
   */
  hurt(amount: number, srcX: number, srcY: number, nowMs: number): boolean {
    if (this.isDead || this.isInvulnerable(nowMs)) return false;

    this.takeDamage(amount);
    this.invulnUntil = nowMs + HERO_COMBAT.INVULN_MS;
    this.hurtUntil = nowMs + 260;

    // Knock the hero away from the source horizontally, and always pop up a
    // little (biased further up when the hit came from below) for readability.
    const away = Math.sign(this.x - srcX) || -this.facing;
    const fromBelow = srcY > this.y ? 1.35 : 1;
    this.body.velocity.x = away * HERO_COMBAT.HIT_KNOCKBACK;
    this.body.velocity.y = -HERO_COMBAT.HIT_KNOCKBACK_UP * fromBelow;

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

  /** Buffer a jump request so an early press still fires on landing. */
  bufferJump(nowMs: number): void {
    this.jumpBufferedAt = nowMs;
  }

  /**
   * Per-frame update. `input` carries move/jump intent; the grapple/dash
   * systems run separately and set {@link swinging} / dash state which shapes
   * how gravity and air control are applied here.
   */
  updatePlayer(input: MoveInput, dtMs: number, nowMs: number): void {
    const dt = dtMs / 1000;
    const body = this.body;
    const dashing = this.isDashing(nowMs);

    // --- grounded bookkeeping (coyote time + air-dash reset) ---
    if (this.grounded) {
      this.lastGroundedAt = nowMs;
      this.airDashesLeft = DASH.AIR_DASHES;
    }

    // --- horizontal movement ---
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.setFacing(dir > 0 ? 1 : -1);

    if (!dashing) {
      if (this.grounded && !this.swinging) {
        // Ground: accelerate toward target run speed, friction to a stop.
        if (dir !== 0) {
          body.velocity.x = Phaser.Math.Linear(body.velocity.x, dir * MOVEMENT.MOVE_SPEED, 1 - Math.exp(-(MOVEMENT.GROUND_ACCEL / MOVEMENT.MOVE_SPEED) * dt));
        } else {
          const drop = MOVEMENT.GROUND_FRICTION * dt;
          if (Math.abs(body.velocity.x) <= drop) body.velocity.x = 0;
          else body.velocity.x -= Math.sign(body.velocity.x) * drop;
        }
      } else {
        // Airborne / swinging: gentle air control that respects existing momentum.
        if (dir !== 0) {
          const accel = this.swinging ? AIR.SWING_STEER_ACCEL : AIR.ACCEL;
          const desired = body.velocity.x + dir * accel * dt;
          // Only clamp toward the input cap when we're below it; never fight fling momentum.
          if (Math.abs(body.velocity.x) < AIR.MAX_INPUT_SPEED || Math.sign(dir) !== Math.sign(body.velocity.x)) {
            body.velocity.x = Phaser.Math.Clamp(desired, -Math.max(AIR.MAX_INPUT_SPEED, Math.abs(body.velocity.x)), Math.max(AIR.MAX_INPUT_SPEED, Math.abs(body.velocity.x)));
          } else {
            body.velocity.x = desired;
          }
        } else if (!this.swinging) {
          // Passive air drag so uncontrolled flight bleeds off gradually.
          body.velocity.x *= Math.max(0, 1 - AIR.DRAG * dt);
        }
      }
    }

    // --- jump (coyote time + jump buffer, variable height) ---
    if (input.jumpPressed) this.bufferJump(nowMs);
    const canCoyote = nowMs - this.lastGroundedAt <= MOVEMENT.COYOTE_MS;
    const hasBuffered = nowMs - this.jumpBufferedAt <= MOVEMENT.JUMP_BUFFER_MS;
    if (hasBuffered && canCoyote && !this.swinging) {
      body.velocity.y = -MOVEMENT.JUMP_VELOCITY;
      this.jumpBufferedAt = -Infinity;
      this.lastGroundedAt = -Infinity;
    }

    // --- gravity shaping ---
    let gravMult = 1;
    if (dashing) {
      gravMult = DASH.GRAVITY_MULT;
    } else if (!this.grounded && !this.swinging) {
      if (body.velocity.y < 0 && !input.jumpHeld) gravMult = MOVEMENT.LOW_JUMP_GRAVITY_MULT;
      else if (body.velocity.y > 0) gravMult = MOVEMENT.FALL_GRAVITY_MULT;
    }
    body.setGravityY(PHYSICS.GRAVITY_Y * (gravMult - 1));

    this.updateAnimation(nowMs, dir);
  }

  /** Drive the animation state machine from body/dash/swing state. */
  private updateAnimation(nowMs: number, dir: number): void {
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
      next = HERO_ANIMS.SWING;
    } else if (!this.grounded) {
      next = this.body.velocity.y < 0 ? HERO_ANIMS.JUMP : HERO_ANIMS.FALL;
    } else if (dir !== 0 && Math.abs(this.body.velocity.x) > 8) {
      next = HERO_ANIMS.RUN;
    } else {
      next = HERO_ANIMS.IDLE;
    }
    if (current !== next) this.play(next, true);
  }

  /** Play the one-shot slash animation (used by combat in a later feature). */
  playSlash(): void {
    this.play(HERO_ANIMS.SLASH, true);
  }
}
