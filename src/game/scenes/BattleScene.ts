import Phaser from 'phaser';
import {
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

/** Damage at or above this fraction of a champion's max HP earns a screen shake. */
const BIG_HIT_FRACTION = 0.12;

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

const NEXUS_HP = 5500;
const NEXUS_TURRET_HP = 2700;
const TURRET_HP = 2000;
const INHIBITOR_HP = 2400;
const TURRET_RANGE = 260;
const TURRET_DAMAGE = 152;
const TURRET_ATTACK_SPEED = 0.83;
const RESOURCE_REGEN = 8; // per second

/** Convert a world coordinate (0..3000) to a canvas pixel. */
function toScreen(p: Vec2): Vec2 {
  return { x: OFF_X + p.x * SCALE, y: OFF_Y + p.y * SCALE };
}

/** A rendered combat entity: pairs pure combat state with its Phaser visuals. */
interface Entity {
  unit: Unit;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
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
  private enemy!: Entity;
  private structures: Entity[] = [];
  private minions: Entity[] = [];
  private allEntities: Entity[] = [];
  /** Structure entities keyed by their pure graph id. */
  private structureById = new Map<string, Entity>();
  private allyNexus!: Entity;
  private enemyNexus!: Entity;

  private structureLines: StructureLine[] = [];

  private playerCds: CooldownState = createCooldownState();
  private enemyCds: CooldownState = createCooldownState();
  private playerResource = 0;
  private playerMaxResource = 300;
  private enemyResource = 0;
  private enemyMaxResource = 300;

  // Economy / progression.
  private playerProgress: ProgressState = createProgress();
  private enemyProgress: ProgressState = createProgress();
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
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private abilityKeys!: Record<CooldownKey, Phaser.Input.Keyboard.Key>;

  private elapsed = 0;
  private ended = false;
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
    this.structures = [];
    this.minions = [];
    this.allEntities = [];
    this.structureById.clear();
    this.structureLines = [];
    this.playerCds = createCooldownState();
    this.enemyCds = createCooldownState();
    this.playerResource = this.playerMaxResource;
    this.enemyResource = this.enemyMaxResource;
    this.playerProgress = createProgress(STARTING_GOLD);
    this.enemyProgress = createProgress(STARTING_GOLD);
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
    this.drawMap();

    this.buildStructures();

    // Champions spawn at their team fountains.
    const allySpawn = toScreen(BASE_POSITIONS.ally);
    const enemySpawn = toScreen(BASE_POSITIONS.enemy);
    this.player = this.spawnChampion('player', this.playerChampion, 'ally', allySpawn);
    this.enemy = this.spawnChampion('enemy', this.enemyChampion, 'enemy', enemySpawn);
    this.applyChampionStats(this.player, 'ally');
    this.applyChampionStats(this.enemy, 'enemy');
    this.player.unit.hp = this.player.unit.maxHp;
    this.enemy.unit.hp = this.enemy.unit.maxHp;

    this.setupInput();
    this.pushHud();
  }

  // ---- Map + structure setup ----------------------------------------------

  private drawMap() {
    const g = this.add.graphics();
    // Map base.
    const tl = toScreen({ x: 0, y: 0 });
    const size = WORLD_SIZE * SCALE;
    g.fillStyle(0x0a2417, 1);
    g.fillRoundedRect(tl.x, tl.y, size, size, 18);
    g.lineStyle(2, 0x1c4d33, 1);
    g.strokeRoundedRect(tl.x, tl.y, size, size, 18);

    // River band along the anti-diagonal.
    g.lineStyle(Math.max(6, 46 * SCALE), 0x1b6fb0, 0.35);
    const river = RIVER_ANCHORS.map(toScreen);
    g.beginPath();
    g.moveTo(river[0].x, river[0].y);
    for (let i = 1; i < river.length; i++) g.lineTo(river[i].x, river[i].y);
    g.strokePath();

    // Lanes.
    g.lineStyle(Math.max(4, 34 * SCALE), 0x2f7d52, 0.5);
    for (const lane of this.lanes) {
      const pts = LANE_WAYPOINTS[lane].map(toScreen);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }

    // Jungle camp + epic pit markers (Rift only).
    if (this.mode === 'rift') {
      for (const camp of JUNGLE_CAMPS) {
        const p = toScreen(camp.pos);
        const dot = this.add.circle(p.x, p.y, 4, 0x6fe08a, 0.8);
        dot.setStrokeStyle(1, 0x0a2417);
      }
      for (const pit of EPIC_PITS) {
        const p = toScreen(pit.pos);
        const marker = this.add.star(p.x, p.y, 5, 5, 11, pit.id === 'dragon' ? 0xe8703a : 0x9b6bff, 0.85);
        marker.setStrokeStyle(1, 0x02100a);
      }
    }
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
    const color = Phaser.Display.Color.HexStringToColor(champion.accentColor).color;
    const body = this.add.circle(0, 0, 12, color);
    body.setStrokeStyle(2, 0xf0e6d2);
    const label = this.add.text(0, -22, champion.id.slice(0, 2).toUpperCase(), {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#f0e6d2',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);
    const container = this.add.container(pos.x, pos.y, [body, label]);
    const entity: Entity = { unit, container, body, stunned: 0 };
    this.attachHpBar(entity, 26);
    this.allEntities.push(entity);
    return entity;
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
    const color = Phaser.Display.Color.HexStringToColor(accent).color;
    const size = node.kind === 'nexus' ? 26 : node.kind === 'inhibitor' ? 16 : 13;
    const shape =
      node.kind === 'nexus'
        ? this.add.rectangle(0, 0, size, size, 0x081c12)
        : node.kind === 'inhibitor'
          ? this.add.rectangle(0, 0, size, size, 0x081c12)
          : this.add.circle(0, 0, size, 0x081c12);
    shape.setStrokeStyle(3, color);
    const container = this.add.container(pos.x, pos.y, [shape]);
    const entity: Entity = { unit, container, body: shape, stunned: 0, node };
    this.attachHpBar(entity, size + 8);
    this.allEntities.push(entity);
    return entity;
  }

  private attachHpBar(entity: Entity, offsetY: number) {
    const width = entity.unit.kind === 'minion' ? 14 : entity.unit.kind === 'champion' ? 28 : 24;
    const bg = this.add.rectangle(0, -offsetY, width, 4, 0x000000, 0.7);
    const bar = this.add.rectangle(0, -offsetY, width, 4, 0x3ad16a);
    bar.setData('width', width);
    entity.container.add([bg, bar]);
    entity.hpBarBg = bg;
    entity.hpBar = bar;
  }

  /** Recompute a champion's Unit stats from level + items + team modifiers. */
  private applyChampionStats(entity: Entity, side: MapSide) {
    const champion = side === 'ally' ? this.playerChampion : this.enemyChampion;
    const level = side === 'ally' ? this.playerProgress.level : this.enemyProgress.level;
    const items = side === 'ally' ? this.ownedItems : [];
    const team = this.teamModifiers(side);
    const eff = computeEffectiveStats(champion, level, items, team);
    const u = entity.unit;
    const hpFrac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    u.maxHp = Math.round(eff.hp);
    u.hp = entity === this.player || entity === this.enemy ? Math.min(u.maxHp, Math.round(u.maxHp * hpFrac)) : u.maxHp;
    u.ad = eff.attackDamage;
    u.armor = eff.armor;
    u.attackSpeed = eff.attackSpeed;
    u.moveSpeed = champion.stats.moveSpeed * SCALE + eff.moveSpeed * SCALE;
    u.attackRange = champion.stats.attackRange * SCALE;
    if (side === 'ally') {
      this.playerMaxResource = 300 + eff.resource;
    } else {
      this.enemyMaxResource = 300 + eff.resource;
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
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.abilityKeys = {
      Q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
    (['Q', 'E', 'R'] as CooldownKey[]).forEach((slot) => {
      this.abilityKeys[slot].on('down', () => this.tryPlayerCast(slot));
    });
    this.abilityKeys.W.on('down', () => this.tryPlayerCast('W'));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
    });
  }

  // ---- Main loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    if (this.ended) return;
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    tickCooldowns(this.playerCds, dt);
    tickCooldowns(this.enemyCds, dt);
    const blueRegen = this.blueBuffRegen();
    this.playerResource = Math.min(this.playerMaxResource, this.playerResource + (RESOURCE_REGEN + blueRegen) * dt);
    this.enemyResource = Math.min(this.enemyMaxResource, this.enemyResource + RESOURCE_REGEN * dt);

    this.tickEconomy(dt);
    this.tickBuffsAndObjectives();
    this.processPurchases();
    this.maybeSpawnWaves();

    this.updatePlayerMovement(dt);
    this.updateEnemyChampion(dt);
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
    const color = Phaser.Display.Color.HexStringToColor(accent).color;
    const s = type === 'super' ? 10 : type === 'siege' ? 8 : 6;
    const body = this.add.rectangle(0, 0, s, s, color);
    body.setStrokeStyle(1, 0x02100a);
    const container = this.add.container(screenPos.x, screenPos.y, [body]);
    const entity: Entity = {
      unit,
      container,
      body,
      stunned: 0,
      rift,
      path: laneWaypoints(lane, team).map(toScreen),
      minionType: type,
    };
    this.attachHpBar(entity, s + 6);
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
    if (!this.enemy.unit.dead) {
      applyHeal(this.enemy.unit, this.enemyChampion.stats.hpRegen * dt);
    }
  }

  private updatePlayerMovement(dt: number) {
    const u = this.player.unit;
    if (u.dead) {
      this.respawnIfNeeded(this.player, 'ally', dt);
      return;
    }
    if (this.player.stunned > 0) return;

    let vx = 0;
    let vy = 0;
    if (this.keys.A.isDown) vx -= 1;
    if (this.keys.D.isDown) vx += 1;
    if (this.keys.W.isDown) vy -= 1;
    if (this.keys.S.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      this.moveTarget = null;
      const len = Math.hypot(vx, vy) || 1;
      u.pos.x = this.clampX(u.pos.x + (vx / len) * u.moveSpeed * dt);
      u.pos.y = this.clampY(u.pos.y + (vy / len) * u.moveSpeed * dt);
    } else if (this.moveTarget) {
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

  private updateEnemyChampion(dt: number) {
    const u = this.enemy.unit;
    if (u.dead) {
      this.respawnIfNeeded(this.enemy, 'enemy', dt);
      return;
    }
    if (this.enemy.stunned > 0) return;

    const target = this.findTarget(u, 1200 * SCALE, true);
    const snapshot = this.buildAiSnapshot(target);
    const intent = decideAction(snapshot);
    const pushGoal = toScreen(BASE_POSITIONS.ally);

    switch (intent) {
      case 'approach': {
        const goal = target ? target.pos : pushGoal;
        this.moveUnitToward(u, goal, dt);
        break;
      }
      case 'retreat': {
        this.moveUnitToward(u, toScreen(BASE_POSITIONS.enemy), dt);
        break;
      }
      case 'attack': {
        if (target) this.tryBasicAttack(this.enemy, target);
        break;
      }
      case 'castQ':
      case 'castW':
      case 'castE':
      case 'castR': {
        const slot = intent.slice(4) as CooldownKey;
        const ability = this.abilityBySlot(this.enemyChampion, slot);
        const aim =
          ability.behavior === 'heal' || ability.behavior === 'buff'
            ? { ...u.pos }
            : target?.pos;
        if (aim) this.enemyCast(slot, aim);
        break;
      }
    }
  }

  private buildAiSnapshot(target: Unit | undefined): AiSnapshot {
    const u = this.enemy.unit;
    const dist = target ? distance(u.pos, target.pos) : Infinity;
    const [q, w, e, r] = this.enemyChampion.abilities;
    return {
      selfHpPct: u.hp / u.maxHp,
      selfResourcePct: this.enemyResource / this.enemyMaxResource,
      distanceToTarget: dist,
      hasTarget: !!target,
      attackRange: u.attackRange,
      cooldowns: this.enemyCds,
      abilityRanges: {
        Q: q.range * SCALE,
        W: w.range * SCALE,
        E: e.range * SCALE,
        R: r.range * SCALE,
      },
      abilityCosts: { Q: q.cost, W: w.cost, E: e.cost, R: r.cost },
      abilityBehaviors: { Q: q.behavior, W: w.behavior, E: e.behavior, R: r.behavior },
      maxResource: this.enemyMaxResource,
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
      this.livingUnits(),
      this.structureLines,
      this.livingUnitIds(),
      u.attackRange,
    );
    if (target && canBasicAttack(u)) {
      const res = applyDamage(target, u.ad);
      this.registerKill(u, target, res.lethal);
      this.onDamage(this.entityForUnit(target), target.pos, res.dealt, 0xffcc55, res.lethal);
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
    this.onDamage(this.entityForUnit(target), target.pos, res.dealt, 0xf0e6d2, res.lethal);
    if (u.attackRange > 220 * SCALE) this.drawProjectile(u.pos, target.pos, 0xf0e6d2);
    resetAttackCooldown(u);
  }

  private tryPlayerCast(slot: CooldownKey) {
    if (this.ended || this.player.unit.dead || this.player.stunned > 0) return;
    const pointer = this.input.activePointer;
    const aim = { x: pointer.worldX, y: pointer.worldY };
    this.castAbility(this.player, slot, aim, this.playerChampion, this.playerCds, () => {
      const cost = this.abilityBySlot(this.playerChampion, slot).cost;
      if (this.playerResource < cost || this.playerCds[slot] > 0) return false;
      this.playerResource -= cost;
      return true;
    }, true);
  }

  private enemyCast(slot: CooldownKey, aim: Vec2) {
    this.castAbility(this.enemy, slot, aim, this.enemyChampion, this.enemyCds, () => {
      const cost = this.abilityBySlot(this.enemyChampion, slot).cost;
      if (this.enemyResource < cost || this.enemyCds[slot] > 0) return false;
      this.enemyResource -= cost;
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
          this.onDamage(e, e.unit.pos, res.dealt, color, res.lethal);
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
      const level = side === 'ally' ? this.playerProgress.level : this.enemyProgress.level;
      entity.container.setData('respawnAt', this.elapsed + Math.min(50, 6 + level * 2.5));
      entity.container.setVisible(false);
    } else if (this.elapsed >= entity.container.getData('respawnAt')) {
      entity.container.setData('respawnAt', 0);
      entity.unit.dead = false;
      entity.unit.hp = entity.unit.maxHp;
      entity.unit.pos = { ...toScreen(BASE_POSITIONS[side]) };
      entity.container.setVisible(true);
    }
  }

  private registerKill(source: Unit, target: Unit, lethal: boolean) {
    if (!lethal) return;
    // Track inhibitor destruction for super-minion spawning.
    if (target.kind === 'turret' && target.id.endsWith('-inhibitor')) {
      this.inhibitorKillTimes.set(target.id, this.elapsed);
    }
    // Award gold/XP to whoever landed the kill (player or enemy).
    const toAlly = source.team === 'ally';
    const progress = toAlly ? this.playerProgress : this.enemyProgress;
    if (target.kind === 'minion') {
      const type = (this.entityForUnit(target)?.minionType ?? 'melee') as MinionType;
      const b = minionBounty(type);
      addGold(progress, b.gold);
      addXp(progress, b.xp);
      if (source.id === 'player') this.stats.minionKills += 1;
    } else if (target.kind === 'champion') {
      addGold(progress, CHAMPION_TAKEDOWN_BOUNTY.gold);
      addXp(progress, CHAMPION_TAKEDOWN_BOUNTY.xp);
      if (source.id === 'player') this.stats.championKills += 1;
    }
    if (toAlly) this.applyChampionStats(this.player, 'ally');
    else this.applyChampionStats(this.enemy, 'enemy');
  }

  // ---- Targeting -----------------------------------------------------------

  private livingUnits(): Unit[] {
    return this.allEntities.filter((e) => !e.unit.dead).map((e) => e.unit);
  }

  private livingUnitIds(): Set<string> {
    const ids = new Set<string>();
    for (const e of this.allEntities) {
      if (!e.unit.dead) ids.add(e.unit.id);
    }
    return ids;
  }

  private findTarget(u: Unit, maxRange: number, preferStructures = false): Unit | undefined {
    // Structure gating: build the current living-structure set and only allow a
    // structure to be targeted when the pure rule permits it.
    const living = this.livingUnitIds();
    const candidates = this.livingUnits().filter((c) => {
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
      e.container.setPosition(e.unit.pos.x, e.unit.pos.y);
      if (e.hpBar) {
        const full = e.hpBar.getData('width') as number;
        const pct = Phaser.Math.Clamp(e.unit.hp / e.unit.maxHp, 0, 1);
        e.hpBar.width = full * pct;
        e.hpBar.x = -(full * (1 - pct)) / 2;
        e.hpBar.fillColor = pct > 0.5 ? 0x3ad16a : pct > 0.25 ? 0xf0c000 : 0xd13a3a;
      }
      if (e.unit.dead && e.unit.kind === 'minion' && e.container.active) {
        e.container.destroy();
      }
      if (e.unit.dead && (e.unit.kind === 'turret' || e.unit.kind === 'nexus') && e.container.visible) {
        e.container.setAlpha(0.25);
      }
    }
    this.minions = this.minions.filter((m) => !(m.unit.dead && !m.container.active));
    this.allEntities = this.allEntities.filter(
      (e) => e.container.active || !e.unit.dead || e.unit.kind !== 'minion',
    );
  }

  private floatingDamage(pos: Vec2, amount: number, color: number, prefix = '') {
    if (amount <= 0) return;
    const text = this.add.text(pos.x, pos.y - 18, `${prefix}${amount}`, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    text.setScale(0.6);
    this.tweens.add({ targets: text, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: text,
      y: pos.y - 44,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private hitFlash(entity: Entity) {
    if (!entity.container.active) return;
    const shape = entity.body;
    const original = shape.fillColor;
    shape.fillColor = 0xffffff;
    this.time.delayedCall(70, () => {
      if (shape.active) shape.fillColor = original;
    });
  }

  private shake(intensity: number) {
    this.cameras.main.shake(160, Phaser.Math.Clamp(intensity, 0.003, 0.02));
  }

  private onDamage(target: Entity | undefined, pos: Vec2, amount: number, color: number, lethal: boolean) {
    this.floatingDamage(pos, amount, color);
    if (target) this.hitFlash(target);
    audio.play('hit');
    if (lethal) {
      audio.play('death');
      if (target) this.deathBurst(target, color);
    }
    if (target && target.unit.kind === 'champion') {
      const frac = amount / target.unit.maxHp;
      if (frac >= BIG_HIT_FRACTION || lethal) this.shake(0.006 + frac * 0.04);
    }
  }

  private deathBurst(entity: Entity, color: number) {
    const ring = this.add.circle(entity.unit.pos.x, entity.unit.pos.y, 10, color, 0.5);
    ring.setStrokeStyle(2, 0xffffff, 0.8);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private entityForUnit(unit: Unit): Entity | undefined {
    return this.allEntities.find((e) => e.unit === unit);
  }

  private drawProjectile(from: Vec2, to: Vec2, color: number) {
    const dot = this.add.circle(from.x, from.y, 4, color);
    this.tweens.add({ targets: dot, x: to.x, y: to.y, duration: 180, onComplete: () => dot.destroy() });
  }

  private drawBeam(from: Vec2, to: Vec2, color: number) {
    const line = this.add.line(0, 0, from.x, from.y, to.x, to.y, color, 0.8);
    line.setOrigin(0, 0);
    line.setLineWidth(1.5);
    this.tweens.add({ targets: line, alpha: 0, duration: 200, onComplete: () => line.destroy() });
  }

  private drawAoe(center: Vec2, radius: number, color: number) {
    const circle = this.add.circle(center.x, center.y, radius, color, 0.28);
    circle.setStrokeStyle(2, color, 0.8);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 1.15,
      duration: 400,
      onComplete: () => circle.destroy(),
    });
  }

  private drawDashTrail(from: Vec2, to: Vec2, color: number) {
    const line = this.add.line(0, 0, from.x, from.y, to.x, to.y, color, 0.6);
    line.setOrigin(0, 0);
    line.setLineWidth(5);
    this.tweens.add({ targets: line, alpha: 0, duration: 280, onComplete: () => line.destroy() });
  }

  private pulse(container: Phaser.GameObjects.Container, color: number) {
    const ring = this.add.circle(container.x, container.y, 20, color, 0.4);
    this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
  }

  private castFlare(caster: Entity, color: number, ultimate: boolean) {
    const { x, y } = caster.unit.pos;
    const ring = this.add.circle(x, y, ultimate ? 16 : 12, color, 0);
    ring.setStrokeStyle(ultimate ? 3 : 2, color, 0.9);
    this.tweens.add({
      targets: ring,
      scale: ultimate ? 2.6 : 1.8,
      alpha: 0,
      duration: ultimate ? 500 : 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    if (ultimate) this.shake(0.006);
  }

  private stunSpin(entity: Entity, color: number) {
    const star = this.add.text(entity.unit.pos.x, entity.unit.pos.y - 26, '\u2726', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: `#${color.toString(16).padStart(6, '0')}`,
    });
    star.setOrigin(0.5);
    this.tweens.add({ targets: star, angle: 360, alpha: 0, duration: 600, onComplete: () => star.destroy() });
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
