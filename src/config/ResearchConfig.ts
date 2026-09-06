/**
 * ResearchConfig - the ORIGINAL multi-branch research tech tree + pure helpers.
 *
 * Frosthold: Last Ember's research layer is INSPIRED BY the frozen-survival
 * genre's academy tech tree but every node name/description is ORIGINAL work
 * (no protected IP). Four branches (economy / battle / survival / development)
 * each hold a small chain of nodes; every node declares its prerequisites, the
 * Ember Archive level it needs, a resource cost, a duration, and a typed
 * permanent BONUS expressed in the shared {@link StatModifiers} bundle. A
 * handful of development nodes grant a `troopTier` unlock instead of a stat
 * bonus, raising the highest trainable troop tier.
 *
 * This module is PURE data + formula functions (no Phaser). ResearchSystem
 * reads these; user-facing names/descriptions live in the i18n table keyed as
 * `research.<id>.name` / `.desc` and `research.branch.<branch>`.
 */

import type { ResearchBranch, ResourceCost, StatModifiers } from '../types';
import { RESEARCH_BRANCH_ORDER } from '../types';

/**
 * A single research node. `bonus` is a partial {@link StatModifiers} bundle
 * (folded into the aggregate on completion). `troopTierUnlock`, when set, is the
 * troop tier this node unlocks once completed (the max trainable tier is the
 * highest unlocked across all completed nodes).
 */
export interface ResearchNodeDef {
  id: string;
  branch: ResearchBranch;
  /** Node ids that must be completed before this node can start. */
  prereqs: string[];
  /** Minimum Ember Archive (lab) level required to start this node. */
  requiresLabLevel: number;
  /** Resource cost paid up front when research starts. */
  cost: ResourceCost;
  /** Milliseconds the research takes. */
  durationMs: number;
  /** The permanent stat bonus this node grants on completion. */
  bonus?: Partial<StatModifiers>;
  /** If set, completing this node unlocks this troop tier. */
  troopTierUnlock?: number;
}

const MIN = 60_000;

/**
 * The research tree. Each branch is a short chain gated by rising Ember Archive
 * levels; the development branch carries the troop-tier unlocks (T2/T3/T4).
 * Bonuses are small so they tune rather than dominate; costs/durations rise
 * along each chain.
 */
export const RESEARCH_DEFS: Record<string, ResearchNodeDef> = {
  // --- Economy branch: idle output + build speed ---
  eco_foraging: {
    id: 'eco_foraging',
    branch: 'economy',
    prereqs: [],
    requiresLabLevel: 1,
    cost: { food: 200, wood: 200 },
    durationMs: 2 * MIN,
    bonus: { foodOutput: 0.1 },
  },
  eco_logistics: {
    id: 'eco_logistics',
    branch: 'economy',
    prereqs: ['eco_foraging'],
    requiresLabLevel: 2,
    cost: { wood: 400, coal: 200 },
    durationMs: 4 * MIN,
    bonus: { economyOutput: 0.08 },
  },
  eco_metallurgy: {
    id: 'eco_metallurgy',
    branch: 'economy',
    prereqs: ['eco_logistics'],
    requiresLabLevel: 4,
    cost: { iron: 400, coal: 400, steel: 40 },
    durationMs: 8 * MIN,
    bonus: { ironOutput: 0.15, steelOutput: 0.15 },
  },
  eco_efficient_works: {
    id: 'eco_efficient_works',
    branch: 'economy',
    prereqs: ['eco_logistics'],
    requiresLabLevel: 3,
    cost: { wood: 600, iron: 200 },
    durationMs: 6 * MIN,
    bonus: { buildSpeed: 0.12 },
  },

  // --- Battle branch: troop attack / hp / defense ---
  bat_drill: {
    id: 'bat_drill',
    branch: 'battle',
    prereqs: [],
    requiresLabLevel: 1,
    cost: { food: 250, iron: 150 },
    durationMs: 3 * MIN,
    bonus: { troopAttack: 0.08 },
  },
  bat_armor: {
    id: 'bat_armor',
    branch: 'battle',
    prereqs: ['bat_drill'],
    requiresLabLevel: 2,
    cost: { iron: 400, coal: 200 },
    durationMs: 5 * MIN,
    bonus: { troopHp: 0.1, troopDefense: 0.06 },
  },
  bat_infantry_doctrine: {
    id: 'bat_infantry_doctrine',
    branch: 'battle',
    prereqs: ['bat_armor'],
    requiresLabLevel: 4,
    cost: { iron: 500, steel: 60 },
    durationMs: 8 * MIN,
    bonus: { infantryBonus: 0.15 },
  },
  bat_lancer_doctrine: {
    id: 'bat_lancer_doctrine',
    branch: 'battle',
    prereqs: ['bat_armor'],
    requiresLabLevel: 4,
    cost: { iron: 500, steel: 60 },
    durationMs: 8 * MIN,
    bonus: { lancerBonus: 0.15 },
  },
  bat_marksman_doctrine: {
    id: 'bat_marksman_doctrine',
    branch: 'battle',
    prereqs: ['bat_armor'],
    requiresLabLevel: 4,
    cost: { wood: 400, steel: 60 },
    durationMs: 8 * MIN,
    bonus: { marksmanBonus: 0.15 },
  },

  // --- Survival branch: economy resilience (folds into output) ---
  sur_insulation: {
    id: 'sur_insulation',
    branch: 'survival',
    prereqs: [],
    requiresLabLevel: 1,
    cost: { wood: 300, coal: 150 },
    durationMs: 3 * MIN,
    bonus: { coalOutput: 0.12 },
  },
  sur_provisioning: {
    id: 'sur_provisioning',
    branch: 'survival',
    prereqs: ['sur_insulation'],
    requiresLabLevel: 3,
    cost: { food: 500, wood: 300 },
    durationMs: 6 * MIN,
    bonus: { foodOutput: 0.15, economyOutput: 0.05 },
  },
  sur_hardened_frame: {
    id: 'sur_hardened_frame',
    branch: 'survival',
    prereqs: ['sur_insulation'],
    requiresLabLevel: 3,
    cost: { iron: 300, steel: 30 },
    durationMs: 6 * MIN,
    bonus: { troopHp: 0.12 },
  },

  // --- Development branch: troop-tier unlocks + build speed ---
  dev_ironworking: {
    id: 'dev_ironworking',
    branch: 'development',
    prereqs: [],
    requiresLabLevel: 2,
    cost: { iron: 300, coal: 200 },
    durationMs: 4 * MIN,
    troopTierUnlock: 2,
  },
  dev_steel_tactics: {
    id: 'dev_steel_tactics',
    branch: 'development',
    prereqs: ['dev_ironworking'],
    requiresLabLevel: 4,
    cost: { iron: 600, steel: 80 },
    durationMs: 8 * MIN,
    troopTierUnlock: 3,
  },
  dev_master_forge: {
    id: 'dev_master_forge',
    branch: 'development',
    prereqs: ['dev_steel_tactics'],
    requiresLabLevel: 6,
    cost: { iron: 1000, steel: 200 },
    durationMs: 12 * MIN,
    troopTierUnlock: 4,
  },
  dev_wide_streets: {
    id: 'dev_wide_streets',
    branch: 'development',
    prereqs: ['dev_ironworking'],
    requiresLabLevel: 3,
    cost: { wood: 500, coal: 300 },
    durationMs: 6 * MIN,
    bonus: { buildSpeed: 0.1 },
  },
};

/** All research node ids in a stable, tree-order iteration order (by branch). */
export const RESEARCH_ORDER: readonly string[] = (() => {
  const out: string[] = [];
  for (const branch of RESEARCH_BRANCH_ORDER) {
    for (const id of Object.keys(RESEARCH_DEFS)) {
      if (RESEARCH_DEFS[id].branch === branch) out.push(id);
    }
  }
  return out;
})();

/** Lookup a research node definition, or undefined for an unknown id. */
export function researchDef(id: string): ResearchNodeDef | undefined {
  return RESEARCH_DEFS[id];
}

/** All node ids belonging to a branch (stable order). */
export function nodesOfBranch(branch: ResearchBranch): string[] {
  return RESEARCH_ORDER.filter((id) => RESEARCH_DEFS[id].branch === branch);
}

/** Whether an id names a real research node. */
export function isResearchNode(id: string): boolean {
  return id in RESEARCH_DEFS;
}
