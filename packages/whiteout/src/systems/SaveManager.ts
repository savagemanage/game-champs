import { ECONOMY, QUESTS } from '../config/GameConfig';
import { BUILDING_ORDER, isProducer } from '../config/BuildingConfig';
import type { Army, GameState, OnboardingState, TroopKind } from '../types';
import { AllianceSystem } from './AllianceSystem';
import { ArenaSystem } from './ArenaSystem';
import { BuildingSystem } from './BuildingSystem';
import { CampaignSystem } from './CampaignSystem';
import { GearSystem } from './GearSystem';
import { HeroRoster } from './HeroRoster';
import { PopulationSystem } from './PopulationSystem';
import { PremiumWallet } from './PremiumWallet';
import { QuestSystem } from './QuestSystem';
import { RallySystem } from './RallySystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { SummonSystem } from './SummonSystem';
import { TrainingQueue } from './TrainingQueue';
import { VipSystem } from './VipSystem';
import { WarmthSystem } from './WarmthSystem';
import { settleDueCompletions, simulate } from './SimulationEngine';

/**
 * Current save-format version. Bump when GameState shape changes.
 *
 * - v1: the legacy 'kingdom-rise' medieval theme.
 * - v2: the Frosthold re-theme (frozen resource/building/troop/enemy
 *   vocabulary + warmth).
 * - v3: the FEAT-002 economy/city expansion - refined `steel` resource, Ember
 *   Sparks premium currency, survivor population, and the enlarged building
 *   roster (Shelter Row / Frost Vault / Forge Hall / Envoy Hall / Warming Ward
 *   / Ember Archive / class yards).
 *
 * - v4: the FEAT-003 hero + summon + campaign layer - the collectible hero
 *   roster (levels/stars/skills/shards + lead picks), the deterministic summon
 *   gacha (pity state), and staged campaign progress.
 *
 * - v5: the FEAT-004 research + chief-gear + troop-tier layer - the multi-branch
 *   research tech tree (completed + in-progress nodes), forgeable chief gear
 *   with socketed charms, and research-gated troop tiers.
 *
 * - v6: the FEAT-005 endgame + retention layer - world-boss / Frostbeast
 *   rallies (per-boss HP depletion + tiered rewards), a simulated arena/PvP
 *   ladder (rank + record + seed), a simulated NPC alliance (help charges +
 *   tech contribution), daily/growth quests + a time-boxed events framework,
 *   and VIP levels.
 *
 * - v7: the review-round wiring that makes troop TIERS live - training batches
 *   (`trainingQueue[].tier`) and the standing army (`armyTiers`) now carry a
 *   tier dimension, so a research-unlocked higher tier actually raises trained
 *   troop cost / stats / power.
 *
 * - v8: the FEAT-003 (crisp-text/onboarding task) new-player guidance layer -
 *   a persisted `onboarding` record ({ introDismissed, guidedComplete }) so the
 *   short first-run welcome + guided objective flow run only for a genuine new
 *   player and a returning player is never re-onboarded. The field is OPTIONAL
 *   in fromJSON: an (in-version) save missing it is treated as a RETURNING
 *   player, so it never re-triggers the intro.
 *
 * A save with any older version is treated as a mismatch and falls back to a
 * fresh frozen settlement rather than mis-mapping old kinds.
 */
export const SAVE_VERSION = 8;

/** Default localStorage key for the single save slot (Frosthold namespace). */
export const SAVE_KEY = 'frosthold:save';
export const SAVE_TEMP_KEY = `${SAVE_KEY}:tmp`;
export const SAVE_BACKUP_KEY = `${SAVE_KEY}:backup`;
export const SAVE_QUARANTINE_KEY = `${SAVE_KEY}:quarantine`;

/**
 * Minimal synchronous key/value storage. `window.localStorage` satisfies this,
 * and a plain object-backed fake satisfies it in tests - so the pure save logic
 * never touches `window` directly.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** False for the in-memory fallback. */
  readonly persistent?: boolean;
}

/** A snapshot of the whole simulation, ready to serialize. */
export interface GameSnapshot {
  resources: ResourceStore;
  buildings: BuildingSystem;
  training: TrainingQueue;
  warmth: WarmthSystem;
  population: PopulationSystem;
  premium: PremiumWallet;
  heroes: HeroRoster;
  summon: SummonSystem;
  campaign: CampaignSystem;
  research: ResearchSystem;
  gear: GearSystem;
  rally: RallySystem;
  arena: ArenaSystem;
  alliance: AllianceSystem;
  quests: QuestSystem;
  vip: VipSystem;
  waveCleared: number;
  /** New-player onboarding / tutorial state (FEAT-003). */
  onboarding: OnboardingState;
  /** Bounded ids of committed result-bearing actions. */
  processedActionIds?: string[];
}

/**
 * A brand-new player's onboarding state: neither the intro card nor the guided
 * flow has run yet, so a fresh game shows both.
 */
export function freshOnboarding(): OnboardingState {
  return { introDismissed: false, guidedComplete: false };
}

/**
 * Normalize a persisted (possibly-absent / partial) onboarding record. A save
 * written BEFORE onboarding existed (undefined) is treated as a RETURNING
 * player - both flags true - so long-time players are never re-onboarded. A
 * present record is coerced to strict booleans.
 */
export function normalizeOnboarding(data: Partial<OnboardingState> | undefined): OnboardingState {
  if (!data || typeof data !== 'object') {
    return { introDismissed: true, guidedComplete: true };
  }
  return {
    introDismissed: data.introDismissed === true,
    guidedComplete: data.guidedComplete === true,
    ...(data.battleAttempted === true ? { battleAttempted: true } : {}),
  };
}

export interface SaveCommitResult {
  state: GameState;
  /** True when the exact checkpoint is readable from temp or primary storage. */
  committed: boolean;
}

/** Extra info returned from a load so the caller can surface offline gains. */
export interface LoadResult {
  snapshot: GameSnapshot;
  /** Monotonic sanitized clock carried into runtime simulation/calendar logic. */
  clockAt: number;
  /** Whether an existing save was found (false = a fresh game was created). */
  loaded: boolean;
  /** Elapsed offline seconds credited (after capping), 0 for a fresh game. */
  offlineSeconds: number;
  /**
   * NET resource change credited over the offline window: idle production minus
   * the fuel (wood + coal) the Furnace burned to hold back the cold. wood/coal
   * may therefore be negative when the furnace outburned production; food/iron
   * are production-only. The ResourceStore balance is the authoritative value;
   * this bundle is the honest "while away" summary derived from it.
   */
  offlineGains: ReturnType<ResourceStore['toJSON']>;
  /** True when the last-known-good backup replaced a corrupt primary. */
  recovered?: boolean;
  /** Source schema version when v6/v7 was migrated to v8. */
  migratedFrom?: 6 | 7;
  /** Diagnostic for rejected clocks or persistence recovery. */
  diagnostic?: string;
}

/**
 * SaveManager - versioned serialization of the whole game to a plain JSON
 * object, plus offline idle-gain reconciliation on load.
 *
 * The pure layer works entirely with in-memory systems and plain objects; the
 * actual persistence goes through an injected {@link KeyValueStorage}, so it is
 * fully testable in node with a fake store and has NO window dependency.
 */
export class SaveManager {
  private _lastSaveError: string | null = null;
  private _blockedPayload: string | null = null;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = SAVE_KEY,
  ) {
    if (storage.persistent === false) this._lastSaveError = 'in-memory fallback';
  }

  get lastSaveError(): string | null {
    return this._lastSaveError;
  }

  /** Original unsupported/corrupt payload retained until explicit reset. */
  get blockedPayload(): string | null {
    return this._blockedPayload;
  }

  /** Build a plain, versioned {@link GameState} from live systems. */
  static serialize(snapshot: GameSnapshot, now: number): GameState {
    return {
      version: SAVE_VERSION,
      resources: snapshot.resources.toJSON(),
      premiumCurrency: snapshot.premium.toJSON(),
      population: snapshot.population.toJSON(),
      heroes: snapshot.heroes.toJSON(),
      summon: snapshot.summon.toJSON(),
      campaign: snapshot.campaign.toJSON(),
      research: snapshot.research.toJSON(),
      gear: snapshot.gear.toJSON(),
      rally: snapshot.rally.toJSON(),
      arena: snapshot.arena.toJSON(),
      alliance: snapshot.alliance.toJSON(),
      quests: snapshot.quests.toJSON(),
      vip: snapshot.vip.toJSON(),
      warmth: snapshot.warmth.toJSON(),
      buildings: snapshot.buildings.toJSON(),
      army: snapshot.training.army,
      armyTiers: snapshot.training.armyTiers,
      trainingQueue: snapshot.training.toJSON(),
      waveCleared: snapshot.waveCleared,
      onboarding: { ...snapshot.onboarding },
      processedActionIds: snapshot.processedActionIds?.slice(-256) ?? [],
      lastSeenAt: now,
    };
  }

  /**
   * Rebuild live systems from a plain {@link GameState}, then reconcile offline
   * idle gains: credit `(now - lastSeenAt)` of production, capped at
   * ECONOMY.MAX_OFFLINE_SECONDS and scaled by ECONOMY.OFFLINE_EFFICIENCY. Also
   * advances the training queue to `now` so units that finished while away are
   * added to the army. Returns the systems plus what was credited.
   */
  static deserialize(state: GameState, now: number): LoadResult {
    const resources = ResourceStore.fromJSON(state.resources);
    const buildings = BuildingSystem.fromJSON(state.buildings);
    const training = TrainingQueue.fromJSON(
      state.trainingQueue,
      normalizeArmy(state.army),
      state.armyTiers,
    );
    // A legacy / warmth-less save (undefined) restores to full warmth.
    const warmth = WarmthSystem.fromJSON(state.warmth);
    // The survivor workforce + premium wallet (both tolerate missing fields).
    const population = PopulationSystem.fromJSON(state.population);
    for (const kind of BUILDING_ORDER) {
      if (isProducer(kind) || kind === 'forge_hall') {
        population.assign(kind, population.assignedTo(kind), buildings.level(kind));
      } else if (population.assignedTo(kind) > 0) {
        population.assign(kind, 0, 0);
      }
    }
    const premium = PremiumWallet.fromJSON(state.premiumCurrency);
    // Hero roster, summon (gacha) state, and campaign progress (all tolerate
    // missing fields so a partial / older-shaped save loads gracefully).
    const heroes = HeroRoster.fromJSON(state.heroes);
    const summon = SummonSystem.fromJSON(state.summon);
    const campaign = CampaignSystem.fromJSON(state.campaign);
    // Research tech tree + chief gear (both tolerate missing fields).
    const research = ResearchSystem.fromJSON(state.research);
    const gear = GearSystem.fromJSON(state.gear);
    // FEAT-005 endgame layer: rallies, arena, alliance, quests, VIP (all
    // tolerate missing fields so a partial / older-shaped save loads gracefully).
    const rally = RallySystem.fromJSON(state.rally);
    const arena = ArenaSystem.fromJSON(state.arena);
    const alliance = AllianceSystem.fromJSON(state.alliance);
    const quests = QuestSystem.fromJSON(state.quests);
    const vip = VipSystem.fromJSON(state.vip);

    {
      const snapshot: GameSnapshot = {
        resources, buildings, training, warmth, population, premium, heroes,
        summon, campaign, research, gear, rally, arena, alliance, quests, vip,
        waveCleared: Math.max(0, Math.min(20, Math.floor(state.waveCleared ?? 0))),
        onboarding: normalizeOnboarding(state.onboarding),
        processedActionIds: sanitizeReceiptIds(state.processedActionIds),
      };
      const nowIsValid = Number.isFinite(now) && now >= 0;
      const validNow = nowIsValid ? now : 0;
      const lastSeenIsValid = Number.isFinite(state.lastSeenAt) && state.lastSeenAt >= 0;
      const lastSeen = lastSeenIsValid ? state.lastSeenAt : validNow;
      const clockReversed = validNow < lastSeen;
      const rawMs = !clockReversed ? validNow - lastSeen : 0;
      const creditedMs = Math.min(rawMs, ECONOMY.MAX_OFFLINE_SECONDS * 1000);
      const windowStart = validNow - creditedMs;

      // Deadlines older than the credited economy window still complete through
      // the canonical quest/reward path, but cannot retroactively produce.
      // Stable same-time order remains build/research/training.
      settleDueCompletions(snapshot, windowStart);
      const settled = simulate(snapshot, windowStart, validNow, ECONOMY.OFFLINE_EFFICIENCY);
      const authoritativeClock = Math.max(lastSeen, validNow);
      return {
        snapshot,
        clockAt: authoritativeClock,
        loaded: true,
        offlineSeconds: creditedMs / 1000,
        offlineGains: settled.resourceDelta,
        diagnostic: !nowIsValid || !lastSeenIsValid
          ? 'clock_invalid'
          : clockReversed
            ? 'clock_reversed'
            : undefined,
      };
    }
  }

  /** A brand-new game snapshot (fresh stockpile, level-1 Furnace, empty queue). */
  static freshGame(): GameSnapshot {
    return {
      resources: new ResourceStore(),
      buildings: new BuildingSystem(),
      training: new TrainingQueue(),
      warmth: new WarmthSystem(),
      population: new PopulationSystem(),
      premium: new PremiumWallet(),
      heroes: new HeroRoster(),
      summon: new SummonSystem(),
      campaign: new CampaignSystem(),
      research: new ResearchSystem(),
      gear: new GearSystem(),
      rally: new RallySystem(),
      arena: new ArenaSystem(),
      alliance: new AllianceSystem(),
      quests: new QuestSystem(),
      vip: new VipSystem(),
      waveCleared: 0,
      onboarding: freshOnboarding(),
    };
  }

  /** Persist a snapshot and report whether the exact checkpoint is readable. */
  save(snapshot: GameSnapshot, now: number): SaveCommitResult {
    const state = SaveManager.serialize(snapshot, now);
    if (this._blockedPayload !== null) {
      this._lastSaveError = 'save requires explicit reset';
      return { state, committed: false };
    }
    const encoded = JSON.stringify(state);
    this._lastSaveError = this.storage.persistent === false ? 'in-memory fallback' : null;
    let committed = false;
    try {
      const tempKey = this.key === SAVE_KEY ? SAVE_TEMP_KEY : `${this.key}:tmp`;
      const backupKey = this.key === SAVE_KEY ? SAVE_BACKUP_KEY : `${this.key}:backup`;
      this.storage.setItem(tempKey, encoded);
      const verifiedTempRaw = this.storage.getItem(tempKey);
      const verifiedTemp = decodeState(verifiedTempRaw);
      if (!verifiedTemp || verifiedTempRaw !== encoded || verifiedTemp.state.version !== SAVE_VERSION) {
        throw new Error('temporary save readback failed');
      }
      // A verified temp slot is itself a durable recovery checkpoint even if
      // backup rotation or primary promotion fails later.
      committed = true;
      const oldPrimary = this.storage.getItem(this.key);
      if (decodeState(oldPrimary)) {
        this.storage.setItem(backupKey, oldPrimary as string);
        if (!decodeState(this.storage.getItem(backupKey))) throw new Error('backup save readback failed');
      }
      this.storage.setItem(this.key, encoded);
      const verifiedPrimaryRaw = this.storage.getItem(this.key);
      const verifiedPrimary = decodeState(verifiedPrimaryRaw);
      if (!verifiedPrimary || verifiedPrimaryRaw !== encoded || verifiedPrimary.state.version !== SAVE_VERSION) {
        throw new Error('primary save readback failed');
      }
      this.storage.removeItem(tempKey);
    } catch (error) {
      this._lastSaveError = error instanceof Error ? error.message : 'storage unavailable';
      // A storage adapter may throw after performing a write. Verify both
      // recovery locations before deciding the mutation is not durable.
      const tempKey = this.key === SAVE_KEY ? SAVE_TEMP_KEY : `${this.key}:tmp`;
      committed = safeGet(this.storage, tempKey) === encoded || safeGet(this.storage, this.key) === encoded;
    }
    return { state, committed };
  }

  /**
   * Load from storage. If no valid save exists, returns a fresh game. Otherwise
   * deserializes and applies offline gains as of `now`.
   */
  load(now: number): LoadResult {
    const tempKey = this.key === SAVE_KEY ? SAVE_TEMP_KEY : `${this.key}:tmp`;
    const backupKey = this.key === SAVE_KEY ? SAVE_BACKUP_KEY : `${this.key}:backup`;
    const quarantineKey = this.key === SAVE_KEY ? SAVE_QUARANTINE_KEY : `${this.key}:quarantine`;
    const primaryRaw = safeGet(this.storage, this.key);
    const tempRaw = safeGet(this.storage, tempKey);
    const backupRaw = safeGet(this.storage, backupKey);

    const restore = (raw: string | null): { result: LoadResult; decoded: DecodedState } | null => {
      const decoded = decodeState(raw);
      if (!decoded) return null;
      try {
        return { result: SaveManager.deserialize(decoded.state, now), decoded };
      } catch {
        return null;
      }
    };

    const pending = restore(tempRaw);
    if (pending) {
      this._blockedPayload = null;
      const checkpoint = this.save(pending.result.snapshot, pending.result.clockAt);
      if (!checkpoint.committed) {
        this._blockedPayload = tempRaw;
        return { ...freshLoad(pending.result.clockAt), diagnostic: 'save_checkpoint_failed' };
      }
      return {
        ...pending.result,
        recovered: true,
        migratedFrom: pending.decoded.sourceVersion === 6 || pending.decoded.sourceVersion === 7
          ? pending.decoded.sourceVersion
          : undefined,
        diagnostic: 'save_recovered',
      };
    }

    const primary = restore(primaryRaw);
    if (primary) {
      const migratedFrom = primary.decoded.sourceVersion === 6 || primary.decoded.sourceVersion === 7
        ? primary.decoded.sourceVersion
        : undefined;
      // Offline reconciliation mutates authoritative resources, timers, quests,
      // and rewards. Checkpoint every valid load before exposing it so closing
      // or reloading before the autosave interval cannot credit the gap twice.
      const checkpoint = this.save(primary.result.snapshot, primary.result.clockAt);
      if (!checkpoint.committed) {
        this._blockedPayload = primaryRaw;
        return { ...freshLoad(primary.result.clockAt), diagnostic: 'save_checkpoint_failed' };
      }
      return { ...primary.result, migratedFrom };
    }

    if (primaryRaw) {
      try { this.storage.setItem(quarantineKey, primaryRaw); } catch { /* best effort */ }
    }

    // Fall back to the last-known-good committed snapshot.
    const recovered = restore(backupRaw);
    if (recovered) {
      this._blockedPayload = null;
      const checkpoint = this.save(recovered.result.snapshot, recovered.result.clockAt);
      if (!checkpoint.committed) {
        this._blockedPayload = backupRaw;
        return { ...freshLoad(recovered.result.clockAt), diagnostic: 'save_checkpoint_failed' };
      }
      return {
        ...recovered.result,
        recovered: true,
        migratedFrom: recovered.decoded.sourceVersion === 6 || recovered.decoded.sourceVersion === 7
          ? recovered.decoded.sourceVersion
          : undefined,
        diagnostic: 'save_recovered',
      };
    }

    const blocked = primaryRaw ?? tempRaw ?? backupRaw;
    if (!blocked) return freshLoad(now);
    this._blockedPayload = blocked;
    const diagnostic = unsupportedVersion(blocked) ? 'save_unsupported' : 'save_corrupt';
    this._lastSaveError = diagnostic;
    return { ...freshLoad(now), diagnostic };
  }

  /** Delete the save slot. */
  clear(): void {
    this.storage.removeItem(this.key);
    this.storage.removeItem(this.key === SAVE_KEY ? SAVE_TEMP_KEY : `${this.key}:tmp`);
    this.storage.removeItem(this.key === SAVE_KEY ? SAVE_BACKUP_KEY : `${this.key}:backup`);
    this.storage.removeItem(this.key === SAVE_KEY ? SAVE_QUARANTINE_KEY : `${this.key}:quarantine`);
    this._blockedPayload = null;
    this._lastSaveError = this.storage.persistent === false ? 'in-memory fallback' : null;
  }
}

function freshLoad(now: number = 0): LoadResult {
  const clockAt = Number.isFinite(now) && now >= 0 ? now : 0;
  return {
    snapshot: SaveManager.freshGame(),
    clockAt,
    loaded: false,
    offlineSeconds: 0,
    offlineGains: ResourceStore.emptyBundle(),
  };
}

interface DecodedState {
  state: GameState;
  sourceVersion: number;
}

function unsupportedVersion(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as { version?: unknown };
    const version = Number(value?.version);
    return Number.isFinite(version) && ![6, 7, SAVE_VERSION].includes(version);
  } catch {
    return false;
  }
}

/** Pure v6 -> v7 migration: preserve all progress and add troop tiers. */
export function migrateV6ToV7(input: Record<string, unknown>): Record<string, unknown> {
  const army = isRecord(input.army) ? input.army : {};
  const armyTiers: Record<string, Record<number, number>> = {};
  for (const kind of ['trapper', 'marksman', 'vanguard'] as const) {
    const count = nonNegativeInteger(army[kind]);
    if (count > 0) armyTiers[kind] = { 1: count };
  }
  const trainingQueue = Array.isArray(input.trainingQueue)
    ? input.trainingQueue.map((order) => isRecord(order) ? { ...order, tier: nonNegativeInteger(order.tier) || 1 } : order)
    : [];
  return { ...input, version: 7, armyTiers, trainingQueue };
}

/** Pure v7 -> v8 migration: install every v8 subsystem and returning onboarding. */
export function migrateV7ToV8(input: Record<string, unknown>): GameState {
  const lastSeenAt = finiteNonNegative(input.lastSeenAt, 0);
  const defaults = SaveManager.serialize(SaveManager.freshGame(), lastSeenAt);
  const merged = {
    ...defaults,
    ...input,
    resources: { ...defaults.resources, ...(isRecord(input.resources) ? input.resources : {}) },
    version: SAVE_VERSION,
  } as unknown as GameState;
  if (!isRecord(input.onboarding)) merged.onboarding = { introDismissed: true, guidedComplete: true };
  if (!Number.isFinite(merged.rally?.dayKey)) {
    merged.rally = { ...merged.rally, dayKey: Math.floor(lastSeenAt / QUESTS.DAY_MS) };
  }
  return merged;
}

/** Parse, validate the supported envelope, and run staged v6/v7 migrations. */
function decodeState(raw: string | null): DecodedState | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value)) return null;
  const version = Number(value.version);
  if (![6, 7, SAVE_VERSION].includes(version)) return null;
  if (!isRecord(value.resources) || !Array.isArray(value.buildings) || !Array.isArray(value.trainingQueue) || !isRecord(value.army)) return null;

  let migrated: GameState;
  if (version === 6) migrated = migrateV7ToV8(migrateV6ToV7(value));
  else if (version === 7) migrated = migrateV7ToV8(value);
  else migrated = value as unknown as GameState;
  if (!validateV8Envelope(migrated)) return null;
  return { state: migrated, sourceVersion: version };
}

function validateV8Envelope(state: GameState): boolean {
  if (state.version !== SAVE_VERSION || !isRecord(state.resources)) return false;
  for (const resource of ['food', 'wood', 'coal', 'iron', 'steel']) {
    const value = state.resources[resource as keyof typeof state.resources];
    if (!Number.isFinite(value) || value < 0) return false;
  }
  if (!Number.isFinite(state.premiumCurrency) || state.premiumCurrency < 0) return false;
  if (!Number.isFinite(state.warmth) || state.warmth < 0) return false;
  if (!Number.isFinite(state.waveCleared) || !Number.isFinite(state.lastSeenAt)) return false;
  if (!isRecord(state.population) || !isRecord(state.population.assignments)) return false;
  if (!isRecord(state.heroes) || !isRecord(state.heroes.heroes) || !Array.isArray(state.heroes.lead)) return false;
  if (!isRecord(state.summon) || !isRecord(state.campaign) || !Array.isArray(state.campaign.claimed)) return false;
  if (!isRecord(state.research) || !Array.isArray(state.research.completed)) return false;
  if (!isRecord(state.gear) || !isRecord(state.gear.slots)) return false;
  if (!isRecord(state.rally) || !isRecord(state.rally.bosses)) return false;
  if (!isRecord(state.arena) || !isRecord(state.alliance)) return false;
  if (!isRecord(state.quests) || !isRecord(state.quests.daily) || !isRecord(state.quests.milestones)) return false;
  if (!isRecord(state.vip) || !Number.isFinite(state.vip.points)) return false;
  if (!isRecord(state.army) || !isRecord(state.armyTiers)) return false;

  if (!Array.isArray(state.buildings) || state.buildings.length > BUILDING_ORDER.length) return false;
  const seen = new Set<string>();
  for (const building of state.buildings) {
    if (!isRecord(building) || typeof building.kind !== 'string' || !BUILDING_ORDER.includes(building.kind as never) || seen.has(building.kind)) return false;
    seen.add(building.kind);
    if (!Number.isFinite(building.level) || Number(building.level) < 0) return false;
    if (building.upgradeEndsAt !== null && (!Number.isFinite(building.upgradeEndsAt) || Number(building.upgradeEndsAt) < 0)) return false;
  }
  if (!seen.has('furnace')) return false;
  if (!Array.isArray(state.trainingQueue) || state.trainingQueue.length > 6) return false;
  for (const order of state.trainingQueue) {
    if (!isRecord(order) || !['trapper', 'marksman', 'vanguard'].includes(String(order.troop))) return false;
    if (!Number.isFinite(order.count) || Number(order.count) < 1 || Number(order.count) > 20) return false;
    if (!Number.isFinite(order.completesAt) || Number(order.completesAt) < 0) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

function sanitizeReceiptIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 160).slice(-256);
}

function safeGet(storage: KeyValueStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

/** Coerce a possibly-partial army object into a full, non-negative integer Army. */
function normalizeArmy(army: Partial<Army> | undefined): Army {
  const out: Army = { trapper: 0, marksman: 0, vanguard: 0 };
  if (army) {
    for (const kind of Object.keys(out) as TroopKind[]) {
      out[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
    }
  }
  return out;
}

/**
 * Thin real-`localStorage` adapter. Kept out of the pure logic; a scene wires
 * this in at runtime while tests inject a fake. Falls back to an in-memory map
 * when `localStorage` is unavailable (e.g. SSR / private mode).
 */
export function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${SAVE_KEY}:probe`;
      localStorage.setItem(probe, '1');
      if (localStorage.getItem(probe) !== '1') throw new Error('storage readback failed');
      localStorage.removeItem(probe);
      return {
        persistent: true,
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      };
    }
  } catch {
    // Access or writes can throw in sandboxed/private/quota-constrained frames.
  }
  return memoryStorage();
}

/** An in-memory {@link KeyValueStorage}, useful for tests and fallbacks. */
export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    persistent: false,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
