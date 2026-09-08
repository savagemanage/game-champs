import Phaser from 'phaser';
import {
  CHAMPIONS,
  getChampionById,
  randomChampionId,
  type Champion,
  type Ability,
} from '../../data/champions';
import {
  advanceAttackCooldown,
  applyDamage,
  applyHeal,
  canBasicAttack,
  createCooldownState,
  distance,
  nearestTargetableEnemy,
  resetAttackCooldown,
  resolveAbility,
  startCooldown,
  tickCooldowns,
  type CooldownKey,
  type CooldownState,
  type StructureLine,
  type Team,
  type Unit,
  type Vec2,
} from '../combat';
import { decideAction, type AiSnapshot } from '../ai';
import { battleStore, type BattleOutcome, type GameMode } from '../battleStore';
import { audio } from '../audio';

// --- Rift pure modules (all Phaser-free, unit tested) --------------------
import {
  WORLD_SIZE,
  type Lane,
  type MapSide,
  LANES,
  STRUCTURES,
  BASE_POSITIONS,
  LANE_WAYPOINTS,
  laneWaypoints,
  RIVER_ANCHORS,
  JUNGLE_CAMPS,
  EPIC_PITS,
} from '../rift/map';
import {
  worldToScreen,
  screenToWorld,
  depthFor,
  projectionScale,
  projectedWorldBounds,
  HEIGHT_SCALE,
  DEFAULT_PROJECTION,
} from '../rift/iso';
import { SpriteFactory, type SpriteSize } from '../render/sprites';
import type { VfxKind } from '../render/svgArt';
import {
  classifyHit,
  shakeForHit,
  shouldShake,
  structureDestructionShake,
  sparkCountForHit,
  knockbackForHit,
  knockbackDir,
  popupStyleForHit,
  MAX_SHAKE_INTENSITY,
  type HitImportance,
  type ShakeSpec,
} from '../render/juice';
import {
  buildStructureGraph,
  isStructureTargetable,
  isInhibitorAlive,
  type StructureNode,
} from '../rift/structures';
import {
  spawnMinion,
  advanceMinion,
  minionStats,
  nextWaveNumberAt,
  laneWaveComposition,
  type Minion as RiftMinion,
  type MinionType,
} from '../rift/minions';
import {
  createProgress,
  addGold,
  addXp,
  passiveGold,
  minionBounty,
  CHAMPION_TAKEDOWN_BOUNTY,
  STARTING_GOLD,
  type ProgressState,
} from '../rift/economy';
import { composeTeams, enemyFacingSlot } from '../rift/teams';
import {
  computeEffectiveStats,
  getItemById,
} from '../rift/loadout';
import { totalModifiers } from '../../data/items';
import {
  createBuffState,
  expireBuffs,
  BUFF_EFFECTS,
  type BuffState,
} from '../rift/jungle';
import {
  addModifiers,
  dragonStackBonus,
  expireBaronBuff,
  noBaronBuff,
  isHeraldWindowOpen,
  DRAGON_FIRST_SPAWN,
  BARON_SPAWN,
  type TeamModifiers,
  type BaronBuffState,
} from '../rift/objectives';

/** Data passed into the scene from React via `scene.start(key, data)`. */
export interface BattleSceneData {
  playerChampionId: string;
  enemyChampionId: string;
  mode: GameMode;
  onGameEnd: (outcome: BattleOutcome) => void;
}

// Canvas dimensions (kept in sync with PhaserGame). The 3000x3000 rift world is
// scaled uniformly into the canvas, leaving a small margin.
const VIEW_W = 900;
const VIEW_H = 640;
const MARGIN = 20;
const SCALE = Math.min(VIEW_W - MARGIN * 2, VIEW_H - MARGIN * 2) / WORLD_SIZE;
const OFF_X = (VIEW_W - WORLD_SIZE * SCALE) / 2;
const OFF_Y = (VIEW_H - WORLD_SIZE * SCALE) / 2;

/**
 * Battle-camera tuning. The projection (see {@link ./rift/iso}) fits the WHOLE
 * world diamond into the 900x640 view; the Phaser camera is layered on top to
 * ZOOM IN on the player's champion and FOLLOW it so only a portion of the map
 * is visible at once (LoL-style). The whole map still lives on the HUD minimap.
 *   - CAMERA_ZOOM: >1 magnifies; ~2.4 shows a champion + immediate surroundings
 *     (nearby turret / minions) without revealing the whole map.
 *   - CAMERA_LERP: follow smoothing (0..1 per axis); small = gentle pan.
 *   - CAMERA_BOUNDS_PADDING: screen px added around the projected diamond so the
 *     camera can keep the champion centred near the map edges.
 */
const CAMERA_ZOOM = 2;
const CAMERA_LERP = 0.1;
const CAMERA_BOUNDS_PADDING = 220;

const NEXUS_HP = 5500;
const NEXUS_TURRET_HP = 2700;
const TURRET_HP = 2000;
const INHIBITOR_HP = 2400;
const TURRET_RANGE = 260;
const TURRET_DAMAGE = 152;
const TURRET_ATTACK_SPEED = 0.83;
const RESOURCE_REGEN = 8; // per second

// How far (screen px) each entity's billboard is lifted off its ground point,
// so it reads as "standing" in the dimetric view. Structures are taller; the
// nexus is tallest.
const CHAMPION_HEIGHT_PX = 26;
const MINION_HEIGHT_PX = 14;
// Structures are lifted LESS than before so they don't stack into a vertical
// "wall of towers"; combined with the smaller baked structure sprites this
// keeps champions the focal figures (size-balance tuning pass).
const TURRET_HEIGHT_PX = 20;
const INHIBITOR_HEIGHT_PX = 15;
const NEXUS_HEIGHT_PX = 30;

/**
 * Convert a world coordinate (0..3000) to the FLAT gameplay-plane pixel space.
 *
 * IMPORTANT render model: `unit.pos` and ALL gameplay math (movement, distance,
 * attackRange*SCALE, moveSpeed*SCALE, clampX/clampY, aim) live in this flat
 * top-down pixel space, exactly as before the 2.5D overhaul. Only the DRAWING
 * is projected: the flat pixel is converted back to world units and run through
 * the FEAT-001 dimetric projection (see {@link project}). Keeping gameplay on
 * the flat plane means combat ranges/speeds are byte-for-byte unchanged.
 */
function toScreen(p: Vec2): Vec2 {
  return { x: OFF_X + p.x * SCALE, y: OFF_Y + p.y * SCALE };
}

/** Inverse of {@link toScreen}: flat gameplay pixel -> world units (0..3000). */
function pixelToWorld(p: Vec2): Vec2 {
  return { x: (p.x - OFF_X) / SCALE, y: (p.y - OFF_Y) / SCALE };
}

/**
 * Project a flat gameplay-plane pixel to its on-screen dimetric position. This
 * is the single place the flat plane becomes 2.5D: pixel -> world -> screen.
 */
function project(p: Vec2): Vec2 {
  return worldToScreen(pixelToWorld(p), DEFAULT_PROJECTION);
}

/**
 * Depth key for an entity standing at a flat gameplay pixel, lifted by
 * `heightPx` screen pixels. Delegates to the projection's {@link depthFor} on
 * the underlying world coordinate so nearer (lower-on-screen) entities sort on
 * top. Height is converted from screen pixels to world units for the tie-break.
 */
function depthForPixel(p: Vec2, heightPx = 0): number {
  return depthFor(pixelToWorld(p), heightPx / HEIGHT_SCALE, DEFAULT_PROJECTION);
}

/** Depth band offsets so terrain < shadows < bodies without cross-mixing. */
const DEPTH_TERRAIN = -100000;
const DEPTH_SHADOW_BIAS = -5000;

/**
 * Convenience wrapper returning a single representative fit-scale for cosmetic
 * world-unit -> screen-px sizing (lane/river band widths). The projection now
 * fits X and Y independently, so we use the average of the two axis scales.
 */
function projScale(): number {
  const { sx, sy } = projectionScale(DEFAULT_PROJECTION);
  return (sx + sy) / 2;
}

/** Depth for transient VFX so they render above all entities. */
const VFX_DEPTH = 200000;

/**
 * Per-champion AI/simulation state for a NON-human champion. Each bot owns its
 * own cooldowns, resource pool, progression and lane assignment so all nine
 * AI champions reason and act independently through the same pure helpers the
 * human uses. The human champion does NOT carry a bot record; it uses the
 * scene's `player*` fields (which the HUD reads).
 */
interface BotState {
  champion: Champion;
  side: MapSide;
  cds: CooldownState;
  resource: number;
  maxResource: number;
  progress: ProgressState;
  /** The active map lane this bot walks/pushes. */
  lane: Lane;
  /** Cached lane push waypoints (flat gameplay pixels), enemy-nexus-ward. */
  pushPath: Vec2[];
  /** Current index into {@link pushPath} while marching. */
  pushIndex: number;
}

/** A rendered combat entity: pairs pure combat state with its Phaser visuals. */
interface Entity {
  unit: Unit;
  /** AI/simulation state for non-human champions (undefined for the human). */
  bot?: BotState;
  /**
   * The upright billboard container. Positioned every frame at the entity's
   * PROJECTED screen point, lifted up by {@link Entity.heightPx}. Holds the
   * baked sprite image, hp bar and (for champions) the 2-letter label.
   */
  container: Phaser.GameObjects.Container;
  /** Baked sprite billboard (procedural texture). */
  body: Phaser.GameObjects.Image;
  /** Ground-shadow ellipse drawn on the floor plane at the projected point. */
  shadow?: Phaser.GameObjects.Ellipse;
  /** How far (screen px) the billboard is lifted off its ground point. */
  heightPx: number;
  hpBarBg?: Phaser.GameObjects.Rectangle;
  hpBar?: Phaser.GameObjects.Rectangle;
  /** Remaining stun seconds; entity cannot act while > 0. */
  stunned: number;
  /** For structures: the pure graph node (kind, lane, shields). */
  node?: StructureNode;
  /** For minions: pure rift minion state (lane path progress). */
  rift?: RiftMinion;
  /** For minions: the lane path this minion walks. */
  path?: Vec2[];
  /** For minions/monsters, their bounty type key. */
  minionType?: MinionType;
}

/**
 * The full Summoner's Rift battle. Renders the three-lane map (Rift mode) or a
 * single mid lane (ARAM) by scaling the pure {@link WORLD_SIZE} world model into
 * the canvas. All map geometry, structure gating, minion waves, economy,
 * jungle/buffs and epic objectives come from the Phaser-free `rift/` modules and
 * `combat.ts`; this scene only renders and calls them.
 */
export default class BattleScene extends Phaser.Scene {
  private onGameEnd!: (outcome: BattleOutcome) => void;
  private mode: GameMode = 'rift';
  private playerChampion!: Champion;
  private enemyChampion!: Champion;
  /** The lanes active this match (all three for Rift, mid only for ARAM). */
  private lanes: Lane[] = [...LANES];

  private player!: Entity;
  /** The player-facing enemy champion (drives the HUD enemy bar). AI-driven. */
  private enemy!: Entity;
  /** All champion entities (10 total): the human + 9 AI bots. */
  private champions: Entity[] = [];
  private structures: Entity[] = [];
  private minions: Entity[] = [];
  private allEntities: Entity[] = [];
  /** Structure entities keyed by their pure graph id. */
  private structureById = new Map<string, Entity>();
  private allyNexus!: Entity;
  private enemyNexus!: Entity;

  private structureLines: StructureLine[] = [];

  private playerCds: CooldownState = createCooldownState();
  private playerResource = 0;
  private playerMaxResource = 300;

  // Economy / progression. Each AI bot carries its own ProgressState; this is
  // the human player's.
  private playerProgress: ProgressState = createProgress();
  private ownedItems: string[] = [];
  private goldAccrual = 0;

  // Buffs / objectives (ally-team perspective drives HUD + player stats).
  private playerBuffs: BuffState = createBuffState();
  private allyBaron: BaronBuffState = noBaronBuff();
  private enemyBaron: BaronBuffState = noBaronBuff();
  private allyDragonStacks = 0;
  private enemyDragonStacks = 0;
  private dragonNextSpawn = DRAGON_FIRST_SPAWN;
  private baronAlive = false;
  private heraldTaken = false;

  // Wave scheduling.
  private spawnedWaves = 0;
  /** Inhibitors down per side, for super-minion spawning. */
  private inhibitorKillTimes = new Map<string, number>();

  private moveTarget: Vec2 | null = null;
  private abilityKeys!: Record<CooldownKey, Phaser.Input.Keyboard.Key>;
  private touchCastHandler?: EventListener;

  /** Procedural sprite/texture factory (baked once, cached, reused). */
  private sprites!: SpriteFactory;

  private elapsed = 0;
  private ended = false;
  /** Guards the cosmetic kill slow-mo so rapid kills cannot stack/strand it. */
  private slowMoActive = false;
  /**
   * Real-time timestamp (performance clock, ms) of the last camera shake that
   * actually fired. Used to throttle shakes so the constant 5v5 combat cannot
   * coalesce into a permanent tremor. -Infinity so the first shake never
   * throttles.
   */
  private lastShakeAt = Number.NEGATIVE_INFINITY;
  /**
   * Per-frame living-unit snapshot, rebuilt once at the top of {@link update}
   * before the champion/minion/turret loops that call {@link findTarget}. This
   * removes the per-caller allocation churn: with ten champions plus minions and
   * turrets all targeting each frame, rebuilding the living `Unit[]` list and id
   * `Set` per call multiplied badly. Targeting is a per-frame approximation (a
   * unit may die mid-loop), which is acceptable and matches the prior
   * order-dependent behavior; the attack paths still guard on `target.dead`.
   */
  private livingSnapshot: { units: Unit[]; ids: Set<string> } = {
    units: [],
    ids: new Set(),
  };
  private stats = {
    championKills: 0,
    minionKills: 0,
    damageDealt: 0,
  };

  constructor() {
    super('battle');
  }

  init(data: BattleSceneData) {
    this.onGameEnd = data.onGameEnd;
    this.mode = data.mode ?? 'rift';
    // ARAM randomizes both champions onto a single mid lane.
    if (this.mode === 'aram') {
      const p = randomChampionId();
      this.playerChampion = getChampionById(p)!;
      this.enemyChampion = getChampionById(randomChampionId(p))!;
      this.lanes = ['mid'];
    } else {
      this.playerChampion =
        getChampionById(data.playerChampionId) ?? getChampionById('ashborne')!;
      this.enemyChampion =
        getChampionById(data.enemyChampionId) ?? getChampionById('nightveil')!;
      this.lanes = [...LANES];
    }

    // Reset per-run state so a restart/rematch starts clean.
    this.champions = [];
    this.structures = [];
    this.minions = [];
    this.allEntities = [];
    this.structureById.clear();
    this.structureLines = [];
    this.playerCds = createCooldownState();
    this.playerResource = this.playerMaxResource;
    this.playerProgress = createProgress(STARTING_GOLD);
    this.ownedItems = [];
    this.goldAccrual = 0;
    this.playerBuffs = createBuffState();
    this.allyBaron = noBaronBuff();
    this.enemyBaron = noBaronBuff();
    this.allyDragonStacks = 0;
    this.enemyDragonStacks = 0;
    this.dragonNextSpawn = DRAGON_FIRST_SPAWN;
    this.baronAlive = false;
    this.heraldTaken = false;
    this.spawnedWaves = 0;
    this.inhibitorKillTimes.clear();
    this.moveTarget = null;
    this.elapsed = 0;
    this.ended = false;
    this.stats = { championKills: 0, minionKills: 0, damageDealt: 0 };
    battleStore.reset(this.playerChampion.id, this.enemyChampion.id, this.mode);
  }

  create() {
    this.cameras.main.setBackgroundColor('#05140c');
    this.sprites = new SpriteFactory(this);
    this.drawMap();

    this.buildStructures();

    this.spawnTeams();

    this.setupInput();
    this.setupCamera();
    this.pushHud();
  }

  /**
   * Zoom the battle camera in on the player's champion and follow it, so only a
   * PORTION of the map is visible at a time (the map feels large). The whole
   * map still shows on the HUD minimap (screen-fixed React overlay, computed
   * from full-world fractions, so it is unaffected by this camera transform).
   *
   * The camera is layered ON TOP of the fixed fit-projection: bounds cover the
   * whole projected world diamond (via the pure {@link projectedWorldBounds}
   * helper) with padding so the champion can stay centred near the edges; zoom
   * magnifies; startFollow pans smoothly. Cosmetic shake/flash (see
   * {@link shake} / kill slow-mo / win-lose) are additive to camera scroll and
   * keep working; none of this touches unit.pos or sim timers (determinism
   * unchanged). Called AFTER spawnTeams() so {@link player} exists to follow.
   */
  private setupCamera() {
    const cam = this.cameras.main;
    const bounds = projectedWorldBounds(DEFAULT_PROJECTION, CAMERA_BOUNDS_PADDING);
    cam.setBounds(bounds.minX, bounds.minY, bounds.width, bounds.height);
    cam.setZoom(CAMERA_ZOOM);
    cam.startFollow(this.player.container, true, CAMERA_LERP, CAMERA_LERP);
    cam.setFollowOffset(0, 0);
  }

  /**
   * Build both full five-champion teams from the pure {@link composeTeams}
   * composition. The human keeps their chosen champion as {@link player} on the
   * ally side; the enemy's player-facing pick becomes {@link enemy} (AI-driven)
   * so the existing single-enemy HUD bar stays meaningful. Every other champion
   * gets its own {@link BotState} and is driven each tick by the pure AI.
   */
  private spawnTeams() {
    const composition = composeTeams(
      CHAMPIONS,
      this.playerChampion.id,
      this.enemyChampion.id,
      this.lanes,
    );
    const facing = enemyFacingSlot(composition, this.enemyChampion.id);

    let allyIndex = 0;
    let enemyIndex = 0;
    for (const side of ['ally', 'enemy'] as MapSide[]) {
      const slots = side === 'ally' ? composition.ally : composition.enemy;
      const base = toScreen(BASE_POSITIONS[side]);
      for (const slot of slots) {
        // Fan the fountain spawns slightly so the five champions do not overlap.
        const n = side === 'ally' ? allyIndex++ : enemyIndex++;
        const spawn: Vec2 = {
          x: this.clampX(base.x + (n - 2) * 16 * SCALE),
          y: this.clampY(base.y + (n - 2) * 16 * SCALE),
        };
        const isHuman = slot.isHuman;
        const isFacingEnemy = side === 'enemy' && slot === facing;
        const id = isHuman
          ? 'player'
          : isFacingEnemy
            ? 'enemy'
            : `${side}-bot-${n}`;
        const entity = this.spawnChampion(id, slot.champion, side, spawn);

        if (isHuman) {
          this.player = entity;
        } else {
          if (isFacingEnemy) this.enemy = entity;
          entity.bot = {
            champion: slot.champion,
            side,
            cds: createCooldownState(),
            resource: 300,
            maxResource: 300,
            progress: createProgress(STARTING_GOLD),
            lane: slot.lane,
            pushPath: laneWaypoints(slot.lane, side).map(toScreen),
            pushIndex: 0,
          };
        }
        this.champions.push(entity);
        this.applyChampionStats(entity, side);
        entity.unit.hp = entity.unit.maxHp;
        if (entity.bot) entity.bot.resource = entity.bot.maxResource;
      }
    }
  }

  // ---- Map + structure setup ----------------------------------------------

  /**
   * Draw the battlefield as a 2.5D dimetric terrain. Every geometry point is a
   * world coordinate projected through {@link worldToScreen}; the square world
   * reads as a diamond, lanes/river/jungle/bases are drawn in projected space,
   * and jungle/epic markers are placed as depth-sorted billboards. Gameplay is
   * untouched: this method only paints, using the FEAT-001 projection.
   */
  private drawMap() {
    const g = this.add.graphics();
    g.setDepth(DEPTH_TERRAIN);

    const w = (p: Vec2) => worldToScreen(p, DEFAULT_PROJECTION);

    // Projected ground diamond (the whole world plane).
    const c0 = w({ x: 0, y: 0 });
    const c1 = w({ x: WORLD_SIZE, y: 0 });
    const c2 = w({ x: WORLD_SIZE, y: WORLD_SIZE });
    const c3 = w({ x: 0, y: WORLD_SIZE });
    const diamond = [
      new Phaser.Geom.Point(c0.x, c0.y),
      new Phaser.Geom.Point(c1.x, c1.y),
      new Phaser.Geom.Point(c2.x, c2.y),
      new Phaser.Geom.Point(c3.x, c3.y),
    ];
    const mid = w({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 });

    // Base ground fill (deep forest floor).
    g.fillStyle(0x0b2a1a, 1);
    g.fillPoints(diamond, true);

    // Layered vignette: concentric shrinking diamonds, brightest toward the
    // center, so the ground reads as a lit clearing fading to dark edges rather
    // than a flat single-color fill. Drawn cheaply, once, in create().
    const groundTones = [0x0d3020, 0x104027, 0x134a2d, 0x175433];
    const worldCorners: Vec2[] = [
      { x: 0, y: 0 },
      { x: WORLD_SIZE, y: 0 },
      { x: WORLD_SIZE, y: WORLD_SIZE },
      { x: 0, y: WORLD_SIZE },
    ];
    for (let i = 0; i < groundTones.length; i++) {
      const t = (i + 1) / (groundTones.length + 1);
      const ring = worldCorners
        .map((p) => ({
          x: p.x + (WORLD_SIZE / 2 - p.x) * t,
          y: p.y + (WORLD_SIZE / 2 - p.y) * t,
        }))
        .map((p) => w(p))
        .map((s) => new Phaser.Geom.Point(s.x, s.y));
      g.fillStyle(groundTones[i], 0.5);
      g.fillPoints(ring, true);
    }

    // Crisp rim on the world edge.
    g.lineStyle(3, 0x2a6b47, 1);
    g.strokePoints(diamond, true, true);

    // Jungle quadrants (top-left / bottom-right of the diamond): darker greens
    // with a mottled canopy texture of scattered soft blobs so they read as
    // dense jungle distinct from the walkable lanes.
    const jungleTris: Phaser.Geom.Point[][] = [
      [
        new Phaser.Geom.Point(c0.x, c0.y),
        new Phaser.Geom.Point(c1.x, c1.y),
        new Phaser.Geom.Point(mid.x, mid.y),
      ],
      [
        new Phaser.Geom.Point(c2.x, c2.y),
        new Phaser.Geom.Point(c3.x, c3.y),
        new Phaser.Geom.Point(mid.x, mid.y),
      ],
    ];
    g.fillStyle(0x08281a, 0.6);
    for (const tri of jungleTris) g.fillPoints(tri, true);
    // Mottled canopy: deterministic scatter of leafy blobs in the two jungle
    // quadrants (top-left and bottom-right in world space), tinted two greens.
    const mottle: Array<{ qx: [number, number]; qy: [number, number] }> = [
      { qx: [0.06, 0.44], qy: [0.06, 0.44] }, // top-left jungle
      { qx: [0.56, 0.94], qy: [0.56, 0.94] }, // bottom-right jungle
    ];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (const q of mottle) {
      for (let i = 0; i < 26; i++) {
        const wx = (q.qx[0] + rand() * (q.qx[1] - q.qx[0])) * WORLD_SIZE;
        const wy = (q.qy[0] + rand() * (q.qy[1] - q.qy[0])) * WORLD_SIZE;
        const p = w({ x: wx, y: wy });
        const r = (6 + rand() * 10) * projScale();
        g.fillStyle(rand() > 0.5 ? 0x0f3a24 : 0x18543a, 0.5);
        g.fillEllipse(p.x, p.y, r * 2.2, r);
      }
    }

    // River band along the anti-diagonal: a wide blue base stroke with a
    // lighter highlight ribbon down its center so the water catches light.
    const river = RIVER_ANCHORS.map(w);
    const strokePoly = (pts: Vec2[]) => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    };
    g.lineStyle(Math.max(12, 66 * projScale()), 0x123f63, 0.55);
    strokePoly(river);
    g.lineStyle(Math.max(8, 48 * projScale()), 0x2b7fc0, 0.45);
    strokePoly(river);
    g.lineStyle(Math.max(2, 12 * projScale()), 0x7fd0ff, 0.5);
    strokePoly(river);

    // Lanes: a soft dark border under a lighter walkable path so the traversable
    // surface reads distinctly from the jungle.
    for (const lane of this.lanes) {
      const pts = LANE_WAYPOINTS[lane].map(w);
      g.lineStyle(Math.max(10, 52 * projScale()), 0x14311f, 0.7);
      strokePoly(pts);
      g.lineStyle(Math.max(8, 42 * projScale()), 0x3c8f60, 0.6);
      strokePoly(pts);
      g.lineStyle(Math.max(3, 16 * projScale()), 0x59b07e, 0.4);
      strokePoly(pts);
    }

    // Faint isometric tile grid so the ground reads as a 2.5D floor (drawn over
    // the terrain surfaces, kept very subtle).
    g.lineStyle(1, 0x1c4a30, 0.4);
    const step = WORLD_SIZE / 12;
    for (let i = 1; i < 12; i++) {
      const a = w({ x: i * step, y: 0 });
      const b = w({ x: i * step, y: WORLD_SIZE });
      g.lineBetween(a.x, a.y, b.x, b.y);
      const c = w({ x: 0, y: i * step });
      const d = w({ x: WORLD_SIZE, y: i * step });
      g.lineBetween(c.x, c.y, d.x, d.y);
    }

    // Base zones: a glowing team-tinted pad at each fountain with a bright rim
    // and an inner core so the fountains read as energized platforms.
    for (const side of ['ally', 'enemy'] as MapSide[]) {
      const b = w(BASE_POSITIONS[side]);
      const tint = side === 'ally' ? 0x2f6fe0 : 0xe0512f;
      const rim = side === 'ally' ? 0x8fd7ff : 0xff8a7a;
      g.fillStyle(tint, 0.14);
      g.fillEllipse(b.x, b.y, 150, 76);
      g.fillStyle(tint, 0.26);
      g.fillEllipse(b.x, b.y, 118, 60);
      g.fillStyle(rim, 0.2);
      g.fillEllipse(b.x, b.y, 70, 36);
      g.lineStyle(2.5, rim, 0.85);
      g.strokeEllipse(b.x, b.y, 120, 61);
      g.lineStyle(1.5, rim, 0.5);
      g.strokeEllipse(b.x, b.y, 150, 76);
    }

    // Jungle camp + epic pit markers (Rift only), as depth-sorted billboards.
    if (this.mode === 'rift') {
      for (const camp of JUNGLE_CAMPS) {
        this.spawnMarker('jungle', camp.pos);
      }
      for (const pit of EPIC_PITS) {
        this.spawnMarker(pit.id, pit.pos);
      }
    }
  }

  /**
   * Place a static projected marker billboard (jungle camp / epic monster) at a
   * world position. Uses the baked marker texture and depth-sorts by its
   * projected ground point so entities in front occlude it correctly.
   */
  private spawnMarker(variant: 'jungle' | 'dragon' | 'baron' | 'herald', worldPos: Vec2) {
    const screen = worldToScreen(worldPos, DEFAULT_PROJECTION);
    const { key, size } = this.sprites.ensure({ kind: 'marker', variant });
    const heightPx = variant === 'jungle' ? 4 : 10;
    if (variant !== 'jungle') {
      const shadow = this.add.ellipse(screen.x, screen.y, size.width * 0.8, size.width * 0.36, 0x000000, 0.32);
      shadow.setDepth(depthFor(worldPos, 0, DEFAULT_PROJECTION) + DEPTH_SHADOW_BIAS);
    }
    const img = this.add.image(screen.x, screen.y - heightPx, key);
    img.setOrigin(0.5, 1 - (size.height - size.footY) / size.height);
    // The backing texture is baked at RASTER_SCALE density; pin the on-screen
    // size to the intrinsic SpriteSize so it renders 1:1 (crisp downsample).
    img.setDisplaySize(size.width, size.height);
    img.setDepth(depthFor(worldPos, heightPx / HEIGHT_SCALE, DEFAULT_PROJECTION));
  }

  private buildStructures() {
    for (const side of ['ally', 'enemy'] as MapSide[]) {
      const team: Team = side;
      const graph = buildStructureGraph(side);
      const anchors = STRUCTURES[side];

      for (const node of graph) {
        // Skip lanes that are not active in this mode (e.g. ARAM = mid only).
        if (node.lane && !this.lanes.includes(node.lane)) continue;

        const pos = this.structurePosition(node, anchors);
        const entity = this.spawnStructure(node, team, pos);
        this.structureById.set(node.id, entity);
        this.structures.push(entity);

        if (node.kind === 'nexus') {
          if (side === 'ally') this.allyNexus = entity;
          else this.enemyNexus = entity;
        }
      }
    }
  }

  private structurePosition(
    node: StructureNode,
    anchors: (typeof STRUCTURES)['ally'],
  ): Vec2 {
    const lane = node.lane;
    switch (node.kind) {
      case 'outerTurret':
        return toScreen(anchors.outerTurrets[lane!]);
      case 'innerTurret':
        return toScreen(anchors.innerTurrets[lane!]);
      case 'inhibitorTurret':
        return toScreen(anchors.inhibitorTurrets[lane!]);
      case 'inhibitor':
        return toScreen(anchors.inhibitors[lane!]);
      case 'nexusTurret':
        return toScreen(node.id.endsWith('-a') ? anchors.nexusTurrets[0] : anchors.nexusTurrets[1]);
      case 'nexus':
      default:
        return toScreen(anchors.nexus);
    }
  }

  private makeUnit(
    id: string,
    kind: Unit['kind'],
    team: Team,
    pos: Vec2,
    stats: Partial<Unit>,
  ): Unit {
    return {
      id,
      kind,
      team,
      pos: { ...pos },
      hp: stats.maxHp ?? 100,
      maxHp: stats.maxHp ?? 100,
      ad: stats.ad ?? 0,
      armor: stats.armor ?? 0,
      attackRange: stats.attackRange ?? 0,
      attackSpeed: stats.attackSpeed ?? 1,
      moveSpeed: stats.moveSpeed ?? 0,
      attackCdRemaining: 0,
      dead: false,
    };
  }

  private spawnChampion(id: string, champion: Champion, team: Team, pos: Vec2): Entity {
    const unit = this.makeUnit(id, 'champion', team, pos, {
      maxHp: champion.stats.hp,
      ad: champion.stats.attackDamage,
      armor: 28,
      attackRange: champion.stats.attackRange * SCALE,
      attackSpeed: champion.stats.attackSpeed,
      moveSpeed: champion.stats.moveSpeed * SCALE,
    });
    const { key, size } = this.sprites.ensure({
      kind: 'champion',
      role: champion.role,
      accent: champion.accentColor,
      team,
    });
    const heightPx = CHAMPION_HEIGHT_PX;
    const body = this.makeBillboard(key, size);
    // Only the player-facing picks carry nameplates. Labeling all ten units at
    // the compact camera scale created a noisy wall of initials at each spawn.
    const shortLabel = id === 'player' || id === 'enemy'
      ? champion.id.slice(0, 2).toUpperCase()
      : '';
    const label = this.add.text(0, -size.height - 6, shortLabel, {
      fontFamily: 'Noto Sans KR, sans-serif',
      fontSize: '12px',
      color: '#fff1c9',
      fontStyle: 'bold',
      stroke: '#02070c',
      strokeThickness: 2,
      resolution: 2,
    });
    label.setOrigin(0.5);
    const container = this.add.container(pos.x, pos.y, [body, label]);
    const shadow = this.makeShadow(size.width * 0.7);
    const entity: Entity = { unit, container, body, shadow, heightPx, stunned: 0 };
    this.attachHpBar(entity, size.height + 12);
    this.allEntities.push(entity);
    return entity;
  }

  /**
   * Build the upright billboard image for a baked sprite. Origin is set so the
   * image's ground-contact point (footY) is the anchor placed on the projected
   * ground; container-relative Y is 0 there.
   */
  private makeBillboard(key: string, size: SpriteSize): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, key);
    // Anchor the sprite's foot at the container origin (0,0).
    img.setOrigin(0.5, size.footY / size.height);
    // The backing texture is baked at RASTER_SCALE density for crispness; pin
    // the on-screen size to the intrinsic SpriteSize so it renders 1:1 and
    // Phaser downsamples the denser texture at draw time.
    img.setDisplaySize(size.width, size.height);
    img.setPosition(0, 0);
    return img;
  }

  /** A soft ground-shadow ellipse laid on the floor plane (its own object). */
  private makeShadow(width: number): Phaser.GameObjects.Ellipse {
    return this.add.ellipse(0, 0, width, width * 0.45, 0x000000, 0.32);
  }

  private spawnStructure(node: StructureNode, team: Team, pos: Vec2): Entity {
    const maxHp =
      node.kind === 'nexus'
        ? NEXUS_HP
        : node.kind === 'nexusTurret'
          ? NEXUS_TURRET_HP
          : node.kind === 'inhibitor'
            ? INHIBITOR_HP
            : TURRET_HP;
    const isTurret = node.kind.endsWith('Turret');
    // Combat kind: nexus for the nexus, turret for anything that shoots,
    // 'nexus'-gated inhibitors are modeled as turrets that do not attack.
    const combatKind: Unit['kind'] = node.kind === 'nexus' ? 'nexus' : 'turret';
    const accent = team === 'ally' ? this.playerChampion.accentColor : this.enemyChampion.accentColor;
    const unit = this.makeUnit(node.id, combatKind, team, pos, {
      maxHp,
      ad: isTurret ? TURRET_DAMAGE : 0,
      armor: 40,
      attackRange: isTurret ? TURRET_RANGE * SCALE : 0,
      attackSpeed: TURRET_ATTACK_SPEED,
      moveSpeed: 0,
    });
    const tier: 'turret' | 'inhibitor' | 'nexus' =
      node.kind === 'nexus' ? 'nexus' : node.kind === 'inhibitor' ? 'inhibitor' : 'turret';
    const heightPx =
      tier === 'nexus' ? NEXUS_HEIGHT_PX : tier === 'inhibitor' ? INHIBITOR_HEIGHT_PX : TURRET_HEIGHT_PX;
    const { key, size } = this.sprites.ensure({ kind: 'structure', tier, accent, team });
    const body = this.makeBillboard(key, size);
    const container = this.add.container(pos.x, pos.y, [body]);
    const shadow = this.makeShadow(size.width * 0.8);
    const entity: Entity = { unit, container, body, shadow, heightPx, stunned: 0, node };
    this.attachHpBar(entity, size.height + 8);
    this.allEntities.push(entity);
    return entity;
  }

  private attachHpBar(entity: Entity, offsetY: number) {
    const isChampion = entity.unit.kind === 'champion';
    const width = entity.unit.kind === 'minion' ? 14 : isChampion ? 34 : 24;
    const height = isChampion ? 5 : 4;
    // A thin dark outline frame behind the track gives contrast against any
    // terrain/sprite color so the bar stays readable when zoomed in.
    const outline = this.add.rectangle(0, -offsetY, width + 2, height + 2, 0x000000, 0.85);
    const bg = this.add.rectangle(0, -offsetY, width, height, 0x201512, 0.9);
    const bar = this.add.rectangle(0, -offsetY, width, height, 0x3ad16a);
    bar.setData('width', width);
    entity.container.add([outline, bg, bar]);
    entity.hpBarBg = bg;
    entity.hpBar = bar;
  }

  /**
   * Recompute a champion's Unit stats from level + items + team modifiers. The
   * human champion reads the scene's `player*` progression/items; every AI bot
   * reads its own {@link BotState}. Item/CDR bonuses stay ally-player-only (bots
   * carry no items), matching prior behavior.
   */
  private applyChampionStats(entity: Entity, side: MapSide) {
    const isHuman = entity === this.player;
    const champion = isHuman ? this.playerChampion : entity.bot!.champion;
    const level = isHuman ? this.playerProgress.level : entity.bot!.progress.level;
    const items = isHuman ? this.ownedItems : [];
    const team = this.teamModifiers(side);
    const eff = computeEffectiveStats(champion, level, items, team);
    const u = entity.unit;
    const hpFrac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    u.maxHp = Math.round(eff.hp);
    // Preserve current hp fraction for live champions; freshly spawned/respawned
    // entities are topped up by the caller.
    u.hp = Math.min(u.maxHp, Math.round(u.maxHp * hpFrac));
    u.ad = eff.attackDamage;
    u.armor = eff.armor;
    u.attackSpeed = eff.attackSpeed;
    u.moveSpeed = champion.stats.moveSpeed * SCALE + eff.moveSpeed * SCALE;
    u.attackRange = champion.stats.attackRange * SCALE;
    if (isHuman) {
      this.playerMaxResource = 300 + eff.resource;
    } else {
      entity.bot!.maxResource = 300 + eff.resource;
    }
  }

  /** The current team modifiers for a side (dragon stacks + baron buff). */
  private teamModifiers(side: MapSide): TeamModifiers {
    const stacks = side === 'ally' ? this.allyDragonStacks : this.enemyDragonStacks;
    const baron = side === 'ally' ? this.allyBaron : this.enemyBaron;
    let mods = dragonStackBonus(stacks);
    if (baron.active) mods = addModifiers(mods, baron.modifiers);
    return mods;
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    // LoL-style controls: movement is CLICK-only (below); Q/W/E/R are the sole
    // keyboard bindings and cast abilities aimed at the cursor. WASD movement is
    // intentionally NOT bound, so physical W is no longer double-bound.
    this.abilityKeys = {
      Q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
    (['Q', 'W', 'E', 'R'] as CooldownKey[]).forEach((slot) => {
      this.abilityKeys[slot].on('down', () => this.tryPlayerCast(slot));
    });

    // Touch HUD buttons dispatch this lightweight event. It enters the exact
    // same cast path as the physical keys and uses the last battlefield pointer
    // as the aim point, so mobile players can tap to aim/move, then cast.
    this.touchCastHandler = ((event: CustomEvent<{ slot?: string }>) => {
      const slot = event.detail?.slot;
      if (slot === 'Q' || slot === 'W' || slot === 'E' || slot === 'R') {
        this.tryPlayerCast(slot);
      }
    }) as EventListener;
    window.addEventListener('champs:cast-ability', this.touchCastHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.touchCastHandler) {
        window.removeEventListener('champs:cast-ability', this.touchCastHandler);
        this.touchCastHandler = undefined;
      }
    });

    // Suppress the browser context menu over the canvas so right-click can be
    // used to issue move commands (LoL-style) without popping a menu.
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // BOTH left- and right-click issue a move command. Convert the click's
      // SCREEN point back to the flat gameplay plane so click-to-move still
      // lands where the player pointed in world terms.
      this.moveTarget = this.pointerToGround(pointer);
    });
  }

  /**
   * Map a pointer's canvas coordinates to the flat gameplay-plane pixel space.
   * The pointer is in projected SCREEN space, so we invert the projection
   * ({@link screenToWorld}) to world units and re-apply {@link toScreen} to get
   * the flat pixel that all gameplay math (movement/aim/ranges) operates in.
   */
  private pointerToGround(pointer: Phaser.Input.Pointer): Vec2 {
    const world = screenToWorld({ x: pointer.worldX, y: pointer.worldY }, DEFAULT_PROJECTION);
    return toScreen(world);
  }

  // ---- Main loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    if (this.ended) return;
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    tickCooldowns(this.playerCds, dt);
    const blueRegen = this.blueBuffRegen();
    this.playerResource = Math.min(this.playerMaxResource, this.playerResource + (RESOURCE_REGEN + blueRegen) * dt);
    // Tick every bot's own cooldowns + resource regen.
    for (const c of this.champions) {
      if (!c.bot) continue;
      tickCooldowns(c.bot.cds, dt);
      c.bot.resource = Math.min(c.bot.maxResource, c.bot.resource + RESOURCE_REGEN * dt);
    }

    this.tickEconomy(dt);
    this.tickBuffsAndObjectives();
    this.processPurchases();
    this.maybeSpawnWaves();

    // Build ONE living-unit snapshot for this frame, consumed by every
    // findTarget/turret-targeting call below. Refreshed here, before the
    // player/bot/minion/turret loops, so the whole frame targets against the
    // same living set instead of each caller rebuilding it.
    this.refreshLivingSnapshot();

    this.updatePlayerMovement(dt);
    // Drive all nine AI champions through the pure AI each tick.
    for (const c of this.champions) {
      if (c.bot) this.updateBotChampion(c, dt);
    }
    this.updateMinions(dt);
    for (const s of this.structures) {
      if (s.unit.kind === 'turret') this.updateTurret(s);
    }
    this.regenAndTick(dt);
    this.syncVisuals();
    this.checkWinLose();
    this.pushHud();
  }

  private blueBuffRegen(): number {
    return this.playerBuffs.buffs.some((b) => b.kind === 'blue')
      ? BUFF_EFFECTS.blue.resourceRegenPerSecond
      : 0;
  }

  private tickEconomy(dt: number) {
    // Passive gold trickle for the player.
    this.goldAccrual += passiveGold(dt);
    if (this.goldAccrual >= 1) {
      const whole = Math.floor(this.goldAccrual);
      addGold(this.playerProgress, whole);
      this.goldAccrual -= whole;
    }
  }

  private tickBuffsAndObjectives() {
    expireBuffs(this.playerBuffs, this.elapsed);
    this.allyBaron = expireBaronBuff(this.allyBaron, this.elapsed);
    this.enemyBaron = expireBaronBuff(this.enemyBaron, this.elapsed);
    if (this.elapsed >= BARON_SPAWN) this.baronAlive = true;
  }

  private processPurchases() {
    const requests = battleStore.consumePurchases();
    if (requests.length === 0) return;
    let changed = false;
    for (const id of requests) {
      const item = getItemById(id);
      if (!item) continue;
      if (this.ownedItems.includes(id)) continue;
      if (this.playerProgress.gold < item.cost) continue;
      // Only allowed in base (fountain proximity), matching the shop gating.
      if (!this.inBase(this.player.unit, 'ally')) continue;
      this.playerProgress.gold -= item.cost;
      this.ownedItems.push(id);
      changed = true;
    }
    if (changed) this.applyChampionStats(this.player, 'ally');
  }

  /** Whether a champion is close enough to its fountain to shop. */
  private inBase(u: Unit, side: MapSide): boolean {
    const base = toScreen(BASE_POSITIONS[side]);
    return distance(u.pos, base) <= 220 * SCALE;
  }

  private maybeSpawnWaves() {
    const wanted = nextWaveNumberAt(this.elapsed);
    while (this.spawnedWaves < wanted) {
      this.spawnedWaves += 1;
      this.spawnWave(this.spawnedWaves);
    }
  }

  private spawnWave(waveNumber: number) {
    for (const team of ['ally', 'enemy'] as Team[]) {
      for (const lane of this.lanes) {
        // Super minions spawn when the enemy inhibitor for that lane is down.
        const enemySide: MapSide = team === 'ally' ? 'enemy' : 'ally';
        const inhibId = `${enemySide}-${lane}-inhibitor`;
        const killedAt = this.inhibitorKillTimes.get(inhibId) ?? null;
        const inhibitorsDown = isInhibitorAlive(this.elapsed, killedAt) ? 0 : 1;
        const comp = laneWaveComposition(waveNumber, inhibitorsDown);
        comp.forEach((type, i) => {
          this.time.delayedCall(i * 220, () => {
            if (!this.ended) this.spawnLaneMinion(type, team, lane);
          });
        });
      }
    }
  }

  private spawnLaneMinion(type: MinionType, team: Team, lane: Lane) {
    const rift = spawnMinion(type, team, lane);
    const stats = minionStats(type);
    const screenPos = toScreen(rift.pos);
    const unit = this.makeUnit(
      `minion-${team}-${lane}-${type}-${this.time.now}-${Math.random().toString(36).slice(2, 6)}`,
      'minion',
      team,
      screenPos,
      {
        maxHp: stats.hp,
        ad: stats.ad,
        armor: stats.armor,
        attackRange: stats.attackRange * SCALE,
        attackSpeed: 1.25,
        moveSpeed: stats.moveSpeed * SCALE,
      },
    );
    const accent = team === 'ally' ? this.playerChampion.accentColor : this.enemyChampion.accentColor;
    const { key, size } = this.sprites.ensure({ kind: 'minion', type, accent, team });
    const body = this.makeBillboard(key, size);
    const container = this.add.container(screenPos.x, screenPos.y, [body]);
    const shadow = this.makeShadow(size.width * 0.7);
    const entity: Entity = {
      unit,
      container,
      body,
      shadow,
      heightPx: MINION_HEIGHT_PX,
      stunned: 0,
      rift,
      path: laneWaypoints(lane, team).map(toScreen),
      minionType: type,
    };
    this.attachHpBar(entity, size.height + 6);
    this.minions.push(entity);
    this.allEntities.push(entity);
  }

  // ---- Update helpers ------------------------------------------------------

  private regenAndTick(dt: number) {
    for (const e of this.allEntities) {
      if (e.stunned > 0) e.stunned = Math.max(0, e.stunned - dt);
      advanceAttackCooldown(e.unit, dt);
    }
    if (!this.player.unit.dead) {
      applyHeal(this.player.unit, this.playerChampion.stats.hpRegen * dt);
      if (this.inBase(this.player.unit, 'ally')) {
        applyHeal(this.player.unit, this.player.unit.maxHp * 0.08 * dt);
        this.playerResource = Math.min(this.playerMaxResource, this.playerResource + this.playerMaxResource * 0.08 * dt);
      }
    }
    // Every AI champion regenerates from its own champion's base regen, plus a
    // strong fountain heal when it is home (so respawned bots top up and push).
    for (const c of this.champions) {
      if (!c.bot || c.unit.dead) continue;
      applyHeal(c.unit, c.bot.champion.stats.hpRegen * dt);
      if (this.inBase(c.unit, c.bot.side)) {
        applyHeal(c.unit, c.unit.maxHp * 0.08 * dt);
        c.bot.resource = Math.min(c.bot.maxResource, c.bot.resource + c.bot.maxResource * 0.08 * dt);
      }
    }
  }

  private updatePlayerMovement(dt: number) {
    const u = this.player.unit;
    if (u.dead) {
      this.respawnIfNeeded(this.player, 'ally', dt);
      return;
    }
    if (this.player.stunned > 0) return;

    // Movement is click-to-move only (LoL-style): walk toward the last clicked
    // world point. WASD is intentionally gone so Q/W/E/R stay unambiguous casts.
    if (this.moveTarget) {
      const d = distance(u.pos, this.moveTarget);
      if (d < 4) {
        this.moveTarget = null;
      } else {
        const travel = Math.min(d, u.moveSpeed * dt);
        u.pos.x += ((this.moveTarget.x - u.pos.x) / d) * travel;
        u.pos.y += ((this.moveTarget.y - u.pos.y) / d) * travel;
      }
    }

    const target = this.findTarget(u, u.attackRange, true);
    if (target) this.tryBasicAttack(this.player, target);
  }

  /**
   * Drive one AI champion for a tick: find its nearest enemy, build a per-bot
   * {@link AiSnapshot}, decide via the pure {@link decideAction}, and apply the
   * intent through the SAME combat/ability/movement paths the human uses. When
   * the bot has no target it marches its assigned lane's waypoints toward the
   * enemy nexus so champions actually push lanes instead of standing still.
   */
  private updateBotChampion(bot: Entity, dt: number) {
    const u = bot.unit;
    const state = bot.bot!;
    if (u.dead) {
      this.respawnIfNeeded(bot, state.side, dt);
      return;
    }
    if (bot.stunned > 0) return;

    const target = this.findTarget(u, 1200 * SCALE, true);
    const snapshot = this.buildAiSnapshot(bot, target);
    const intent = decideAction(snapshot);
    const homeBase = toScreen(BASE_POSITIONS[state.side]);

    switch (intent) {
      case 'approach': {
        if (target) {
          this.moveUnitToward(u, target.pos, dt);
        } else {
          const goal = this.laneAdvanceGoal(state);
          this.moveUnitToward(u, goal, dt);
          // Advance to the next lane waypoint once this one is reached so the
          // bot keeps marching toward the enemy nexus.
          if (
            state.pushIndex < state.pushPath.length - 1 &&
            distance(u.pos, goal) <= 30 * SCALE
          ) {
            state.pushIndex += 1;
          }
        }
        break;
      }
      case 'retreat': {
        this.moveUnitToward(u, homeBase, dt);
        break;
      }
      case 'attack': {
        if (target) this.tryBasicAttack(bot, target);
        break;
      }
      case 'castQ':
      case 'castW':
      case 'castE':
      case 'castR': {
        const slot = intent.slice(4) as CooldownKey;
        const ability = this.abilityBySlot(state.champion, slot);
        const aim =
          ability.behavior === 'heal' || ability.behavior === 'buff'
            ? { ...u.pos }
            : target?.pos;
        if (aim) this.botCast(bot, slot, aim);
        break;
      }
    }
  }

  /**
   * The next lane waypoint a bot should walk toward while pushing. Advances the
   * bot's cached push index as it reaches each waypoint so it marches down its
   * lane toward the enemy nexus. Returns the final waypoint once the lane is
   * fully walked. No per-frame allocation beyond reading the cached path.
   */
  private laneAdvanceGoal(state: BotState): Vec2 {
    const path = state.pushPath;
    if (path.length === 0) return toScreen(BASE_POSITIONS[state.side]);
    // (path is authored ally->enemy; laneWaypoints already reversed for enemy).
    return path[Math.min(state.pushIndex, path.length - 1)];
  }

  private buildAiSnapshot(bot: Entity, target: Unit | undefined): AiSnapshot {
    const u = bot.unit;
    const state = bot.bot!;
    const dist = target ? distance(u.pos, target.pos) : Infinity;
    const [q, w, e, r] = state.champion.abilities;
    return {
      selfHpPct: u.hp / u.maxHp,
      selfResourcePct: state.resource / state.maxResource,
      distanceToTarget: dist,
      hasTarget: !!target,
      attackRange: u.attackRange,
      cooldowns: state.cds,
      abilityRanges: {
        Q: q.range * SCALE,
        W: w.range * SCALE,
        E: e.range * SCALE,
        R: r.range * SCALE,
      },
      abilityCosts: { Q: q.cost, W: w.cost, E: e.cost, R: r.cost },
      abilityBehaviors: { Q: q.behavior, W: w.behavior, E: e.behavior, R: r.behavior },
      maxResource: state.maxResource,
      targetLowHp: target ? target.hp / target.maxHp < 0.35 : false,
    };
  }

  private updateMinions(dt: number) {
    for (const m of this.minions) {
      const u = m.unit;
      if (u.dead || !m.rift || !m.path) continue;
      const target = this.findTarget(u, 200 * SCALE);
      if (target && distance(u.pos, target.pos) <= u.attackRange) {
        this.tryBasicAttackUnit(m, target);
      } else {
        // Route movement through the tested advanceMinion helper (in world
        // units), then mirror the result onto the screen position.
        const worldPath = laneWaypoints(m.rift.lane, u.team);
        const worldDt = dt; // advanceMinion uses world-unit speeds internally.
        const res = advanceMinion(m.rift, worldPath, worldDt);
        m.rift.pos = res.pos;
        m.rift.waypointIndex = res.waypointIndex;
        m.rift.distanceTravelled = res.distanceTravelled;
        const screen = toScreen(res.pos);
        u.pos.x = screen.x;
        u.pos.y = screen.y;
      }
    }
  }

  private updateTurret(turret: Entity) {
    const u = turret.unit;
    if (u.dead) return;
    const target = nearestTargetableEnemy(
      u,
      this.livingSnapshot.units,
      this.structureLines,
      this.livingSnapshot.ids,
      u.attackRange,
    );
    if (target && canBasicAttack(u)) {
      const res = applyDamage(target, u.ad);
      this.registerKill(u, target, res.lethal);
      this.onDamage(this.entityForUnit(target), target.pos, res.dealt, 0xffcc55, res.lethal, {
        fromPos: u.pos,
        attacker: u,
      });
      this.drawBeam(u.pos, target.pos, 0xffcc55);
      resetAttackCooldown(u);
    }
  }

  // ---- Combat actions ------------------------------------------------------

  private tryBasicAttack(attacker: Entity, target: Unit) {
    this.tryBasicAttackUnit(attacker, target);
  }

  private tryBasicAttackUnit(attacker: Entity, target: Unit) {
    const u = attacker.unit;
    if (!canBasicAttack(u) || target.dead) return;
    if (distance(u.pos, target.pos) > u.attackRange) return;
    let ad = u.ad;
    // Red buff adds flat on-hit damage for the player.
    if (attacker === this.player && this.playerBuffs.buffs.some((b) => b.kind === 'red')) {
      ad += BUFF_EFFECTS.red.bonusDamage;
    }
    const res = applyDamage(target, ad);
    if (attacker === this.player) this.stats.damageDealt += res.dealt;
    this.registerKill(u, target, res.lethal);
    this.onDamage(this.entityForUnit(target), target.pos, res.dealt, 0xf0e6d2, res.lethal, {
      fromPos: u.pos,
      attacker: u,
    });
    if (u.attackRange > 220 * SCALE) this.drawProjectile(u.pos, target.pos, 0xf0e6d2);
    resetAttackCooldown(u);
  }

  private tryPlayerCast(slot: CooldownKey) {
    if (this.ended || this.player.unit.dead || this.player.stunned > 0) return;
    const pointer = this.input.activePointer;
    // Aim is taken from the pointer, re-mapped through the projection to the
    // flat gameplay plane so cursor-aimed abilities land where intended.
    const aim = this.pointerToGround(pointer);
    this.castAbility(this.player, slot, aim, this.playerChampion, this.playerCds, () => {
      const cost = this.abilityBySlot(this.playerChampion, slot).cost;
      if (this.playerResource < cost || this.playerCds[slot] > 0) return false;
      this.playerResource -= cost;
      return true;
    }, true);
  }

  private botCast(bot: Entity, slot: CooldownKey, aim: Vec2) {
    const state = bot.bot!;
    this.castAbility(bot, slot, aim, state.champion, state.cds, () => {
      const cost = this.abilityBySlot(state.champion, slot).cost;
      if (state.resource < cost || state.cds[slot] > 0) return false;
      state.resource -= cost;
      return true;
    }, false);
  }

  private abilityBySlot(champion: Champion, slot: CooldownKey): Ability {
    const map: Record<CooldownKey, Ability> = {
      Q: champion.abilities[0],
      W: champion.abilities[1],
      E: champion.abilities[2],
      R: champion.abilities[3],
    };
    return map[slot];
  }

  private cooldownFor(champion: Champion, slot: CooldownKey, side: MapSide): number {
    const base = this.abilityBySlot(champion, slot).cooldown;
    // Blue buff + item CDR reduce cooldowns for the player.
    if (side !== 'ally') return base;
    let cdr = totalModifiers(this.ownedItems).cooldownReduction;
    if (this.playerBuffs.buffs.some((b) => b.kind === 'blue')) cdr += BUFF_EFFECTS.blue.cooldownReduction;
    return base * (1 - Math.min(0.5, cdr));
  }

  private castAbility(
    caster: Entity,
    slot: CooldownKey,
    aim: Vec2,
    champion: Champion,
    cds: CooldownState,
    spend: () => boolean,
    isPlayer: boolean,
  ) {
    const ability = this.abilityBySlot(champion, slot);
    if (!spend()) return;
    startCooldown(cds, slot, this.cooldownFor(champion, slot, isPlayer ? 'ally' : 'enemy'));
    const effect = resolveAbility(ability);
    const color = Phaser.Display.Color.HexStringToColor(champion.accentColor).color;
    const origin = { ...caster.unit.pos };

    audio.play(slot === 'R' ? 'ability' : 'cast');
    this.castFlare(caster, color, slot === 'R');

    const dir = this.clampAim(origin, aim, ability.range * SCALE);

    if (effect.dashes) {
      caster.unit.pos.x = this.clampX(dir.x);
      caster.unit.pos.y = this.clampY(dir.y);
      this.drawDashTrail(origin, caster.unit.pos, color);
    }
    if (effect.heal > 0) {
      const healed = applyHeal(caster.unit, effect.heal);
      this.floatingDamage(caster.unit.pos, healed, 0x3ad16a, '+');
      // Cosmetic SVG heal sparkle over the healed caster.
      this.pulse(caster.container, 0x3ad16a);
    }
    if (effect.buffDuration > 0 && effect.damage === 0 && effect.heal === 0) {
      this.pulse(caster.container, color);
    }
    if (effect.damage > 0) {
      const center = dir;
      const hitRadius = effect.area ? effect.radius * SCALE : effect.dashes ? 40 : 34;
      if (effect.area) this.drawAoe(center, hitRadius, color);
      else if (!effect.dashes) this.drawProjectile(origin, center, color);

      for (const e of this.allEntities) {
        if (e.unit.dead || e.unit.team === caster.unit.team) continue;
        if (distance(e.unit.pos, center) <= hitRadius) {
          const res = applyDamage(e.unit, effect.damage);
          if (isPlayer) this.stats.damageDealt += res.dealt;
          this.registerKill(caster.unit, e.unit, res.lethal);
          this.onDamage(e, e.unit.pos, res.dealt, color, res.lethal, {
            fromPos: caster.unit.pos,
            ability: true,
            ult: slot === 'R',
            attacker: caster.unit,
          });
          if (effect.stunDuration > 0) {
            e.stunned = effect.stunDuration;
            this.stunSpin(e, color);
          }
          if (!effect.area) break;
        }
      }
    }
  }

  private clampAim(origin: Vec2, aim: Vec2, range: number): Vec2 {
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d <= range) return { x: aim.x, y: aim.y };
    return { x: origin.x + (dx / d) * range, y: origin.y + (dy / d) * range };
  }

  private clampX(x: number): number {
    return Phaser.Math.Clamp(x, OFF_X, OFF_X + WORLD_SIZE * SCALE);
  }

  private clampY(y: number): number {
    return Phaser.Math.Clamp(y, OFF_Y, OFF_Y + WORLD_SIZE * SCALE);
  }

  private moveUnitToward(u: Unit, goal: Vec2, dt: number) {
    const d = distance(u.pos, goal);
    if (d < 1) return;
    const travel = Math.min(d, u.moveSpeed * dt);
    u.pos.x = this.clampX(u.pos.x + ((goal.x - u.pos.x) / d) * travel);
    u.pos.y = this.clampY(u.pos.y + ((goal.y - u.pos.y) / d) * travel);
  }

  private respawnIfNeeded(entity: Entity, side: MapSide, _dt: number) {
    if (!entity.container.getData('respawnAt')) {
      const level = entity === this.player
        ? this.playerProgress.level
        : entity.bot
          ? entity.bot.progress.level
          : 1;
      entity.container.setData('respawnAt', this.elapsed + Math.min(50, 6 + level * 2.5));
      entity.container.setVisible(false);
    } else if (this.elapsed >= entity.container.getData('respawnAt')) {
      entity.container.setData('respawnAt', 0);
      entity.unit.dead = false;
      entity.unit.hp = entity.unit.maxHp;
      entity.unit.pos = { ...toScreen(BASE_POSITIONS[side]) };
      entity.container.setVisible(true);
      // Restart the bot's lane march from home so it pushes out again.
      if (entity.bot) entity.bot.pushIndex = 0;
    }
  }

  private registerKill(source: Unit, target: Unit, lethal: boolean) {
    if (!lethal) return;
    // Track inhibitor destruction for super-minion spawning.
    if (target.kind === 'turret' && target.id.endsWith('-inhibitor')) {
      this.inhibitorKillTimes.set(target.id, this.elapsed);
    }
    // Award gold/XP to the champion that landed the kill (its OWN progress).
    // The human uses the scene's playerProgress; each bot uses its own. Kills by
    // structures/minions have no champion progress to award, but still tick the
    // human's stats when the human is the source.
    const killer = this.entityForUnit(source);
    const progress = source.id === 'player'
      ? this.playerProgress
      : killer?.bot?.progress ?? null;
    if (target.kind === 'minion') {
      const type = (this.entityForUnit(target)?.minionType ?? 'melee') as MinionType;
      const b = minionBounty(type);
      if (progress) {
        addGold(progress, b.gold);
        addXp(progress, b.xp);
      }
      if (source.id === 'player') this.stats.minionKills += 1;
    } else if (target.kind === 'champion') {
      if (progress) {
        addGold(progress, CHAMPION_TAKEDOWN_BOUNTY.gold);
        addXp(progress, CHAMPION_TAKEDOWN_BOUNTY.xp);
      }
      if (source.id === 'player') this.stats.championKills += 1;
    }
    // Recompute the killer's stats from its updated level/progression.
    if (source.id === 'player') this.applyChampionStats(this.player, 'ally');
    else if (killer?.bot) this.applyChampionStats(killer, killer.bot.side);
  }

  // ---- Targeting -----------------------------------------------------------

  /**
   * Rebuild the per-frame {@link livingSnapshot} (living `Unit[]` + id `Set`)
   * from the current entities. Called once per frame from {@link update} so all
   * targeting in that frame shares one snapshot instead of each caller
   * allocating its own.
   */
  private refreshLivingSnapshot() {
    const units: Unit[] = [];
    const ids = new Set<string>();
    for (const e of this.allEntities) {
      if (!e.unit.dead) {
        units.push(e.unit);
        ids.add(e.unit.id);
      }
    }
    this.livingSnapshot = { units, ids };
  }

  private findTarget(u: Unit, maxRange: number, preferStructures = false): Unit | undefined {
    // Structure gating: use the per-frame living set and only allow a structure
    // to be targeted when the pure rule permits it.
    const living = this.livingSnapshot.ids;
    const candidates = this.livingSnapshot.units.filter((c) => {
      if (c.team === u.team) return false;
      if (c.kind === 'turret' || c.kind === 'nexus') {
        return isStructureTargetable(c.id, living);
      }
      return true;
    });
    return nearestTargetableEnemy(
      u,
      candidates,
      this.structureLines,
      living,
      maxRange,
      preferStructures,
    );
  }

  // ---- Visuals -------------------------------------------------------------

  private syncVisuals() {
    for (const e of this.allEntities) {
      // Project the entity's flat ground pixel to its on-screen dimetric point.
      const ground = project(e.unit.pos);
      // Ground shadow sits on the floor at the projected point.
      if (e.shadow) {
        e.shadow.setPosition(ground.x, ground.y);
        e.shadow.setDepth(depthForPixel(e.unit.pos) + DEPTH_SHADOW_BIAS);
        e.shadow.setVisible(e.container.visible);
      }
      // Billboard is lifted up by its height so it reads as standing, and
      // depth-sorted by its projected ground point (+ tiny height tie-break).
      e.container.setPosition(ground.x, ground.y - e.heightPx);
      e.container.setDepth(depthForPixel(e.unit.pos, e.heightPx));
      if (e.hpBar) {
        const full = e.hpBar.getData('width') as number;
        const pct = Phaser.Math.Clamp(e.unit.hp / e.unit.maxHp, 0, 1);
        e.hpBar.width = full * pct;
        e.hpBar.x = -(full * (1 - pct)) / 2;
        e.hpBar.fillColor = pct > 0.5 ? 0x3ad16a : pct > 0.25 ? 0xf0c000 : 0xd13a3a;
      }
      if (e.unit.dead && e.unit.kind === 'minion' && e.container.active) {
        e.shadow?.destroy();
        e.container.destroy();
      }
      if (e.unit.dead && (e.unit.kind === 'turret' || e.unit.kind === 'nexus') && e.container.visible) {
        e.container.setAlpha(0.25);
        e.shadow?.setAlpha(0.12);
      }
    }
    this.minions = this.minions.filter((m) => !(m.unit.dead && !m.container.active));
    this.allEntities = this.allEntities.filter(
      (e) => e.container.active || !e.unit.dead || e.unit.kind !== 'minion',
    );
  }

  private floatingDamage(
    rawPos: Vec2,
    amount: number,
    color: number,
    prefix = '',
    importance: HitImportance = 'normal',
  ) {
    if (amount <= 0) return;
    const pos = project(rawPos);
    const style = popupStyleForHit(importance);
    // Heavy hits get a hot near-white core so they punch through the accent
    // color and read as clearly bigger than chip damage.
    const shown = style.heavy ? 0xfff3c0 : color;
    const jitter = (Math.random() * 2 - 1) * style.jitter;
    const text = this.add.text(pos.x + jitter, pos.y - 18, `${prefix}${amount}`, {
      fontFamily: 'Noto Sans KR, sans-serif',
      fontSize: `${style.fontSize}px`,
      color: `#${shown.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#101018',
      strokeThickness: style.heavy ? 3 : 2,
      resolution: 2,
    });
    text.setOrigin(0.5);
    text.setScale(0.4);
    text.setDepth(VFX_DEPTH);
    // Punchy Back.easeOut pop up to the importance-scaled peak, then settle.
    this.tweens.add({
      targets: text,
      scale: style.pop,
      duration: 130,
      ease: 'Back.easeOut',
      yoyo: false,
    });
    this.tweens.add({
      targets: text,
      y: pos.y - (style.heavy ? 56 : 44),
      alpha: 0,
      duration: style.heavy ? 720 : 620,
      delay: 90,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private hitFlash(entity: Entity, importance: HitImportance = 'normal') {
    if (!entity.container.active) return;
    const img = entity.body;
    img.setTintFill(0xffffff);
    // Bigger hits flash a touch longer so the impact reads as heavier.
    const dur = importance === 'big' ? 110 : importance === 'chip' ? 55 : 80;
    this.time.delayedCall(dur, () => {
      if (img.active) img.clearTint();
    });
  }

  private shake(intensity: number, duration = 160) {
    if (intensity <= 0 || duration <= 0) return;
    // Ceiling lowered well below the old 0.03 so even a legitimate on-screen
    // shake is a gentle bump, never a lurch. Matches juice.MAX_SHAKE_INTENSITY.
    this.cameras.main.shake(duration, Phaser.Math.Clamp(intensity, 0.002, MAX_SHAKE_INTENSITY));
    this.lastShakeAt = this.time.now;
  }

  /**
   * Guarded entry point for ALL camera shake. A shake only fires when the pure
   * {@link shouldShake} policy allows it: it must have real magnitude, be
   * PERCEIVABLE by the player (the player champion is attacker/victim, or the
   * hit is inside the camera's visible {@link Phaser.Cameras.Scene2D.Camera.worldView}),
   * and pass the throttle (no new shake within {@link SHAKE_MIN_INTERVAL_MS}
   * unless strictly stronger, and never restart a shake weaker than the one
   * currently playing). This is what keeps off-screen bot fights and rapid hits
   * from turning the camera into a permanent tremor. `worldPos` is the flat
   * gameplay-plane position of the hit; we project it into the same screen space
   * the camera scrolls over to test on-screen. Purely cosmetic.
   */
  private tryShake(spec: ShakeSpec, worldPos: Vec2, involvesPlayer: boolean) {
    if (spec.intensity <= 0 || spec.duration <= 0) return;
    const cam = this.cameras.main;
    const screen = project(worldPos);
    const onScreen = cam.worldView.contains(screen.x, screen.y);
    const effect = cam.shakeEffect;
    const running = effect.isRunning;
    // Shake.intensity is a Vector2 (per-axis); we drive both axes equally so x
    // is representative of the currently-playing magnitude.
    const runningIntensity = running ? effect.intensity.x : 0;
    if (
      !shouldShake({
        intensity: spec.intensity,
        involvesPlayer,
        onScreen,
        sinceLastMs: this.time.now - this.lastShakeAt,
        running,
        runningIntensity,
      })
    ) {
      return;
    }
    this.shake(spec.intensity, spec.duration);
  }

  /**
   * Central hit hook: fires ALL combat juice for one damaging blow. Everything
   * here is cosmetic (tweens / camera / timers / transient VFX) and NEVER writes
   * `unit.pos` or any simulation timer, so it cannot perturb the deterministic
   * `update()` step. `fromPos` (the attacker's flat position) is used only to
   * pick a visual knockback DIRECTION.
   */
  private onDamage(
    target: Entity | undefined,
    pos: Vec2,
    amount: number,
    color: number,
    lethal: boolean,
    opts: { fromPos?: Vec2; ability?: boolean; ult?: boolean; attacker?: Unit } = {},
  ) {
    const fraction = target ? amount / target.unit.maxHp : 0;
    const importance = classifyHit({ fraction, ability: opts.ability, ult: opts.ult, lethal });
    // Does the player's champion feel this hit (as attacker or victim)? Used to
    // decide whether camera shake / kill slow-mo may fire even when off-screen.
    const playerUnit = this.player?.unit;
    const involvesPlayer =
      !!playerUnit &&
      ((target?.unit === playerUnit) || (opts.attacker !== undefined && opts.attacker === playerUnit));

    this.floatingDamage(pos, amount, color, '', importance);
    if (target) {
      this.hitFlash(target, importance);
      this.squashStretch(target, importance);
      this.knockback(target, opts.fromPos ?? pos, importance);
    }
    this.impactSparks(pos, color, importance);
    audio.play('hit');

    if (lethal) {
      audio.play('death');
      if (target) this.deathBurst(target, color);
      // Kill slow-mo is a rare, dramatic beat: only the player's own takedowns
      // or the player's death earn it, never the many bot-vs-bot deaths that
      // happen constantly across a 5v5 map.
      if (target && target.unit.kind === 'champion' && involvesPlayer) this.killSlowMo();
    }

    // Camera shake only for combat the player can perceive, throttled and
    // magnitude-capped via tryShake so constant/off-screen fighting can never
    // turn the camera into a permanent tremor. Chip and normal (autoattack)
    // hits produce a zero-intensity spec and are dropped inside tryShake.
    if (target && (target.unit.kind === 'champion' || lethal)) {
      this.tryShake(shakeForHit(importance, fraction), pos, involvesPlayer);
    }
    if (lethal && target && (target.unit.kind === 'turret' || target.unit.kind === 'nexus')) {
      this.tryShake(structureDestructionShake(), pos, involvesPlayer);
    }
  }

  /**
   * Short-lived burst of small pixel-block sparks at the projected hit point,
   * tinted by the attack color. Bigger/lethal hits throw more sparks. Pinned to
   * {@link VFX_DEPTH}; each spark tweens out then destroys itself.
   */
  private impactSparks(rawPos: Vec2, color: number, importance: HitImportance) {
    const p = project(rawPos);
    // COUNT stays driven by the pure juice math so this remains cosmetic and
    // matches sparkCountForHit exactly; only the LOOK is upgraded to baked SVG
    // shard bursts (cached by color) instead of plain rectangles.
    const count = sparkCountForHit(importance);
    const spread = importance === 'big' ? 26 : importance === 'ult' ? 22 : 16;
    const size = importance === 'big' ? 12 : importance === 'chip' ? 6 : 9;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const dist = spread * (0.5 + Math.random() * 0.6);
      const spark = this.vfxImage('impact', i % 3 === 0 ? 0xffffff : color, p.x, p.y - 6, size);
      this.tweens.add({
        targets: spark,
        x: p.x + Math.cos(angle) * dist,
        y: p.y - 6 + Math.sin(angle) * dist * 0.6,
        alpha: 0,
        scaleX: spark.scaleX * 0.2,
        scaleY: spark.scaleY * 0.2,
        duration: 220 + Math.random() * 160,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * VISUAL-ONLY recoil: nudge the struck billboard's rendered body a few px away
   * from its attacker, then tween it back. Applied to the sprite image's local
   * offset INSIDE the container, so the container position (driven every frame
   * from `unit.pos` in {@link syncVisuals}) is never fought over and the
   * simulation's `unit.pos` is untouched.
   */
  private knockback(target: Entity, rawFrom: Vec2, importance: HitImportance) {
    if (!target.container.active) return;
    const img = target.body;
    const dir = knockbackDir(project(rawFrom), project(target.unit.pos));
    const dist = knockbackForHit(importance);
    // Kill any in-flight recoil so rapid hits do not compound the offset.
    this.tweens.killTweensOf(img);
    const baseX = 0;
    const baseY = 0;
    img.x = baseX + dir.x * dist;
    img.y = baseY + dir.y * dist;
    this.tweens.add({
      targets: img,
      x: baseX,
      y: baseY,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Quick squash-and-stretch on the struck sprite: a brief vertical squash that
   * springs back to scale 1. Purely a scale tween on the body image; auto-
   * returns so it can never leave the sprite deformed.
   */
  private squashStretch(target: Entity, importance: HitImportance) {
    if (!target.container.active) return;
    // Applied to the CONTAINER scale (not the body image) so it never collides
    // with the body-image knockback tween; syncVisuals only sets container
    // position/depth, never scale, so this is safe to own here.
    const c = target.container;
    const amt = importance === 'big' ? 0.28 : importance === 'chip' ? 0.1 : 0.18;
    this.tweens.killTweensOf(c);
    this.tweens.add({
      targets: c,
      scaleX: 1 + amt,
      scaleY: 1 - amt,
      duration: 70,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        if (c.active) c.setScale(1);
      },
    });
  }

  /**
   * Brief, DETERMINISM-SAFE slow-mo on a champion kill. We slow ONLY the tween
   * and animation timeScales (cosmetic layers) and add a short camera flash;
   * the simulation keeps stepping on the real `deltaMs` in {@link update}, so
   * cooldowns, waves, objectives, economy and win/lose are untouched. A one-shot
   * real-time timer restores the tween timeScale, and re-entrancy is guarded so
   * multiple kills in a row cannot stack or strand the scene slowed.
   */
  private killSlowMo() {
    if (this.slowMoActive) return;
    this.slowMoActive = true;
    this.tweens.timeScale = 0.35;
    this.cameras.main.flash(120, 255, 255, 255, false);
    // Real-time timer: NOT affected by tweens.timeScale, so it always restores.
    this.time.delayedCall(160, () => {
      this.tweens.timeScale = 1;
      this.slowMoActive = false;
    });
  }

  /**
   * Create a transient VFX billboard from a baked SVG texture (rasterized once
   * and cached by kind+color via {@link SpriteFactory.ensureVfx}). Returns the
   * Image already placed at (x, y), centered, pinned to {@link VFX_DEPTH} and
   * scaled to `displayW` on-screen pixels (height follows the texture aspect,
   * or is overridden by `displayH`). Callers tween it and destroy it, exactly
   * as with the old primitive VFX. Kept COSMETIC-ONLY.
   */
  private vfxImage(
    kind: VfxKind,
    color: number,
    x: number,
    y: number,
    displayW: number,
    displayH?: number,
  ): Phaser.GameObjects.Image {
    const { key, size } = this.sprites.ensureVfx(kind, color);
    const img = this.add.image(x, y, key);
    img.setOrigin(0.5, 0.5);
    img.setDisplaySize(displayW, displayH ?? displayW * (size.height / size.width));
    img.setDepth(VFX_DEPTH);
    return img;
  }

  private deathBurst(entity: Entity, color: number) {
    const p = project(entity.unit.pos);
    const burst = this.vfxImage('death', color, p.x, p.y, 26);
    this.tweens.add({
      targets: burst,
      scale: burst.scale * 2.2,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
  }

  private entityForUnit(unit: Unit): Entity | undefined {
    return this.allEntities.find((e) => e.unit === unit);
  }

  private drawProjectile(rawFrom: Vec2, rawTo: Vec2, color: number) {
    const from = project(rawFrom);
    const to = project(rawTo);
    const fy = from.y - CHAMPION_HEIGHT_PX * 0.5;
    const ty = to.y - CHAMPION_HEIGHT_PX * 0.5;
    // A glowing SVG orb-with-trail Image, rotated to face its travel direction
    // (the art points +x), tweened from->to over the same 180ms.
    const bolt = this.vfxImage('projectile', color, from.x, fy, 22);
    bolt.setRotation(Math.atan2(ty - fy, to.x - from.x));
    this.tweens.add({
      targets: bolt,
      x: to.x,
      y: ty,
      duration: 180,
      onComplete: () => bolt.destroy(),
    });
  }

  private drawBeam(rawFrom: Vec2, rawTo: Vec2, color: number) {
    const from = project(rawFrom);
    const to = project(rawTo);
    const fx = from.x;
    const fy = from.y - TURRET_HEIGHT_PX * 0.5;
    const tx = to.x;
    const ty = to.y - CHAMPION_HEIGHT_PX * 0.5;
    // A tapered SVG streak stretched to span from->to, anchored at the source
    // and rotated toward the target, fading over the same ~200ms.
    const len = Math.max(6, Math.hypot(tx - fx, ty - fy));
    const { key } = this.sprites.ensureVfx('beam', color);
    const beam = this.add.image(fx, fy, key);
    beam.setOrigin(0, 0.5);
    beam.setDisplaySize(len, 8);
    beam.setRotation(Math.atan2(ty - fy, tx - fx));
    beam.setDepth(VFX_DEPTH);
    this.tweens.add({ targets: beam, alpha: 0, duration: 200, onComplete: () => beam.destroy() });
  }

  /**
   * Draw an ability AoE as a PROJECTED ground ellipse (a dimetric "circle" on
   * the floor plane) so the ability's reach reads correctly in the 2.5D view.
   * `radius` is in flat gameplay pixels; we sample the projected extents to get
   * the on-screen ellipse width/height.
   */
  private drawAoe(rawCenter: Vec2, radius: number, color: number) {
    const center = project(rawCenter);
    // Project the flat-space radius onto screen axes: the dimetric transform
    // squashes Y to ~half, so sample right/down offsets to size the ellipse.
    const right = project({ x: rawCenter.x + radius, y: rawCenter.y });
    const down = project({ x: rawCenter.x, y: rawCenter.y + radius });
    const rx = Math.hypot(right.x - center.x, right.y - center.y);
    const ry = Math.hypot(down.x - center.x, down.y - center.y);
    // Overlay a baked SVG telegraph-ring texture squashed to the SAME rx/ry so
    // the ability reach still reads correctly in the dimetric view. The ring
    // texture is a square viewBox, so display width = 2*rx, height = 2*ry.
    const { key } = this.sprites.ensureVfx('aoeRing', color);
    const ring = this.add.image(center.x, center.y, key);
    ring.setOrigin(0.5, 0.5);
    ring.setDisplaySize(Math.max(6, rx * 2), Math.max(4, ry * 2));
    ring.setDepth(VFX_DEPTH);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: ring.scaleX * 1.12,
      scaleY: ring.scaleY * 1.12,
      duration: 400,
      onComplete: () => ring.destroy(),
    });
  }

  private drawDashTrail(rawFrom: Vec2, rawTo: Vec2, color: number) {
    const from = project(rawFrom);
    const to = project(rawTo);
    const fx = from.x;
    const fy = from.y - CHAMPION_HEIGHT_PX * 0.5;
    const tx = to.x;
    const ty = to.y - CHAMPION_HEIGHT_PX * 0.5;
    // A thick SVG streak spanning the dash path, fading over the same ~280ms.
    const len = Math.max(6, Math.hypot(tx - fx, ty - fy));
    const { key } = this.sprites.ensureVfx('beam', color);
    const streak = this.add.image(fx, fy, key);
    streak.setOrigin(0, 0.5);
    streak.setDisplaySize(len, 14);
    streak.setRotation(Math.atan2(ty - fy, tx - fx));
    streak.setAlpha(0.8);
    streak.setDepth(VFX_DEPTH);
    this.tweens.add({ targets: streak, alpha: 0, duration: 280, onComplete: () => streak.destroy() });
  }

  private pulse(container: Phaser.GameObjects.Container, color: number) {
    // A soft SVG heal sparkle expanding and fading over the same ~380ms.
    const ring = this.vfxImage('heal', color, container.x, container.y, 36);
    ring.setAlpha(0.9);
    this.tweens.add({
      targets: ring,
      scaleX: ring.scaleX * 1.6,
      scaleY: ring.scaleY * 1.6,
      alpha: 0,
      duration: 380,
      onComplete: () => ring.destroy(),
    });
  }

  private castFlare(caster: Entity, color: number, ultimate: boolean) {
    const p = project(caster.unit.pos);
    const y = p.y - caster.heightPx * 0.5;
    // A radiant SVG burst; ultimates flare larger and add the camera shake.
    const flare = this.vfxImage('castFlare', color, p.x, y, ultimate ? 30 : 22);
    flare.setAlpha(0.95);
    this.tweens.add({
      targets: flare,
      scaleX: flare.scaleX * (ultimate ? 2.6 : 1.8),
      scaleY: flare.scaleY * (ultimate ? 2.6 : 1.8),
      alpha: 0,
      duration: ultimate ? 500 : 300,
      ease: 'Cubic.easeOut',
      onComplete: () => flare.destroy(),
    });
    // Ult cast bump: gated/throttled like every other shake so the ten bots
    // ulting around the map cannot rattle the player's camera. Only the
    // player's own ult, or one cast on-screen, gives a subtle bump.
    if (ultimate) {
      this.tryShake(
        { intensity: 0.006, duration: 150 },
        caster.unit.pos,
        caster.unit === this.player?.unit,
      );
    }
  }

  private stunSpin(entity: Entity, color: number) {
    const p = project(entity.unit.pos);
    // SVG orbiting-stars sprite spinning above the entity over the same ~600ms.
    const stars = this.vfxImage('stun', color, p.x, p.y - entity.heightPx - 8, 24);
    this.tweens.add({
      targets: stars,
      angle: 360,
      alpha: 0,
      duration: 600,
      onComplete: () => stars.destroy(),
    });
  }

  // ---- HUD + win/lose ------------------------------------------------------

  private structureStatus(side: MapSide) {
    let turrets = 0;
    let turretsMax = 0;
    let inhibitors = 0;
    let inhibitorsMax = 0;
    for (const s of this.structures) {
      if (s.unit.team !== side || !s.node) continue;
      const kind = s.node.kind;
      if (kind.endsWith('Turret')) {
        turretsMax += 1;
        if (!s.unit.dead) turrets += 1;
      } else if (kind === 'inhibitor') {
        inhibitorsMax += 1;
        // Inhibitors "respawn" per the pure rule; treat as alive if respawned.
        const killedAt = this.inhibitorKillTimes.get(s.node.id) ?? null;
        if (isInhibitorAlive(this.elapsed, killedAt) && !s.unit.dead) inhibitors += 1;
      }
    }
    const nexus = side === 'ally' ? this.allyNexus : this.enemyNexus;
    return {
      turrets,
      turretsMax,
      inhibitors,
      inhibitorsMax,
      nexusPct: nexus ? nexus.unit.hp / nexus.unit.maxHp : 1,
    };
  }

  private buildMinimap() {
    const blips = this.allEntities
      .filter((e) => !e.unit.dead && e.container.visible)
      .map((e) => ({
        id: e.unit.id,
        x: Phaser.Math.Clamp((e.unit.pos.x - OFF_X) / (WORLD_SIZE * SCALE), 0, 1),
        y: Phaser.Math.Clamp((e.unit.pos.y - OFF_Y) / (WORLD_SIZE * SCALE), 0, 1),
        kind: e.unit.kind,
        team: e.unit.team as 'ally' | 'enemy',
      }));
    return blips;
  }

  private pushHud() {
    const slots: CooldownKey[] = ['Q', 'W', 'E', 'R'];
    const xpPct = this.xpProgressPct();
    battleStore.set({
      mode: this.mode,
      playerChampionId: this.playerChampion.id,
      enemyChampionId: this.enemyChampion.id,
      playerHp: Math.round(this.player.unit.hp),
      playerMaxHp: Math.round(this.player.unit.maxHp),
      playerResource: Math.round(this.playerResource),
      playerMaxResource: Math.round(this.playerMaxResource),
      enemyHp: Math.round(this.enemy.unit.hp),
      enemyMaxHp: Math.round(this.enemy.unit.maxHp),
      allyNexusPct: this.allyNexus ? this.allyNexus.unit.hp / this.allyNexus.unit.maxHp : 1,
      enemyNexusPct: this.enemyNexus ? this.enemyNexus.unit.hp / this.enemyNexus.unit.maxHp : 1,
      elapsed: this.elapsed,
      gold: Math.floor(this.playerProgress.gold),
      level: this.playerProgress.level,
      xpPct,
      shopAvailable: this.inBase(this.player.unit, 'ally'),
      ownedItems: [...this.ownedItems],
      buffs: [
        ...this.playerBuffs.buffs.map((b) => ({
          kind: b.kind as string,
          remaining: Math.ceil(b.expiresAt - this.elapsed),
        })),
        ...(this.allyBaron.active
          ? [{ kind: 'baron', remaining: Math.ceil(this.allyBaron.expiresAt - this.elapsed) }]
          : []),
      ],
      objectives: this.buildObjectives(),
      dragonStacks: this.allyDragonStacks,
      allyStructures: this.structureStatus('ally'),
      enemyStructures: this.structureStatus('enemy'),
      minimap: this.buildMinimap(),
      abilities: slots.map((slot) => {
        const total = this.cooldownFor(this.playerChampion, slot, 'ally');
        const remaining = this.playerCds[slot];
        return {
          slot,
          progress: total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - remaining / total)),
          remaining: Math.ceil(remaining),
          ready: remaining <= 0,
        };
      }),
    });
  }

  private buildObjectives() {
    const dragonAlive = this.elapsed >= this.dragonNextSpawn;
    return [
      {
        id: 'dragon' as const,
        alive: dragonAlive,
        spawnsIn: dragonAlive ? 0 : Math.ceil(this.dragonNextSpawn - this.elapsed),
      },
      {
        id: 'herald' as const,
        alive: isHeraldWindowOpen(this.elapsed) && !this.heraldTaken,
        spawnsIn: this.elapsed < 480 ? Math.ceil(480 - this.elapsed) : 0,
      },
      {
        id: 'baron' as const,
        alive: this.baronAlive,
        spawnsIn: this.elapsed < BARON_SPAWN ? Math.ceil(BARON_SPAWN - this.elapsed) : 0,
      },
    ];
  }

  private xpProgressPct(): number {
    // Approximate progress toward the next level from banked xp.
    const p = this.playerProgress;
    if (p.level >= 18) return 1;
    // economy.addXp already consumed thresholds; xp holds remainder toward next.
    const need = 280 + (p.level - 1) * 100;
    return Math.min(1, Math.max(0, p.xp / need));
  }

  private checkWinLose() {
    if (this.ended) return;
    if (this.enemyNexus && this.enemyNexus.unit.dead) this.endGame(true);
    else if (this.allyNexus && this.allyNexus.unit.dead) this.endGame(false);
  }

  private endGame(win: boolean) {
    this.ended = true;
    audio.play(win ? 'victory' : 'defeat');
    this.cameras.main.flash(300, win ? 10 : 80, win ? 200 : 20, win ? 185 : 30);
    const outcome: BattleOutcome = {
      win,
      mode: this.mode,
      playerChampionId: this.playerChampion.id,
      enemyChampionId: this.enemyChampion.id,
      stats: {
        durationSeconds: Math.round(this.elapsed),
        championKills: this.stats.championKills,
        minionKills: this.stats.minionKills,
        damageDealt: Math.round(this.stats.damageDealt),
        level: this.playerProgress.level,
        gold: Math.floor(this.playerProgress.gold),
      },
    };
    this.time.delayedCall(400, () => this.onGameEnd(outcome));
  }
}
