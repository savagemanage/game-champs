/**
 * SaveManager.ts - versioned persistence of LAST SQUAD meta-progression.
 *
 * A run itself is transient and never saved; only meta-progression (coins,
 * purchased upgrade levels, personal bests, runs played) persists. The pure
 * layer works entirely with plain objects and an injected
 * {@link KeyValueStorage}, so it is fully testable in node with a fake store
 * and has NO window dependency. `load()` is robust: a missing, corrupt, or
 * wrong-version save yields a fresh game rather than crashing.
 */

import type {
  BuildingId,
  BuildingState,
  BuildingUpgrade,
  CampaignState,
  FormationState,
  GameState,
  GameStateV1,
  HeroInstance,
  HeroState,
  LeagueState,
  MetaUpgradeState,
  MiniGameMeta,
  MissionState,
  PityState,
  ResourceState,
  SeasonState,
  TutorialState,
} from '../types';
import { freshUpgrades } from './MetaProgress';
import { heroDef } from '../config/Heroes';
import {
  BUILDING_ORDER,
  BUILDINGS,
  ECONOMY,
  GAME_STATE,
  HEROES,
  RESOURCE_ORDER,
  UPGRADE_ORDER,
} from '../config/GameConfig';
import { CAMPAIGN_ORDER, SEASON } from '../config/Progression';
import { cumulativeXpForTier } from './Season';

/** Current save-format version. Bump when GameState shape changes. */
export const SAVE_VERSION = 3;

/** Default localStorage key for the single meta save slot. */
export const SAVE_KEY = 'last-squad:save';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}:backup`;
export const SAVE_TEMP_KEY = `${SAVE_KEY}:temp`;
export const SAVE_QUARANTINE_KEY = `${SAVE_KEY}:quarantine`;

export type SaveWarning = 'recovered_backup' | 'corrupt_reset' | 'future_version' | 'storage_unavailable';

/**
 * Minimal synchronous key/value storage. `window.localStorage` satisfies this,
 * and a plain object-backed fake satisfies it in tests - so the pure save logic
 * never touches `window` directly.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * SaveManager - versioned serialization of the meta GameState to plain JSON.
 * Persistence goes through the injected {@link KeyValueStorage}.
 */
export class SaveManager {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = SAVE_KEY,
  ) {}

  /**
   * A brand-new v2 game state: a fresh gate-runner meta block plus empty-but-
   * valid placeholders for every expanded sub-state (resources, buildings,
   * heroes, formation, season, missions). Later features populate those.
   */
  static freshGame(): GameState {
    return {
      version: SAVE_VERSION,
      miniGame: freshMiniGame(),
      resources: freshResources(),
      buildings: freshBuildings(),
      heroes: freshHeroes(),
      formation: freshFormation(),
      season: freshSeason(),
      missions: freshMissions(),
      campaign: freshCampaign(),
      league: freshLeague(),
      tutorial: freshTutorial(),
      runSequence: 0,
      settledRunSequence: 0,
      appliedRunIds: [],
      dailyCompletedRuns: { dayKey: -1, count: 0 },
      maxSeenWallTime: 0,
      maxDayOrdinal: -1,
      maxWeekOrdinal: -1,
      maxSeasonOrdinal: -1,
      pendingBattleSummary: null,
    };
  }

  /**
   * Serialize to a plain, versioned, JSON-safe v2 object (normalized). Missing
   * or malformed sub-states are filled with fresh defaults so downstream code
   * always sees a complete state.
   */
  static serialize(state: GameState): GameState {
    return {
      version: SAVE_VERSION,
      miniGame: normalizeMiniGame(state.miniGame),
      resources: normalizeResources(state.resources),
      buildings: normalizeBuildings(state.buildings),
      heroes: normalizeHeroes(state.heroes),
      formation: normalizeFormation(state.formation),
      season: normalizeSeason(state.season),
      missions: normalizeMissions(state.missions),
      campaign: normalizeCampaign(state.campaign),
      league: normalizeLeague(state.league),
      tutorial: normalizeTutorial(state.tutorial),
      runSequence: safeInt(state.runSequence),
      settledRunSequence: Math.max(
        safeInt(state.settledRunSequence),
        highestRunSequence(state.appliedRunIds),
      ),
      appliedRunIds: normalizeStringArray(state.appliedRunIds),
      dailyCompletedRuns: normalizeDailyRuns(state.dailyCompletedRuns),
      maxSeenWallTime: safeInt(state.maxSeenWallTime),
      maxDayOrdinal: safeKeyInt(state.maxDayOrdinal),
      maxWeekOrdinal: safeKeyInt(state.maxWeekOrdinal),
      maxSeasonOrdinal: safeKeyInt(state.maxSeasonOrdinal),
      pendingBattleSummary: normalizeBattleSummary(state.pendingBattleSummary),
    };
  }

  private readonly fallback = memoryStorage();
  private fallbackActive = false;
  private futureVersionLocked = false;
  private warningsInternal: SaveWarning[] = [];

  /** Non-fatal persistence/recovery notices for the UI. */
  get warnings(): readonly SaveWarning[] {
    return this.warningsInternal;
  }

  /** Persist a normalized state transactionally; fall back to session memory on failure. */
  save(state: GameState): GameState {
    const normalized = SaveManager.serialize(state);
    const json = JSON.stringify(normalized);
    // Validate our own serialization before replacing durable state.
    JSON.parse(json);
    const target = this.fallbackActive || this.futureVersionLocked ? this.fallback : this.storage;
    try {
      target.setItem(`${this.key}:temp`, json);
      const verified = target.getItem(`${this.key}:temp`);
      if (!verified || (JSON.parse(verified) as { version?: number }).version !== SAVE_VERSION) {
        throw new Error('save verification failed');
      }
      target.setItem(this.key, json);
      target.setItem(`${this.key}:backup`, json);
      target.removeItem(`${this.key}:temp`);
    } catch {
      this.fallbackActive = true;
      if (!this.warningsInternal.includes('storage_unavailable')) this.warningsInternal.push('storage_unavailable');
      this.fallback.setItem(this.key, json);
      this.fallback.setItem(`${this.key}:backup`, json);
    }
    return normalized;
  }

  /** Load primary, then backup; quarantine damage and migrate valid old saves. */
  load(): { state: GameState; loaded: boolean; warnings: readonly SaveWarning[] } {
    const primary = this.safeGet(this.key);
    const primaryVersion = primary ? readVersion(primary) : -1;

    // A save written by a newer build is authoritative even when an older
    // backup exists. Never overwrite or quarantine it: use session memory and
    // lock durable writes until the player explicitly resets progress.
    if (primary && primaryVersion > SAVE_VERSION) {
      this.futureVersionLocked = true;
      this.warningsInternal.push('future_version');
      return { state: SaveManager.freshGame(), loaded: false, warnings: this.warnings };
    }

    const backup = this.safeGet(`${this.key}:backup`);
    let decoded = this.decode(primary);

    if (!decoded && backup) {
      decoded = this.decode(backup);
      if (decoded) {
        this.warningsInternal.push('recovered_backup');
        try { this.storage.setItem(this.key, JSON.stringify(decoded)); } catch { this.fallbackActive = true; }
      }
    }

    if (!decoded) {
      if (primary) {
        this.warningsInternal.push('corrupt_reset');
        try { this.storage.setItem(`${this.key}:quarantine`, primary); } catch { this.fallbackActive = true; }
      }
      return { state: SaveManager.freshGame(), loaded: false, warnings: this.warnings };
    }

    // Normalize/migrate missing old-v3 fields and immediately persist the
    // complete v3 shape. A future version is never decoded or overwritten.
    const normalized = SaveManager.serialize(decoded);
    this.save(normalized);
    return { state: normalized, loaded: true, warnings: this.warnings };
  }

  private safeGet(key: string): string | null {
    try {
      return (this.fallbackActive ? this.fallback : this.storage).getItem(key);
    } catch {
      this.fallbackActive = true;
      if (!this.warningsInternal.includes('storage_unavailable')) this.warningsInternal.push('storage_unavailable');
      return this.fallback.getItem(key);
    }
  }

  private decode(raw: string | null): GameState | null {
    if (!raw) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    const version = (parsed as { version?: unknown }).version;
    if (version === SAVE_VERSION) {
      const state = parsed as GameState;
      return typeof state.miniGame === 'object' && state.miniGame !== null ? state : null;
    }
    if (version === 2) {
      const state = parsed as GameState;
      return typeof state.miniGame === 'object' && state.miniGame !== null ? migrateV2toV3(state) : null;
    }
    if (version === 1) {
      const legacy = parsed as GameStateV1;
      return typeof legacy.meta === 'object' && legacy.meta !== null ? migrateV1toV2(legacy) : null;
    }
    return null;
  }

  /** Delete game save slots while settings (a separate key) remain untouched. */
  clear(): void {
    this.futureVersionLocked = false;
    this.fallbackActive = false;
    for (const suffix of ['', ':backup', ':temp', ':quarantine']) {
      try { this.storage.removeItem(`${this.key}${suffix}`); } catch { /* memory-only session */ }
      this.fallback.removeItem(`${this.key}${suffix}`);
    }
  }
}

function readVersion(raw: string): number {
  try {
    const value = JSON.parse(raw) as { version?: unknown };
    const version = Number(value?.version);
    return Number.isFinite(version) ? version : -1;
  } catch {
    return -1;
  }
}

/** Highest valid sequence encoded by a generated `run-N` id. */
function highestRunSequence(ids: unknown): number {
  if (!Array.isArray(ids)) return 0;
  let highest = 0;
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const match = /^run-(\d+)$/.exec(id);
    if (!match) continue;
    const sequence = Number(match[1]);
    if (Number.isSafeInteger(sequence)) highest = Math.max(highest, sequence);
  }
  return highest;
}

/**
 * Migrate a legacy v1 save into a v2 {@link GameState}: the old top-level
 * `meta` gate-runner block moves verbatim under `miniGame`, and every new
 * sub-state is initialized to its fresh default. Normalization (clamps, missing
 * fields) is applied later by {@link SaveManager.serialize}, so this step only
 * needs to reshape the object; coins / upgrade levels / bests are preserved.
 */
function migrateV1toV2(legacy: GameStateV1): GameState {
  return {
    version: SAVE_VERSION,
    miniGame: legacy.meta,
    resources: freshResources(),
    buildings: freshBuildings(),
    heroes: freshHeroes(),
    formation: freshFormation(),
    season: freshSeason(),
    missions: freshMissions(),
    campaign: freshCampaign(),
    league: freshLeague(),
    // A migrated legacy player is an EXISTING player: mark the onboarding
    // tutorial as already seen so they are not forced into first-run onboarding.
    tutorial: seenTutorial(),
    runSequence: 0,
    settledRunSequence: 0,
    appliedRunIds: [],
    dailyCompletedRuns: { dayKey: -1, count: 0 },
    maxSeenWallTime: 0,
    maxDayOrdinal: -1,
    maxWeekOrdinal: -1,
    maxSeasonOrdinal: -1,
    pendingBattleSummary: null,
  };
}

/**
 * Migrate a v2 {@link GameState} (predating the onboarding tutorial) forward to
 * v3. The whole existing state is preserved verbatim (normalization runs after)
 * and the new `tutorial` block is added marked as SEEN: a v2 save belongs to a
 * real player who is already mid-game, so the first-run tutorial must NOT be
 * forced on them. Only a brand-new {@link SaveManager.freshGame} starts unseen.
 */
function migrateV2toV3(state: GameState): GameState {
  return {
    ...state,
    version: SAVE_VERSION,
    tutorial: seenTutorial(),
  };
}

/* -------------------------------------------------------------------------- */
/* Fresh-default builders for each v2 sub-state.                              */
/* -------------------------------------------------------------------------- */

/** A fresh gate-runner meta block: no coins, no upgrades, no bests. */
function freshMiniGame(): MiniGameMeta {
  return {
    coins: 0,
    upgrades: freshUpgrades(),
    bestDistance: 0,
    bestScore: 0,
    runsPlayed: 0,
  };
}

/**
 * A fresh resource economy: each of the four resources seeded with its config
 * `start` amount, and no production tick recorded yet (lastTickTimestamp 0 so
 * the first real tick establishes the baseline without back-crediting time).
 */
function freshResources(): ResourceState {
  const stockpiles: Record<string, number> = {};
  for (const kind of RESOURCE_ORDER) {
    stockpiles[kind] = ECONOMY.RESOURCES[kind].start;
  }
  return { stockpiles, lastTickTimestamp: 0 };
}

/**
 * A fresh building state: HQ at level 1 (base is playable) and every other
 * building at level 0, with an empty build queue.
 */
function freshBuildings(): BuildingState {
  const levels: Record<string, number> = {};
  for (const id of BUILDING_ORDER) {
    levels[id] = id === 'hq' ? 1 : 0;
  }
  return { levels, queue: [] };
}

/**
 * Empty-but-valid hero roster (no heroes recruited, no shards, fresh pity),
 * seeded with a random per-account recruit-entropy value so a brand-new game's
 * pulls are not identical to another fresh game's.
 */
function freshHeroes(): HeroState {
  return { roster: {}, shards: 0, pity: freshPity(), recruitSeed: randomSeed() };
}

/** A fresh random 32-bit unsigned recruit-entropy seed. */
function randomSeed(): number {
  return (Math.floor(Math.random() * 0x100000000) >>> 0);
}

/** A fresh recruit pity state (no dry streak, no pulls made). */
function freshPity(): PityState {
  return { sinceHighGrade: 0, totalPulls: 0 };
}

/** Empty-but-valid formation: front/back rows sized from config, all unassigned. */
function freshFormation(): FormationState {
  return {
    front: new Array<string | null>(GAME_STATE.FORMATION.FRONT_SLOTS).fill(null),
    back: new Array<string | null>(GAME_STATE.FORMATION.BACK_SLOTS).fill(null),
  };
}

/**
 * A fresh season / battle-pass state (FEAT-004): season 1, no XP, tier 0, no
 * resistance, premium track locked. `progress` mirrors `xp` for backward-compat
 * with the FEAT-001 placeholder shape.
 */
function freshSeason(): SeasonState {
  return {
    current: 1,
    progress: GAME_STATE.SEASON.START_PROGRESS,
    xp: 0,
    earnedXp: 0,
    availableXp: 0,
    tier: 0,
    claimedFree: 0,
    claimedPremium: 0,
    premiumUnlocked: false,
    resistance: SEASON.START_RESISTANCE,
  };
}

/** A fresh mission state (FEAT-004): no day/week claimed, no progress tracked. */
function freshMissions(): MissionState {
  return {
    dayKey: -1,
    weekKey: -1,
    daily: {},
    claimedTasks: [],
    armsScore: 0,
    claimedMilestones: [],
    weekActivity: 0,
    weekly: {},
  };
}

/** A fresh campaign state (FEAT-004): nothing cleared, no zombie waves. */
function freshCampaign(): CampaignState {
  return { clearedStages: [], highestWave: -1 };
}

/** A fresh league state (FEAT-004): player's alliance, period 0, no record. */
function freshLeague(): LeagueState {
  return {
    alliance: 'league.alliance.player',
    period: 0,
    wins: 0,
    losses: 0,
    bestRank: 0,
  };
}

/**
 * A fresh onboarding-tutorial state (FEAT-003): NOT seen and no steps
 * completed, so a brand-new game shows the first-run tutorial once.
 */
function freshTutorial(): TutorialState {
  return { seen: false, completedSteps: [], grantClaimed: false };
}

/**
 * An "already seen" onboarding-tutorial state: used when migrating a returning
 * player (v1 / v2 save) forward so they are never re-onboarded. No per-step
 * completion is back-filled (that only matters for the replay overlay).
 */
function seenTutorial(): TutorialState {
  // Migrated existing players are considered already granted so migration can
  // never mint a new-player currency reward.
  return { seen: true, completedSteps: [], grantClaimed: true };
}

/* -------------------------------------------------------------------------- */
/* Normalizers: coerce a possibly-partial sub-state into a complete one.      */
/* -------------------------------------------------------------------------- */

/** Coerce any value into a finite non-negative number, preserving fractions. */
function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Coerce any value into a non-negative integer (missing/NaN -> 0). */
function safeInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Coerce a possibly-partial upgrade object into a full, non-negative-int state. */
function normalizeUpgrades(upgrades: Partial<MetaUpgradeState> | undefined): MetaUpgradeState {
  const out = freshUpgrades();
  if (upgrades) {
    for (const kind of UPGRADE_ORDER) {
      out[kind] = Math.max(0, Math.floor(upgrades[kind] ?? 0));
    }
  }
  return out;
}

/** Coerce a possibly-partial gate-runner meta block into a complete one. */
function normalizeMiniGame(meta: Partial<MiniGameMeta> | undefined): MiniGameMeta {
  return {
    coins: safeInt(meta?.coins),
    upgrades: normalizeUpgrades(meta?.upgrades),
    bestDistance: safeInt(meta?.bestDistance),
    bestScore: safeInt(meta?.bestScore),
    runsPlayed: safeInt(meta?.runsPlayed),
  };
}

/** A shallow record of non-negative integers, keyed by string. */
function normalizeIntRecord(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = safeInt(v);
    }
  }
  return out;
}

/**
 * Coerce a possibly-partial resource state into a complete one: every resource
 * key present as a non-negative int (missing -> config start), stockpiles
 * clamped to their storage caps is left to the runtime tick (normalization only
 * guarantees a well-formed shape), and a non-negative lastTickTimestamp.
 */
function normalizeResources(resources: Partial<ResourceState> | undefined): ResourceState {
  const raw = resources?.stockpiles && typeof resources.stockpiles === 'object'
    ? resources.stockpiles
    : {};
  const stockpiles: Record<string, number> = {};
  for (const kind of RESOURCE_ORDER) {
    stockpiles[kind] = Object.prototype.hasOwnProperty.call(raw, kind)
      ? safeNumber(raw[kind], 0)
      : ECONOMY.RESOURCES[kind].start;
  }
  return { stockpiles, lastTickTimestamp: safeInt(resources?.lastTickTimestamp) };
}

/**
 * Coerce a possibly-partial building state into a complete one: every building
 * id present as a non-negative int level (missing -> HQ 1, others 0) and a
 * well-formed, deduplicated single-slot build queue.
 */
function normalizeBuildings(buildings: Partial<BuildingState> | undefined): BuildingState {
  const rawLevels = normalizeIntRecord(buildings?.levels);
  const levels: Record<string, number> = {};
  for (const id of BUILDING_ORDER) {
    const fallback = id === 'hq' ? 1 : 0;
    const level = rawLevels[id] ?? fallback;
    // HQ starts at 1 (base always exists); nothing exceeds its config ceiling.
    const min = id === 'hq' ? 1 : 0;
    levels[id] = Math.min(Math.max(min, level), BUILDINGS.DEFS[id].maxLevel);
  }
  return { levels, queue: normalizeQueue(buildings?.queue) };
}

/** Whether a value is a valid building id. */
function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === 'string' && (BUILDING_ORDER as readonly string[]).includes(value);
}

/**
 * Coerce a possibly-malformed build queue into a well-formed one, keeping at
 * most one active upgrade (single global queue) and dropping entries that are
 * not a valid, fully-specified {@link BuildingUpgrade}.
 */
function normalizeQueue(input: unknown): BuildingUpgrade[] {
  if (!Array.isArray(input)) return [];
  const out: BuildingUpgrade[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const u = raw as Partial<BuildingUpgrade>;
    if (!isBuildingId(u.building)) continue;
    const toLevel = safeInt(u.toLevel);
    const startedAt = safeInt(u.startedAt);
    const completesAt = safeInt(u.completesAt);
    if (toLevel <= 0 || completesAt <= 0) continue;
    out.push({ building: u.building, toLevel, startedAt, completesAt });
    if (out.length >= BUILDINGS.MAX_CONCURRENT_UPGRADES) break;
  }
  return out;
}

/**
 * Coerce a possibly-partial hero instance into a well-formed one, clamped to
 * its grade's progression caps. Returns null for an unknown catalog hero id so
 * the roster only ever holds real heroes. Level/stars/skill are floored to
 * their minimums and capped at the grade ceilings.
 */
function normalizeHeroInstance(id: string, raw: unknown): HeroInstance | null {
  const def = heroDef(id);
  if (!def) return null;
  const grade = HEROES.GRADES[def.grade];
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<HeroInstance>;
  const clamp = (v: unknown, min: number, max: number): number => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < min) return min;
    return Math.min(n, max);
  };
  return {
    id,
    level: clamp(src.level, 1, grade.maxLevel),
    stars: clamp(src.stars, HEROES.START_STARS, grade.maxStars),
    skillLevel: clamp(src.skillLevel, HEROES.START_SKILL_LEVEL, HEROES.MAX_SKILL_LEVEL),
    dupes: Math.max(0, safeInt(src.dupes)),
  };
}

/**
 * Coerce a possibly-partial hero state into a complete one: every roster entry
 * normalized to a valid, cap-clamped {@link HeroInstance} (unknown hero ids
 * dropped), a non-negative shard balance, and a well-formed pity counter.
 */
function normalizeHeroes(heroes: Partial<HeroState> | undefined): HeroState {
  const roster: Record<string, HeroInstance> = {};
  const rawRoster = heroes?.roster;
  if (rawRoster && typeof rawRoster === 'object') {
    for (const [id, raw] of Object.entries(rawRoster as Record<string, unknown>)) {
      const instance = normalizeHeroInstance(id, raw);
      if (instance) roster[id] = instance;
    }
  }
  return {
    roster,
    shards: safeInt(heroes?.shards),
    pity: normalizePity(heroes?.pity),
    recruitSeed: normalizeSeed(heroes?.recruitSeed),
  };
}

/**
 * Coerce a persisted recruit-entropy seed into a valid 32-bit unsigned int.
 * A missing / non-finite / zero value (e.g. an older v2 save that predates the
 * field) generates a fresh random seed once so the account gains stable
 * entropy from that point on; a valid value is clamped to 32 bits and kept.
 */
function normalizeSeed(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return randomSeed();
  return n >>> 0;
}

/** Coerce a possibly-partial pity state into a complete one. */
function normalizePity(pity: Partial<PityState> | undefined): PityState {
  return {
    sinceHighGrade: Math.min(20, safeInt(pity?.sinceHighGrade)),
    totalPulls: safeInt(pity?.totalPulls),
  };
}

/**
 * Coerce a possibly-partial formation into the config-sized rows. Each slot is
 * a hero id string or null; extra slots are dropped and missing ones filled
 * with null so the row lengths always match the config.
 */
function normalizeFormation(formation: Partial<FormationState> | undefined): FormationState {
  // A hero occupies at most one slot: track ids seen so a duplicate (or an
  // unknown catalog id) is dropped to null rather than persisted twice.
  const seen = new Set<string>();
  const slot = (v: unknown): string | null => {
    if (typeof v !== 'string' || !heroDef(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  };
  const row = (input: unknown, size: number): (string | null)[] => {
    const src = Array.isArray(input) ? input : [];
    return Array.from({ length: size }, (_, i) => slot(src[i]));
  };
  return {
    front: row(formation?.front, GAME_STATE.FORMATION.FRONT_SLOTS),
    back: row(formation?.back, GAME_STATE.FORMATION.BACK_SLOTS),
  };
}

/** Coerce a possibly-null integer key (allows a sentinel of -1). */
function safeKeyInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/** A deduplicated array of finite non-negative integers from an unknown value. */
function normalizeIntArray(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  for (const raw of input) {
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= 0) seen.add(n);
  }
  return [...seen];
}

/** A deduplicated array of non-empty strings from an unknown value. */
function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw === 'string' && raw.length > 0) seen.add(raw);
  }
  return [...seen];
}

/**
 * Coerce a possibly-partial season state into a complete FEAT-004 one, clamping
 * XP / tier / resistance / claimed counters to their bounds. `current` floors at
 * 1 (a started season) and `progress` is kept in sync with `xp`.
 */
function normalizeSeason(season: Partial<SeasonState> | undefined): SeasonState {
  const legacy = safeInt(season?.xp ?? season?.progress);
  const clampMax = (v: unknown, max: number): number => Math.min(max, safeInt(v));
  const savedTier = clampMax(season?.tier, SEASON.MAX_TIER);
  // Older v3 payloads stored only spendable XP. Resistance purchases reduce
  // that balance but must never erase lifetime tier progress, so reconstruct
  // missing earned XP from the larger of the legacy balance and tier floor.
  const earnedXp = Math.max(
    safeInt(season?.earnedXp ?? legacy),
    cumulativeXpForTier(savedTier),
  );
  const availableXp = Math.min(earnedXp, safeInt(season?.availableXp ?? legacy));
  const current = Math.max(1, safeInt(season?.current) || 1);
  return {
    current,
    progress: availableXp,
    xp: availableXp,
    earnedXp,
    availableXp,
    tier: savedTier,
    claimedFree: clampMax(season?.claimedFree, SEASON.MAX_TIER),
    claimedPremium: clampMax(season?.claimedPremium, SEASON.MAX_TIER),
    premiumUnlocked: season?.premiumUnlocked === true,
    resistance: clampMax(season?.resistance, SEASON.MAX_RESISTANCE),
  };
}

/**
 * Coerce a possibly-partial mission state into a complete FEAT-004 one. Day /
 * week keys default to the -1 sentinel (forces a rollover on first tick); the
 * claimed lists and scores are normalized to well-formed non-negative values.
 */
function normalizeMissions(missions: Partial<MissionState> | undefined): MissionState {
  return {
    dayKey: safeKeyInt(missions?.dayKey),
    weekKey: safeKeyInt(missions?.weekKey),
    daily: normalizeIntRecord(missions?.daily),
    claimedTasks: normalizeStringArray(missions?.claimedTasks),
    armsScore: safeInt(missions?.armsScore),
    claimedMilestones: normalizeIntArray(missions?.claimedMilestones),
    weekActivity: safeInt(missions?.weekActivity),
    weekly: normalizeIntRecord(missions?.weekly),
  };
}

/**
 * Coerce a possibly-partial campaign state into a complete one: cleared stages
 * filtered to real campaign stage ids (dedup), and the highest zombie wave a
 * finite integer floored at the -1 "none" sentinel.
 */
function normalizeCampaign(campaign: Partial<CampaignState> | undefined): CampaignState {
  const validStage = (id: string): boolean =>
    (CAMPAIGN_ORDER as readonly string[]).includes(id);
  const cleared = normalizeStringArray(campaign?.clearedStages).filter(validStage);
  const wave = Math.floor(Number(campaign?.highestWave));
  return {
    clearedStages: cleared,
    highestWave: Number.isFinite(wave) && wave >= 0 ? wave : -1,
  };
}

/** Coerce a possibly-partial league state into a complete one. */
function normalizeLeague(league: Partial<LeagueState> | undefined): LeagueState {
  const alliance =
    typeof league?.alliance === 'string' && league.alliance.length > 0
      ? league.alliance
      : 'league.alliance.player';
  return {
    alliance,
    period: safeInt(league?.period),
    wins: safeInt(league?.wins),
    losses: safeInt(league?.losses),
    bestRank: (() => {
      const rank = safeInt(league?.bestRank);
      return rank >= 1 && rank <= 10 ? rank : 0;
    })(),
  };
}

/**
 * Coerce a possibly-partial / absent onboarding-tutorial block into a complete
 * one. A missing block (e.g. an old v2 save reaching this via serialize)
 * defaults to NOT seen with no completed steps; `seen` is a strict boolean and
 * `completedSteps` a deduplicated array of non-empty step-id strings. The
 * migration layer (v1/v2 -> v3) is what flips a returning player to seen=true;
 * this normalizer only guarantees a well-formed shape.
 */
function normalizeTutorial(tutorial: Partial<TutorialState> | undefined): TutorialState {
  return {
    seen: tutorial?.seen === true,
    completedSteps: normalizeStringArray(tutorial?.completedSteps),
    grantClaimed: tutorial?.grantClaimed === true,
  };
}

function normalizeBattleSummary(value: GameState['pendingBattleSummary'] | undefined): GameState['pendingBattleSummary'] {
  if (!value || typeof value !== 'object') return null;
  return {
    win: value.win === true,
    rounds: Math.min(40, safeInt(value.rounds)),
    survivors: Math.min(5, safeInt(value.survivors)),
    timedOut: value.timedOut === true,
  };
}

function normalizeDailyRuns(value: GameState['dailyCompletedRuns'] | undefined): GameState['dailyCompletedRuns'] {
  return {
    dayKey: safeKeyInt(value?.dayKey),
    count: Math.min(5_000, safeInt(value?.count)),
  };
}

/**
 * Thin real-`localStorage` adapter. Kept out of the pure logic; a scene wires
 * this in at runtime while tests inject a fake. Falls back to an in-memory map
 * when `localStorage` is unavailable (e.g. SSR / private mode).
 */
export function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage as unknown as KeyValueStorage;
    }
  } catch {
    // Access can throw in sandboxed frames; fall through to memory.
  }
  return memoryStorage();
}

/** An in-memory {@link KeyValueStorage}, useful for tests and fallbacks. */
export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
