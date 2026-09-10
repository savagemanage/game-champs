import type { CooldownKey, Vec2 } from './combat';
import type { ChampionLifePhase } from './championLifeState';
import type { MatchPhase, MatchResolutionReason } from './matchResolution';
import type { Difficulty, MatchKind } from './tutorial/config';
import type { LearningAction } from './tutorial/flow';

export type GameMode = 'conquest' | 'midline';
export type BattleResult = 'win' | 'loss' | 'draw' | 'abandoned';
export type BattleLifecycle = 'running' | 'paused' | 'ended';
export type PauseReason = 'manual' | 'settings' | 'hidden';
export const DEFAULT_MATCH_KIND: MatchKind = 'standard';
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export interface AbilityHudState {
  slot: CooldownKey;
  progress: number;
  remaining: number;
  cooldown?: number;
  ready: boolean;
  cost?: number;
}
export interface BuffHudState { kind: string; remaining: number }
export interface CampHudState {
  id: string;
  type: 'blue' | 'red' | 'raptors' | 'wolves' | 'gromp' | 'krugs' | 'scuttle';
  side: 'ally' | 'enemy';
  alive: boolean;
  membersAlive: number;
  membersTotal: number;
  respawnsIn: number;
}
export interface ObjectiveHudState {
  id: 'dragon' | 'herald' | 'baron';
  alive: boolean;
  spawnsIn: number;
}
export interface StructureStatus {
  turrets: number;
  turretsMax: number;
  inhibitors: number;
  inhibitorsMax: number;
  nexusPct: number;
}
export interface MinimapBlip {
  id: string;
  x: number;
  y: number;
  kind: 'champion' | 'minion' | 'turret' | 'nexus' | 'monster';
  team: 'ally' | 'enemy' | 'neutral';
}
export interface PlayerLifeHudState {
  phase: ChampionLifePhase;
  deaths: number;
  respawnSeconds: number;
  invulnerableSeconds: number;
}
export interface MatchStatusHudState {
  phase: MatchPhase;
  suddenDeath: boolean;
  hardCapSecondsRemaining: number;
}
export interface RecallHudState {
  channeling: boolean;
  remaining: number;
  cancellation?: string;
}
export interface LearningHudState {
  current?: LearningAction;
  completed: number;
  total: number;
}
export interface PurchaseFeedback {
  itemId: string;
  accepted: boolean;
  reason?: string;
  sequence: number;
}

export interface BattleHudState {
  mode: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  lifecycle: BattleLifecycle;
  pauseReasons: PauseReason[];
  playerChampionId: string;
  enemyChampionId: string;
  playerHp: number;
  playerMaxHp: number;
  playerResource: number;
  playerMaxResource: number;
  enemyHp: number;
  enemyMaxHp: number;
  allyNexusPct: number;
  enemyNexusPct: number;
  abilities: AbilityHudState[];
  elapsed: number;
  gold: number;
  level: number;
  xpPct: number;
  xpCapped: boolean;
  shopAvailable: boolean;
  ownedItems: string[];
  buffs: BuffHudState[];
  camps: CampHudState[];
  objectives: ObjectiveHudState[];
  aimingSlot?: CooldownKey;
  dragonStacks: number;
  objectivePoints: number;
  wardenChargeSeconds: number;
  playerLife: PlayerLifeHudState;
  matchStatus: MatchStatusHudState;
  recall: RecallHudState;
  learning?: LearningHudState;
  currentTargetId?: string;
  purchaseFeedback?: PurchaseFeedback;
  allyStructures: StructureStatus;
  enemyStructures: StructureStatus;
  minimap: MinimapBlip[];
}

export interface BattleOutcome {
  matchId: string;
  result: BattleResult;
  mode: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  playerChampionId: string;
  enemyChampionId: string;
  deaths: number;
  totalGoldEarned: number;
  objectives: number;
  objectivePoints: number;
  ownedItems: string[];
  endReason: MatchResolutionReason;
  learningRequirementsCompleted?: boolean;
  stats: {
    durationSeconds: number;
    championKills: number;
    minionKills: number;
    damageDealt: number;
    level: number;
    gold: number;
  };
}

export type BattleCommand =
  | { type: 'purchase'; itemId: string }
  | { type: 'cast'; slot: CooldownKey; aim?: Vec2 }
  | { type: 'arm-cast'; slot: CooldownKey }
  | { type: 'aim-start'; slot: CooldownKey; clientX: number; clientY: number }
  | { type: 'aim-update'; slot: CooldownKey; clientX: number; clientY: number }
  | { type: 'aim-commit'; slot: CooldownKey; clientX: number; clientY: number }
  | { type: 'aim-cancel'; slot?: CooldownKey }
  | { type: 'attack-move' }
  | { type: 'move-to'; point: Vec2 }
  | { type: 'target-at'; point: Vec2 }
  | { type: 'attack-move-to'; point: Vec2 }
  | { type: 'stop' }
  | { type: 'recall' }
  | { type: 'pause'; reason: PauseReason }
  | { type: 'resume'; reason: PauseReason }
  | { type: 'surrender' }
  | { type: 'use-warden' }
  | { type: 'skip-learning' };

function emptyStructures(turrets = 0, inhibitors = 0): StructureStatus {
  return { turrets, turretsMax: turrets, inhibitors, inhibitorsMax: inhibitors, nexusPct: 1 };
}

function emptyState(
  playerChampionId = '',
  enemyChampionId = '',
  mode: GameMode = 'conquest',
): BattleHudState {
  return {
    mode,
    matchKind: DEFAULT_MATCH_KIND,
    difficulty: DEFAULT_DIFFICULTY,
    lifecycle: 'running',
    pauseReasons: [],
    playerChampionId,
    enemyChampionId,
    playerHp: 0,
    playerMaxHp: 1,
    playerResource: 0,
    playerMaxResource: 1,
    enemyHp: 0,
    enemyMaxHp: 1,
    allyNexusPct: 1,
    enemyNexusPct: 1,
    abilities: [],
    elapsed: 0,
    gold: 0,
    level: 1,
    xpPct: 0,
    xpCapped: false,
    shopAvailable: false,
    ownedItems: [],
    buffs: [],
    camps: [],
    objectives: [],
    dragonStacks: 0,
    objectivePoints: 0,
    wardenChargeSeconds: 0,
    playerLife: { phase: 'alive', deaths: 0, respawnSeconds: 0, invulnerableSeconds: 0 },
    matchStatus: { phase: 'regulation', suddenDeath: false, hardCapSecondsRemaining: 0 },
    recall: { channeling: false, remaining: 0 },
    allyStructures: emptyStructures(),
    enemyStructures: emptyStructures(),
    minimap: [],
  };
}

type Listener = () => void;

export interface QueuedBattleCommand {
  sequence: number;
  command: BattleCommand;
}

export interface AuthorityCommandLogEntry extends QueuedBattleCommand {
  targetTick: number;
}

export interface AuthorityMatchRequest {
  matchId: string;
  matchSeed: string;
  mode: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  playerChampionId: string;
  enemyChampionId: string;
}

/** Versioned, JSON-safe input replay that can recreate a match from tick zero. */
export interface AuthorityReplayState {
  version: 1;
  matchRequest: AuthorityMatchRequest;
  commands: AuthorityCommandLogEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFinitePoint(value: unknown): value is Vec2 {
  return isRecord(value) &&
    typeof value.x === 'number' && Number.isFinite(value.x) &&
    typeof value.y === 'number' && Number.isFinite(value.y);
}

function isBattleCommand(value: unknown): value is BattleCommand {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'purchase': return typeof value.itemId === 'string';
    case 'cast':
      return (value.slot === 'Q' || value.slot === 'W' || value.slot === 'E' || value.slot === 'R') &&
        (value.aim === undefined || isFinitePoint(value.aim));
    case 'arm-cast': return value.slot === 'Q' || value.slot === 'W' || value.slot === 'E' || value.slot === 'R';
    case 'aim-start':
    case 'aim-update':
    case 'aim-commit':
      return (value.slot === 'Q' || value.slot === 'W' || value.slot === 'E' || value.slot === 'R') &&
        typeof value.clientX === 'number' && Number.isFinite(value.clientX) &&
        typeof value.clientY === 'number' && Number.isFinite(value.clientY);
    case 'aim-cancel':
      return value.slot === undefined || value.slot === 'Q' || value.slot === 'W' || value.slot === 'E' || value.slot === 'R';
    case 'move-to':
    case 'target-at':
    case 'attack-move-to': return isFinitePoint(value.point);
    case 'pause':
    case 'resume': return value.reason === 'manual' || value.reason === 'settings' || value.reason === 'hidden';
    case 'attack-move':
    case 'stop':
    case 'recall':
    case 'surrender':
    case 'use-warden':
    case 'skip-learning': return true;
    default: return false;
  }
}

function parseReplayState(value: unknown): AuthorityReplayState {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.matchRequest) || !Array.isArray(parsed.commands)) {
    throw new Error('Invalid Champs authority replay state');
  }
  const request = parsed.matchRequest;
  if (
    typeof request.matchId !== 'string' || !request.matchId ||
    typeof request.matchSeed !== 'string' || !request.matchSeed ||
    (request.mode !== 'conquest' && request.mode !== 'midline') ||
    (request.matchKind !== 'standard' && request.matchKind !== 'practice' && request.matchKind !== 'tutorial') ||
    (request.difficulty !== 'easy' && request.difficulty !== 'normal' && request.difficulty !== 'hard') ||
    typeof request.playerChampionId !== 'string' || !request.playerChampionId ||
    typeof request.enemyChampionId !== 'string' || !request.enemyChampionId
  ) throw new Error('Invalid Champs authority replay match request');

  const commands = parsed.commands.map((entry) => {
    if (
      !isRecord(entry) || !Number.isSafeInteger(entry.sequence) || (entry.sequence as number) < 1 ||
      !Number.isSafeInteger(entry.targetTick) || (entry.targetTick as number) < 0 ||
      !isBattleCommand(entry.command)
    ) throw new Error('Invalid Champs authority replay command');
    return {
      sequence: entry.sequence as number,
      targetTick: entry.targetTick as number,
      command: structuredClone(entry.command),
    };
  });
  commands.sort((a, b) => a.targetTick - b.targetTick || a.sequence - b.sequence);
  return {
    version: 1,
    matchRequest: {
      matchId: request.matchId,
      matchSeed: request.matchSeed,
      mode: request.mode,
      matchKind: request.matchKind,
      difficulty: request.difficulty,
      playerChampionId: request.playerChampionId,
      enemyChampionId: request.enemyChampionId,
    },
    commands,
  };
}

function sameMatchRequest(left: AuthorityMatchRequest, right: AuthorityMatchRequest): boolean {
  return left.matchId === right.matchId &&
    left.matchSeed === right.matchSeed &&
    left.mode === right.mode &&
    left.matchKind === right.matchKind &&
    left.difficulty === right.difficulty &&
    left.playerChampionId === right.playerChampionId &&
    left.enemyChampionId === right.enemyChampionId;
}

export class BattleStore {
  private state: BattleHudState = emptyState();
  private listeners = new Set<Listener>();
  private commandQueue: QueuedBattleCommand[] = [];
  private acceptedCommandLog: AuthorityCommandLogEntry[] = [];
  private nextCommandSequence = 1;
  private matchRequest: AuthorityMatchRequest | null = null;
  private pendingImportedReplay: AuthorityReplayState | null = null;

  getSnapshot = (): BattleHudState => this.state;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  set(next: BattleHudState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  reset(
    playerChampionId: string,
    enemyChampionId: string,
    mode: GameMode = 'conquest',
    matchRequest?: AuthorityMatchRequest,
  ): void {
    this.commandQueue = [];
    this.acceptedCommandLog = [];
    this.nextCommandSequence = 1;
    this.matchRequest = matchRequest ? structuredClone(matchRequest) : null;
    this.set(emptyState(playerChampionId, enemyChampionId, mode));
  }
  request(command: BattleCommand): void {
    const queued = { sequence: this.nextCommandSequence++, command: structuredClone(command) };
    this.commandQueue.push(queued);
  }
  consumeQueuedCommands(): QueuedBattleCommand[] {
    if (this.commandQueue.length === 0) return [];
    const commands = this.commandQueue;
    this.commandQueue = [];
    return commands;
  }
  /** Compatibility view; authority consumes the stable sequence envelope. */
  consumeCommands(): BattleCommand[] {
    return this.consumeQueuedCommands().map(({ command }) => command);
  }
  recordAuthorityCommand(entry: AuthorityCommandLogEntry): void {
    this.acceptedCommandLog.push(structuredClone(entry));
  }
  getCommandLog(): readonly AuthorityCommandLogEntry[] {
    return this.acceptedCommandLog.map((entry) => structuredClone(entry));
  }
  /** Export the complete deterministic replay input for the current match. */
  exportReplayState(): AuthorityReplayState | null {
    if (!this.matchRequest) return null;
    return {
      version: 1,
      matchRequest: structuredClone(this.matchRequest),
      commands: this.getCommandLog().map((entry) => structuredClone(entry)),
    };
  }
  serializeReplayState(): string | null {
    const replay = this.exportReplayState();
    return replay ? JSON.stringify(replay) : null;
  }
  /** Validate and stage replay input. The returned request can be used to launch Phaser. */
  importReplayState(value: unknown): AuthorityMatchRequest {
    this.pendingImportedReplay = parseReplayState(value);
    return structuredClone(this.pendingImportedReplay.matchRequest);
  }
  /**
   * Consume staged commands only for their exact request. Commands retain their
   * original target ticks and sequences, independent of render timing.
   */
  consumeImportedReplay(matchRequest: AuthorityMatchRequest): AuthorityCommandLogEntry[] {
    const replay = this.pendingImportedReplay;
    if (!replay || !sameMatchRequest(replay.matchRequest, matchRequest)) return [];
    this.pendingImportedReplay = null;
    this.acceptedCommandLog = replay.commands.map((entry) => structuredClone(entry));
    this.nextCommandSequence = Math.max(0, ...replay.commands.map((entry) => entry.sequence)) + 1;
    return replay.commands.map((entry) => structuredClone(entry));
  }
  requestPurchase(itemId: string): void { this.request({ type: 'purchase', itemId }); }
  consumePurchases(): string[] {
    const purchases: string[] = [];
    const rest: QueuedBattleCommand[] = [];
    for (const queued of this.commandQueue) {
      if (queued.command.type === 'purchase') purchases.push(queued.command.itemId);
      else rest.push(queued);
    }
    this.commandQueue = rest;
    return purchases;
  }
}

export const battleStore = new BattleStore();
