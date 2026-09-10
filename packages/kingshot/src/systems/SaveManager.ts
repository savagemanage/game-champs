import { ECONOMY } from '../config/GameConfig';
import { BUILDING_DEFS, BUILDING_ORDER } from '../config/BuildingConfig';
import { TECH_DEFS, type TechId } from '../config/ResearchConfig';
import { TROOP_ORDER } from '../config/TroopConfig';
import type { Army, BuildingKind, BuildingState, GameState, ResourceKind, Resources, TrainingOrder, TroopKind } from '../types';
import { BuildingSystem } from './BuildingSystem';
import { HeroSystem } from './HeroSystem';
import { QuestSystem } from './QuestSystem';
import { ResearchSystem } from './ResearchSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem } from './WarmthSystem';
import { advanceSimulation, type SimulationReceipt } from './SimulationEngine';
import type { BattleReceipt } from './BattleReceipt';

export const SAVE_VERSION = 7;
export const SUPPORTED_SAVE_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const SAVE_KEY = 'kingdom-rise:save';
export const BACKUP_KEY_PREFIX = `${SAVE_KEY}:backup`;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameSnapshot {
  resources: ResourceStore;
  /** Last fully settled economic tick boundary; preserves sub-second phase. */
  simulationCursorAt?: number;
  buildings: BuildingSystem;
  training: TrainingQueue;
  research: ResearchSystem;
  heroes: HeroSystem;
  quests: QuestSystem;
  warmth: WarmthSystem;
  waveCleared: number;
  troopsTrained: number;
  battlesWon: number;
  onboardingSeen: boolean;
  tutorialDone: boolean;
  lastBattleReceipt?: BattleReceipt | null;
  battleRevision?: number;
}

export type SaveStatus =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

export interface LoadIssue {
  kind: 'corrupt-json' | 'invalid-shape' | 'future-version' | 'storage-read' | 'reconcile-save';
  message: string;
  backupKey?: string;
  backupRaw?: string;
}

export interface LoadResult {
  snapshot: GameSnapshot;
  loaded: boolean;
  offlineSeconds: number;
  offlineGains: Resources;
  reconciliation?: SimulationReceipt;
  issue?: LoadIssue;
  migrated: boolean;
}

/** Safe v7 persistence, additive v1-v6 migration, quarantine, and reconciliation. */
export class SaveManager {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = SAVE_KEY,
  ) {}

  static serialize(snapshot: GameSnapshot, now: number): GameState {
    return {
      version: SAVE_VERSION,
      resources: snapshot.resources.toJSON(),
      buildings: snapshot.buildings.toJSON(),
      army: snapshot.training.army,
      trainingQueue: snapshot.training.toJSON(),
      waveCleared: clampInt(snapshot.waveCleared, 0, 20),
      research: snapshot.research.toJSON(),
      heroes: snapshot.heroes.toJSON(),
      quests: snapshot.quests.toJSON(),
      troopsTrained: nonNegativeInt(snapshot.troopsTrained),
      battlesWon: nonNegativeInt(snapshot.battlesWon),
      warmth: snapshot.warmth.toJSON(),
      onboardingSeen: snapshot.onboardingSeen,
      tutorialDone: snapshot.tutorialDone,
      lastBattleReceipt: normalizeReceipt(snapshot.lastBattleReceipt),
      battleRevision: nonNegativeInt(snapshot.battleRevision ?? 0),
      lastSeenAt: finiteTimestamp(now, 0),
      simulationCursorAt: Math.min(
        finiteTimestamp(now, 0),
        finiteTimestamp(snapshot.simulationCursorAt, finiteTimestamp(now, 0)),
      ),
    };
  }

  /** Rebuild runtime systems without advancing time (transaction rollback). */
  static hydrate(state: GameState, now: number): GameSnapshot {
    return hydrateNormalized(normalizeState(state, now));
  }

  static deserialize(state: GameState, now: number): LoadResult {
    const normalized = normalizeState(state, now);
    const snapshot = hydrateNormalized(normalized);
    const rawSeconds = Math.max(0, (now - normalized.lastSeenAt) / 1000);
    const reconciliation = advanceSimulation(
      snapshot,
      normalized.simulationCursorAt ?? normalized.lastSeenAt,
      now,
      'offline',
    );
    snapshot.simulationCursorAt = reconciliation.economicCursorAt;
    snapshot.troopsTrained += reconciliation.trainedCount;
    return {
      snapshot,
      loaded: true,
      offlineSeconds: Math.min(rawSeconds, ECONOMY.MAX_OFFLINE_SECONDS),
      offlineGains: reconciliation.gains,
      reconciliation,
      migrated: state.version !== SAVE_VERSION || JSON.stringify(state) !== JSON.stringify(normalized),
    };
  }

  static freshGame(): GameSnapshot {
    return {
      resources: new ResourceStore(),
      buildings: new BuildingSystem(),
      training: new TrainingQueue(),
      research: new ResearchSystem(),
      heroes: new HeroSystem(),
      quests: new QuestSystem(),
      warmth: new WarmthSystem(),
      waveCleared: 0,
      troopsTrained: 0,
      battlesWon: 0,
      onboardingSeen: false,
      tutorialDone: false,
      lastBattleReceipt: null,
      battleRevision: 0,
    };
  }

  /** Never throws: serialization/quota/security failures become retryable status. */
  trySave(snapshot: GameSnapshot, now: number): SaveStatus {
    try {
      const state = SaveManager.serialize(snapshot, now);
      const raw = JSON.stringify(state);
      this.storage.setItem(`${this.key}:temp`, raw);
      const readback = this.storage.getItem(`${this.key}:temp`);
      if (readback !== raw) throw new Error('Temporary save verification failed');
      const previous = this.storage.getItem(this.key);
      if (previous !== null) this.storage.setItem(`${this.key}:previous`, previous);
      this.storage.setItem(this.key, raw);
      // Web Storage writes are atomic: a returning setItem is the commit point.
      // A second read can itself fail after a durable write, so it must not
      // create an ambiguous "failed" result that makes callers roll memory back.
      // The exact payload was already verified in the temporary slot above.
      try {
        this.storage.removeItem(`${this.key}:temp`);
      } catch {
        // A stale temp is harmless and will be replaced by the next attempt.
      }
      return { ok: true, state };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Compatibility wrapper. It reports failure instead of throwing. */
  save(snapshot: GameSnapshot, now: number): GameState {
    const result = this.trySave(snapshot, now);
    return result.ok ? result.state : SaveManager.serialize(snapshot, now);
  }

  load(now: number): LoadResult {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      return freshLoad({ kind: 'storage-read', message: errorMessage(error) });
    }
    if (!raw) return freshLoad();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.quarantine(raw, now, 'corrupt-json', 'The save JSON is damaged.');
    }
    if (!isRecord(parsed) || typeof parsed.version !== 'number') {
      return this.quarantine(raw, now, 'invalid-shape', 'The save structure is invalid.');
    }
    if (parsed.version > SAVE_VERSION) {
      return this.quarantine(raw, now, 'future-version', 'This save was created by a newer version.');
    }
    if (!SUPPORTED_SAVE_VERSIONS.includes(parsed.version)) {
      return this.quarantine(raw, now, 'invalid-shape', 'The save version is unsupported.');
    }
    if (!hasCoreShape(parsed)) {
      return this.quarantine(raw, now, 'invalid-shape', 'Required save collections are malformed.');
    }

    let result: LoadResult;
    try {
      result = SaveManager.deserialize(parsed as unknown as GameState, now);
    } catch (error) {
      return this.quarantine(raw, now, 'invalid-shape', errorMessage(error));
    }

    // Migration and offline settlement are durable before the state is exposed,
    // preventing a rapid reload from crediting the same absence twice.
    const persisted = this.trySave(result.snapshot, now);
    if (!persisted.ok) {
      result.issue = {
        kind: 'reconcile-save',
        message: persisted.error,
        backupRaw: raw,
      };
    }
    return result;
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
      this.storage.removeItem(`${this.key}:temp`);
    } catch {
      // A blocked storage backend is already surfaced through save/load status.
    }
  }

  private quarantine(raw: string, now: number, kind: LoadIssue['kind'], message: string): LoadResult {
    const backupKey = `${BACKUP_KEY_PREFIX}:${Math.floor(now)}`;
    try {
      this.storage.setItem(backupKey, raw);
    } catch {
      // Keep backupRaw in memory so the Title export action still works.
    }
    return freshLoad({ kind, message, backupKey, backupRaw: raw });
  }
}

function hydrateNormalized(normalized: GameState): GameSnapshot {
  return {
    resources: ResourceStore.fromJSON(normalized.resources),
    buildings: BuildingSystem.fromJSON(normalized.buildings),
    training: TrainingQueue.fromJSON(normalized.trainingQueue, normalized.army),
    research: ResearchSystem.fromJSON(normalized.research),
    heroes: HeroSystem.fromJSON(normalized.heroes),
    quests: QuestSystem.fromJSON(normalized.quests),
    warmth: WarmthSystem.fromJSON(normalized.warmth),
    waveCleared: normalized.waveCleared,
    troopsTrained: normalized.troopsTrained ?? 0,
    battlesWon: normalized.battlesWon ?? 0,
    onboardingSeen: normalized.onboardingSeen ?? true,
    tutorialDone: normalized.tutorialDone ?? true,
    lastBattleReceipt: normalizeReceipt(normalized.lastBattleReceipt),
    battleRevision: nonNegativeInt(normalized.battleRevision ?? 0),
    simulationCursorAt: normalized.simulationCursorAt ?? normalized.lastSeenAt,
  };
}

function freshLoad(issue?: LoadIssue): LoadResult {
  return {
    snapshot: SaveManager.freshGame(),
    loaded: false,
    offlineSeconds: 0,
    offlineGains: ResourceStore.emptyBundle(),
    issue,
    migrated: false,
  };
}

function normalizeState(input: GameState, now: number): GameState {
  const record = input as unknown as Record<string, unknown>;
  const buildings = normalizeBuildings(record.buildings);
  const townCenterLevel = buildings.find((building) => building.kind === 'town_center')?.level ?? 1;
  const maxWarmth = new WarmthSystem().maxWarmth(townCenterLevel);
  const warmth = Math.min(maxWarmth, finiteNonNegative(record.warmth, maxWarmth));
  return {
    version: SAVE_VERSION,
    resources: normalizeResources(record.resources),
    buildings,
    army: normalizeArmy(record.army),
    trainingQueue: normalizeQueue(record.trainingQueue),
    waveCleared: clampInt(record.waveCleared, 0, 20),
    research: normalizeResearch(record.research),
    heroes: isRecord(record.heroes) ? (record.heroes as GameState['heroes']) : undefined,
    quests: isRecord(record.quests) ? (record.quests as GameState['quests']) : undefined,
    troopsTrained: nonNegativeInt(record.troopsTrained),
    battlesWon: nonNegativeInt(record.battlesWon),
    warmth,
    onboardingSeen: typeof record.onboardingSeen === 'boolean' ? record.onboardingSeen : true,
    tutorialDone: typeof record.tutorialDone === 'boolean' ? record.tutorialDone : true,
    lastBattleReceipt: normalizeReceipt(record.lastBattleReceipt),
    battleRevision: nonNegativeInt(record.battleRevision),
    // A future clock produces zero offline elapsed and is stamped to now.
    lastSeenAt: Math.min(now, finiteTimestamp(record.lastSeenAt, now)),
    simulationCursorAt: Math.min(
      now,
      finiteTimestamp(record.simulationCursorAt, Math.min(now, finiteTimestamp(record.lastSeenAt, now))),
    ),
  };
}

function normalizeResources(value: unknown): Resources {
  const record = isRecord(value) ? value : {};
  return {
    food: finiteNonNegative(record.food, 0),
    wood: finiteNonNegative(record.wood, 0),
    stone: finiteNonNegative(record.stone, 0),
    gold: finiteNonNegative(record.gold, 0),
  };
}

function normalizeBuildings(value: unknown): BuildingState[] {
  const byKind = new Map<BuildingKind, BuildingState>();
  if (Array.isArray(value)) {
    for (const raw of value) {
      if (!isRecord(raw) || typeof raw.kind !== 'string' || !(raw.kind in BUILDING_DEFS)) continue;
      const kind = raw.kind as BuildingKind;
      if (byKind.has(kind)) continue;
      const max = BUILDING_DEFS[kind].maxLevel;
      const minimum = kind === 'town_center' ? 1 : 0;
      const level = clampInt(raw.level, minimum, max);
      const end = raw.upgradeEndsAt === null ? null : finiteTimestamp(raw.upgradeEndsAt, null);
      byKind.set(kind, { kind, level, upgradeEndsAt: level >= max ? null : end });
    }
  }
  if (!byKind.has('town_center')) byKind.set('town_center', { kind: 'town_center', level: 1, upgradeEndsAt: null });
  const townCenterLevel = byKind.get('town_center')!.level;
  for (const [kind, state] of byKind) {
    if (kind === 'town_center') continue;
    const def = BUILDING_DEFS[kind];
    const allowedLevel = townCenterLevel < def.requiresTownCenterLevel
      ? 0
      : Math.min(def.maxLevel, townCenterLevel);
    state.level = Math.min(state.level, allowedLevel);
    if (
      state.upgradeEndsAt !== null &&
      (townCenterLevel < def.requiresTownCenterLevel || state.level + 1 > townCenterLevel || state.level >= def.maxLevel)
    ) {
      state.upgradeEndsAt = null;
    }
  }
  return BUILDING_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind)!);
}

function normalizeArmy(value: unknown): Army {
  const record = isRecord(value) ? value : {};
  const out = {} as Army;
  for (const kind of TROOP_ORDER) out[kind] = nonNegativeInt(record[kind]);
  return out;
}

function normalizeQueue(value: unknown): TrainingOrder[] {
  if (!Array.isArray(value)) return [];
  const queue: TrainingOrder[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.troop !== 'string' || !TROOP_ORDER.includes(raw.troop as TroopKind)) continue;
    const count = strictInt(raw.count, 1, 20);
    const completesAt = finiteTimestamp(raw.completesAt, undefined);
    if (count === undefined || completesAt === undefined) continue;
    const durationMs = finiteNonNegative(raw.durationMs, undefined);
    const startsAt = finiteNonNegative(raw.startsAt, undefined);
    queue.push({ troop: raw.troop as TroopKind, count, completesAt, durationMs, startsAt });
  }
  return queue.sort((a, b) => a.completesAt - b.completesAt).slice(0, 6);
}

function normalizeResearch(value: unknown): GameState['research'] {
  if (!isRecord(value)) return undefined;
  const unlocked = Array.isArray(value.unlocked)
    ? value.unlocked.filter((id): id is TechId => typeof id === 'string' && id in TECH_DEFS)
    : [];
  const activeRaw = value.active;
  const active =
    isRecord(activeRaw) &&
    typeof activeRaw.techId === 'string' &&
    activeRaw.techId in TECH_DEFS &&
    finiteTimestamp(activeRaw.endsAt, undefined) !== undefined
      ? { techId: activeRaw.techId, endsAt: finiteTimestamp(activeRaw.endsAt, 0) }
      : null;
  return { unlocked, active };
}

function normalizeReceipt(value: unknown): BattleReceipt | null {
  if (!isRecord(value)) return null;
  const mode = value.mode === 'replay' ? 'replay' : value.mode === 'campaign' ? 'campaign' : null;
  const wave = clampInt(value.wave, 1, 20);
  if (!mode || typeof value.win !== 'boolean' || typeof value.id !== 'string') return null;
  return {
    id: value.id,
    revision: nonNegativeInt(value.revision),
    mode,
    wave,
    win: value.win,
    reward: normalizeCost(value.reward),
    penalty: normalizeCost(value.penalty),
    casualties: normalizeArmy(value.casualties),
    survivors: normalizeArmy(value.survivors),
    deployed: normalizeArmy(value.deployed),
    committedAt: finiteTimestamp(value.committedAt, 0),
    armyPower: finiteNonNegative(value.armyPower, 0),
    wavePower: finiteNonNegative(value.wavePower, 0),
    attackMultiplier: finiteNonNegative(value.attackMultiplier, 1),
    defenseMultiplier: Math.max(1, finiteNonNegative(value.defenseMultiplier, 1)),
    townDefense: finiteNonNegative(value.townDefense, 0),
    contributions: isRecord(value.contributions)
      ? Object.fromEntries(
          TROOP_ORDER.map((kind) => [kind, finiteNonNegative(value.contributions?.[kind], 0)]),
        )
      : {},
    acknowledged: value.acknowledged === true,
  };
}

function normalizeCost(value: unknown): Partial<Record<ResourceKind, number>> {
  const record = isRecord(value) ? value : {};
  return {
    food: finiteNonNegative(record.food, 0),
    wood: finiteNonNegative(record.wood, 0),
    stone: finiteNonNegative(record.stone, 0),
    gold: finiteNonNegative(record.gold, 0),
  };
}

function hasCoreShape(value: Record<string, unknown>): boolean {
  if (!isRecord(value.resources) || !Array.isArray(value.buildings) || !isRecord(value.army) || !Array.isArray(value.trainingQueue)) {
    return false;
  }

  // Known nested records must be complete and finite. Silently inventing a
  // missing deadline at `now` would turn corruption into a free completion.
  for (const raw of value.buildings) {
    if (!isRecord(raw) || typeof raw.kind !== 'string') return false;
    if (!(raw.kind in BUILDING_DEFS)) continue; // Unknown IDs are isolated.
    const max = BUILDING_DEFS[raw.kind as BuildingKind].maxLevel;
    if (strictInt(raw.level, 0, max) === undefined) return false;
    if (raw.upgradeEndsAt !== null && finiteTimestamp(raw.upgradeEndsAt, undefined) === undefined) return false;
  }
  for (const kind of TROOP_ORDER) {
    const count = value.army[kind];
    // Missing newer troop kinds are valid in old saves; present values are not
    // allowed to be fractional, negative, NaN, or infinite.
    if (count !== undefined && strictInt(count, 0, Number.MAX_SAFE_INTEGER) === undefined) return false;
  }
  for (const raw of value.trainingQueue) {
    if (!isRecord(raw) || typeof raw.troop !== 'string') return false;
    if (!TROOP_ORDER.includes(raw.troop as TroopKind)) continue;
    if (strictInt(raw.count, 1, 20) === undefined) return false;
    if (finiteTimestamp(raw.completesAt, undefined) === undefined) return false;
    if (raw.startsAt !== undefined && finiteTimestamp(raw.startsAt, undefined) === undefined) return false;
    if (raw.durationMs !== undefined && finiteNonNegative(raw.durationMs, undefined) === undefined) return false;
  }
  if (value.research !== undefined) {
    if (!isRecord(value.research) || !Array.isArray(value.research.unlocked)) return false;
    const active = value.research.active;
    if (active !== null && active !== undefined) {
      if (!isRecord(active) || typeof active.techId !== 'string') return false;
      if (active.techId in TECH_DEFS && finiteTimestamp(active.endsAt, undefined) === undefined) return false;
    }
  }
  return finiteTimestamp(value.lastSeenAt, undefined) !== undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, fallback: any): any {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function finiteTimestamp<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0));
}

function strictInt(value: unknown, low: number, high: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return undefined;
  return value >= low && value <= high ? value : undefined;
}

function clampInt(value: unknown, low: number, high: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : low;
  return Math.max(low, Math.min(high, number));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage as unknown as KeyValueStorage;
  } catch {
    // Fall through to volatile storage while the UI reports persistence state.
  }
  return memoryStorage();
}

export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}
