/**
 * Shared cross-cutting types for Frosthold: Last Ember.
 *
 * These are the vocabulary the later features (economy, buildings, training,
 * combat, save/load, warmth) all import so their contracts line up. Nothing
 * here depends on Phaser, so the pure-logic systems and their unit tests can
 * import these freely.
 */

import { RESOURCE_ORDER } from '../config/GameConfig';

/**
 * The four resource kinds of the frozen settlement (rations, timber, coal,
 * iron). Derived from the canonical RESOURCE_ORDER tuple.
 */
export type ResourceKind = (typeof RESOURCE_ORDER)[number];

/** A full resource bundle: an amount for every resource kind. */
export type Resources = Record<ResourceKind, number>;

/** A partial cost/reward bundle (missing kinds are treated as 0). */
export type ResourceCost = Partial<Resources>;

/**
 * The buildable structure kinds. `furnace` (the Ember) gates the level cap of
 * the rest. The original six are the founding roster; the FEAT-002 expansion
 * adds a Furnace-gated city of ORIGINAL-named support buildings (envoy hall,
 * warming ward, frost vault, ember archive, shelter row, forge hall) plus the
 * three class training yards that FEAT-004 will build troops from.
 */
export type BuildingKind =
  | 'furnace'
  | 'hunters_hut'
  | 'sawmill'
  | 'coal_pit'
  | 'iron_mine'
  | 'war_camp'
  // --- FEAT-002 expanded city (all original names) ---
  | 'envoy_hall' // diplomacy / help hub (Embassy-equivalent)
  | 'warming_ward' // heals/recovers wounded survivors (Infirmary-equivalent)
  | 'frost_vault' // shelters a fraction of resources from raids (Warehouse-equivalent)
  | 'ember_archive' // research/academy building (Academy-equivalent)
  | 'shelter_row' // survivor housing (raises population cap)
  | 'forge_hall' // steelworks: converts iron + coal -> steel (refinery)
  | 'infantry_yard' // class training: front-line infantry
  | 'lancer_yard' // class training: lancers
  | 'marksman_range'; // class training: marksmen

/**
 * Producer buildings map to the single resource they generate. Non-producers
 * (furnace, war_camp, and the new support/training buildings, plus the refinery
 * which is handled separately) are excluded.
 */
export type ProducerKind = Exclude<
  BuildingKind,
  | 'furnace'
  | 'war_camp'
  | 'envoy_hall'
  | 'warming_ward'
  | 'frost_vault'
  | 'ember_archive'
  | 'shelter_row'
  | 'forge_hall'
  | 'infantry_yard'
  | 'lancer_yard'
  | 'marksman_range'
>;

/** The trainable troop kinds (survivor militia roles). */
export type TroopKind = 'trapper' | 'marksman' | 'vanguard';

/**
 * The three WOS-style combat CLASSES that form the Infantry > Lancer >
 * Marksman > Infantry rock-paper-scissors triangle. Distinct from
 * {@link TroopKind} (the concrete militia rosters) and {@link HeroClass} (hero
 * flavour) so the vocabularies can diverge; TroopConfig maps each troop kind to
 * exactly one class (infantry = front tank, lancer = charge, marksman = ranged).
 */
export type TroopClass = 'infantry' | 'lancer' | 'marksman';

/**
 * A troop TIER (T1..Tn). Higher tiers cost more and field stronger stats; the
 * highest trainable tier is gated by completed research (FEAT-004). Tiers are
 * 1-indexed so `1` is always the baseline militia.
 */
export type TroopTier = number;

/** A standing army: a count for every troop kind. */
export type Army = Record<TroopKind, number>;

/**
 * The Frozen Horde enemy kinds faced in battle. The first three are the
 * standard wave roster; the FEAT-005 additions are high-HP BOSS kinds fought in
 * escalating world-boss rallies (RallySystem) — a fast pack alpha, an armoured
 * bulwark, and a colossal apex predator — all ORIGINAL names.
 */
export type EnemyKind =
  | 'frost_wolf'
  | 'ravager'
  | 'frost_titan'
  // --- FEAT-005 Frostbeast / world-boss kinds (high-HP rally targets) ---
  | 'rime_alpha' // pack-alpha Frostbeast (fast, lancer-role)
  | 'glacier_behemoth' // armoured bulwark Frostbeast (infantry-role)
  | 'hoarfrost_wyrm'; // apex world-boss (marksman-role, immense HP)

/** A combatant's shared stat block (troops and enemies both use this shape). */
export interface UnitStats {
  hp: number;
  attack: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** Movement speed in world px/second (battle lane). */
  speed: number;
  /** Attack reach in world px. */
  range: number;
}

/** A single building's persisted state. */
export interface BuildingState {
  kind: BuildingKind;
  level: number;
  /** Epoch ms when an in-progress upgrade completes, or null when idle. */
  upgradeEndsAt: number | null;
}

/** A queued training batch. */
export interface TrainingOrder {
  troop: TroopKind;
  count: number;
  /**
   * The troop TIER this batch trains (1 = baseline militia). Gated by completed
   * research; higher tiers cost more, take longer, and field stronger stats.
   * Optional in the persisted shape so an older-shaped save (no tier) loads as
   * tier 1.
   */
  tier?: TroopTier;
  /** Epoch ms when this batch completes. */
  completesAt: number;
}

/**
 * The standing army broken down BY TIER: for each troop kind, a map of
 * tier -> count. The flat {@link Army} is the per-kind TOTAL across tiers (kept
 * for battle rendering + neutral power calls); this parallel breakdown lets the
 * combat resolver field each unit at the tier it was trained. Missing kinds /
 * tiers are treated as 0. Persisted alongside `army` so tiers survive reloads.
 */
export type ArmyTiers = Partial<Record<TroopKind, Record<number, number>>>;

/**
 * The survivor workforce, persisted. `total` survivors are split into those
 * `assigned` to producer buildings (summed across `assignments`) and the
 * idle remainder. Per-building assignment is keyed by BuildingKind so the
 * save/UI can show who works where; only producer kinds are meaningful keys.
 */
export interface PopulationState {
  /** Total living survivors in the hold. */
  total: number;
  /** Survivors assigned to each producer building (missing = 0 assigned). */
  assignments: Partial<Record<BuildingKind, number>>;
  /** Fractional survivor growth preserved across saves. */
  growthCarry?: number;
}

// --- FEAT-003: heroes, summon (gacha) and story campaign ---------------------

/**
 * A hero's combat CLASS, the same soft rock-paper-scissors triangle the troops
 * use (FEAT-004 formalizes troop tiers): infantry > lancer > marksman >
 * infantry. A hero leads and buffs its own class, so class composition of the
 * lead heroes matters. Kept as its own union (distinct from TroopKind) so the
 * two vocabularies can diverge later.
 */
export type HeroClass = 'infantry' | 'lancer' | 'marksman';

/**
 * Hero rarity tiers, low to high. Rarity drives base power, star ceiling, the
 * shards a duplicate summon grants, and the summon draw weights. Ordered tuple
 * so UI/iteration share one canonical order; the union is derived from it.
 */
export const HERO_RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const;
export type HeroRarity = (typeof HERO_RARITY_ORDER)[number];

/**
 * The original collectible hero roster ids. All names/lore are ORIGINAL (see
 * HeroConfig + i18n). The union is derived from HERO_IDS so config, systems and
 * the persisted state can never drift out of sync.
 */
export const HERO_IDS = [
  'ember_warden', // common infantry
  'snow_picket', // common marksman
  'drift_runner', // common lancer
  'iron_bulwark', // rare infantry
  'glacier_lance', // rare lancer
  'frost_archer', // rare marksman
  'aurora_sentinel', // epic infantry
  'stormpike_rider', // epic lancer
  'winters_eye', // epic marksman
  'the_kindled_queen', // legendary infantry
  'wyrmspear_valdis', // legendary lancer
  'the_pale_marksman', // legendary marksman
] as const;
export type HeroId = (typeof HERO_IDS)[number];

/**
 * A single owned hero's persisted state. A hero is "owned" once summoned; before
 * that it may still have accumulated `shards` from duplicate pulls / campaign
 * rewards toward its first copy. `level` and `stars` drive power; `skillLevels`
 * mirrors the hero's skill ids -> level.
 */
export interface OwnedHeroState {
  id: HeroId;
  /** True once the first full copy has been obtained (summon or shard craft). */
  owned: boolean;
  /** Current level (>=1 once owned). */
  level: number;
  /** Accumulated XP toward the next level. */
  xp: number;
  /** Star rank (>=1 once owned), gated by rarity ceiling. */
  stars: number;
  /** Loose hero shards held (toward first copy, or toward the next star-up). */
  shards: number;
  /** Per-skill level, keyed by the hero's skill ids. */
  skillLevels: Record<string, number>;
}

/** The persisted hero roster: every touched hero keyed by id, plus lead picks. */
export interface HeroRosterState {
  heroes: Partial<Record<HeroId, OwnedHeroState>>;
  /** The lead heroes whose bonuses apply to the whole hold (ordered, capped). */
  lead: HeroId[];
}

/** The persisted summon/gacha state: total pulls and the pity miss counter. */
export interface SummonState {
  /** Total summons ever performed (for stats / UI). */
  totalPulls: number;
  /** Draws since the last high-rarity (epic+) pull; drives the pity guarantee. */
  pityCounter: number;
  /** Persisted 32-bit PRNG state; prevents reload rerolls. */
  rngState?: number;
}

/** The persisted campaign progress: highest cleared stage index + claimed rewards. */
export interface CampaignState {
  /**
   * Highest cleared stage ORDER index (0 = nothing cleared, 1 = first stage
   * cleared). Gating uses this; a stage is attemptable iff its order <=
   * highestCleared + 1.
   */
  highestCleared: number;
  /** Stage ids whose first-clear reward has already been granted. */
  claimed: string[];
}

// --- FEAT-004: research tech tree, chief gear + charms, troop tiers ----------

/**
 * The four original research BRANCHES, mirroring the genre's tech-tree split:
 * economy (idle output / build speed), battle (troop combat stats), survival
 * (warmth / population resilience), and development (higher troop tiers +
 * meta unlocks). Derived-from-tuple so config/UI iterate one canonical order.
 */
export const RESEARCH_BRANCH_ORDER = [
  'economy',
  'battle',
  'survival',
  'development',
] as const;
export type ResearchBranch = (typeof RESEARCH_BRANCH_ORDER)[number];

/**
 * The persisted research state: the set of completed node ids and the single
 * in-progress node (WOS runs ONE research at a time on a timer). `startedAt` /
 * `endsAt` are epoch ms so the timer reconciles across sessions like buildings.
 */
export interface ResearchState {
  /** Node ids whose research has fully completed (bonuses are permanent). */
  completed: string[];
  /** The node currently being researched, or null when the lab is idle. */
  active: { nodeId: string; endsAt: number } | null;
}

/**
 * The original chief-gear SLOTS. Six equipment pieces (all original names) each
 * carry a level (0 = not forged) and one socketed charm. Derived-from-tuple so
 * config/UI/state share one canonical order.
 */
export const GEAR_SLOT_ORDER = [
  'coat',
  'gloves',
  'boots',
  'belt',
  'helm',
  'emblem',
] as const;
export type GearSlot = (typeof GEAR_SLOT_ORDER)[number];

/**
 * The original charm KINDS that socket into gear for extra bonuses. Each charm
 * kind leans into one axis of the shared modifier bundle. Derived-from-tuple.
 */
export const CHARM_KIND_ORDER = ['warfare', 'bulwark', 'harvest'] as const;
export type CharmKind = (typeof CHARM_KIND_ORDER)[number];

/** A single equipped charm: its kind + its upgrade level (0 = empty socket). */
export interface EquippedCharm {
  kind: CharmKind;
  level: number;
}

/** The persisted state of one gear slot: its level + the charm socketed in it. */
export interface GearSlotState {
  level: number;
  charm: EquippedCharm | null;
}

/** The persisted chief-gear state: per-slot level + socketed charm. */
export interface GearState {
  slots: Partial<Record<GearSlot, GearSlotState>>;
}

// --- FEAT-005: rallies, arena, alliance, quests, VIP -------------------------

/**
 * The persisted RALLY (world-boss) state, keyed by boss id. Each boss has a
 * large HP pool depleted across repeated attempts; `damageDealt` is the total
 * damage the player (plus simulated alliance contribution) has landed this
 * cycle, `defeated` marks a kill, and `tierClaimed` records the highest reward
 * tier already granted so tier rewards pay out exactly once per cycle.
 */
export interface RallyBossState {
  /** Total damage dealt to the boss this cycle (player + simulated alliance). */
  damageDealt: number;
  /** Number of attempts made against the boss this cycle. */
  attempts: number;
  /** True once the boss HP pool has been fully depleted (a kill). */
  defeated: boolean;
  /** Highest reward TIER index already claimed (-1 = none), for reward-once. */
  tierClaimed: number;
}

/** The persisted rally state: per-boss progress keyed by boss id. */
export interface RallyState {
  bosses: Record<string, RallyBossState>;
  /** UTC day index for the current daily boss cycle. */
  dayKey?: number;
}

/**
 * The persisted ARENA (simulated PvP) state. The player holds a `rank` on an
 * NPC ladder (1 = top; higher numbers are lower ranks) and a running win/loss
 * tally. Matches are resolved deterministically against a generated NPC power
 * profile derived from the opponent's rank + a seed, so no networking is used.
 */
export interface ArenaState {
  /** Current ladder rank (1 = champion; larger = lower). */
  rank: number;
  /** Total arena matches won. */
  wins: number;
  /** Total arena matches lost. */
  losses: number;
  /** Deterministic seed advanced each match so opponents/outcomes vary stably. */
  seed: number;
}

/**
 * The persisted ALLIANCE (simulated, NPC) state. A fixed roster of NPC members
 * provides "help" that shaves time off the player's active build/research
 * timers, and an alliance-tech contribution track (points -> level) grants a
 * shared StatModifiers bonus. All single-player: no real members/servers.
 */
export interface AllianceState {
  /** Accumulated alliance-tech contribution points. */
  techPoints: number;
  /** Alliance help charges currently available to spend on timers. */
  helpsAvailable: number;
  /** Fractional help-generation carry, in charges. */
  helpAccrual?: number;
  /** Last accepted direct-contribution timestamp for debounce. */
  lastContributionAt?: number;
}

/**
 * A single quest's persisted progress. `progress` counts toward the quest's
 * target; `claimed` marks its reward as granted (one-time for milestones,
 * per-day for dailies which reset the whole daily set on a day boundary).
 */
export interface QuestProgressState {
  progress: number;
  claimed: boolean;
}

/**
 * The persisted QUEST state: daily quests (reset on a day boundary from an
 * injected clock), one-time growth/beginner milestones, and the active
 * time-boxed event. `dailyDayIndex` is the day the current daily set belongs to
 * (floor(now / DAY_MS)); when the clock crosses into a new day the dailies
 * reset. `milestones` persist across days (one-time).
 */
export interface QuestState {
  /** The day index (floor(now/DAY_MS)) the current daily quests belong to. */
  dailyDayIndex: number;
  /**
   * Recently applied domain-event ids. This bounded receipt ledger makes quest
   * progress and its automatic reward idempotent across double submissions and
   * reloads without growing the save forever.
   */
  processedEventIds?: string[];
  /** Daily quest progress keyed by quest id (reset each day). */
  daily: Record<string, QuestProgressState>;
  /** One-time growth/beginner milestone progress keyed by quest id. */
  milestones: Record<string, QuestProgressState>;
  /** The active time-boxed event id, or null when no event is running. */
  activeEventId: string | null;
  /** Epoch ms the active event ends (0 when none). */
  eventEndsAt: number;
  /**
   * The last day index the daily cycle armed an event for (see
   * QuestSystem.dailySync). Optional so an older-shaped save (no field) arms
   * the current day's event on the first sync. -1 = never armed.
   */
  eventArmedDayIndex?: number;
}

/**
 * The persisted VIP state: accumulated VIP points that map to a VIP level
 * granting permanent QoL / stat bonuses (expressed as a StatModifiers bundle).
 */
export interface VipState {
  /** Total VIP points ever accumulated (monotonic; drives the level). */
  points: number;
}

/**
 * The ONE shared stat-modifier bundle every progression source (research, gear,
 * heroes) contributes to and a pure combiner sums. All values are ADDITIVE
 * FRACTIONS (0.10 = +10%) unless the name says `Flat`. GameState combines the
 * contributions and consumes the result: economy fields scale idle producer
 * output + build speed; battle fields scale troop / combat power.
 *
 * Kept deliberately flat (no nesting) so summing is a trivial key-wise add and
 * a missing key defaults to 0. The per-class battle bonuses let a source buff
 * one leg of the Infantry/Lancer/Marksman triangle specifically.
 */
export interface StatModifiers {
  // --- Economy ---
  /** +% to ALL producer output (food/wood/coal/iron/steel alike). */
  economyOutput: number;
  /** +% to food (rations) output specifically. */
  foodOutput: number;
  /** +% to wood (timber) output specifically. */
  woodOutput: number;
  /** +% to coal output specifically. */
  coalOutput: number;
  /** +% to iron output specifically. */
  ironOutput: number;
  /** +% to steel refinery output specifically. */
  steelOutput: number;
  /** Build-time REDUCTION as a fraction (0.10 = builds 10% faster). */
  buildSpeed: number;

  // --- Battle (army-wide) ---
  /** +% to all troop attack. */
  troopAttack: number;
  /** +% to all troop hp. */
  troopHp: number;
  /** +% to all troop defense (a general survivability lever). */
  troopDefense: number;

  // --- Battle (per class) ---
  /** +% combat power for the infantry class specifically. */
  infantryBonus: number;
  /** +% combat power for the lancer class specifically. */
  lancerBonus: number;
  /** +% combat power for the marksman class specifically. */
  marksmanBonus: number;
}

/**
 * The persisted new-player onboarding / tutorial state (FEAT-003). A tiny
 * record so a returning player is never re-onboarded: `introDismissed` marks the
 * short first-run welcome card as seen, and `guidedComplete` marks the guided
 * objective flow (pointer + banner) as finished. Both optional so an older-shaped
 * save (no field) loads without crashing; the SaveManager treats a save that
 * predates onboarding as a RETURNING player (see fromJSON tolerance), so old
 * players never get the intro card again.
 */
export interface OnboardingState {
  /** True once the short first-run welcome card has been dismissed. */
  introDismissed: boolean;
  /** True once the guided objective flow has been completed (or skipped). */
  guidedComplete: boolean;
  /** True after the first valid normal-battle attempt, win or loss. */
  battleAttempted?: boolean;
}

/** The complete persisted game state (serialized to localStorage by the save feature). */
export interface GameState {
  /**
   * Save-format version so future migrations can be detected. Bumped to 7 for
   * the review-round wiring that makes troop TIERS live: training batches and
   * the standing army now carry a tier dimension (`trainingQueue[].tier` +
   * `armyTiers`), so a research-unlocked higher tier actually raises trained
   * troop cost / stats / power. On top of the v6 endgame + retention layer
   * (world-boss rallies, a simulated arena/PvP ladder, a simulated NPC
   * alliance, daily/growth quests + events, and VIP levels) and the v5
   * research/gear/troop-tier layer. Older saves (v1 medieval, v2 pre-expansion,
   * v3 pre-heroes, v4 pre-research, v5 pre-endgame, v6 pre-tiered-army) are
   * detected as a version mismatch and fall back to a fresh frozen settlement
   * rather than mis-mapping.
   */
  version: number;
  resources: Resources;
  /** Ember Sparks: the soft-premium wallet, kept separate from idle resources. */
  premiumCurrency: number;
  /** The survivor workforce (housing, growth, per-building assignment). */
  population: PopulationState;
  /** The collectible hero roster (FEAT-003): owned heroes + lead picks. */
  heroes: HeroRosterState;
  /** The summon/gacha state (FEAT-003): total pulls + pity counter. */
  summon: SummonState;
  /** Story campaign progress (FEAT-003): highest cleared stage + claimed rewards. */
  campaign: CampaignState;
  /** Research tech-tree progress (FEAT-004): completed + in-progress nodes. */
  research: ResearchState;
  /** Chief-gear progress (FEAT-004): per-slot gear level + socketed charms. */
  gear: GearState;
  /** World-boss rally progress (FEAT-005): per-boss HP depletion + rewards. */
  rally: RallyState;
  /** Simulated arena/PvP ladder progress (FEAT-005): rank + win/loss + seed. */
  arena: ArenaState;
  /** Simulated NPC alliance state (FEAT-005): tech points + help charges. */
  alliance: AllianceState;
  /** Quest progress (FEAT-005): dailies, growth milestones, active event. */
  quests: QuestState;
  /** VIP progression (FEAT-005): accumulated points -> level -> bonuses. */
  vip: VipState;
  /**
   * Current Furnace warmth level (the signature frozen-survival mechanic).
   * Persisted so warmth carries across sessions and is reconciled over the
   * offline window on load. A legacy / warmth-less save (undefined) loads to
   * full warmth (see WarmthSystem.fromJSON).
   */
  warmth: number;
  buildings: BuildingState[];
  /** Trained, idle troops available to send into battle (per-kind totals). */
  army: Record<TroopKind, number>;
  /**
   * The standing army broken down by tier (FEAT review v1): per-kind, a map of
   * tier -> count. Optional so an older-shaped save (flat `army` only) loads
   * with every standing unit treated as tier 1.
   */
  armyTiers?: ArmyTiers;
  trainingQueue: TrainingOrder[];
  /** Highest battle wave cleared. */
  waveCleared: number;
  /**
   * New-player onboarding / tutorial state (FEAT-003). Optional so an older
   * save (written before onboarding existed) loads without crashing; a missing
   * value is treated as a RETURNING player (intro dismissed + guided complete),
   * so long-time players are never re-onboarded.
   */
  onboarding?: OnboardingState;
  /** Bounded ids of committed result-bearing actions for reload-safe dedupe. */
  processedActionIds?: string[];
  /** Epoch ms of the last simulation update (drives offline reconciliation). */
  lastSeenAt: number;
}
