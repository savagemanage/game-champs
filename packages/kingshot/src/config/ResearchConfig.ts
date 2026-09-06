/**
 * ResearchConfig - the multi-branch tech tree for Kingdom Rise's Scholars' Hall
 * (연구소). This is pure data + pure helper functions with NO Phaser dependency,
 * so ResearchSystem and its unit tests can consume it directly.
 *
 * The tree has two branches:
 *   - military:  troop attack, troop defense/HP, and training speed.
 *   - economic:  production rate, storage capacity, build speed, and offline
 *                efficiency.
 *
 * Each tech sits at a TIER. A tech may require its predecessor in the same
 * chain (prereq) and/or a minimum Scholars' Hall (research building) level. Its
 * effect is a DECLARATIVE multiplier: an EffectKind plus a `mult`. Multipliers
 * compose multiplicatively across every unlocked tech of the same kind (see
 * ResearchSystem's aggregate getters), so two +10% attack techs give 1.21x.
 *
 * Convention for `mult`:
 *   - "faster / cheaper" effects (trainSpeed, buildSpeed) use mult < 1 (a time
 *     scale, e.g. 0.9 = 10% faster).
 *   - "more / stronger" effects (production, storage, offlineEfficiency,
 *     combatAttack, combatDefense) use mult > 1 (a boost, e.g. 1.1 = +10%).
 */

import type { ResourceCost } from '../types';

/** The two tech-tree branches. */
export type ResearchBranch = 'military' | 'economic';

/**
 * What a tech's multiplier applies to. Each maps to a REAL wired system:
 *   - trainSpeed:        scales TrainingQueue batch train time (mult < 1 faster).
 *   - buildSpeed:        scales BuildingSystem upgrade time (mult < 1 faster).
 *   - production:        scales BuildingSystem productionRates (mult > 1 more).
 *   - storage:           scales the ResourceStore soft cap (mult > 1 higher cap).
 *   - offlineEfficiency: scales offline idle-gain efficiency (mult > 1 more).
 *   - combatAttack:      scales effective army power in CombatSystem (mult > 1).
 *   - combatDefense:     reduces battle casualties in CombatSystem (mult > 1).
 */
export type EffectKind =
  | 'trainSpeed'
  | 'buildSpeed'
  | 'production'
  | 'storage'
  | 'offlineEfficiency'
  | 'combatAttack'
  | 'combatDefense';

/** A declarative research effect: one multiplier applied to one system. */
export interface ResearchEffect {
  kind: EffectKind;
  /** Multiplier composed multiplicatively across all unlocked techs of this kind. */
  mult: number;
}

/** The identifiers of every tech in the tree. */
export type TechId =
  // Military - attack chain.
  | 'sharpened_blades'
  | 'forged_weapons'
  | 'masterwork_arms'
  // Military - defense / HP chain.
  | 'hardened_armor'
  | 'tempered_plate'
  // Military - training speed chain.
  | 'drill_grounds'
  | 'veteran_cadre'
  // Economic - production chain.
  | 'crop_rotation'
  | 'guild_charters'
  | 'grand_markets'
  // Economic - storage chain.
  | 'reinforced_stores'
  | 'great_granaries'
  // Economic - build speed chain.
  | 'scaffolding'
  | 'master_masons'
  // Economic - offline efficiency chain.
  | 'ledger_keeping';

/** Static definition of a single tech node. */
export interface TechDef {
  id: TechId;
  branch: ResearchBranch;
  /** 1-based tier within its branch (higher tiers gate behind the Hall level). */
  tier: number;
  /** Resource cost to research (charged up front on start). */
  cost: ResourceCost;
  /** Milliseconds the research takes to complete. */
  timeMs: number;
  /** The declarative multiplier this tech applies once unlocked. */
  effect: ResearchEffect;
  /** Prerequisite tech that must be unlocked first (same chain), if any. */
  requires?: TechId;
  /** Minimum Scholars' Hall (research building) level required to research it. */
  requiresResearchLevel: number;
}

/**
 * The tech tree. Kept intentionally compact but genuinely multi-branch with
 * chains and building-level gates so canResearch exercises every reason code.
 */
export const TECH_DEFS: Record<TechId, TechDef> = {
  // --- Military: attack -----------------------------------------------------
  sharpened_blades: {
    id: 'sharpened_blades',
    branch: 'military',
    tier: 1,
    cost: { wood: 80, gold: 40 },
    timeMs: 30_000,
    effect: { kind: 'combatAttack', mult: 1.1 },
    requiresResearchLevel: 1,
  },
  forged_weapons: {
    id: 'forged_weapons',
    branch: 'military',
    tier: 2,
    cost: { wood: 160, stone: 80, gold: 90 },
    timeMs: 75_000,
    effect: { kind: 'combatAttack', mult: 1.15 },
    requires: 'sharpened_blades',
    requiresResearchLevel: 2,
  },
  masterwork_arms: {
    id: 'masterwork_arms',
    branch: 'military',
    tier: 3,
    cost: { stone: 200, gold: 220 },
    timeMs: 150_000,
    effect: { kind: 'combatAttack', mult: 1.2 },
    requires: 'forged_weapons',
    requiresResearchLevel: 3,
  },

  // --- Military: defense / HP ----------------------------------------------
  hardened_armor: {
    id: 'hardened_armor',
    branch: 'military',
    tier: 1,
    cost: { stone: 90, gold: 40 },
    timeMs: 35_000,
    effect: { kind: 'combatDefense', mult: 1.1 },
    requiresResearchLevel: 1,
  },
  tempered_plate: {
    id: 'tempered_plate',
    branch: 'military',
    tier: 2,
    cost: { stone: 180, gold: 100 },
    timeMs: 90_000,
    effect: { kind: 'combatDefense', mult: 1.15 },
    requires: 'hardened_armor',
    requiresResearchLevel: 2,
  },

  // --- Military: training speed --------------------------------------------
  drill_grounds: {
    id: 'drill_grounds',
    branch: 'military',
    tier: 1,
    cost: { food: 100, wood: 60 },
    timeMs: 30_000,
    effect: { kind: 'trainSpeed', mult: 0.9 },
    requiresResearchLevel: 1,
  },
  veteran_cadre: {
    id: 'veteran_cadre',
    branch: 'military',
    tier: 2,
    cost: { food: 220, gold: 80 },
    timeMs: 85_000,
    effect: { kind: 'trainSpeed', mult: 0.85 },
    requires: 'drill_grounds',
    requiresResearchLevel: 2,
  },

  // --- Economic: production -------------------------------------------------
  crop_rotation: {
    id: 'crop_rotation',
    branch: 'economic',
    tier: 1,
    cost: { food: 80, wood: 80 },
    timeMs: 25_000,
    effect: { kind: 'production', mult: 1.1 },
    requiresResearchLevel: 1,
  },
  guild_charters: {
    id: 'guild_charters',
    branch: 'economic',
    tier: 2,
    cost: { wood: 200, stone: 120, gold: 60 },
    timeMs: 80_000,
    effect: { kind: 'production', mult: 1.15 },
    requires: 'crop_rotation',
    requiresResearchLevel: 2,
  },
  grand_markets: {
    id: 'grand_markets',
    branch: 'economic',
    tier: 3,
    cost: { stone: 260, gold: 200 },
    timeMs: 150_000,
    effect: { kind: 'production', mult: 1.2 },
    requires: 'guild_charters',
    requiresResearchLevel: 3,
  },

  // --- Economic: storage ----------------------------------------------------
  reinforced_stores: {
    id: 'reinforced_stores',
    branch: 'economic',
    tier: 1,
    cost: { wood: 100, stone: 100 },
    timeMs: 30_000,
    effect: { kind: 'storage', mult: 1.5 },
    requiresResearchLevel: 1,
  },
  great_granaries: {
    id: 'great_granaries',
    branch: 'economic',
    tier: 2,
    cost: { wood: 240, stone: 240, gold: 60 },
    timeMs: 90_000,
    effect: { kind: 'storage', mult: 2.0 },
    requires: 'reinforced_stores',
    requiresResearchLevel: 2,
  },

  // --- Economic: build speed ------------------------------------------------
  scaffolding: {
    id: 'scaffolding',
    branch: 'economic',
    tier: 1,
    cost: { wood: 120, stone: 60 },
    timeMs: 30_000,
    effect: { kind: 'buildSpeed', mult: 0.9 },
    requiresResearchLevel: 1,
  },
  master_masons: {
    id: 'master_masons',
    branch: 'economic',
    tier: 2,
    cost: { wood: 200, stone: 200, gold: 80 },
    timeMs: 90_000,
    effect: { kind: 'buildSpeed', mult: 0.85 },
    requires: 'scaffolding',
    requiresResearchLevel: 2,
  },

  // --- Economic: offline efficiency ----------------------------------------
  ledger_keeping: {
    id: 'ledger_keeping',
    branch: 'economic',
    tier: 1,
    cost: { food: 120, gold: 60 },
    timeMs: 40_000,
    effect: { kind: 'offlineEfficiency', mult: 1.25 },
    requiresResearchLevel: 1,
  },
};

/** All tech ids in a stable display/iteration order, grouped by branch. */
export const TECH_ORDER: readonly TechId[] = [
  // Military.
  'sharpened_blades',
  'forged_weapons',
  'masterwork_arms',
  'hardened_armor',
  'tempered_plate',
  'drill_grounds',
  'veteran_cadre',
  // Economic.
  'crop_rotation',
  'guild_charters',
  'grand_markets',
  'reinforced_stores',
  'great_granaries',
  'scaffolding',
  'master_masons',
  'ledger_keeping',
] as const;

/** The branches in display order. */
export const RESEARCH_BRANCHES: readonly ResearchBranch[] = ['military', 'economic'] as const;

/** Lookup a tech definition (never undefined for a valid id). */
export function techDef(id: TechId): TechDef {
  return TECH_DEFS[id];
}

/** All tech ids belonging to a branch, in TECH_ORDER order. */
export function techsInBranch(branch: ResearchBranch): TechId[] {
  return TECH_ORDER.filter((id) => TECH_DEFS[id].branch === branch);
}

/** Resource cost to research a tech. */
export function techCost(id: TechId): ResourceCost {
  return TECH_DEFS[id].cost;
}

/** Time in ms a tech takes to research. */
export function techTimeMs(id: TechId): number {
  return TECH_DEFS[id].timeMs;
}
