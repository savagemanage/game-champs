import Phaser from 'phaser';
import { EnemyRole } from '../../config/GameConfig';
import { ENEMY_TEXTURE_BY_ROLE, type TextureKey } from '../../config/AssetKeys';
import {
  ENEMY_COMBAT,
  ENEMY_STATS,
  HERO_AGGRESSION,
  HERO_THREAT,
  type EnemyStats,
} from '../../config/EnemyConfig';
import { isFrontalHit, napeOffset } from '../../systems/SiegeGeometry';

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

/**
 * A world point a giant should path toward / attack: the nearest un-breached
 * ring segment, mirrored from Wall.RingTarget but kept structural here so the
 * enemy layer does not depend on the Wall entity.
 */
export interface SiegeTarget {
  readonly x: number;
  readonly y: number;
  /** 0 = outer ring, 1 = inner ring. */
  readonly ring: number;
  readonly index: number;
}

/**
 * Behavioural context passed to a giant each frame by the scene. Top-down: the
 * giants siege the arena CENTER, so the context carries the center, the hero
 * position (for hero-threat behaviour in FEAT-003), and a handle to resolve the
 * nearest attackable ring target for a given giant position. FEAT-003 builds
 * the full radial AI on this shape.
 */
export interface EnemyContext {
  /** Arena center the giants converge on. */
  readonly centerX: number;
  readonly centerY: number;
  /** Hero world position (for situational hero-targeting / dodging). */
  readonly heroX: number;
  readonly heroY: number;
  /** True once the inner ring is fully breached (giants can reach citizens). */
  readonly innerBreached: boolean;
  /**
   * Resolve the nearest un-breached ring segment a giant at (x, y) should
   * attack, or null when both rings are down (path to the center instead).
   */
  readonly nearestTarget: (x: number, y: number) => SiegeTarget | null;
  readonly nowMs: number;
  readonly dtMs: number;
}

/** What a giant's attack is aimed at, so the scene routes damage correctly. */
export const enum AttackTarget {
  /** The nearest ring segment / a citizen at the core (the siege objective). */
  Structure = 0,
  /** The hero specifically (a diverted swipe/lunge); routed via damageHero. */
  Hero = 1,
}

/** Emitted when a giant performs an attack (on ring/citizen or the hero). */
export interface AttackEvent {
  readonly role: EnemyRole;
  readonly damage: number;
  /** Origin of the attack (the giant's strike point) in world space. */
  readonly x: number;
  readonly y: number;
  /** Who the attack is aimed at (drives scene routing). */
  readonly target: AttackTarget;
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
  /**
   * 2D unit heading the giant currently faces (points toward its target). Top
   * down, facing is a full vector, not a left/right flip: the nape sits on the
   * BACK of the neck relative to this heading and the frontal-armor test uses
   * its dot product against an incoming hit. Initialized facing inward.
   */
  protected facingX = 0;
  protected facingY = 1;

  private staggerUntil = 0;
  private nextAttackAt = 0;
  private dying = false;
  private dead = false;

  /**
   * While set in the future, the giant is committed to hunting the hero (bug 4
   * fix). Prevents per-frame flip-flopping between the wall and the hero.
   */
  private heroHuntUntil = 0;
  /** Last decision timestamp for whether to commit to hunting the hero. */
  private nextHeroDecisionAt = 0;

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

    // Face inward toward the arena center by default; steer() updates this to
    // the live heading each frame.
    this.faceToward(x, y - 1);
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

  /**
   * Set the 2D facing to a unit heading (fx, fy). Also flips the sprite so its
   * silhouette reads the correct way along the horizontal component (the art is
   * a side profile, so the nape/armor math uses the full vector while the flip
   * only conveys left/right for the eye).
   */
  protected setFacing(fx: number, fy: number): void {
    const len = Math.hypot(fx, fy);
    if (len < 1e-4) return;
    this.facingX = fx / len;
    this.facingY = fy / len;
    // Default art faces LEFT; flip when the heading points right.
    this.setFlipX(this.facingX > 0);
  }

  /** Convenience: face toward a world point. */
  protected faceToward(x: number, y: number): void {
    this.setFacing(x - this.x, y - this.y);
  }

  /**
   * World-space position of the nape/weak-point. The nape sits at the BACK of
   * the neck - offset OPPOSITE the 2D facing heading - and high on the body,
   * just below the head. Because facing is a full vector, the exposed nape
   * swings around with the giant's heading, so the player must get behind it
   * (relative to its approach) to strike it cleanly from any angle.
   */
  getNapeWorld(): Phaser.Math.Vector2 {
    const off = napeOffset(
      this.facingX,
      this.facingY,
      this.displayHeight,
      this.napeLocalY,
      this.stats.scale,
    );
    return new Phaser.Math.Vector2(this.x + off.x, this.y + off.y);
  }

  /** Radius of the nape hitbox in world px. */
  getNapeRadius(): number {
    return ENEMY_COMBAT.NAPE_RADIUS * this.stats.scale;
  }

  /**
   * Resolve an incoming blade hit.
   * @param baseDamage raw blade damage before crit/armor.
   * @param hitX world x of the strike (to detect frontal vs rear for armor).
   * @param hitY world y of the strike (2D frontal-armor test).
   * @param onNape whether the strike overlapped the nape hitbox.
   */
  applyHit(baseDamage: number, hitX: number, hitY: number, onNape: boolean): HitResult {
    if (this.dying || this.dead) {
      return { damage: 0, crit: false, blocked: false, killed: false };
    }

    let damage = baseDamage;
    let blocked = false;

    if (onNape) {
      // Nape/weak-point: big critical bonus; always bypasses frontal armor.
      damage = baseDamage * this.stats.napeCritMultiplier;
    } else if (this.stats.frontalResist > 0) {
      // Frontal armor: a body hit landing within the frontal cone (the side the
      // giant faces, tested in 2D via the dot product of the incoming hit
      // direction against the facing heading) is heavily reduced. A hit from
      // behind or the flank (outside the cone) bypasses the plate entirely.
      if (
        isFrontalHit(
          this.facingX,
          this.facingY,
          hitX - this.x,
          hitY - this.y,
          ENEMY_COMBAT.FRONTAL_CONE_DEG,
        )
      ) {
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
   * Resolve the world point this giant is currently advancing on: the nearest
   * un-breached ring segment, or the arena center once both rings are down.
   */
  protected currentTarget(ctx: EnemyContext): { x: number; y: number } {
    const seg = ctx.nearestTarget(this.x, this.y);
    return seg ?? { x: ctx.centerX, y: ctx.centerY };
  }

  /** Unit heading vector from this giant toward its current siege target. */
  protected headingTo(target: { x: number; y: number }): { x: number; y: number } {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  /**
   * Whether the giant is close enough to attack its current target. Top-down:
   * measured as planar distance to the nearest ring segment / the center.
   */
  protected inAttackRange(ctx: EnemyContext): boolean {
    const t = this.currentTarget(ctx);
    return Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) <= this.stats.attackRange;
  }

  /** Planar distance from this giant to the hero. */
  protected distanceToHero(ctx: EnemyContext): number {
    return Phaser.Math.Distance.Between(this.x, this.y, ctx.heroX, ctx.heroY);
  }

  /**
   * Bug 4 fix: decide whether this giant is currently HUNTING the hero. When
   * the hero is inside the role's threat radius the giant may commit to the
   * hero for a sticky window (probability + stickiness are per-role in
   * HERO_AGGRESSION), so it diverts from the wall to lunge/swipe at the player.
   * Ranged roles (divertChance 0) never melee-hunt. Returns true while a giant
   * is committed to the hero.
   */
  protected isHuntingHero(ctx: EnemyContext): boolean {
    const aggression = HERO_AGGRESSION[this.role];
    if (aggression.divertChance <= 0) return false;

    const heroClose = this.distanceToHero(ctx) <= HERO_THREAT.THREAT_RADIUS;

    // Committed window still active: keep hunting as long as the hero is near.
    if (ctx.nowMs < this.heroHuntUntil) {
      return heroClose;
    }

    // Re-decide on a throttled cadence so we don't roll every frame.
    if (heroClose && ctx.nowMs >= this.nextHeroDecisionAt) {
      this.nextHeroDecisionAt = ctx.nowMs + 240;
      if (Math.random() < aggression.divertChance) {
        this.heroHuntUntil = ctx.nowMs + aggression.stickinessMs;
        return true;
      }
    }
    return false;
  }

  /** Whether a hunting giant is close enough to actually strike the hero. */
  protected inHeroMeleeRange(ctx: EnemyContext): boolean {
    return this.distanceToHero(ctx) <= HERO_THREAT.MELEE_HERO_RANGE;
  }

  /**
   * Per-frame update. Runs the shared death/stagger gates, then delegates
   * movement to {@link steer} and attacking to {@link performAttack}. Returns an
   * AttackEvent for the scene to apply (ring/citizen/hero damage) or null.
   *
   * Hero-threat has priority: a giant committed to hunting the hero and within
   * melee range swipes the HERO (bug 4). Otherwise it attacks its ring/citizen
   * target when in range.
   */
  update(ctx: EnemyContext): AttackEvent | null {
    if (this.dying || this.dead) return null;

    if (this.staggered) {
      this.body.setVelocity(0, 0);
      return null;
    }

    this.steer(ctx);

    if (ctx.nowMs < this.nextAttackAt) return null;

    // Priority 1: if hunting the hero and within reach, swipe the hero.
    if (this.isHuntingHero(ctx) && this.inHeroMeleeRange(ctx)) {
      this.nextAttackAt = ctx.nowMs + this.stats.attackCooldownMs;
      return this.performHeroAttack(ctx);
    }

    // Priority 2: attack the current siege target (ring segment / citizen).
    if (this.inAttackRange(ctx)) {
      this.nextAttackAt = ctx.nowMs + this.stats.attackCooldownMs;
      return this.performAttack(ctx);
    }
    return null;
  }

  /**
   * Move toward the hero (used by roles that divert to hunt). Faces the hero,
   * stops at melee range, otherwise closes at base speed.
   */
  protected steerTowardHero(ctx: EnemyContext, speedMult = 1): void {
    this.faceToward(ctx.heroX, ctx.heroY);
    if (this.inHeroMeleeRange(ctx)) {
      this.body.setVelocity(0, 0);
      return;
    }
    let dx = ctx.heroX - this.x;
    let dy = ctx.heroY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = this.stats.moveSpeed * speedMult;
    this.body.setVelocity(dx * speed, dy * speed);
  }

  /**
   * Movement AI - overridden per role. Default (top-down): if hunting the hero,
   * close on the hero; otherwise advance radially toward the nearest un-breached
   * ring segment / the center, stopping at attack range.
   */
  protected steer(ctx: EnemyContext): void {
    if (this.isHuntingHero(ctx)) {
      this.steerTowardHero(ctx);
      return;
    }
    const t = this.currentTarget(ctx);
    let dx = t.x - this.x;
    let dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    this.setFacing(dx, dy);
    if (this.inAttackRange(ctx)) {
      this.body.setVelocity(0, 0);
    } else {
      this.body.setVelocity(dx * this.stats.moveSpeed, dy * this.stats.moveSpeed);
    }
  }

  /**
   * Perform an attack on the siege objective when in range. Default: a melee
   * strike carrying the giant's world position; the scene routes it to the
   * nearest ring segment or a citizen past a breach. Thrower overrides this to
   * spawn a ranged projectile instead.
   */
  protected performAttack(_ctx: EnemyContext): AttackEvent | null {
    return {
      role: this.role,
      damage: this.stats.attack,
      x: this.x,
      y: this.y,
      target: AttackTarget.Structure,
    };
  }

  /**
   * Perform a telegraphed swipe/lunge aimed at the HERO (bug 4). A short
   * out-and-back lunge tween toward the hero gives the strike a readable
   * wind-up; the returned event is routed to GameScene.damageHero, which owns
   * proximity + i-frames. Carries the giant's strike point so the scene can
   * range-check the hit.
   */
  protected performHeroAttack(ctx: EnemyContext): AttackEvent | null {
    this.faceToward(ctx.heroX, ctx.heroY);
    this.lungeAt(ctx.heroX, ctx.heroY);
    return {
      role: this.role,
      damage: this.stats.attack,
      x: this.x,
      y: this.y,
      target: AttackTarget.Hero,
    };
  }

  /** A brief out-and-back lunge toward a world point, for attack telegraphing. */
  protected lungeAt(x: number, y: number): void {
    let dx = x - this.x;
    let dy = y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    this.scene.tweens.add({
      targets: this,
      x: this.x + dx * HERO_THREAT.LUNGE_DISTANCE,
      y: this.y + dy * HERO_THREAT.LUNGE_DISTANCE,
      duration: HERO_THREAT.LUNGE_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }
}
