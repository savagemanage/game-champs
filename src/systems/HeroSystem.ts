import {
  HERO_DEFS,
  HERO_ORDER,
  heroDef,
  heroLevelUpCost,
  heroMultiplierAt,
  isHeroId,
  type HeroId,
} from '../config/HeroConfig';
import type { ResourceStore } from './ResourceStore';

/** Why a hero cannot be recruited/leveled/starred right now. */
export type HeroDenyReason =
  | 'already' // the hero is already recruited (recruit only)
  | 'notRecruited' // the hero has not been recruited yet (level/star only)
  | 'cost' // not enough resources
  | 'shards' // not enough hero shards (star-up)
  | 'maxLevel'; // already at the level cap (level-up only)

/** Result of a hero gate check. */
export interface HeroCheck {
  ok: boolean;
  reason?: HeroDenyReason;
}

/** The mutable per-hero progression state. */
export interface HeroProgress {
  level: number;
  stars: number;
  /** Accrued shards (spent when starring up). */
  shards: number;
}

/** Serialized shape persisted by the save layer. */
export interface HeroStateJSON {
  recruited: Record<string, HeroProgress>;
  active: HeroId | null;
}

/**
 * HeroSystem - the pure (no Phaser) hero roster runtime.
 *
 * Owns which heroes are recruited (each with a level/stars/shards), plus the
 * single ACTIVE hero. The active hero grants a role-gated multiplier: a 'war'
 * hero raises {@link combatMultiplier} (composed alongside the research combat
 * bonus at the battle seam), while an 'economy' hero raises
 * {@link economyMultiplier} (composed alongside the research production bonus at
 * the production seam). When no hero is active - or the active hero's role does
 * not match the queried domain - the getter is neutral (1.0), so a fresh game
 * changes nothing.
 *
 * Recruiting and leveling spend resources; starring up spends accrued SHARDS
 * (which quest rewards / future systems grant via {@link addShards}). Every gate
 * returns a distinct reason code for legible UI messaging. Fully serializable
 * via toJSON/fromJSON, tolerating missing/old-save data.
 */
export class HeroSystem {
  private readonly _recruited: Map<HeroId, HeroProgress>;
  private _active: HeroId | null;

  constructor(recruited?: Iterable<[HeroId, HeroProgress]>, active?: HeroId | null) {
    this._recruited = new Map();
    if (recruited) {
      for (const [id, progress] of recruited) {
        if (HERO_DEFS[id]) this._recruited.set(id, sanitizeProgress(id, progress));
      }
    }
    this._active = active && this._recruited.has(active) ? active : null;
  }

  /** True when the given hero has been recruited. */
  isRecruited(id: HeroId): boolean {
    return this._recruited.has(id);
  }

  /** The recruited hero ids in HERO_ORDER order (defensive copy). */
  get recruited(): HeroId[] {
    return HERO_ORDER.filter((id) => this._recruited.has(id));
  }

  /** The active hero id, or null when none is assigned. */
  get activeHero(): HeroId | null {
    return this._active;
  }

  /** A defensive copy of a hero's progress, or null if not recruited. */
  progress(id: HeroId): HeroProgress | null {
    const p = this._recruited.get(id);
    return p ? { ...p } : null;
  }

  // ---- Recruit -------------------------------------------------------------

  /**
   * Whether `id` can be recruited right now: not already recruited, and the
   * recruit cost is affordable. Returns the first failing reason.
   */
  canRecruit(id: HeroId, store: ResourceStore): HeroCheck {
    if (this._recruited.has(id)) return { ok: false, reason: 'already' };
    if (!store.canAfford(heroDef(id).recruitCost)) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Recruit `id`, spending its cost from `store`. On success the hero joins the
   * roster at level 1 / 0 stars and - if no hero was active - becomes active.
   * On failure nothing changes and no resources are spent.
   */
  recruit(id: HeroId, store: ResourceStore): HeroCheck {
    const check = this.canRecruit(id, store);
    if (!check.ok) return check;
    if (!store.spend(heroDef(id).recruitCost)) return { ok: false, reason: 'cost' };
    this._recruited.set(id, { level: 1, stars: 0, shards: 0 });
    if (this._active === null) this._active = id;
    return { ok: true };
  }

  // ---- Level up ------------------------------------------------------------

  /**
   * Whether `id` can level up: recruited, below the level cap, and the scaling
   * level-up cost is affordable. Returns the first failing reason.
   */
  canLevelUp(id: HeroId, store: ResourceStore): HeroCheck {
    const p = this._recruited.get(id);
    if (!p) return { ok: false, reason: 'notRecruited' };
    if (p.level >= heroDef(id).maxLevel) return { ok: false, reason: 'maxLevel' };
    if (!store.canAfford(heroLevelUpCost(id, p.level))) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Level `id` up by one, spending the scaling level-up cost from `store`. On
   * failure nothing changes.
   */
  levelUp(id: HeroId, store: ResourceStore): HeroCheck {
    const check = this.canLevelUp(id, store);
    if (!check.ok) return check;
    const p = this._recruited.get(id)!;
    if (!store.spend(heroLevelUpCost(id, p.level))) return { ok: false, reason: 'cost' };
    p.level += 1;
    return { ok: true };
  }

  // ---- Stars (shards) ------------------------------------------------------

  /**
   * Grant `n` shards to a recruited hero (quest rewards / future systems). A
   * non-recruited hero or a non-positive `n` is a no-op. Shards accrue and are
   * later spent by {@link starUp}.
   */
  addShards(id: HeroId, n: number): void {
    const p = this._recruited.get(id);
    if (!p) return;
    const amount = Math.floor(n);
    if (amount <= 0) return;
    p.shards += amount;
  }

  /**
   * Whether `id` can gain a star: recruited, below the star cap, and holding at
   * least {@link HeroDef.shardsPerStar} shards. Returns the first failing reason.
   */
  canStarUp(id: HeroId): HeroCheck {
    const p = this._recruited.get(id);
    if (!p) return { ok: false, reason: 'notRecruited' };
    const def = heroDef(id);
    if (p.stars >= def.starMax) return { ok: false, reason: 'maxLevel' };
    if (p.shards < def.shardsPerStar) return { ok: false, reason: 'shards' };
    return { ok: true };
  }

  /**
   * Spend {@link HeroDef.shardsPerStar} shards to gain one star. On failure
   * nothing changes.
   */
  starUp(id: HeroId): HeroCheck {
    const check = this.canStarUp(id);
    if (!check.ok) return check;
    const p = this._recruited.get(id)!;
    p.shards -= heroDef(id).shardsPerStar;
    p.stars += 1;
    return { ok: true };
  }

  // ---- Active selection ----------------------------------------------------

  /**
   * Assign the active hero. Passing a recruited id makes it active; passing
   * null clears the active hero. A non-recruited id is rejected (returns false,
   * active unchanged).
   */
  setActive(id: HeroId | null): boolean {
    if (id === null) {
      this._active = null;
      return true;
    }
    if (!this._recruited.has(id)) return false;
    this._active = id;
    return true;
  }

  // ---- Bonus getters -------------------------------------------------------

  /**
   * The full multiplier (>= 1) the active hero grants in `role`'s domain, or 1
   * when no hero is active or the active hero's role does not match. This is
   * the single place the war/economy split is decided.
   */
  private multiplierFor(role: 'war' | 'economy'): number {
    if (this._active === null) return 1;
    const def = heroDef(this._active);
    if (def.role !== role) return 1;
    const p = this._recruited.get(this._active)!;
    return heroMultiplierAt(this._active, p.level, p.stars);
  }

  /**
   * Combat multiplier from the active WAR hero (1 when none/economy active).
   * Composed alongside the research combat multiplier at the battle seam.
   */
  combatMultiplier(): number {
    return this.multiplierFor('war');
  }

  /**
   * Economy/production multiplier from the active ECONOMY hero (1 when
   * none/war active). Composed alongside the research production multiplier at
   * the production seam.
   */
  economyMultiplier(): number {
    return this.multiplierFor('economy');
  }

  // ---- Serialization -------------------------------------------------------

  /** Serialize to a plain, JSON-safe object. */
  toJSON(): HeroStateJSON {
    const recruited: Record<string, HeroProgress> = {};
    for (const id of this.recruited) {
      recruited[id] = { ...this._recruited.get(id)! };
    }
    return { recruited, active: this._active };
  }

  /**
   * Restore from a plain object produced by {@link toJSON}. Tolerates a missing
   * / malformed value (old saves with no hero field) by returning a fresh,
   * empty HeroSystem, so migrations never crash. Unknown hero ids are filtered
   * so a hand-edited / stale save cannot inject bad heroes.
   */
  static fromJSON(
    data:
      | {
          recruited?: Record<string, Partial<HeroProgress>> | null;
          active?: string | null;
        }
      | undefined
      | null,
  ): HeroSystem {
    if (!data || typeof data !== 'object') return new HeroSystem();
    const entries: [HeroId, HeroProgress][] = [];
    const rec = data.recruited;
    if (rec && typeof rec === 'object') {
      for (const [id, progress] of Object.entries(rec)) {
        if (isHeroId(id)) entries.push([id, sanitizeProgress(id, progress)]);
      }
    }
    const active =
      typeof data.active === 'string' && isHeroId(data.active) ? data.active : null;
    return new HeroSystem(entries, active);
  }
}

/**
 * Coerce a possibly-partial/hand-edited progress record into a valid one,
 * clamped to the hero's level/star bounds with a non-negative integer shard
 * count. Keeps a stale save from over-crediting a hero.
 */
function sanitizeProgress(id: HeroId, progress: Partial<HeroProgress> | undefined): HeroProgress {
  const def = heroDef(id);
  const level = clampInt(progress?.level ?? 1, 1, def.maxLevel);
  const stars = clampInt(progress?.stars ?? 0, 0, def.starMax);
  const shards = Math.max(0, Math.floor(Number(progress?.shards) || 0));
  return { level, stars, shards };
}

/** Clamp `n` to the inclusive integer range [lo, hi]. */
function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : lo);
  return Math.max(lo, Math.min(hi, v));
}
