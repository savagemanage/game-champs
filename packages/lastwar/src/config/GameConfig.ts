/**
 * GameConfig - centralized, config-driven tuning for LAST SQUAD (라스트 스쿼드).
 *
 * LAST SQUAD is an ORIGINAL, modern military-survival lane gate-runner. A small
 * squad of soldiers auto-runs forward down two lanes; the player slides the
 * squad left/right between lanes; rows of math "gates" (x2, +10, -5, /2) grow
 * or shrink the crowd; periodic enemy clusters are auto-shot by the squad; and
 * a boss waits at the end of the run. Between runs the player spends earned
 * coins on meta-upgrades. All naming, lore, art, and audio are original and
 * role-based; nothing is drawn from any existing IP or trademark.
 *
 * Keep balance numbers here so the whole game can be tuned in one place. Later
 * features (scenes, entities, UI) read this config rather than scattering magic
 * numbers. Everything in this module is Phaser-free `as const` data.
 */

/**
 * Logical (design) resolution. Portrait, phone-friendly runner layout; the
 * canvas scales to fit while preserving this aspect. 540x960 integer-scales
 * cleanly and gives the two lanes plus a top HUD comfortable room.
 */
export const CANVAS = {
  WIDTH: 540,
  HEIGHT: 960,
} as const;

/**
 * Physics tuning (arcade). This is a top-down-ish forward-runner view, so there
 * is no gravity; motion is planar and driven directly by velocity.
 */
export const PHYSICS = {
  GRAVITY_Y: 0,
} as const;

/**
 * Original modern / military-survival palette. Values are 0xRRGGBB integers for
 * Phaser tinting and graphics, plus `*_CSS` strings where the DOM / text needs
 * them. Cool steel + asphalt with a hazard-amber accent and squad-teal.
 */
export const PALETTE = {
  // Backgrounds / terrain.
  BG_SKY: 0x11151c,
  BG_SKY_CSS: '#11151c',
  BG_HORIZON: 0x1c2733,
  BG_HORIZON_CSS: '#1c2733',
  ROAD: 0x2b323c,
  ROAD_CSS: '#2b323c',
  ROAD_DARK: 0x1e242c,
  ROAD_DARK_CSS: '#1e242c',
  LANE_LINE: 0x4a5666,
  LANE_LINE_CSS: '#4a5666',

  // Squad / friendly accents.
  SQUAD: 0x3fd6c2,
  SQUAD_CSS: '#3fd6c2',
  SQUAD_DARK: 0x1f9b8c,
  SQUAD_DARK_CSS: '#1f9b8c',
  MUZZLE: 0xffe08a,
  MUZZLE_CSS: '#ffe08a',

  // Enemy accents.
  ENEMY: 0xd8564b,
  ENEMY_CSS: '#d8564b',
  ENEMY_DARK: 0x8f322b,
  ENEMY_DARK_CSS: '#8f322b',
  BOSS: 0xb148d8,
  BOSS_CSS: '#b148d8',

  // Gates: good (buff) vs bad (nerf) tinting.
  GATE_GOOD: 0x5fd36a,
  GATE_GOOD_CSS: '#5fd36a',
  GATE_BAD: 0xd85466,
  GATE_BAD_CSS: '#d85466',

  // UI / text.
  PANEL: 0x161b23,
  PANEL_CSS: '#161b23',
  ACCENT: 0xffb347,
  ACCENT_CSS: '#ffb347',
  TEXT: 0xf2f5f8,
  TEXT_CSS: '#f2f5f8',
  MUTED_CSS: '#9aa7b4',
  DANGER: 0xd8564b,
  DANGER_CSS: '#d8564b',
  SUCCESS: 0x5fd36a,
  SUCCESS_CSS: '#5fd36a',
  COIN: 0xffcf4a,
  COIN_CSS: '#ffcf4a',
} as const;

/**
 * Run / track tuning. The squad runs forward along a fixed distance; rows of
 * gates and enemy clusters are placed along that distance. Difficulty ramps
 * with distance travelled.
 */
export const RUN = {
  /** Number of lanes the squad can occupy. */
  LANE_COUNT: 2,
  /** Horizontal centre (fraction of canvas width) of lane 0 and lane 1. */
  LANE_CENTERS: [0.3, 0.7] as const,
  /** World distance units in a full run before the boss. */
  RUN_DISTANCE: 2000,
  /** Forward scroll speed, distance units per second. */
  SCROLL_SPEED: 120,
  /** Distance travelled before difficulty is considered "max ramped". */
  DIFFICULTY_RAMP_DISTANCE: 2000,
  /** Difficulty multiplier range across a run [start, end]. */
  DIFFICULTY_RANGE: [1, 3] as const,
} as const;

/**
 * Squad tuning. The squad is a crowd of little soldiers; only a capped number
 * are individually rendered, the rest are implied by the count. Firepower is a
 * function of the (rendered-capped) soldier count.
 */
export const SQUAD = {
  /** Soldiers a fresh run starts with (before meta-upgrades). */
  START_SIZE: 5,
  /** Hard floor; hitting 0 ends the run. */
  MIN_SIZE: 0,
  /** Hard ceiling on the logical squad count. */
  MAX_SIZE: 9999,
  /** Maximum soldiers individually drawn (formation cap). */
  MAX_RENDERED: 60,
  /** Base shots-per-second per soldier (before meta-upgrades). */
  FIRE_RATE: 1,
  /** Base damage per shot per soldier (before meta-upgrades). */
  DAMAGE: 1,
} as const;

/**
 * Gate tuning. Each gate row presents one gate per lane. A gate applies a math
 * operation to the squad size. Value ranges are per-operation; the pair
 * generator guarantees at least one non-catastrophic choice per row.
 */
export const GATES = {
  /** Distance units between consecutive gate rows. */
  ROW_SPACING: 260,
  /** Distance before the first gate row. */
  FIRST_ROW_AT: 200,
  /** Additive gate value range [min, max] (inclusive). */
  ADD_RANGE: [5, 25] as const,
  /** Subtractive gate value range [min, max] (inclusive). */
  SUB_RANGE: [3, 15] as const,
  /** Multiplicative gate factor range [min, max] (inclusive). */
  MUL_RANGE: [2, 3] as const,
  /** Divisive gate divisor range [min, max] (inclusive). */
  DIV_RANGE: [2, 3] as const,
} as const;

/**
 * Enemy / obstacle tuning. Enemy clusters have HP that the squad's firepower
 * whittles down while passing; leftover cluster HP costs squad members. A boss
 * caps the run.
 */
export const ENEMIES = {
  /** Distance units between enemy clusters. */
  CLUSTER_SPACING: 520,
  /** Distance before the first enemy cluster. */
  FIRST_CLUSTER_AT: 420,
  /** Base cluster HP at difficulty 1. */
  CLUSTER_BASE_HP: 40,
  /** Cluster HP added per difficulty unit above 1. */
  CLUSTER_HP_PER_DIFFICULTY: 60,
  /** Squad members lost per unit of unblocked (leftover) cluster HP. */
  DAMAGE_PER_LEFTOVER_HP: 0.25,
  /** Boss HP (fixed encounter at run end). */
  BOSS_HP: 1200,
  /** Squad members lost per unit of unblocked boss HP if the boss survives. */
  BOSS_DAMAGE_PER_HP: 0.05,
  /** Seconds the squad shoots the boss before resolution. */
  BOSS_DURATION: 6,
} as const;

/**
 * Meta-progression tuning. Coins earned across runs buy permanent upgrades with
 * a geometric cost curve. Each upgrade level nudges a derived stat.
 */
export const META = {
  /** Coins earned per surviving squad member at run end. */
  COINS_PER_SURVIVOR: 2,
  /** Coins earned per 100 distance units travelled. */
  COINS_PER_DISTANCE: 0.05,
  /** Bonus coins for reaching / beating the boss (winning the run). */
  COINS_WIN_BONUS: 100,
  /**
   * Upgrade definitions. `base` is the level-1 cost; cost of level L is
   * `round(base * GROWTH^(L-1))`. `perLevel` is the additive stat gain per
   * purchased level applied on top of the base config value. `max` is the
   * highest purchasable level.
   */
  GROWTH: 1.55,
  UPGRADES: {
    /** Bigger starting squad. */
    start_size: { base: 40, perLevel: 2, max: 20 },
    /** More damage per shot. */
    damage: { base: 60, perLevel: 0.5, max: 20 },
    /** Faster fire rate. */
    fire_rate: { base: 60, perLevel: 0.35, max: 20 },
    /** Coin multiplier (perLevel is added to a 1.0 base multiplier). */
    coin_bonus: { base: 80, perLevel: 0.1, max: 15 },
  },
} as const;

/**
 * Expanded single-player game state tuning. FEAT-001 only needs the shape of a
 * fresh save (empty-but-valid sub-states); later features flesh out each
 * system's real tuning. Kept here so the fresh-default builder never hardcodes
 * magic numbers. The squad formation is a 5-slot layout: 2 front + 3 back.
 */
export const GAME_STATE = {
  /** Squad-formation slot counts (front row + back row). */
  FORMATION: {
    /** Front-row slots. */
    FRONT_SLOTS: 2,
    /** Back-row slots. */
    BACK_SLOTS: 3,
  },
  /** Season progression starting point (0 = no season started yet). */
  SEASON: {
    /** Current season id for a fresh game. */
    START_SEASON: 0,
    /** Season progress points for a fresh game. */
    START_PROGRESS: 0,
  },
} as const;

/**
 * Base economy tuning (FEAT-002). The base produces four original survival
 * resources over wall-clock time, each capped by a storage limit. HQ level
 * drives global production/storage multipliers; individual buildings add flat
 * production and storage on top. All numbers are Phaser-free `as const` data so
 * the pure economy/building systems and their tests share one source of truth.
 *
 * Resources (original, genre-appropriate names):
 *  - rations   (식량)     : feeds the squad; base staple resource.
 *  - steel     (철강)     : structural material for construction.
 *  - fuel      (연료)     : powers vehicles, drones, and production.
 *  - circuitry (전자부품) : advanced parts gating higher-tech upgrades.
 */
export const ECONOMY = {
  /**
   * Per-resource base tuning. `baseProduction` is units/second produced with no
   * buildings, `baseStorage` is the level-0 storage cap, and `start` is the
   * amount a fresh save begins with. Storage clamps the stockpile every tick.
   */
  RESOURCES: {
    rations: { baseProduction: 0.5, baseStorage: 2000, start: 500 },
    steel: { baseProduction: 0.4, baseStorage: 2000, start: 400 },
    fuel: { baseProduction: 0.3, baseStorage: 1500, start: 300 },
    circuitry: { baseProduction: 0.1, baseStorage: 800, start: 100 },
  },
  /**
   * Real-time accrual is capped at this many seconds per resolution so a save
   * left closed for weeks does not overflow with a single absurd delta; offline
   * production still accrues up to this window (24h). Storage caps then clamp.
   */
  MAX_ACCRUAL_SECONDS: 86400,
} as const;

/**
 * Building tree tuning (FEAT-002). Every building shares a geometric cost + time
 * curve: the cost of a resource to reach `level` (from level-1 up) is
 * `round(baseCost[res] * costGrowth^(level-1))` and the build time is
 * `round(baseTimeSeconds * timeGrowth^(level-1))`. `maxLevel` is the absolute
 * ceiling; a non-HQ building is additionally capped at the current HQ level
 * (the HQ cap, enforced in Buildings.ts).
 *
 * Per-level EFFECTS (applied by Economy/other systems reading the level):
 *  - hq            : global production + storage multiplier; raises the cap for
 *                    all other buildings. Level 0 already grants the base.
 *  - tech_center   : circuitry production + research-unlock tier.
 *  - parade_ground : rations + fuel production (feeds/moves the army).
 *  - hospital      : wounded-soldier heal capacity.
 *  - barracks      : troop-training capacity + steel production.
 *  - drone_center  : fuel production + drone (Falcon Rescue) support capacity.
 */
export const BUILDINGS = {
  /** Multiplicative cost growth per building level (geometric curve). */
  COST_GROWTH: 1.6,
  /** Multiplicative build-time growth per building level. */
  TIME_GROWTH: 1.5,
  /** Only one upgrade may be in progress at a time (single global build queue). */
  MAX_CONCURRENT_UPGRADES: 1,
  /**
   * Per-building definitions. `baseCost` is the level-1 cost per resource,
   * `baseTimeSeconds` the level-1 build time, `maxLevel` the absolute ceiling,
   * and `effectPerLevel` documents the numeric effect one level grants (read by
   * the systems that own that stat).
   */
  DEFS: {
    hq: {
      baseCost: { steel: 100, rations: 100, fuel: 0, circuitry: 0 },
      baseTimeSeconds: 30,
      maxLevel: 30,
      /** Fractional production + storage bonus granted per HQ level. */
      effectPerLevel: { productionBonus: 0.1, storageBonus: 0.25 },
    },
    tech_center: {
      baseCost: { steel: 80, rations: 40, fuel: 20, circuitry: 0 },
      baseTimeSeconds: 45,
      maxLevel: 30,
      /** Flat circuitry production (units/sec) added per level. */
      effectPerLevel: { circuitryProduction: 0.05, researchTier: 1 },
    },
    parade_ground: {
      baseCost: { steel: 60, rations: 80, fuel: 30, circuitry: 0 },
      baseTimeSeconds: 40,
      maxLevel: 30,
      /** Flat rations + fuel production (units/sec) added per level. */
      effectPerLevel: { rationsProduction: 0.15, fuelProduction: 0.08 },
    },
    hospital: {
      baseCost: { steel: 70, rations: 50, fuel: 10, circuitry: 5 },
      baseTimeSeconds: 40,
      maxLevel: 30,
      /** Wounded-heal capacity added per level. */
      effectPerLevel: { healCapacity: 25 },
    },
    barracks: {
      baseCost: { steel: 90, rations: 60, fuel: 15, circuitry: 0 },
      baseTimeSeconds: 50,
      maxLevel: 30,
      /** Troop-training capacity + flat steel production per level. */
      effectPerLevel: { trainingCapacity: 20, steelProduction: 0.1 },
    },
    drone_center: {
      baseCost: { steel: 80, rations: 40, fuel: 40, circuitry: 15 },
      baseTimeSeconds: 55,
      maxLevel: 30,
      /** Flat fuel production + drone-support capacity per level. */
      effectPerLevel: { fuelProduction: 0.12, droneSupport: 1 },
    },
  },
} as const;

/**
 * Hero / RPG-core tuning (FEAT-003). LAST SQUAD's heroes span three combat
 * TYPES in a rock-paper-scissors triangle, three battlefield ROLES, and three
 * GRADES. Star-tier + level + skill progression fold into final stats. All
 * numbers are Phaser-free `as const` data shared by the pure hero, recruit,
 * formation, and combat systems and their tests.
 *
 * Type triangle (advantage): tank > missile > aircraft > tank. Attacking a type
 * you are strong against multiplies damage by {@link COMBAT.ADVANTAGE_MULT};
 * attacking a type you are weak to multiplies by {@link COMBAT.DISADVANTAGE_MULT};
 * a neutral matchup is 1x.
 */
export const HEROES = {
  /**
   * Per-grade base multipliers + progression caps. `statMult` scales a hero's
   * catalog base stats (so a UR is innately stronger than an SR of the same
   * catalog stats), `maxLevel` / `maxStars` cap progression, and `shardValue`
   * is how many progression shards a duplicate of that grade converts into.
   */
  GRADES: {
    UR: { statMult: 1.4, maxLevel: 80, maxStars: 6, shardValue: 40 },
    SSR: { statMult: 1.15, maxLevel: 70, maxStars: 5, shardValue: 20 },
    SR: { statMult: 1.0, maxLevel: 60, maxStars: 4, shardValue: 10 },
  },
  /**
   * Level progression. A hero at level L (1-based) has its base stats scaled by
   * `1 + LEVEL_STAT_GROWTH * (L - 1)`. Levelling from L to L+1 costs
   * `round(LEVEL_COST_BASE * LEVEL_COST_GROWTH^(L-1))` progression shards.
   */
  LEVEL_STAT_GROWTH: 0.08,
  LEVEL_COST_BASE: 20,
  LEVEL_COST_GROWTH: 1.12,
  /**
   * Star-tier progression. Each star grants a flat `STAR_STAT_BONUS` fractional
   * bonus to all stats (additive with the level bonus). Rising from star S to
   * S+1 costs `round(STAR_COST_BASE * STAR_COST_GROWTH^S)` shards. Heroes start
   * at 1 star.
   */
  START_STARS: 1,
  STAR_STAT_BONUS: 0.15,
  STAR_COST_BASE: 100,
  STAR_COST_GROWTH: 1.8,
  /**
   * Skill progression. Skills start at level 1. Each skill level adds
   * `SKILL_POTENCY_PER_LEVEL` to a skill's effect potency and the whole hero's
   * stats gain `SKILL_STAT_BONUS_PER_LEVEL` per skill level beyond the first.
   * Raising a skill from level K to K+1 costs
   * `round(SKILL_COST_BASE * SKILL_COST_GROWTH^(K-1))` shards.
   */
  START_SKILL_LEVEL: 1,
  MAX_SKILL_LEVEL: 10,
  SKILL_POTENCY_PER_LEVEL: 0.1,
  SKILL_STAT_BONUS_PER_LEVEL: 0.03,
  SKILL_COST_BASE: 50,
  SKILL_COST_GROWTH: 1.25,
  /** Same-type squad buff: +20% HP/ATK/DEF when all 5 heroes share one type. */
  SAME_TYPE_BUFF: 0.2,
} as const;

/**
 * Recruit / gacha tuning (FEAT-003). A single pull rolls a grade against
 * {@link RECRUIT.RATES} (which must sum to 1) using the seeded {@link Rng}, then
 * picks a hero of that grade. A PITY counter guarantees a UR pull once
 * {@link RECRUIT.PITY_THRESHOLD} consecutive non-UR pulls have accrued: the pull
 * AT the threshold is forced to UR and the counter resets. Duplicates convert to
 * progression shards using the grade's {@link HEROES.GRADES}.shardValue.
 */
export const RECRUIT = {
  /** Grade drop rates for a normal pull. Must sum to 1. */
  RATES: { UR: 0.03, SSR: 0.15, SR: 0.82 },
  /**
   * Consecutive non-UR pulls after which the NEXT pull is forced to UR. With 20,
   * pull #21 (the 21st in a dry streak) is guaranteed UR if none dropped before.
   */
  PITY_THRESHOLD: 20,
  /** Shards awarded on a duplicate, added on top of the grade shardValue. */
  DUPLICATE_BONUS_SHARDS: 5,
} as const;

/**
 * Combat resolver tuning (FEAT-003). A deterministic turn-based auto-battle.
 * Turn order is by descending speed (ties broken deterministically by slot).
 * Damage = `attacker.atk * typeMult * roleMult * variance - defender.def * DEF_FACTOR`,
 * floored at {@link COMBAT.MIN_DAMAGE}. The type triangle multiplies damage; the
 * variance is drawn from the seeded RNG within [1 - VARIANCE, 1 + VARIANCE].
 */
export const COMBAT = {
  /** Damage multiplier when the attacker's type beats the defender's. */
  ADVANTAGE_MULT: 1.5,
  /** Damage multiplier when the attacker's type loses to the defender's. */
  DISADVANTAGE_MULT: 0.6,
  /** Damage multiplier for a neutral (same/other) matchup. */
  NEUTRAL_MULT: 1.0,
  /** Fraction of the defender's DEF subtracted from raw damage. */
  DEF_FACTOR: 0.5,
  /** Minimum damage any landed attack deals (chip damage floor). */
  MIN_DAMAGE: 1,
  /** Half-width of the random damage variance band (+/-). */
  VARIANCE: 0.1,
  /** A dealer's outgoing-damage multiplier (focus fire). */
  DEALER_DAMAGE_MULT: 1.35,
  /** A tank's outgoing-damage multiplier (soaks more than it hits). */
  TANK_DAMAGE_MULT: 0.7,
  /** A support's outgoing-damage multiplier. */
  SUPPORT_DAMAGE_MULT: 0.85,
  /** Fraction of a support's ATK healed to the lowest-HP ally on its turn. */
  SUPPORT_HEAL_FACTOR: 1.1,
  /** Hard cap on rounds so a stalemate always terminates deterministically. */
  MAX_ROUNDS: 40,
} as const;

/**
 * Ordered tuple of hero combat types (rock-paper-scissors). The HeroType union
 * is derived in src/types. Triangle: tank > missile > aircraft > tank.
 */
export const HERO_TYPES = ['tank', 'missile', 'aircraft'] as const;

/** Ordered tuple of hero roles. The HeroRole union is derived in src/types. */
export const HERO_ROLES = ['dealer', 'tank', 'support'] as const;

/** Ordered tuple of hero grades (best first). The HeroGrade union is derived in src/types. */
export const HERO_GRADES = ['UR', 'SSR', 'SR'] as const;

/**
 * Which type each type BEATS (deals advantage damage to). Encodes the triangle
 * tank > missile > aircraft > tank; the loser side is derived by inversion in
 * the combat system.
 */
export const TYPE_ADVANTAGE = {
  tank: 'missile',
  missile: 'aircraft',
  aircraft: 'tank',
} as const;

/**
 * Ordered tuple of resource ids so UI and iteration share one canonical order.
 * The ResourceKind union type is derived in src/types.
 */
export const RESOURCE_ORDER = ['rations', 'steel', 'fuel', 'circuitry'] as const;

/**
 * Ordered tuple of building ids (HQ first). The BuildingId union type is
 * derived in src/types. HQ leads because its level caps every other building.
 */
export const BUILDING_ORDER = [
  'hq',
  'tech_center',
  'parade_ground',
  'hospital',
  'barracks',
  'drone_center',
] as const;

/**
 * Ordered tuple of meta-upgrade kinds so UI and iteration share one canonical
 * order. The MetaUpgradeKind union type is derived in src/types.
 */
export const UPGRADE_ORDER = ['start_size', 'damage', 'fire_rate', 'coin_bonus'] as const;

/**
 * Ordered tuple of gate operation kinds. The GateOp union type is derived in
 * src/types.
 */
export const GATE_OPS = ['add', 'sub', 'mul', 'div'] as const;

/** Scene keys used across the game. Centralized to avoid magic strings. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Title: 'TitleScene',
  /** Base-hub landing screen (FEAT-005): persistent bottom-nav shell. */
  Home: 'HomeScene',
  Run: 'RunScene',
  Results: 'ResultsScene',
  Upgrade: 'UpgradeScene',
  Settings: 'SettingsScene',
  /**
   * Meta-system scenes reached from the HomeScene bottom-nav. These are built
   * in FEAT-006 (Base / Heroes management panels) and FEAT-007 (Campaign,
   * Missions/Season, animated battle view). Their keys are declared here so the
   * nav can target them by name; HomeScene guards with a scene-existence check
   * (see HomeScene.navTo) so tapping a not-yet-registered tab is a safe no-op
   * until the owning feature registers the scene in src/main.ts.
   *
   * FEAT-006 MUST register scenes with keys: Base, Heroes, Formation.
   * FEAT-007 MUST register scenes with keys: Campaign, Missions, Season, Battle.
   */
  Base: 'BaseScene',
  Heroes: 'HeroesScene',
  /**
   * Squad-formation board (FEAT-006), reached from the Heroes scene. Assigns
   * owned heroes to the 2-front / 3-back slots and surfaces the same-type buff.
   */
  Formation: 'FormationScene',
  Campaign: 'CampaignScene',
  Missions: 'MissionsScene',
  Season: 'SeasonScene',
  Battle: 'BattleScene',
  /**
   * First-run onboarding tutorial (FEAT-003). An OVERLAY scene: launched with
   * scene.launch on top of the current scene (never replacing it) so the guided
   * sequence draws over the base hub and can be dismissed to reveal it.
   */
  Tutorial: 'TutorialScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
