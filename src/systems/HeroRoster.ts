import { HEROES } from '../config/GameConfig';
import {
  HERO_DEFS,
  heroDef,
  heroPower,
  levelCapForStars,
  maxStars,
  shardsForStar,
  shardsToOwn,
  unlockedSkillCount,
  xpToNextLevel,
} from '../config/HeroConfig';
import type { HeroId, HeroRosterState, OwnedHeroState } from '../types';
import { HERO_IDS } from '../types';

/** The aggregate lead-hero bonuses the whole hold enjoys. */
export interface HeroBonuses {
  /** Additive fraction added to combat/army power (e.g. 0.15 = +15%). */
  army: number;
  /** Additive fraction added to the idle-production multiplier (e.g. 0.10). */
  economy: number;
}

/** A brand-new, fully-owned hero record at level 1 / 1 star with skill 0. */
function freshOwned(id: HeroId): OwnedHeroState {
  return {
    id,
    owned: true,
    level: 1,
    xp: 0,
    stars: 1,
    shards: 0,
    skillLevels: skillLevelsForStars(id, 1),
  };
}

/** An un-owned record that only accumulates shards toward the first copy. */
function freshUnowned(id: HeroId): OwnedHeroState {
  return { id, owned: false, level: 0, xp: 0, stars: 0, shards: 0, skillLevels: {} };
}

/**
 * The skill-level map for a hero at a given star rank: every unlocked skill
 * (skill i unlocks at star i+1) is set to the current star rank so a starred-up
 * hero's skills scale with it. Pure.
 */
function skillLevelsForStars(id: HeroId, stars: number): Record<string, number> {
  const out: Record<string, number> = {};
  const unlocked = unlockedSkillCount(id, stars);
  const skills = heroDef(id).skills;
  for (let i = 0; i < unlocked; i++) {
    out[skills[i].id] = Math.max(1, Math.floor(stars));
  }
  return out;
}

/**
 * HeroRoster - the owned-hero collection + hero development as PURE logic.
 *
 * No Phaser import; mirrors the other systems. It owns:
 *   - every TOUCHED hero's {@link OwnedHeroState} (owned or shard-accumulating),
 *   - the LEAD picks (capped at HEROES.MAX_LEAD) whose bonuses apply hold-wide,
 *   - level-up (spending XP against the {@link xpToNextLevel} curve, capped by
 *     the star-derived level ceiling),
 *   - star-up (spending shards against the {@link shardsForStar} curve, raising
 *     stats + unlocking/raising skills),
 *   - the aggregate {@link HeroBonuses} the lead heroes grant, which GameState
 *     consumes so heroes MATTER for production and combat.
 *
 * Serializable via toJSON / fromJSON.
 */
export class HeroRoster {
  private readonly _heroes: Map<HeroId, OwnedHeroState> = new Map();
  private _lead: HeroId[] = [];

  constructor(state?: HeroRosterState) {
    if (state?.heroes) {
      for (const id of HERO_IDS) {
        const h = state.heroes[id];
        if (h) this._heroes.set(id, normalizeHero(id, h));
      }
    }
    if (state?.lead) {
      for (const id of state.lead) {
        if (HERO_IDS.includes(id) && this.isOwned(id) && !this._lead.includes(id)) {
          this._lead.push(id);
        }
        if (this._lead.length >= HEROES.MAX_LEAD) break;
      }
    }
  }

  /** Whether a hero has its first full copy. */
  isOwned(id: HeroId): boolean {
    return this._heroes.get(id)?.owned ?? false;
  }

  /** The owned/shard state for a hero (a defensive copy), or undefined if untouched. */
  get(id: HeroId): OwnedHeroState | undefined {
    const h = this._heroes.get(id);
    return h ? { ...h, skillLevels: { ...h.skillLevels } } : undefined;
  }

  /** All owned hero ids (stable HERO_IDS order). */
  ownedIds(): HeroId[] {
    return HERO_IDS.filter((id) => this.isOwned(id));
  }

  /** The current lead heroes (a copy). */
  get lead(): HeroId[] {
    return [...this._lead];
  }

  /** Loose shards held for a hero (0 if untouched). */
  shards(id: HeroId): number {
    return this._heroes.get(id)?.shards ?? 0;
  }

  private ensure(id: HeroId): OwnedHeroState {
    let h = this._heroes.get(id);
    if (!h) {
      h = freshUnowned(id);
      this._heroes.set(id, h);
    }
    return h;
  }

  /**
   * Grant a FIRST copy of a hero (from a summon). If already owned, this instead
   * banks shards (the caller normally routes duplicates via {@link addShards}).
   * Returns true when a new copy was granted.
   */
  grantHero(id: HeroId): boolean {
    const h = this.ensure(id);
    if (h.owned) return false;
    const fresh = freshOwned(id);
    fresh.shards = h.shards; // keep any pre-accumulated shards
    this._heroes.set(id, fresh);
    return true;
  }

  /** Add loose shards toward a hero (duplicates / campaign rewards). */
  addShards(id: HeroId, amount: number): void {
    if (amount <= 0) return;
    const h = this.ensure(id);
    h.shards += Math.floor(amount);
  }

  /**
   * Craft the FIRST copy from banked shards when enough are held (the star-0
   * cost). Returns true on success. Owned heroes cannot be re-crafted.
   */
  craftFromShards(id: HeroId): boolean {
    const h = this.ensure(id);
    if (h.owned) return false;
    const cost = shardsToOwn(id);
    if (h.shards < cost) return false;
    const fresh = freshOwned(id);
    fresh.shards = h.shards - cost;
    this._heroes.set(id, fresh);
    return true;
  }

  /**
   * Grant XP to an owned hero and apply as many whole level-ups as the XP and
   * the star-derived level cap allow. Excess XP at the cap is retained (so it
   * counts once the hero stars up). Returns the number of levels gained.
   */
  addXp(id: HeroId, amount: number): number {
    const h = this._heroes.get(id);
    if (!h || !h.owned || amount <= 0) return 0;
    h.xp += Math.floor(amount);
    let gained = 0;
    let cap = levelCapForStars(h.stars);
    while (h.level < cap) {
      const need = xpToNextLevel(h.level);
      if (h.xp < need) break;
      h.xp -= need;
      h.level += 1;
      gained += 1;
      cap = levelCapForStars(h.stars);
    }
    return gained;
  }

  /**
   * Star up an owned hero by spending the shard cost for its current star rank,
   * if affordable and below the rarity's star ceiling. Raises stats (via the
   * higher star in {@link heroPower}) and unlocks/raises skills. Returns true on
   * success.
   */
  starUp(id: HeroId): boolean {
    const h = this._heroes.get(id);
    if (!h || !h.owned) return false;
    const ceiling = maxStars(id);
    if (h.stars >= ceiling) return false;
    const cost = shardsForStar(id, h.stars);
    if (h.shards < cost) return false;
    h.shards -= cost;
    h.stars += 1;
    // Unlock any newly-available skill and raise all unlocked skills to the star.
    h.skillLevels = mergeSkillLevels(id, h.stars, h.skillLevels);
    return true;
  }

  /** Set the lead heroes (owned only, de-duplicated, capped at MAX_LEAD). */
  setLead(ids: HeroId[]): void {
    const next: HeroId[] = [];
    for (const id of ids) {
      if (!HERO_IDS.includes(id) || !this.isOwned(id) || next.includes(id)) continue;
      next.push(id);
      if (next.length >= HEROES.MAX_LEAD) break;
    }
    this._lead = next;
  }

  /**
   * A single hero's current power (level + star scaled). 0 for un-owned heroes.
   */
  power(id: HeroId): number {
    const h = this._heroes.get(id);
    if (!h || !h.owned) return 0;
    return heroPower(id, h.level, h.stars);
  }

  /** Total power across all owned heroes (coarse collection strength / UI). */
  totalPower(): number {
    let total = 0;
    for (const id of this.ownedIds()) total += this.power(id);
    return total;
  }

  /**
   * The aggregate lead-hero bonuses. Each lead hero contributes its base bonus
   * scaled UP by its development: level (POWER_PER_LEVEL) and star
   * (POWER_PER_STAR) growth, further boosted by its unlocked skills' magnitudes.
   * `army` bonuses sum into the combat/army fraction; `economy` bonuses sum into
   * the production fraction. GameState consumes these so heroes MATTER.
   */
  bonuses(): HeroBonuses {
    let army = 0;
    let economy = 0;
    for (const id of this._lead) {
      const h = this._heroes.get(id);
      if (!h || !h.owned) continue;
      const def = heroDef(id);
      const levelFactor = 1 + HEROES.POWER_PER_LEVEL * (h.level - 1);
      const starFactor = 1 + HEROES.POWER_PER_STAR * (h.stars - 1);
      const skillFactor = 1 + this.skillMagnitude(id, h);
      const value = def.bonus.base * levelFactor * starFactor * skillFactor;
      if (def.bonus.kind === 'army') army += value;
      else economy += value;
    }
    return { army, economy };
  }

  /** Combat-power multiplier from lead heroes (1 + army bonus fraction). */
  armyPowerMultiplier(): number {
    return 1 + this.bonuses().army;
  }

  /** Production multiplier from lead heroes (1 + economy bonus fraction). */
  economyMultiplier(): number {
    return 1 + this.bonuses().economy;
  }

  /** Summed magnitude of a hero's UNLOCKED skills at their current levels. */
  private skillMagnitude(id: HeroId, h: OwnedHeroState): number {
    const skills = heroDef(id).skills;
    const unlocked = unlockedSkillCount(id, h.stars);
    let sum = 0;
    for (let i = 0; i < unlocked; i++) {
      const skill = skills[i];
      const lvl = h.skillLevels[skill.id] ?? 0;
      sum += skill.magnitudePerLevel * lvl;
    }
    return sum;
  }

  /** Serialize to a plain {@link HeroRosterState}. */
  toJSON(): HeroRosterState {
    const heroes: HeroRosterState['heroes'] = {};
    for (const [id, h] of this._heroes.entries()) {
      heroes[id] = { ...h, skillLevels: { ...h.skillLevels } };
    }
    return { heroes, lead: [...this._lead] };
  }

  /**
   * Restore from a persisted {@link HeroRosterState}. A missing / malformed
   * value yields an empty roster so old saves load without crashing.
   */
  static fromJSON(data: HeroRosterState | undefined | null): HeroRoster {
    if (!data || typeof data !== 'object') return new HeroRoster();
    return new HeroRoster(data);
  }
}

/**
 * Merge/refresh a hero's skill levels for its (new) star rank: every unlocked
 * skill is at least the star rank, keeping any higher persisted value. Pure.
 */
function mergeSkillLevels(
  id: HeroId,
  stars: number,
  existing: Record<string, number>,
): Record<string, number> {
  const base = skillLevelsForStars(id, stars);
  const out: Record<string, number> = { ...base };
  for (const [k, v] of Object.entries(existing)) {
    out[k] = Math.max(out[k] ?? 0, Math.floor(v));
  }
  return out;
}

/**
 * Coerce a persisted hero record into a valid {@link OwnedHeroState}, clamping
 * level to its star ceiling and stars to the rarity ceiling so a tampered or
 * older save cannot exceed the current rules.
 */
function normalizeHero(id: HeroId, h: OwnedHeroState): OwnedHeroState {
  const owned = Boolean(h.owned);
  const ceiling = maxStars(id);
  const stars = owned ? Math.min(ceiling, Math.max(1, Math.floor(h.stars ?? 1))) : 0;
  const levelCap = owned ? levelCapForStars(stars) : 0;
  const level = owned ? Math.min(levelCap, Math.max(1, Math.floor(h.level ?? 1))) : 0;
  const shards = Math.max(0, Math.floor(h.shards ?? 0));
  const xp = Math.max(0, Math.floor(h.xp ?? 0));
  // Rebuild skill levels from the star rank, honoring any higher persisted value.
  const skillLevels = owned
    ? mergeSkillLevels(id, stars, sanitizeSkillLevels(id, h.skillLevels))
    : {};
  return { id, owned, level, xp, stars, shards, skillLevels };
}

/** Keep only known skill ids with non-negative integer levels. */
function sanitizeSkillLevels(
  id: HeroId,
  raw: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  const known = new Set(HERO_DEFS[id].skills.map((s) => s.id));
  for (const [k, v] of Object.entries(raw)) {
    if (known.has(k) && typeof v === 'number' && v > 0) out[k] = Math.floor(v);
  }
  return out;
}
