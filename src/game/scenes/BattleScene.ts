import Phaser from 'phaser';
import {
  getChampionById,
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
import { battleStore, type BattleOutcome } from '../battleStore';
import { audio } from '../audio';

/** Damage at or above this fraction of a champion's max HP earns a screen shake. */
const BIG_HIT_FRACTION = 0.12;

/** Data passed into the scene from React via `scene.start(key, data)`. */
export interface BattleSceneData {
  playerChampionId: string;
  enemyChampionId: string;
  onGameEnd: (outcome: BattleOutcome) => void;
}

const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 420;
const LANE_Y = WORLD_HEIGHT / 2;

const ALLY_BASE_X = 90;
const ENEMY_BASE_X = WORLD_WIDTH - 90;
const ALLY_TURRET_X = 360;
const ENEMY_TURRET_X = WORLD_WIDTH - 360;

const NEXUS_HP = 2000;
const TURRET_HP = 1400;
const TURRET_RANGE = 320;
const TURRET_DAMAGE = 90;
const TURRET_ATTACK_SPEED = 0.9;
const MINION_HP = 120;
const MINION_DAMAGE = 14;
const MINION_SPEED = 90;
const MINION_RANGE = 120;
const WAVE_INTERVAL = 9000;
const MINIONS_PER_WAVE = 4;
const RESOURCE_REGEN = 8; // per second
const HP_REGEN_SCALE = 1;

/** A rendered combat entity: pairs pure combat state with its Phaser visuals. */
interface Entity {
  unit: Unit;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
  hpBarBg?: Phaser.GameObjects.Rectangle;
  hpBar?: Phaser.GameObjects.Rectangle;
  /** Remaining stun seconds; entity cannot act while > 0. */
  stunned: number;
}

/**
 * The arena battle. A stylized single lane with a nexus + turret per team,
 * periodic minion waves, a player champion under keyboard/mouse control, and an
 * AI champion driven by `ai.ts`. All damage flows through `combat.ts` so the
 * math is the tested, shared implementation. No external art: everything is
 * drawn with Phaser shapes + text tinted to each champion's accent color.
 */
export default class BattleScene extends Phaser.Scene {
  private onGameEnd!: (outcome: BattleOutcome) => void;
  private playerChampion!: Champion;
  private enemyChampion!: Champion;

  private player!: Entity;
  private enemy!: Entity;
  private allyNexus!: Entity;
  private enemyNexus!: Entity;
  private allyTurret!: Entity;
  private enemyTurret!: Entity;
  private minions: Entity[] = [];
  private allEntities: Entity[] = [];

  /**
   * Structure gating: each nexus is shielded while the turret guarding it is
   * still alive, so a nexus cannot be attacked until its turret has fallen
   * (the MOBA "clear the turret first" rule). Consumed by the pure targeting
   * helpers in combat.ts.
   */
  private readonly structureLines: readonly StructureLine[] = [
    { turretId: 'ally-turret', nexusId: 'ally-nexus' },
    { turretId: 'enemy-turret', nexusId: 'enemy-nexus' },
  ];

  private playerCds: CooldownState = createCooldownState();
  private enemyCds: CooldownState = createCooldownState();
  private playerResource = 0;
  private playerMaxResource = 300;
  private enemyResource = 0;
  private enemyMaxResource = 300;

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
    this.playerChampion =
      getChampionById(data.playerChampionId) ?? getChampionById('ashborne')!;
    this.enemyChampion =
      getChampionById(data.enemyChampionId) ?? getChampionById('nightveil')!;
    // Reset per-run state so a restart/rematch starts clean.
    this.minions = [];
    this.allEntities = [];
    this.playerCds = createCooldownState();
    this.enemyCds = createCooldownState();
    this.playerResource = this.playerMaxResource;
    this.enemyResource = this.enemyMaxResource;
    this.moveTarget = null;
    this.elapsed = 0;
    this.ended = false;
    this.stats = { championKills: 0, minionKills: 0, damageDealt: 0 };
    battleStore.reset(this.playerChampion.id, this.enemyChampion.id);
  }

  create() {
    this.cameras.main.setBackgroundColor('#071018');
    this.drawLane();

    // Structures.
    this.allyNexus = this.spawnStructure('ally-nexus', 'nexus', 'ally', ALLY_BASE_X, this.playerChampion.accentColor);
    this.enemyNexus = this.spawnStructure('enemy-nexus', 'nexus', 'enemy', ENEMY_BASE_X, this.enemyChampion.accentColor);
    this.allyTurret = this.spawnStructure('ally-turret', 'turret', 'ally', ALLY_TURRET_X, this.playerChampion.accentColor);
    this.enemyTurret = this.spawnStructure('enemy-turret', 'turret', 'enemy', ENEMY_TURRET_X, this.enemyChampion.accentColor);

    // Champions.
    this.player = this.spawnChampion('player', this.playerChampion, 'ally', { x: ALLY_BASE_X + 120, y: LANE_Y });
    this.enemy = this.spawnChampion('enemy', this.enemyChampion, 'enemy', { x: ENEMY_BASE_X - 120, y: LANE_Y });

    this.setupInput();

    // Minion waves.
    this.spawnWave();
    this.time.addEvent({
      delay: WAVE_INTERVAL,
      loop: true,
      callback: () => {
        if (!this.ended) this.spawnWave();
      },
    });

    this.pushHud();
  }

  // ---- Setup helpers -------------------------------------------------------

  private drawLane() {
    const g = this.add.graphics();
    // Lane strip.
    g.fillStyle(0x0d2033, 1);
    g.fillRoundedRect(40, LANE_Y - 70, WORLD_WIDTH - 80, 140, 24);
    g.lineStyle(2, 0x1d3a52, 1);
    g.strokeRoundedRect(40, LANE_Y - 70, WORLD_WIDTH - 80, 140, 24);
    // Center dashes.
    g.fillStyle(0x1d3a52, 0.6);
    for (let x = 120; x < WORLD_WIDTH - 120; x += 60) {
      g.fillRect(x, LANE_Y - 2, 30, 4);
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

  private spawnChampion(
    id: string,
    champion: Champion,
    team: Team,
    pos: Vec2,
  ): Entity {
    const unit = this.makeUnit(id, 'champion', team, pos, {
      maxHp: champion.stats.hp,
      ad: champion.stats.attackDamage,
      armor: 32,
      attackRange: champion.stats.attackRange,
      attackSpeed: champion.stats.attackSpeed,
      moveSpeed: champion.stats.moveSpeed,
    });
    const color = Phaser.Display.Color.HexStringToColor(champion.accentColor).color;
    const body = this.add.circle(0, 0, 20, color);
    body.setStrokeStyle(3, 0xf0e6d2);
    const label = this.add.text(0, -34, this.initials(champion), {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#f0e6d2',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);
    const container = this.add.container(pos.x, pos.y, [body, label]);
    const entity: Entity = { unit, container, body, stunned: 0 };
    this.attachHpBar(entity, 44);
    this.allEntities.push(entity);
    return entity;
  }

  private spawnStructure(
    id: string,
    kind: 'nexus' | 'turret',
    team: Team,
    x: number,
    accent: string,
  ): Entity {
    const maxHp = kind === 'nexus' ? NEXUS_HP : TURRET_HP;
    const unit = this.makeUnit(id, kind, team, { x, y: LANE_Y }, {
      maxHp,
      ad: kind === 'turret' ? TURRET_DAMAGE : 0,
      armor: 40,
      attackRange: kind === 'turret' ? TURRET_RANGE : 0,
      attackSpeed: TURRET_ATTACK_SPEED,
      moveSpeed: 0,
    });
    const color = Phaser.Display.Color.HexStringToColor(accent).color;
    const size = kind === 'nexus' ? 58 : 40;
    const body = this.add.rectangle(0, 0, size, size, 0x0a1a2a);
    body.setStrokeStyle(4, color);
    const icon = this.add.text(0, 0, kind === 'nexus' ? '\u25C6' : '\u25B2', {
      fontFamily: 'sans-serif',
      fontSize: kind === 'nexus' ? '30px' : '20px',
      color: accent,
    });
    icon.setOrigin(0.5);
    if (kind === 'turret') {
      const ring = this.add.circle(0, 0, TURRET_RANGE, color, 0.04);
      ring.setStrokeStyle(1, color, 0.15);
      this.add.container(x, LANE_Y, [ring]);
    }
    const container = this.add.container(x, LANE_Y, [body, icon]);
    const entity: Entity = { unit, container, body, stunned: 0 };
    this.attachHpBar(entity, size + 16);
    this.allEntities.push(entity);
    return entity;
  }

  private spawnWave() {
    for (const team of ['ally', 'enemy'] as Team[]) {
      for (let i = 0; i < MINIONS_PER_WAVE; i++) {
        const fromX = team === 'ally' ? ALLY_BASE_X + 40 : ENEMY_BASE_X - 40;
        const y = LANE_Y - 30 + Math.random() * 60;
        const unit = this.makeUnit(
          `minion-${team}-${this.time.now}-${i}`,
          'minion',
          team,
          { x: fromX, y },
          {
            maxHp: MINION_HP,
            ad: MINION_DAMAGE,
            armor: 10,
            attackRange: MINION_RANGE,
            attackSpeed: 1.1,
            moveSpeed: MINION_SPEED,
          },
        );
        const accent = team === 'ally' ? this.playerChampion.accentColor : this.enemyChampion.accentColor;
        const color = Phaser.Display.Color.HexStringToColor(accent).color;
        const body = this.add.rectangle(0, 0, 16, 16, color);
        body.setStrokeStyle(2, 0x02070c);
        const container = this.add.container(unit.pos.x, unit.pos.y, [body]);
        const entity: Entity = { unit, container, body, stunned: 0 };
        this.attachHpBar(entity, 18);
        this.minions.push(entity);
        this.allEntities.push(entity);
      }
    }
  }

  private attachHpBar(entity: Entity, offsetY: number) {
    const width = entity.unit.kind === 'minion' ? 20 : 46;
    const bg = this.add.rectangle(0, -offsetY, width, 5, 0x000000, 0.7);
    const bar = this.add.rectangle(0, -offsetY, width, 5, 0x3ad16a);
    bar.setData('width', width);
    entity.container.add([bg, bar]);
    entity.hpBarBg = bg;
    entity.hpBar = bar;
  }

  private initials(champion: Champion): string {
    return champion.id.slice(0, 2).toUpperCase();
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

    // Cast abilities aimed at the cursor.
    (['Q', 'E', 'R'] as CooldownKey[]).forEach((slot) => {
      this.abilityKeys[slot].on('down', () => this.tryPlayerCast(slot));
    });
    // W often overlaps with movement key; bind on keydown too but it is fine.
    this.abilityKeys.W.on('down', () => this.tryPlayerCast('W'));

    // Right-click / left-click to move; the player is not click-locked so WASD
    // also works. Left click also issues a basic attack if an enemy is nearby.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const world = { x: pointer.worldX, y: pointer.worldY };
      this.moveTarget = {
        x: Phaser.Math.Clamp(world.x, 60, WORLD_WIDTH - 60),
        y: Phaser.Math.Clamp(world.y, LANE_Y - 60, LANE_Y + 60),
      };
    });
  }

  // ---- Main loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    if (this.ended) return;
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    tickCooldowns(this.playerCds, dt);
    tickCooldowns(this.enemyCds, dt);
    this.playerResource = Math.min(
      this.playerMaxResource,
      this.playerResource + RESOURCE_REGEN * dt,
    );
    this.enemyResource = Math.min(
      this.enemyMaxResource,
      this.enemyResource + RESOURCE_REGEN * dt,
    );

    this.updatePlayerMovement(dt);
    this.updateEnemyChampion(dt);
    this.updateMinions(dt);
    this.updateTurret(this.allyTurret, dt);
    this.updateTurret(this.enemyTurret, dt);
    this.regenAndTick(dt);
    this.syncVisuals();
    this.checkWinLose();
    this.pushHud();
  }

  private regenAndTick(dt: number) {
    for (const e of this.allEntities) {
      if (e.stunned > 0) e.stunned = Math.max(0, e.stunned - dt);
      // Single per-frame decrement for every unit (turrets included).
      advanceAttackCooldown(e.unit, dt);
    }
    // Champion hp regen.
    if (!this.player.unit.dead) {
      applyHeal(this.player.unit, this.playerChampion.stats.hpRegen * HP_REGEN_SCALE * dt);
    }
    if (!this.enemy.unit.dead) {
      applyHeal(this.enemy.unit, this.enemyChampion.stats.hpRegen * HP_REGEN_SCALE * dt);
    }
  }

  private updatePlayerMovement(dt: number) {
    const u = this.player.unit;
    if (u.dead) {
      // Respawn champions after a short delay to keep the match going.
      this.respawnIfNeeded(this.player, ALLY_BASE_X + 120, dt);
      return;
    }
    if (this.player.stunned > 0) return;

    // WASD overrides click-move.
    let vx = 0;
    let vy = 0;
    if (this.keys.A.isDown) vx -= 1;
    if (this.keys.D.isDown) vx += 1;
    if (this.keys.W.isDown) vy -= 1;
    if (this.keys.S.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      this.moveTarget = null;
      const len = Math.hypot(vx, vy) || 1;
      u.pos.x = Phaser.Math.Clamp(u.pos.x + (vx / len) * u.moveSpeed * dt, 60, WORLD_WIDTH - 60);
      u.pos.y = Phaser.Math.Clamp(u.pos.y + (vy / len) * u.moveSpeed * dt, LANE_Y - 60, LANE_Y + 60);
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

    // Auto basic-attack the nearest targetable enemy in range, favoring the
    // objective (turret then nexus) when the player is standing on it.
    const target = this.findTarget(u, u.attackRange, true);
    if (target) this.tryBasicAttack(this.player, target);
  }

  private updateEnemyChampion(dt: number) {
    const u = this.enemy.unit;
    if (u.dead) {
      this.respawnIfNeeded(this.enemy, ENEMY_BASE_X - 120, dt);
      return;
    }
    if (this.enemy.stunned > 0) return;

    const target = this.findTarget(u, 1400, true);
    const snapshot = this.buildAiSnapshot(target);
    const intent = decideAction(snapshot);

    const enemyBaseDir = ALLY_BASE_X; // push toward the ally nexus.
    switch (intent) {
      case 'approach': {
        const goal = target ? target.pos : { x: enemyBaseDir, y: LANE_Y };
        this.moveUnitToward(u, goal, dt);
        break;
      }
      case 'retreat': {
        this.moveUnitToward(u, { x: ENEMY_BASE_X - 40, y: LANE_Y }, dt);
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
        // Non-offensive casts (self-heal/buff) aim at the caster and need no
        // target; offensive casts aim at the current target.
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
      abilityRanges: { Q: q.range, W: w.range, E: e.range, R: r.range },
      abilityCosts: { Q: q.cost, W: w.cost, E: e.cost, R: r.cost },
      abilityBehaviors: {
        Q: q.behavior,
        W: w.behavior,
        E: e.behavior,
        R: r.behavior,
      },
      maxResource: this.enemyMaxResource,
      targetLowHp: target ? target.hp / target.maxHp < 0.35 : false,
    };
  }

  private updateMinions(dt: number) {
    for (const m of this.minions) {
      const u = m.unit;
      if (u.dead) continue;
      const goalX = u.team === 'ally' ? ENEMY_BASE_X : ALLY_BASE_X;
      const target = this.findTarget(u, 260);
      if (target && distance(u.pos, target.pos) <= u.attackRange) {
        this.tryBasicAttackUnit(m, target);
      } else if (target) {
        this.moveUnitToward(u, target.pos, dt);
      } else {
        this.moveUnitToward(u, { x: goalX, y: u.pos.y }, dt);
      }
    }
  }

  private updateTurret(turret: Entity, _dt: number) {
    const u = turret.unit;
    if (u.dead) return;
    // NOTE: attackCdRemaining is decremented once per frame in regenAndTick
    // (for every entity). Do NOT decrement it again here or turrets fire at
    // roughly double their configured attack speed.
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
    const res = applyDamage(target, u.ad);
    if (attacker === this.player) this.stats.damageDealt += res.dealt;
    this.registerKill(u, target, res.lethal);
    this.onDamage(this.entityForUnit(target), target.pos, res.dealt, 0xf0e6d2, res.lethal);
    if (u.attackRange > 260) {
      this.drawProjectile(u.pos, target.pos, 0xf0e6d2);
    }
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
    startCooldown(cds, slot, ability.cooldown);
    const effect = resolveAbility(ability);
    const color = Phaser.Display.Color.HexStringToColor(champion.accentColor).color;
    const origin = { ...caster.unit.pos };

    // Cast feedback: an ultimate gets the heavier "ability" sting, others a cast blip.
    audio.play(slot === 'R' ? 'ability' : 'cast');
    this.castFlare(caster, color, slot === 'R');

    // Direction toward the aim point, clamped to the ability range.
    const dir = this.clampAim(origin, aim, ability.range);

    if (effect.dashes) {
      caster.unit.pos.x = Phaser.Math.Clamp(dir.x, 60, WORLD_WIDTH - 60);
      caster.unit.pos.y = Phaser.Math.Clamp(dir.y, LANE_Y - 60, LANE_Y + 60);
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
      const center = effect.area || effect.dashes ? dir : dir;
      const hitRadius = effect.area ? effect.radius : effect.dashes ? 70 : 60;
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
          if (!effect.area) break; // single-target skillshots hit one.
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

  private moveUnitToward(u: Unit, goal: Vec2, dt: number) {
    const d = distance(u.pos, goal);
    if (d < 1) return;
    const travel = Math.min(d, u.moveSpeed * dt);
    u.pos.x = Phaser.Math.Clamp(u.pos.x + ((goal.x - u.pos.x) / d) * travel, 60, WORLD_WIDTH - 60);
    u.pos.y = Phaser.Math.Clamp(u.pos.y + ((goal.y - u.pos.y) / d) * travel, LANE_Y - 60, LANE_Y + 60);
  }

  private respawnIfNeeded(entity: Entity, x: number, _dt: number) {
    // Champions respawn on a timer so the game keeps flowing toward nexus wins.
    if (!entity.container.getData('respawnAt')) {
      entity.container.setData('respawnAt', this.elapsed + 6);
      entity.container.setVisible(false);
    } else if (this.elapsed >= entity.container.getData('respawnAt')) {
      entity.container.setData('respawnAt', 0);
      entity.unit.dead = false;
      entity.unit.hp = entity.unit.maxHp;
      entity.unit.pos = { x, y: LANE_Y };
      entity.container.setVisible(true);
    }
  }

  private registerKill(source: Unit, target: Unit, lethal: boolean) {
    if (!lethal) return;
    if (source.id === 'player') {
      if (target.kind === 'champion') this.stats.championKills += 1;
      else if (target.kind === 'minion') this.stats.minionKills += 1;
    }
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
      // Dead minions get cleaned up; dead champions/structures hide.
      if (e.unit.dead && e.unit.kind === 'minion' && e.container.active) {
        e.container.destroy();
      }
    }
    this.minions = this.minions.filter((m) => !(m.unit.dead && !m.container.active));
    this.allEntities = this.allEntities.filter((e) => e.container.active || !e.unit.dead || e.unit.kind !== 'minion');
  }

  private livingUnits(): Unit[] {
    return this.allEntities.filter((e) => !e.unit.dead).map((e) => e.unit);
  }

  /** Ids of every unit still alive, used by structure-gating in targeting. */
  private livingUnitIds(): Set<string> {
    const ids = new Set<string>();
    for (const e of this.allEntities) {
      if (!e.unit.dead) ids.add(e.unit.id);
    }
    return ids;
  }

  /**
   * Structure-gated nearest-enemy lookup shared by every combatant. A nexus
   * behind a living turret is never returned. `preferStructures` makes a unit
   * standing on the objective commit to the turret/nexus instead of chasing.
   */
  private findTarget(
    u: Unit,
    maxRange: number,
    preferStructures = false,
  ): Unit | undefined {
    return nearestTargetableEnemy(
      u,
      this.livingUnits(),
      this.structureLines,
      this.livingUnitIds(),
      maxRange,
      preferStructures,
    );
  }

  private floatingDamage(pos: Vec2, amount: number, color: number, prefix = '') {
    if (amount <= 0) return;
    const text = this.add.text(pos.x, pos.y - 28, `${prefix}${amount}`, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    // Pop-in then float up with an eased settle for a juicier feel.
    text.setScale(0.6);
    const driftX = (Math.random() - 0.5) * 24;
    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 120,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: text,
      x: pos.x + driftX,
      y: pos.y - 62,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Flash a unit white briefly to sell an incoming hit. */
  private hitFlash(entity: Entity) {
    if (!entity.container.active) return;
    const shape = entity.body;
    const original = shape.fillColor;
    shape.fillColor = 0xffffff;
    this.time.delayedCall(70, () => {
      if (shape.active) shape.fillColor = original;
    });
    // A quick squash-and-stretch on the whole container.
    this.tweens.add({
      targets: entity.container,
      scaleX: 1.14,
      scaleY: 0.9,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Camera shake scaled to how hard the hit landed. */
  private shake(intensity: number) {
    this.cameras.main.shake(180, Phaser.Math.Clamp(intensity, 0.003, 0.02));
  }

  /**
   * Central hook for a damaging hit: floating number, hit flash, and (for big
   * hits) a camera shake plus impact SFX. Death gets its own sting.
   */
  private onDamage(
    target: Entity | undefined,
    pos: Vec2,
    amount: number,
    color: number,
    lethal: boolean,
  ) {
    this.floatingDamage(pos, amount, color);
    if (target) this.hitFlash(target);
    audio.play('hit');
    if (lethal) {
      audio.play('death');
      if (target) this.deathBurst(target, color);
    }
    if (target && target.unit.kind === 'champion') {
      const frac = amount / target.unit.maxHp;
      if (frac >= BIG_HIT_FRACTION || lethal) {
        this.shake(0.006 + frac * 0.04);
      }
    }
  }

  /** A short expanding ring + fade when a unit dies. */
  private deathBurst(entity: Entity, color: number) {
    const ring = this.add.circle(entity.unit.pos.x, entity.unit.pos.y, 14, color, 0.5);
    ring.setStrokeStyle(2, 0xffffff, 0.8);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Locate the rendered Entity that owns a given Unit, if still active. */
  private entityForUnit(unit: Unit): Entity | undefined {
    return this.allEntities.find((e) => e.unit === unit);
  }

  private drawProjectile(from: Vec2, to: Vec2, color: number) {
    const dot = this.add.circle(from.x, from.y, 6, color);
    this.tweens.add({
      targets: dot,
      x: to.x,
      y: to.y,
      duration: 200,
      onComplete: () => dot.destroy(),
    });
  }

  private drawBeam(from: Vec2, to: Vec2, color: number) {
    const line = this.add.line(0, 0, from.x, from.y, to.x, to.y, color, 0.8);
    line.setOrigin(0, 0);
    line.setLineWidth(2);
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 220,
      onComplete: () => line.destroy(),
    });
  }

  private drawAoe(center: Vec2, radius: number, color: number) {
    const circle = this.add.circle(center.x, center.y, radius, color, 0.28);
    circle.setStrokeStyle(2, color, 0.8);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 1.15,
      duration: 420,
      onComplete: () => circle.destroy(),
    });
  }

  private drawDashTrail(from: Vec2, to: Vec2, color: number) {
    const line = this.add.line(0, 0, from.x, from.y, to.x, to.y, color, 0.6);
    line.setOrigin(0, 0);
    line.setLineWidth(6);
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 300,
      onComplete: () => line.destroy(),
    });
  }

  private pulse(container: Phaser.GameObjects.Container, color: number) {
    const ring = this.add.circle(container.x, container.y, 30, color, 0.4);
    this.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });
  }

  /** A cast tell around the caster - bigger and layered for ultimates. */
  private castFlare(caster: Entity, color: number, ultimate: boolean) {
    const { x, y } = caster.unit.pos;
    const ring = this.add.circle(x, y, ultimate ? 24 : 18, color, 0);
    ring.setStrokeStyle(ultimate ? 4 : 2, color, 0.9);
    this.tweens.add({
      targets: ring,
      scale: ultimate ? 2.6 : 1.8,
      alpha: 0,
      duration: ultimate ? 520 : 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    if (ultimate) {
      // Second, offset ring for extra weight, plus a light camera kick.
      const inner = this.add.circle(x, y, 12, 0xffffff, 0.5);
      this.tweens.add({
        targets: inner,
        scale: 3,
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => inner.destroy(),
      });
      this.shake(0.006);
    }
  }

  /** Brief spin/tint to telegraph that a unit is stunned. */
  private stunSpin(entity: Entity, color: number) {
    const star = this.add.text(entity.unit.pos.x, entity.unit.pos.y - 40, '\u2726', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      color: `#${color.toString(16).padStart(6, '0')}`,
    });
    star.setOrigin(0.5);
    this.tweens.add({
      targets: star,
      angle: 360,
      alpha: 0,
      duration: 600,
      onComplete: () => star.destroy(),
    });
  }

  // ---- HUD + win/lose ------------------------------------------------------

  private pushHud() {
    const slots: CooldownKey[] = ['Q', 'W', 'E', 'R'];
    battleStore.set({
      playerChampionId: this.playerChampion.id,
      enemyChampionId: this.enemyChampion.id,
      playerHp: Math.round(this.player.unit.hp),
      playerMaxHp: this.player.unit.maxHp,
      playerResource: Math.round(this.playerResource),
      playerMaxResource: this.playerMaxResource,
      enemyHp: Math.round(this.enemy.unit.hp),
      enemyMaxHp: this.enemy.unit.maxHp,
      allyNexusPct: this.allyNexus.unit.hp / this.allyNexus.unit.maxHp,
      enemyNexusPct: this.enemyNexus.unit.hp / this.enemyNexus.unit.maxHp,
      elapsed: this.elapsed,
      abilities: slots.map((slot) => {
        const total = this.abilityBySlot(this.playerChampion, slot).cooldown;
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

  private checkWinLose() {
    if (this.ended) return;
    if (this.enemyNexus.unit.dead) this.endGame(true);
    else if (this.allyNexus.unit.dead) this.endGame(false);
  }

  private endGame(win: boolean) {
    this.ended = true;
    audio.play(win ? 'victory' : 'defeat');
    this.cameras.main.flash(300, win ? 10 : 80, win ? 200 : 20, win ? 185 : 30);
    const outcome: BattleOutcome = {
      win,
      playerChampionId: this.playerChampion.id,
      enemyChampionId: this.enemyChampion.id,
      stats: {
        durationSeconds: Math.round(this.elapsed),
        championKills: this.stats.championKills,
        minionKills: this.stats.minionKills,
        damageDealt: Math.round(this.stats.damageDealt),
      },
    };
    this.time.delayedCall(400, () => this.onGameEnd(outcome));
  }
}
