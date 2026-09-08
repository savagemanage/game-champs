import type { GameMode } from '../game/battleStore';
import type { Lane } from '../game/rift/map';

/** Wave cadence for one mode, in elapsed match seconds. */
export interface WaveRules {
  firstWaveSeconds: number;
  intervalSeconds: number;
  unitStaggerMilliseconds: number;
}

/** Neutral-objective cadence. Timings are ignored when objectives are disabled. */
export interface ObjectiveRules {
  enabled: boolean;
  firstSpawnSeconds: number;
  respawnSeconds: number;
  heraldStartSeconds: number;
  heraldEndSeconds: number;
  majorSpawnSeconds: number;
  majorBuffSeconds: number;
}

/** Structure topology and recovery policy for one mode. */
export interface StructureRules {
  activeLanes: readonly Lane[];
  lanePolicy: 'all-active-lanes';
  baseTurretCount: 2;
  baseUnlockPolicy: 'any-active-inhibitor-destroyed';
  inhibitorRespawnSeconds: number;
}

/** Champion death and return-to-play tuning. */
export interface RespawnRules {
  baseSeconds: number;
  secondsPerLevel: number;
  maxSeconds: number;
  invulnerabilitySeconds: number;
}

/** Numeric weights used only when the hard match cap forces a winner. */
export interface HardResolutionWeights {
  nexusHealth: number;
  structures: number;
  championKills: number;
  objectives: number;
  gold: number;
}

/** Complete pure rules consumed by simulation modules for a match mode. */
export interface MatchModeRules {
  mode: GameMode;
  waves: WaveRules;
  objectives: ObjectiveRules;
  structures: StructureRules;
  respawn: RespawnRules;
  suddenDeathSeconds: number;
  hardCapSeconds: number;
  hardResolutionWeights: HardResolutionWeights;
}

const HARD_RESOLUTION_WEIGHTS: HardResolutionWeights = {
  nexusHealth: 1_000,
  structures: 300,
  championKills: 25,
  objectives: 40,
  gold: 0.01,
};

/** Three-lane neutral-objective cadence, compressed for a 10-15 minute match. */
export const CONQUEST_OBJECTIVE_RULES: ObjectiveRules = {
  enabled: true,
  firstSpawnSeconds: 120,
  respawnSeconds: 150,
  heraldStartSeconds: 180,
  heraldEndSeconds: 420,
  majorSpawnSeconds: 480,
  majorBuffSeconds: 90,
};

/** Single-lane matches intentionally omit neutral map objectives. */
export const MIDLINE_OBJECTIVE_RULES: ObjectiveRules = {
  enabled: false,
  firstSpawnSeconds: 0,
  respawnSeconds: 0,
  heraldStartSeconds: 0,
  heraldEndSeconds: 0,
  majorSpawnSeconds: 0,
  majorBuffSeconds: 0,
};

export const MATCH_RULES: Readonly<Record<GameMode, MatchModeRules>> = {
  conquest: {
    mode: 'conquest',
    waves: {
      firstWaveSeconds: 10,
      intervalSeconds: 24,
      unitStaggerMilliseconds: 180,
    },
    objectives: CONQUEST_OBJECTIVE_RULES,
    structures: {
      activeLanes: ['top', 'mid', 'bot'],
      lanePolicy: 'all-active-lanes',
      baseTurretCount: 2,
      baseUnlockPolicy: 'any-active-inhibitor-destroyed',
      inhibitorRespawnSeconds: 150,
    },
    respawn: {
      baseSeconds: 4,
      secondsPerLevel: 1.25,
      maxSeconds: 26,
      invulnerabilitySeconds: 2,
    },
    suddenDeathSeconds: 12 * 60,
    hardCapSeconds: 15 * 60,
    hardResolutionWeights: HARD_RESOLUTION_WEIGHTS,
  },
  midline: {
    mode: 'midline',
    waves: {
      firstWaveSeconds: 10,
      intervalSeconds: 20,
      unitStaggerMilliseconds: 150,
    },
    objectives: MIDLINE_OBJECTIVE_RULES,
    structures: {
      activeLanes: ['mid'],
      lanePolicy: 'all-active-lanes',
      baseTurretCount: 2,
      baseUnlockPolicy: 'any-active-inhibitor-destroyed',
      inhibitorRespawnSeconds: 120,
    },
    respawn: {
      baseSeconds: 3,
      secondsPerLevel: 0.9,
      maxSeconds: 20,
      invulnerabilitySeconds: 2.5,
    },
    suddenDeathSeconds: 12 * 60,
    hardCapSeconds: 15 * 60,
    hardResolutionWeights: HARD_RESOLUTION_WEIGHTS,
  },
};

/** Return the immutable rules record for a mode. */
export function rulesForMode(mode: GameMode): MatchModeRules {
  return MATCH_RULES[mode];
}

/** Return a fresh active-lane array so callers cannot mutate shared config. */
export function activeLanesForMode(mode: GameMode): Lane[] {
  return [...rulesForMode(mode).structures.activeLanes];
}
