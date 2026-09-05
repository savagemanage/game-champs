import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { ENEMY_TEXTURE_BY_ROLE, type TextureKey } from '../../config/AssetKeys';
import { ENEMY_COMBAT, ENEMY_STATS, type EnemyStats } from '../../config/EnemyConfig';

/** Result of resolving an incoming blade hit against a giant. */
export interface HitResult {
  /** Final HP damage applied after crit / armor. */
  readonly damage: number;
  /** Whether the hit landed on the nape/weak-point (critical). */
  readonly crit: boolean;
  /** Whether the hit was reduced by frontal armor. */
  readonly blocked: boolean;
  /** Whether this hit killed the giant. */
  readonly killed: boolean;
}

/** Behavioural context passed to a giant each frame by the scene. */
export interface EnemyContext {
  /** X of the wall face the giants march toward. */
  readonly wallX: number;
  /** Ground surface Y (feet rest here). */
  readonly groundY: number;
  /** Current wall integrity ratio [0..1] (for pathing past a breach). */
  readonly wallBreached: boolean;
  readonly nowMs: number;
  readonly dtMs: number;
}

/** Emitted when a giant performs an attack (on wall or reaching citizens). */
export interface AttackEvent {
  readonly role: EnemyRole;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Enemy - the abstract base giant.
 *
 * Owns the shared lifecycle: fixed base stats loaded once from EnemyConfig
 * (never mutated), the nape weak-point hitbox, HP + hit resolution (crit +
 * frontal armor), stagger/hit-reaction, death, and marching toward the wall.
 * Per-role subclasses override {@link steer} (movement AI) and, where relevant,
 * {@link performAttack} (e.g. Thrower's ranged lob) to add distinct behaviour.
 *
 * Base stats are read-only after construction: difficulty is a wave-composition
 * concern, not a per-instance stat-scaling concern.
 */
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;

  /** Immutable base stats for this role (from EnemyConfig). */
  public readonly stats: EnemyStats;

  protected hp: number;
  /** +1 marching right (toward a right-side wall), used for facing/nape side. */
  protected marchDir: 1 | -1 = 1;

  private staggerUntil = 0;
  private nextAttackAt = 0;
  private dying = false;
  private dead = false;

  /** Vertical nape offset from the neck baseline (unscaled), tuned per role. */
  protected napeLocalY = -6;

  constructor(scene: Phaser.Scene, x: number, y: number, role: EnemyRole) {
    super(scene, x, y, ENEMY_TEXTURE_BY_ROLE[role] as TextureKey, 0);
    this.stats = ENEMY_STATS[role];
    this.hp = this.stats.maxHp;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(this.stats.scale);
    this.setOrigin(0.5, 1); // feet at y
    this.body.setAllowGravity(false);
    this.body.setImmovable(false);

    Enemy.ensureAnimations(scene, role);
    const walkKey = Enemy.walkAnimKey(role);
    if (scene.anims.exists(walkKey)) this.play(walkKey);

    // Face the march direction (art faces left by default; flip when going right).
    this.setMarchDir(1);
  }

  /** The role this giant plays. */
  get role(): EnemyRole {
    return this.stats.role;
  }

  /** True once the death sequence has started (no longer a valid target). */
  get isDying(): boolean {
    return this.dying;
  }

  /** True while staggered (movement paused by a hit reaction). */
  protected get staggered(): boolean {
    return this.scene.time.now < this.staggerUntil;
  }

  /** Register per-role walk animation once (idempotent). */
  private static ensureAnimations(scene: Phaser.Scene, role: EnemyRole): void {
    const key = Enemy.walkAnimKey(role);
    if (scene.anims.exists(key)) return;
    const tex = ENEMY_TEXTURE_BY_ROLE[role] as string;
    scene.anims.create({
      key,
      frames: [
        { key: tex, frame: 0 },
        { key: tex, frame: 1 },
      ],
      frameRate: 4,
      repeat: -1,
    });
  }

  private static walkAnimKey(role: EnemyRole): string {
    return `enemy_walk_${role}`;
  }

  /** Set march/facing direction. Art faces left by default. */
  protected setMarchDir(dir: 1 | -1): void {
    this.marchDir = dir;
    // Default art faces LEFT; when marching right we flip so the front faces right.
    this.setFlipX(dir > 0);
  }

  /**
   * World-space position of the nape/weak-point. The nape sits at the back of
   * the neck (opposite the direction the giant faces) and high on the body,
   * just below the head - which is why the player must get behind/above the
   * giant with the grapple to strike it cleanly.
   */
  getNapeWorld(): Phaser.Math.Vector2 {
    const back = -this.marchDir; // back is opposite the facing/front direction
    const h = this.displayHeight;
    // Horizontal: a bit toward the back of the neck. Vertical: near the top.
    const nx = this.x + back * (h * 0.12);
    const ny = this.y - h * 0.78 + this.napeLocalY * this.stats.scale;
    return new Phaser.Math.Vector2(nx, ny);
  }

  /** Radius of the nape hitbox in world px. */
  getNapeRadius(): number {
    return ENEMY_COMBAT.NAPE_RADIUS * this.stats.scale;
  }

  /**
   * Resolve an incoming blade hit.
   * @param baseDamage raw blade damage before crit/armor.
   * @param hitX world x of the strike (to detect frontal vs rear for armor).
   * @param onNape whether the strike overlapped the nape hitbox.
   */
  applyHit(baseDamage: number, hitX: number, onNape: boolean): HitResult {
    if (this.dying || this.dead) {
      return { damage: 0, crit: false, blocked: false, killed: false };
    }

    let damage = baseDamage;
    let blocked = false;

    if (onNape) {
      // Nape/weak-point: big critical bonus; always bypasses frontal armor.
      damage = baseDamage * this.stats.napeCritMultiplier;
    } else if (this.stats.frontalResist > 0) {
      // Frontal armor: a body hit from the front (side the giant faces) is
      // heavily reduced. A hit from behind (nape side) bypasses the plate.
      const frontX = this.marchDir; // giant faces its march direction
      const strikeFromFront = Math.sign(hitX - this.x) === frontX;
      if (strikeFromFront) {
        damage = baseDamage * (1 - this.stats.frontalResist);
        blocked = true;
      }
    }

    damage = Math.max(0, Math.round(damage));
    this.hp -= damage;

    // Hit reaction / stagger.
    const now = this.scene.time.now;
    this.staggerUntil = now + (onNape ? ENEMY_COMBAT.STAGGER_CRIT_MS : ENEMY_COMBAT.STAGGER_MS);
    this.hitFlash(onNape);

    const killed = this.hp <= 0;
    if (killed) this.beginDeath();
    return { damage, crit: onNape, blocked, killed };
  }

  /** Brief tint flash as a hit reaction. */
  private hitFlash(crit: boolean): void {
    this.setTintFill(crit ? 0xffffff : 0xffb0a0);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.clearTint();
    });
  }

  /** Start the death sequence: freeze, fade, then destroy. */
  private beginDeath(): void {
    if (this.dying) return;
    this.dying = true;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: this.scaleX * 1.1,
      scaleY: this.scaleY * 0.85,
      duration: ENEMY_COMBAT.DEATH_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.dead = true;
        this.destroy();
      },
    });
  }

  /**
   * Whether the giant is close enough to attack its current target (wall or,
   * past a breach, the citizens behind it).
   */
  protected inAttackRange(ctx: EnemyContext): boolean {
    const targetX = ctx.wallBreached ? ctx.wallX + 40 : ctx.wallX;
    return Math.abs(this.x - targetX) <= this.stats.attackRange;
  }

  /**
   * Per-frame update. Runs the shared death/stagger gates, then delegates
   * movement to {@link steer} and attacking to {@link tryAttack}. Returns an
   * AttackEvent for the scene to apply (wall/citizen damage) or null.
   */
  update(ctx: EnemyContext): AttackEvent | null {
    if (this.dying || this.dead) return null;

    // Keep feet on the ground plane (arcade bodies don't fall - we drive Y).
    this.y = ctx.groundY;

    if (this.staggered) {
      this.body.setVelocity(0, 0);
      return null;
    }

    this.steer(ctx);

    if (this.inAttackRange(ctx) && ctx.nowMs >= this.nextAttackAt) {
      this.nextAttackAt = ctx.nowMs + this.stats.attackCooldownMs;
      return this.performAttack(ctx);
    }
    return null;
  }

  /**
   * Movement AI - overridden per role. Default: march straight toward the wall
   * and stop at attack range. Subclasses add charges, weaving, standoff, etc.
   */
  protected steer(ctx: EnemyContext): void {
    const targetX = ctx.wallX;
    const dir: 1 | -1 = targetX >= this.x ? 1 : -1;
    this.setMarchDir(dir);
    if (this.inAttackRange(ctx)) {
      this.body.setVelocityX(0);
    } else {
      this.body.setVelocityX(dir * this.stats.moveSpeed);
    }
  }

  /**
   * Perform an attack when in range. Default: a melee strike on the wall.
   * Thrower overrides this to spawn a ranged projectile instead.
   */
  protected performAttack(_ctx: EnemyContext): AttackEvent | null {
    return { role: this.role, damage: this.stats.attack, x: this.x, y: this.y };
  }
}
