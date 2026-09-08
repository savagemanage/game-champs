/**
 * A tiny framework-agnostic store the Phaser BattleScene pushes live HUD data
 * into, and the React HUD overlay subscribes to. Keeping this Phaser-free (it
 * only holds plain data) means the scene can update it every frame without the
 * React tree re-rendering Phaser, and the HUD stays perfectly in sync via
 * `useSyncExternalStore`.
 */

import type { CooldownKey } from './combat';
import type { ChampionLifePhase } from './championLifeState';
import type { MatchPhase, MatchResolutionReason } from './matchResolution';
import type { Difficulty, MatchKind } from './tutorial/config';

/** Which game mode the battle is running. */
export type GameMode = 'conquest' | 'midline';

/** Defaults used when a local match setup omits progression metadata. */
export const DEFAULT_MATCH_KIND: MatchKind = 'standard';
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/** Per-ability HUD state: cooldown fill 0..1 and remaining seconds. */
export interface AbilityHudState {
  slot: CooldownKey;
  /** 0 (just cast) .. 1 (ready). */
  progress: number;
  /** Whole seconds remaining, for the numeric overlay (0 when ready). */
  remaining: number;
  ready: boolean;
}

/** A single active buff shown on the HUD. */
export interface BuffHudState {
  /** 'blue' | 'red' | 'baron' etc. */
  kind: string;
  /** Whole seconds of the buff remaining. */
  remaining: number;
}

/** An epic-monster objective timer for the HUD. */
export interface ObjectiveHudState {
  id: 'dragon' | 'herald' | 'baron';
  /** True when the monster is currently alive/available. */
  alive: boolean;
  /** Whole seconds until it (re)spawns; 0 when alive. */
  spawnsIn: number;
}

/** The living/destroyed state of a team's structures, for the HUD + minimap. */
export interface StructureStatus {
  /** Turrets still standing for this team (of the full set). */
  turrets: number;
  /** Total turrets this team started with. */
  turretsMax: number;
  /** Inhibitors still standing for this team. */
  inhibitors: number;
  /** Total inhibitors this team started with. */
  inhibitorsMax: number;
  /** Nexus health fraction 0..1. */
  nexusPct: number;
}

/** A single blip on the minimap (normalized 0..1 world coordinates). */
export interface MinimapBlip {
  id: string;
  /** 0..1 across the world width. */
  x: number;
  /** 0..1 down the world height. */
  y: number;
  kind: 'champion' | 'minion' | 'turret' | 'nexus' | 'monster';
  team: 'ally' | 'enemy' | 'neutral';
}

/** Player life-cycle facts needed for death and return-to-play HUDs. */
export interface PlayerLifeHudState {
  phase: ChampionLifePhase;
  deaths: number;
  respawnSeconds: number;
  invulnerableSeconds: number;
}

/** Authoritative current match clock phase and forced-resolution deadline. */
export interface MatchStatusHudState {
  phase: MatchPhase;
  suddenDeath: boolean;
  hardCapSecondsRemaining: number;
}

/** The complete snapshot the HUD renders at most ten times per second. */
export interface BattleHudState {
  mode: GameMode;
  playerChampionId: string;
  enemyChampionId: string;
  playerHp: number;
  playerMaxHp: number;
  playerResource: number;
  playerMaxResource: number;
  enemyHp: number;
  enemyMaxHp: number;
  /** Remaining structure health per team, 0..1, for the objective bar. */
  allyNexusPct: number;
  enemyNexusPct: number;
  abilities: AbilityHudState[];
  /** Elapsed match time in seconds. */
  elapsed: number;

  // --- Economy / progression -------------------------------------------
  /** Player gold available to spend in the shop. */
  gold: number;
  /** Player champion level (1..18). */
  level: number;
  /** XP progress toward the next level, 0..1. */
  xpPct: number;

  // --- Shop -------------------------------------------------------------
  /** Whether the shop can be opened (player is in base/fountain). */
  shopAvailable: boolean;
  /** Item ids the player currently owns. */
  ownedItems: string[];

  // --- Buffs / objectives ----------------------------------------------
  /** Active buffs on the player (blue/red/baron). */
  buffs: BuffHudState[];
  /** Epic-monster objective timers. */
  objectives: ObjectiveHudState[];
  /** Dragon stacks the ally team has secured. */
  dragonStacks: number;
  /** Player death, respawn and post-respawn protection state. */
  playerLife: PlayerLifeHudState;
  /** Regulation, sudden-death and hard-cap timing facts. */
  matchStatus: MatchStatusHudState;

  // --- Structures + minimap --------------------------------------------
  allyStructures: StructureStatus;
  enemyStructures: StructureStatus;
  minimap: MinimapBlip[];
}

/** The authoritative outcome handed to React when the match ends. */
export interface BattleOutcome {
  matchId: string;
  win: boolean;
  mode: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  playerChampionId: string;
  enemyChampionId: string;
  deaths: number;
  totalGoldEarned: number;
  objectives: number;
  ownedItems: string[];
  endReason: MatchResolutionReason;
  /** Match stats surfaced on the results screen. */
  stats: {
    durationSeconds: number;
    championKills: number;
    minionKills: number;
    damageDealt: number;
    level: number;
    gold: number;
  };
}

function emptyStructures(turrets = 0, inhibitors = 0): StructureStatus {
  return {
    turrets,
    turretsMax: turrets,
    inhibitors,
    inhibitorsMax: inhibitors,
    nexusPct: 1,
  };
}

function emptyState(
  playerChampionId = '',
  enemyChampionId = '',
  mode: GameMode = 'conquest',
): BattleHudState {
  return {
    mode,
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
    shopAvailable: false,
    ownedItems: [],
    buffs: [],
    objectives: [],
    dragonStacks: 0,
    playerLife: {
      phase: 'alive',
      deaths: 0,
      respawnSeconds: 0,
      invulnerableSeconds: 0,
    },
    matchStatus: {
      phase: 'regulation',
      suddenDeath: false,
      hardCapSecondsRemaining: 0,
    },
    allyStructures: emptyStructures(),
    enemyStructures: emptyStructures(),
    minimap: [],
  };
}

type Listener = () => void;

/** Minimal external store with a stable snapshot reference for React. */
export class BattleStore {
  private state: BattleHudState = emptyState();
  private listeners = new Set<Listener>();
  /**
   * Purchase requests queued by the React shop, drained by the Phaser scene
   * each frame so gold validation and item application live in one place.
   */
  private purchaseQueue: string[] = [];

  getSnapshot = (): BattleHudState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replace the snapshot (a new object ref) and notify subscribers. */
  set(next: BattleHudState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  reset(
    playerChampionId: string,
    enemyChampionId: string,
    mode: GameMode = 'conquest',
  ): void {
    this.purchaseQueue = [];
    this.set(emptyState(playerChampionId, enemyChampionId, mode));
  }

  /** Queue a purchase request from the React shop (validated by the scene). */
  requestPurchase(itemId: string): void {
    this.purchaseQueue.push(itemId);
  }

  /** Drain and return all queued purchase requests (called by the scene). */
  consumePurchases(): string[] {
    if (this.purchaseQueue.length === 0) return [];
    const drained = this.purchaseQueue;
    this.purchaseQueue = [];
    return drained;
  }
}

/** A single shared store instance for the active battle. */
export const battleStore = new BattleStore();
