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

export type HeroDenyReason =
  | 'already'
  | 'notRecruited'
  | 'cost'
  | 'shards'
  | 'maxLevel';

export interface HeroCheck {
  ok: boolean;
  reason?: HeroDenyReason;
}

export interface HeroProgress {
  level: number;
  stars: number;
  /** Compatibility projection of the canonical hero shard wallet. */
  shards: number;
}

export interface HeroStateJSON {
  recruited: Record<string, HeroProgress>;
  /** Shards exist independently of recruitment and are never discarded. */
  shardsByHero: Record<string, number>;
  active: HeroId | null;
}

/** Pure hero roster, pre-recruit shard wallets, and repeatable patronage. */
export class HeroSystem {
  private readonly _recruited = new Map<HeroId, HeroProgress>();
  private readonly _shards = new Map<HeroId, number>();
  private _active: HeroId | null;

  constructor(
    recruited?: Iterable<[HeroId, HeroProgress]>,
    active?: HeroId | null,
    shards?: Partial<Record<HeroId, number>>,
  ) {
    for (const id of HERO_ORDER) this._shards.set(id, sanitizeCount(shards?.[id]));
    if (recruited) {
      for (const [id, progress] of recruited) {
        if (!HERO_DEFS[id]) continue;
        const clean = sanitizeProgress(id, progress);
        this._recruited.set(id, clean);
        // v1-v7 additive migration: legacy recruited progress held the wallet.
        this._shards.set(id, Math.max(this.shards(id), clean.shards));
      }
    }
    this._active = active && this._recruited.has(active) ? active : null;
  }

  isRecruited(id: HeroId): boolean {
    return this._recruited.has(id);
  }

  get recruited(): HeroId[] {
    return HERO_ORDER.filter((id) => this._recruited.has(id));
  }

  get activeHero(): HeroId | null {
    return this._active;
  }

  /** Canonical wallet, available before and after recruitment. */
  shards(id: HeroId): number {
    return this._shards.get(id) ?? 0;
  }

  progress(id: HeroId): HeroProgress | null {
    const p = this._recruited.get(id);
    return p ? { level: p.level, stars: p.stars, shards: this.shards(id) } : null;
  }

  canRecruit(id: HeroId, store: ResourceStore): HeroCheck {
    if (this._recruited.has(id)) return { ok: false, reason: 'already' };
    if (!store.canAfford(heroDef(id).recruitCost)) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  recruit(id: HeroId, store: ResourceStore): HeroCheck {
    const check = this.canRecruit(id, store);
    if (!check.ok) return check;
    if (!store.spend(heroDef(id).recruitCost)) return { ok: false, reason: 'cost' };
    this._recruited.set(id, { level: 1, stars: 0, shards: this.shards(id) });
    if (this._active === null) this._active = id;
    return { ok: true };
  }

  canLevelUp(id: HeroId, store: ResourceStore): HeroCheck {
    const p = this._recruited.get(id);
    if (!p) return { ok: false, reason: 'notRecruited' };
    if (p.level >= heroDef(id).maxLevel) return { ok: false, reason: 'maxLevel' };
    if (!store.canAfford(heroLevelUpCost(id, p.level))) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  levelUp(id: HeroId, store: ResourceStore): HeroCheck {
    const check = this.canLevelUp(id, store);
    if (!check.ok) return check;
    const p = this._recruited.get(id)!;
    if (!store.spend(heroLevelUpCost(id, p.level))) return { ok: false, reason: 'cost' };
    p.level += 1;
    return { ok: true };
  }

  addShards(id: HeroId, n: number): void {
    const amount = sanitizeCount(n);
    if (amount <= 0) return;
    this._shards.set(id, this.shards(id) + amount);
    const p = this._recruited.get(id);
    if (p) p.shards = this.shards(id);
  }

  canStarUp(id: HeroId): HeroCheck {
    const p = this._recruited.get(id);
    if (!p) return { ok: false, reason: 'notRecruited' };
    const def = heroDef(id);
    if (p.stars >= def.starMax) return { ok: false, reason: 'maxLevel' };
    if (this.shards(id) < def.shardsPerStar) return { ok: false, reason: 'shards' };
    return { ok: true };
  }

  starUp(id: HeroId): HeroCheck {
    const check = this.canStarUp(id);
    if (!check.ok) return check;
    const p = this._recruited.get(id)!;
    this._shards.set(id, this.shards(id) - heroDef(id).shardsPerStar);
    p.shards = this.shards(id);
    p.stars += 1;
    return { ok: true };
  }

  /** Atomically spend the fixed Royal Patronage cost for exactly one shard. */
  purchasePatronage(id: HeroId, store: ResourceStore): HeroCheck {
    const cost = heroDef(id).patronageCost;
    if (!store.canAfford(cost)) return { ok: false, reason: 'cost' };
    if (!store.spend(cost)) return { ok: false, reason: 'cost' };
    this.addShards(id, 1);
    return { ok: true };
  }

  setActive(id: HeroId | null): boolean {
    if (id === null) {
      this._active = null;
      return true;
    }
    if (!this._recruited.has(id)) return false;
    this._active = id;
    return true;
  }

  private multiplierFor(role: 'war' | 'economy'): number {
    if (this._active === null) return 1;
    const def = heroDef(this._active);
    if (def.role !== role) return 1;
    const p = this._recruited.get(this._active)!;
    return heroMultiplierAt(this._active, p.level, p.stars);
  }

  combatMultiplier(): number {
    return this.multiplierFor('war');
  }

  economyMultiplier(): number {
    return this.multiplierFor('economy');
  }

  toJSON(): HeroStateJSON {
    const recruited: Record<string, HeroProgress> = {};
    const shardsByHero: Record<string, number> = {};
    for (const id of HERO_ORDER) {
      shardsByHero[id] = this.shards(id);
      const p = this._recruited.get(id);
      if (p) recruited[id] = { level: p.level, stars: p.stars, shards: this.shards(id) };
    }
    return { recruited, shardsByHero, active: this._active };
  }

  static fromJSON(
    data:
      | {
          recruited?: Record<string, Partial<HeroProgress>> | null;
          shardsByHero?: Record<string, number> | null;
          active?: string | null;
        }
      | undefined
      | null,
  ): HeroSystem {
    if (!data || typeof data !== 'object') return new HeroSystem();
    const entries: [HeroId, HeroProgress][] = [];
    const rec = data.recruited;
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      for (const [id, progress] of Object.entries(rec)) {
        if (isHeroId(id) && progress && typeof progress === 'object') {
          entries.push([id, sanitizeProgress(id, progress)]);
        }
      }
    }
    const wallets: Partial<Record<HeroId, number>> = {};
    if (data.shardsByHero && typeof data.shardsByHero === 'object' && !Array.isArray(data.shardsByHero)) {
      for (const id of HERO_ORDER) wallets[id] = sanitizeCount(data.shardsByHero[id]);
    }
    const active = typeof data.active === 'string' && isHeroId(data.active) ? data.active : null;
    return new HeroSystem(entries, active, wallets);
  }
}

function sanitizeProgress(id: HeroId, progress: Partial<HeroProgress> | undefined): HeroProgress {
  const def = heroDef(id);
  return {
    level: clampInt(progress?.level ?? 1, 1, def.maxLevel),
    stars: clampInt(progress?.stars ?? 0, 0, def.starMax),
    shards: sanitizeCount(progress?.shards),
  };
}

function sanitizeCount(n: unknown): number {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.floor(value));
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : lo);
  return Math.max(lo, Math.min(hi, v));
}
