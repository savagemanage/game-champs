import Phaser from 'phaser';
import { ARENA } from '../../config/PlayerConfig';
import { EnemyRole } from '../../config/GameConfig';
import { ENEMY_TEXTURE_BY_ROLE, type TextureKey } from '../../config/AssetKeys';
import { ENEMY_COMBAT, ENEMY_STATS, HERO_AGGRESSION, HERO_THREAT, type EnemyStats } from '../../config/EnemyConfig';
import { coolingNodeOffset, isFrontalHit } from '../../systems/SiegeGeometry';
import type { RandomSource } from '../../systems/DeterministicRng';

const ATTACK_CUE_TINT: Record<EnemyRole, number> = {
  [EnemyRole.Surveyor]: 0xffcf5c,
  [EnemyRole.Skitter]: 0x59e6ff,
  [EnemyRole.Rammer]: 0xff725c,
  [EnemyRole.Fluxborn]: 0xb58cff,
  [EnemyRole.Bastion]: 0xf2f5f7,
  [EnemyRole.Bombard]: 0x7eff9b,
};

export interface HitResult {
  readonly damage: number;
  readonly crit: boolean;
  readonly blocked: boolean;
  readonly killed: boolean;
}

export interface SiegeTarget { readonly x: number; readonly y: number; readonly ring: number; readonly index: number }
export interface CitizenTarget { readonly x: number; readonly y: number; readonly reference: object }
export type StructureTarget =
  | ({ readonly kind: 'wall' } & SiegeTarget)
  | ({ readonly kind: 'citizen' } & CitizenTarget)
  | { readonly kind: 'point'; readonly x: number; readonly y: number };
export interface EnemyContext {
  readonly centerX: number;
  readonly centerY: number;
  readonly heroX: number;
  readonly heroY: number;
  readonly nearestTarget: (x: number, y: number) => SiegeTarget | null;
  readonly nearestCitizen: (x: number, y: number) => CitizenTarget | null;
  readonly canEnterCitizens: (x: number, y: number) => boolean;
  readonly isStructureValid: (target: StructureTarget) => boolean;
  readonly reducedMotion: boolean;
  readonly nowMs: number;
  readonly dtMs: number;
}

export const enum AttackTarget { Structure = 0, Hero = 1 }
export interface AttackEvent {
  readonly role: EnemyRole;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
  readonly target: AttackTarget;
  readonly structure?: StructureTarget;
}

interface PendingAttack {
  readonly target: AttackTarget;
  readonly impactAt: number;
  readonly structure?: StructureTarget;
}

/** Shared autonomous siege-machine lifecycle and deterministic AI. */
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare public body: Phaser.Physics.Arcade.Body;
  public readonly stats: EnemyStats;
  protected hp: number;
  protected facingX = 0;
  protected facingY = 1;
  protected readonly rng: RandomSource;

  private staggerUntil = 0;
  private nextAttackAt = 0;
  private dying = false;
  private dead = false;
  private deathEndsAt = 0;
  private heroHuntUntil = 0;
  private nextHeroDecisionAt = 0;
  private pendingAttack: PendingAttack | null = null;
  private simulationNow = 0;
  private enteredInnerDistrict = false;
  private reducedMotion = false;

  constructor(scene: Phaser.Scene, x: number, y: number, role: EnemyRole, rng: RandomSource) {
    super(scene, x, y, ENEMY_TEXTURE_BY_ROLE[role] as TextureKey, 0);
    this.stats = ENEMY_STATS[role];
    this.hp = this.stats.maxHp;
    this.rng = rng;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5);
    this.body.setAllowGravity(false);
    this.body.setImmovable(false);
    const frameWidth = this.frame.realWidth;
    const frameHeight = this.frame.realHeight;
    this.body.setSize(this.stats.bodyWidth, this.stats.bodyHeight);
    this.body.setOffset((frameWidth - this.stats.bodyWidth) / 2, (frameHeight - this.stats.bodyHeight) / 2);
    Enemy.ensureAnimations(scene, role);
    const walkKey = Enemy.walkAnimKey(role);
    if (scene.anims.exists(walkKey)) this.play(walkKey);
    this.faceToward(ARENA.CENTER_X, ARENA.CENTER_Y);
  }

  get role(): EnemyRole { return this.stats.role; }
  get isDying(): boolean { return this.dying; }
  get currentHp(): number { return Math.max(0, this.hp); }
  get facing(): { x: number; y: number } { return { x: this.facingX, y: this.facingY }; }
  protected get staggered(): boolean { return this.simulationNow < this.staggerUntil; }

  private static ensureAnimations(scene: Phaser.Scene, role: EnemyRole): void {
    const key = Enemy.walkAnimKey(role);
    if (scene.anims.exists(key)) return;
    const texture = ENEMY_TEXTURE_BY_ROLE[role] as string;
    scene.anims.create({
      key,
      frames: [{ key: texture, frame: 0 }, { key: texture, frame: 1 }],
      frameRate: 4,
      repeat: -1,
    });
  }

  private static walkAnimKey(role: EnemyRole): string { return `machine_move_${role}`; }

  protected setFacing(fx: number, fy: number): void {
    const len = Math.hypot(fx, fy);
    if (len < 1e-4) return;
    this.facingX = fx / len;
    this.facingY = fy / len;
    this.setFlipX(this.facingX > 0);
  }

  protected faceToward(x: number, y: number): void { this.setFacing(x - this.x, y - this.y); }

  getCoolingNodeWorld(): Phaser.Math.Vector2 {
    const offset = coolingNodeOffset(this.facingX, this.facingY, this.stats.nodeDistance);
    return new Phaser.Math.Vector2(this.x + offset.x, this.y + offset.y);
  }

  getNodeRadius(): number { return ENEMY_COMBAT.NODE_RADIUS; }

  getBodyAabb(): { left: number; top: number; right: number; bottom: number } {
    return { left: this.body.left, top: this.body.top, right: this.body.right, bottom: this.body.bottom };
  }

  applyHit(baseDamage: number, attackerX: number, attackerY: number, onNode: boolean, nowMs: number): HitResult {
    if (this.dying || this.dead) return { damage: 0, crit: false, blocked: false, killed: false };
    let damage = baseDamage;
    let blocked = false;
    if (onNode) {
      damage = this.role === EnemyRole.Bastion ? Math.round(baseDamage * this.stats.nodeCritMultiplier) : this.hp;
    } else if (
      this.stats.frontalResist > 0 &&
      isFrontalHit(this.facingX, this.facingY, attackerX - this.x, attackerY - this.y, ENEMY_COMBAT.FRONTAL_CONE_DEG)
    ) {
      damage = baseDamage * (1 - this.stats.frontalResist);
      blocked = true;
    }
    damage = Math.max(0, Math.round(damage));
    this.hp = Math.max(0, this.hp - damage);
    this.staggerUntil = nowMs + (onNode ? ENEMY_COMBAT.STAGGER_CRIT_MS : ENEMY_COMBAT.STAGGER_MS);
    this.hitFlash(onNode, blocked);
    const killed = this.hp <= 0;
    if (killed) this.beginDeath(nowMs);
    return { damage, crit: onNode, blocked, killed };
  }

  private hitFlash(critical: boolean, blocked: boolean): void {
    this.setTintFill(blocked ? 0xbfefff : critical ? 0xffffff : 0xffd29d);
    this.scene.time.delayedCall(80, () => { if (!this.dead) this.clearTint(); });
  }

  private beginDeath(nowMs: number): void {
    if (this.dying) return;
    this.dying = true;
    this.deathEndsAt = nowMs + ENEMY_COMBAT.DEATH_MS;
    this.pendingAttack = null;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.setTintFill(0xffffff);
    if (this.reducedMotion) {
      this.setAlpha(0.2);
    } else {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scaleX: this.scaleX * 1.1,
        scaleY: this.scaleY * 0.85,
        duration: ENEMY_COMBAT.DEATH_MS,
        ease: 'Quad.easeIn',
      });
    }
  }

  protected structureTarget(ctx: EnemyContext): StructureTarget {
    const citizen = this.enteredInnerDistrict ? ctx.nearestCitizen(this.x, this.y) : null;
    if (citizen) return { kind: 'citizen', ...citizen };
    const wall = ctx.nearestTarget(this.x, this.y);
    if (wall) return { kind: 'wall', ...wall };
    return { kind: 'point', x: ctx.centerX, y: ctx.centerY };
  }

  protected currentTarget(ctx: EnemyContext): { x: number; y: number } {
    return this.structureTarget(ctx);
  }

  protected headingTo(target: { x: number; y: number }): { x: number; y: number } {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  protected inAttackRange(ctx: EnemyContext): boolean {
    const target = this.currentTarget(ctx);
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= this.stats.attackRange;
  }

  protected distanceToHero(ctx: EnemyContext): number {
    return Phaser.Math.Distance.Between(this.x, this.y, ctx.heroX, ctx.heroY);
  }

  protected isHuntingHero(ctx: EnemyContext): boolean {
    const aggression = HERO_AGGRESSION[this.role];
    if (aggression.divertChance <= 0) return false;
    if (ctx.nowMs < this.heroHuntUntil) return true;
    const close = this.distanceToHero(ctx) <= HERO_THREAT.THREAT_RADIUS;
    if (close && ctx.nowMs >= this.nextHeroDecisionAt) {
      this.nextHeroDecisionAt = ctx.nowMs + HERO_THREAT.DECISION_CADENCE_MS;
      if (this.rng.chance(aggression.divertChance)) {
        this.heroHuntUntil = ctx.nowMs + aggression.stickinessMs;
        return true;
      }
    }
    return false;
  }

  protected inHeroMeleeRange(ctx: EnemyContext): boolean {
    return this.distanceToHero(ctx) <= HERO_THREAT.MELEE_HERO_RANGE;
  }

  update(ctx: EnemyContext): AttackEvent | null {
    this.simulationNow = ctx.nowMs;
    this.reducedMotion = ctx.reducedMotion;
    if (this.dead) return null;
    if (this.dying) {
      if (ctx.nowMs >= this.deathEndsAt) {
        this.dead = true;
        this.destroy();
      }
      return null;
    }
    if (this.staggered) { this.body.setVelocity(0, 0); return null; }

    this.enteredInnerDistrict ||= ctx.canEnterCitizens(this.x, this.y);
    if (this.pendingAttack) {
      this.body.setVelocity(0, 0);
      if (ctx.nowMs < this.pendingAttack.impactAt) return null;
      const pending = this.pendingAttack;
      this.pendingAttack = null;
      this.clearTint();
      this.setScale(1);
      if (pending.target === AttackTarget.Hero) {
        return this.inHeroMeleeRange(ctx) ? this.performHeroAttack(ctx) : null;
      }
      const structure = pending.structure;
      if (!structure || !ctx.isStructureValid(structure)) return null;
      const inRange = Phaser.Math.Distance.Between(this.x, this.y, structure.x, structure.y) <= this.stats.attackRange;
      return inRange ? this.performAttack(ctx, structure) : null;
    }

    this.steer(ctx);
    if (ctx.nowMs < this.nextAttackAt) return null;
    const target = this.isHuntingHero(ctx) && this.inHeroMeleeRange(ctx)
      ? AttackTarget.Hero
      : this.inAttackRange(ctx) ? AttackTarget.Structure : null;
    if (target === null) return null;
    const structure = target === AttackTarget.Structure ? this.structureTarget(ctx) : undefined;
    this.pendingAttack = { target, structure, impactAt: ctx.nowMs + ENEMY_COMBAT.ATTACK_WINDUP_MS };
    this.nextAttackAt = this.pendingAttack.impactAt + this.stats.attackCooldownMs;
    const point = target === AttackTarget.Hero ? { x: ctx.heroX, y: ctx.heroY } : structure ?? this.currentTarget(ctx);
    this.faceToward(point.x, point.y);
    this.setTint(ATTACK_CUE_TINT[this.role]);
    this.setScale(1.06);
    if (!ctx.reducedMotion) this.lungeAt(point.x, point.y);
    return null;
  }

  protected steerTowardHero(ctx: EnemyContext, speedMult = 1): void {
    this.faceToward(ctx.heroX, ctx.heroY);
    if (this.inHeroMeleeRange(ctx)) { this.body.setVelocity(0, 0); return; }
    const heading = this.headingTo({ x: ctx.heroX, y: ctx.heroY });
    this.body.setVelocity(heading.x * this.stats.moveSpeed * speedMult, heading.y * this.stats.moveSpeed * speedMult);
  }

  protected steer(ctx: EnemyContext): void {
    if (this.isHuntingHero(ctx)) { this.steerTowardHero(ctx); return; }
    const target = this.currentTarget(ctx);
    const heading = this.headingTo(target);
    this.setFacing(heading.x, heading.y);
    this.body.setVelocity(
      this.inAttackRange(ctx) ? 0 : heading.x * this.stats.moveSpeed,
      this.inAttackRange(ctx) ? 0 : heading.y * this.stats.moveSpeed,
    );
  }

  protected performAttack(_ctx: EnemyContext, structure: StructureTarget): AttackEvent | null {
    return {
      role: this.role,
      damage: this.stats.attack,
      x: structure.x,
      y: structure.y,
      target: AttackTarget.Structure,
      structure,
    };
  }

  protected performHeroAttack(_ctx: EnemyContext): AttackEvent | null {
    return { role: this.role, damage: this.stats.attack, x: this.x, y: this.y, target: AttackTarget.Hero };
  }

  protected lungeAt(_x: number, _y: number): void {
    // Presentation-only pulse: authoritative position remains on the fixed-step body.
    this.scene.tweens.add({
      targets: this,
      scaleX: this.scaleX * 1.08,
      scaleY: this.scaleY * 1.08,
      duration: HERO_THREAT.LUNGE_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }
}
