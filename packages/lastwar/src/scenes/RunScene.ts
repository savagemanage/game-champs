import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RUN, ENEMIES, SQUAD } from '../config/GameConfig';
import { TextureKeys, AudioKeys, ENEMY_TEXTURE_BY_KIND, type EnemyKind } from '../config/AssetKeys';
import type { DerivedStats, Gate, Lane, RunResult } from '../types';
import { applyGate, gateLabel, isGoodGate } from '../systems/GateMath';
import { buildTrack, resolveRun, squadFirepower, type RunTrack } from '../systems/RunSimulator';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import { deriveStats } from '../systems/MetaProgress';
import { RunHud } from '../ui/RunHud';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { setAccessibleScreen } from '../systems/Accessibility';

/**
 * RunScene - the core LAST SQUAD gate-runner loop.
 *
 * A crowd of soldier sprites auto-runs "up" the screen along two lanes on a
 * scrolling road. The player slides the squad between lanes by dragging or with
 * the arrow / A-D keys. Rows of math gates apply their operation to the squad
 * size as the crowd passes through; periodic enemy clusters are auto-shot by
 * the squad (firepower burns cluster HP, leftover HP costs soldiers); a boss
 * caps the run.
 *
 * The deterministic model lives in RunSimulator. We build the same track from a
 * seed, let the player steer in real time, and apply the SAME gate/cluster/boss
 * math the simulator uses. When the run ends we call resolveRun() with the
 * collected lane choices to produce the authoritative, unit-tested RunResult
 * that gets persisted, keeping the visible outcome consistent with the model.
 */

/** Vertical screen position (fraction) where the squad sits; the world scrolls past it. */
const SQUAD_Y_FRAC = 0.78;

/** Distance-units-per-pixel is 1:1; obstacles are placed at world distance and drawn relative to travelled. */

type Obstacle =
  | {
      type: 'row';
      distance: number;
      index: number;
      gates: Gate[];
      sprites: Phaser.GameObjects.Container[];
      resolved: boolean;
    }
  | {
      type: 'cluster';
      distance: number;
      hp: number;
      boss: boolean;
      units: Phaser.GameObjects.Sprite[];
      hpBar?: { setProgress(f: number): void; setFillColor(c: number): void };
      engaged: boolean;
      resolved: boolean;
      maxHp: number;
    };

export class RunScene extends Phaser.Scene {
  private seed = 0;
  private runId = '';
  private stats!: DerivedStats;
  private track!: RunTrack;

  private road?: Phaser.GameObjects.TileSprite;
  private skyline?: Phaser.GameObjects.Image;

  private squadSize = 0;
  private squadPeak = 0;
  private lane: Lane = 0;
  private laneChoices: Lane[] = [];

  private soldiers: Phaser.GameObjects.Sprite[] = [];
  private squadContainer!: Phaser.GameObjects.Container;

  private obstacles: Obstacle[] = [];
  private hud!: RunHud;

  private travelled = 0;
  private running = false;
  private suspended = false;
  private finished = false;
  private startTimer: Phaser.Time.TimerEvent | null = null;

  private fireTimer = 0;
  private shootSfxTimer = 0;
  private bossFxTimer = 0;
  private bossActive = false;
  private bossTimer = 0;
  private activeBoss: Extract<Obstacle, { type: 'cluster' }> | null = null;

  private dragActive = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private resumeRunning = false;
  private readonly lifecyclePause = (): void => this.pauseRun();
  private readonly visibilityPause = (): void => {
    if (document.visibilityState === 'hidden') this.pauseRun();
  };

  constructor() {
    super({ key: SceneKeys.Run });
  }

  create(): void {
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this, 250);

    const gameStore = GameStore.get();
    this.stats = deriveStats(gameStore.state.miniGame.upgrades);
    const identity = gameStore.beginFalconRun();
    this.runId = identity.runId;
    this.seed = identity.seed;

    this.squadSize = Math.max(1, Math.round(this.stats.startSize));
    this.squadPeak = this.squadSize;
    this.lane = 0;
    this.laneChoices = [];
    this.travelled = 0;
    this.finished = false;
    this.running = false;
    this.suspended = false;
    this.startTimer = null;
    this.bossActive = false;
    this.bossTimer = 0;
    this.bossFxTimer = 0;
    this.activeBoss = null;
    this.obstacles = [];
    this.soldiers = [];

    this.track = buildTrack(this.seed, this.squadSize);

    this.buildBackground();
    this.ensureAnims();
    this.buildObstacles();

    this.squadContainer = this.add.container(this.laneX(this.lane), CANVAS.HEIGHT * SQUAD_Y_FRAC);
    this.squadContainer.setDepth(20);
    this.syncSoldiers();

    this.hud = new RunHud(this);
    this.hud.setSquad(this.squadSize);
    this.hud.setDistance(0);
    this.hud.setScore(0);
    this.hud.setRewardsRemaining(gameStore.falconRewardsRemaining(Date.now()));
    setAccessibleScreen(tr('nav.falcon'), tr('run.rewardsRemaining', { count: gameStore.falconRewardsRemaining(Date.now()) }));

    Menu.button(this, CANVAS.WIDTH - 38, 78, tr('run.pause'), () => this.pauseRun(), {
      width: 64,
      height: 44,
      fontSize: 12,
      allowSmall: true,
    }).container.setDepth(100);

    this.setupInput();
    document.addEventListener('visibilitychange', this.visibilityPause);
    window.addEventListener('blur', this.lifecyclePause);
    window.addEventListener('orientationchange', this.lifecyclePause);

    // Short "GO!" countdown flash, then start running.
    this.showGo();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy();
      this.startTimer?.remove();
      this.startTimer = null;
      this.time.paused = false;
      this.tweens.resumeAll();
      document.removeEventListener('visibilitychange', this.visibilityPause);
      window.removeEventListener('blur', this.lifecyclePause);
      window.removeEventListener('orientationchange', this.lifecyclePause);
    });
  }

  // ---- Setup helpers ----------------------------------------------------

  private buildBackground(): void {
    const cx = CANVAS.WIDTH / 2;
    this.skyline = this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setDepth(0);
    this.road = this.add
      .tileSprite(cx, CANVAS.HEIGHT, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgRoad)
      .setOrigin(0.5, 1)
      .setDepth(1);
  }

  private ensureAnims(): void {
    const defs: Array<[string, string]> = [
      ['squad_run', TextureKeys.Soldier],
      ['walker_walk', TextureKeys.EnemyWalker],
      ['runner_walk', TextureKeys.EnemyRunner],
    ];
    for (const [key, tex] of defs) {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(tex, { start: 0, end: 1 }),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
    for (const [key, tex] of [
      ['fx_muzzle_play', TextureKeys.FxMuzzle],
      ['fx_hit_play', TextureKeys.FxHit],
      ['fx_sparkle_play', TextureKeys.FxSparkle],
    ] as Array<[string, string]>) {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(tex, { start: 0, end: 3 }),
          frameRate: 24,
          repeat: 0,
        });
      }
    }
  }

  private buildObstacles(): void {
    // Gate rows.
    this.track.rows.forEach((row, index) => {
      const sprites: Phaser.GameObjects.Container[] = [];
      row.gates.forEach((gate) => {
        sprites.push(this.buildGateSprite(gate));
      });
      this.obstacles.push({ type: 'row', distance: row.distance, index, gates: row.gates, sprites, resolved: false });
    });

    // Clusters.
    this.track.clusters.forEach((cluster) => {
      this.obstacles.push({
        type: 'cluster',
        distance: cluster.distance,
        hp: cluster.hp,
        maxHp: cluster.hp,
        boss: false,
        units: [],
        engaged: false,
        resolved: false,
      });
    });

    // Boss.
    this.obstacles.push({
      type: 'cluster',
      distance: this.track.boss.distance,
      hp: this.track.boss.hp,
      maxHp: this.track.boss.hp,
      boss: true,
      units: [],
      engaged: false,
      resolved: false,
    });

    this.obstacles.sort((a, b) => a.distance - b.distance);
  }

  private buildGateSprite(gate: Gate): Phaser.GameObjects.Container {
    const good = this.gateIsGood(gate);
    const tint = good ? PALETTE.GATE_GOOD : PALETTE.GATE_BAD;
    const img = this.add.image(0, 0, TextureKeys.Gate).setTint(tint).setAlpha(0.9);
    const label = this.add
      .text(0, 0, gateLabel(gate), textStyle(26, { fontStyle: 'bold', color: good ? PALETTE.GATE_GOOD_CSS : PALETTE.GATE_BAD_CSS }))
      .setOrigin(0.5);
    label.setColor('#ffffff');
    const c = this.add.container(this.laneX(gate.lane), -400, [img, label]);
    c.setDepth(8);
    c.setVisible(false);
    return c;
  }

  private gateIsGood(gate: Gate): boolean {
    return isGoodGate(this.squadSize, gate) && (gate.op === 'add' || gate.op === 'mul');
  }

  private setupInput(): void {
    // Pointer drag steers toward the pointer's lane.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragActive = true;
      this.setLane(p.worldX < CANVAS.WIDTH / 2 ? 0 : 1);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragActive = false;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.dragActive && !p.isDown) return;
      this.setLane(p.worldX < CANVAS.WIDTH / 2 ? 0 : 1);
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.setLane(0));
    kb?.on('keydown-A', () => this.setLane(0));
    kb?.on('keydown-RIGHT', () => this.setLane(1));
    kb?.on('keydown-D', () => this.setLane(1));
    kb?.on('keydown-P', () => this.pauseRun());
    kb?.on('keydown-ESC', () => this.pauseRun());
  }

  private pauseRun(): void {
    if (this.finished || this.pauseLayer) return;
    this.resumeRunning = this.running;
    this.running = false;
    this.suspended = true;
    this.time.paused = true;
    this.tweens.pauseAll();
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const scrim = this.add.rectangle(cx, cy, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.78).setInteractive();
    const panel = Menu.panel(this, cx, cy, 400, 250, 0.99);
    const title = Menu.title(this, cx, cy - 70, tr('run.paused'), 28);
    const resume = Menu.button(this, cx, cy, tr('run.resume'), () => this.resumeRun(), { width: 220 });
    const abandon = Menu.button(this, cx, cy + 62, tr('run.abandon'), () => this.abandonRun(), { width: 220, accent: PALETTE.DANGER });
    this.pauseLayer = this.add.container(0, 0, [scrim, panel, title, resume.container, abandon.container]).setDepth(200);
  }

  private resumeRun(): void {
    this.pauseLayer?.destroy(true);
    this.pauseLayer = null;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.suspended = false;
    this.running = this.resumeRunning;
  }

  private abandonRun(): void {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.pauseLayer?.destroy(true);
    this.pauseLayer = null;
    this.suspended = false;
    this.finished = true;
    this.scene.start(SceneKeys.Home);
  }

  private showGo(): void {
    const t = this.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.42, tr('run.go'), textStyle(48, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0.5)
      .setDepth(60)
      .setScale(0.5);
    this.tweens.add({
      targets: t,
      scale: 1.2,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
    this.startTimer = this.time.delayedCall(300, () => {
      this.startTimer = null;
      if (!this.suspended && !this.finished) this.running = true;
    });
  }

  // ---- Lane / squad rendering ------------------------------------------

  private laneX(lane: Lane): number {
    return CANVAS.WIDTH * RUN.LANE_CENTERS[lane === 1 ? 1 : 0];
  }

  private setLane(lane: Lane): void {
    const l: Lane = lane === 1 ? 1 : 0;
    if (l === this.lane) return;
    this.lane = l;
    this.tweens.add({
      targets: this.squadContainer,
      x: this.laneX(l),
      duration: 120,
      ease: 'Quad.easeOut',
    });
  }

  /** Rebuild the rendered soldier crowd to match the squad size (capped). */
  private syncSoldiers(): void {
    const target = Math.min(this.squadSize, SQUAD.MAX_RENDERED);
    // Add missing soldiers.
    while (this.soldiers.length < target) {
      const s = this.add.sprite(0, 0, TextureKeys.Soldier).setScale(1.6).play('squad_run');
      s.anims.setProgress(Math.random());
      this.soldiers.push(s);
      this.squadContainer.add(s);
    }
    // Remove extras.
    while (this.soldiers.length > target) {
      const s = this.soldiers.pop();
      s?.destroy();
    }
    // Arrange into a compact formation grid centred on the container.
    const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(this.soldiers.length))));
    const spacingX = 15;
    const spacingY = 15;
    this.soldiers.forEach((s, i) => {
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      const rowCount = Math.ceil(this.soldiers.length / cols);
      s.x = (col - (cols - 1) / 2) * spacingX + Phaser.Math.Between(-2, 2);
      s.y = (rowIdx - (rowCount - 1) / 2) * spacingY;
      s.setDepth(20 + rowIdx);
    });
  }

  private setSquadSize(next: number, grew: boolean): void {
    this.squadSize = Math.max(0, Math.floor(next));
    this.squadPeak = Math.max(this.squadPeak, this.squadSize);
    this.syncSoldiers();
    this.hud.setSquad(this.squadSize);
    // Scale pop on the whole crowd.
    this.tweens.add({
      targets: this.squadContainer,
      scale: grew ? 1.15 : 0.9,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.squadContainer.setScale(1),
    });
  }

  // ---- Main loop --------------------------------------------------------

  update(_time: number, delta: number): void {
    if (this.finished || this.suspended) return;
    const dt = delta / 1000;

    if (this.running && !this.bossActive) {
      this.travelled += RUN.SCROLL_SPEED * dt;
      const scrollPx = RUN.SCROLL_SPEED * dt;
      if (this.road) this.road.tilePositionY -= scrollPx;
      if (this.skyline) this.skyline.x = CANVAS.WIDTH / 2 + Math.sin(this.travelled * 0.002) * 6;
    }

    // Position and resolve obstacles relative to how far we've travelled.
    this.updateObstacles(dt);

    // Auto-fire visuals.
    this.updateAutoFire(dt);

    // HUD.
    this.hud.setDistance(Math.min(RUN.RUN_DISTANCE, Math.round(this.travelled)));
    this.hud.setScore(Math.floor(this.travelled + this.squadSize * 10 + this.squadPeak * 5));

    // Boss engagement handled in resolveBoss via timer.
    if (this.bossActive) this.updateBoss(dt);

    if (this.squadSize <= 0 && !this.finished) {
      this.endRun();
    }
  }

  private worldY(distance: number): number {
    // Obstacle at `distance` should be at the squad line when travelled==distance,
    // and above (smaller y) when it's ahead.
    return CANVAS.HEIGHT * SQUAD_Y_FRAC - (distance - this.travelled);
  }

  private updateObstacles(_dt: number): void {
    for (const ob of this.obstacles) {
      const y = this.worldY(ob.distance);

      if (ob.type === 'row') {
        ob.sprites.forEach((c) => {
          if (ob.distance - this.travelled < 520 && !c.visible) c.setVisible(true);
          c.y = y;
        });
        if (!ob.resolved && this.travelled >= ob.distance) {
          this.resolveGateRow(ob);
        }
      } else {
        // Spawn cluster units as they approach.
        if (!ob.engaged && ob.distance - this.travelled < 480) {
          this.spawnCluster(ob, y);
          ob.engaged = true;
        }
        // Move existing units.
        for (const u of ob.units) {
          u.y = y + (u.getData('offY') as number);
        }
        if (!ob.resolved && this.travelled >= ob.distance) {
          if (ob.boss) {
            this.beginBoss(ob);
          } else {
            this.resolveCluster(ob);
          }
        }
      }
    }
  }

  private resolveGateRow(ob: Extract<Obstacle, { type: 'row' }>): void {
    ob.resolved = true;
    this.laneChoices[ob.index] = this.lane;
    const gate = ob.gates[this.lane] ?? ob.gates[0];
    const before = this.squadSize;
    const after = applyGate(before, gate.op, gate.value);
    const grew = after >= before;
    this.setSquadSize(after, grew);

    // FX + SFX at the chosen gate.
    const gx = this.laneX(this.lane);
    const gy = CANVAS.HEIGHT * SQUAD_Y_FRAC;
    this.playFx(grew ? TextureKeys.FxSparkle : TextureKeys.FxHit, 'fx_sparkle_play', gx, gy, grew);
    AudioManager.get(this).playSfx(grew ? AudioKeys.GatePass : AudioKeys.Hit, 0.7);
    if (grew) AudioManager.get(this).playSfx(AudioKeys.LevelUp, 0.4);
    else this.shake(120, 0.006);

    // Dissolve the passed gates.
    ob.sprites.forEach((c) => {
      this.tweens.add({ targets: c, alpha: 0, y: c.y + 40, duration: 220, onComplete: () => c.destroy() });
    });
  }

  private spawnCluster(ob: Extract<Obstacle, { type: 'cluster' }>, y: number): void {
    if (ob.boss) {
      const boss = this.add.sprite(CANVAS.WIDTH / 2, y, TextureKeys.Boss).setScale(1.6).setDepth(15);
      boss.setData('offY', 0);
      ob.units.push(boss);
      this.hud.showBossBar(true);
      this.hud.setBossHp(1);
      // Warning flash.
      const warn = this.add
        .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.3, tr('run.bossWarning'), textStyle(30, { fontStyle: 'bold', color: PALETTE.BOSS_CSS }))
        .setOrigin(0.5)
        .setDepth(60);
      this.tweens.add({ targets: warn, alpha: 0, scale: 1.4, duration: 1000, onComplete: () => warn.destroy() });
      return;
    }
    // A small mob of walker/runner sprites.
    const kind: EnemyKind = (ob.distance % 2 === 0 ? 'walker' : 'runner') as EnemyKind;
    const tex = ENEMY_TEXTURE_BY_KIND[kind];
    const anim = kind === 'walker' ? 'walker_walk' : 'runner_walk';
    const count = Phaser.Math.Clamp(Math.round(ob.maxHp / 20), 3, 10);
    for (let i = 0; i < count; i++) {
      const lane = i % 2;
      const offX = (i % 2 === 0 ? -1 : 1) * (10 + (i % 3) * 10);
      const offY = -Math.floor(i / 2) * 16;
      const u = this.add.sprite(this.laneX(lane) + offX * 0.5, y + offY, tex).setScale(1.5).setDepth(14).play(anim);
      u.setData('offY', offY);
      ob.units.push(u);
    }
  }

  private resolveCluster(ob: Extract<Obstacle, { type: 'cluster' }>): void {
    ob.resolved = true;
    // SAME math as RunSimulator: fixed engagement time over the cluster spacing.
    const firepower = squadFirepower(this.squadSize, this.stats);
    const engageSeconds = ENEMIES.CLUSTER_SPACING / RUN.SCROLL_SPEED;
    const damageDealt = Math.min(ob.hp, firepower * engageSeconds);
    const leftover = Math.max(0, ob.hp - damageDealt);
    const casualties = Math.floor(leftover * ENEMIES.DAMAGE_PER_LEFTOVER_HP);
    const before = this.squadSize;
    const after = Math.max(0, before - casualties);

    // Hit FX on each unit, then destroy them.
    for (const u of ob.units) {
      this.playFx(TextureKeys.FxHit, 'fx_hit_play', u.x, u.y, false);
      this.tweens.add({ targets: u, alpha: 0, scale: 1.9, duration: 200, onComplete: () => u.destroy() });
    }
    AudioManager.get(this).playSfx(AudioKeys.Hit, 0.6);
    if (casualties > 0) {
      this.shake(160, 0.008);
      this.setSquadSize(after, false);
    }
  }

  private beginBoss(ob: Extract<Obstacle, { type: 'cluster' }>): void {
    ob.resolved = true;
    this.bossActive = true;
    this.bossTimer = 0;
    this.running = false;
    this.activeBoss = ob;
    AudioManager.get(this).playSfx(AudioKeys.Hit, 0.8);
  }

  private updateBoss(dt: number): void {
    const ob = this.activeBoss;
    if (!ob) return;
    this.bossTimer += dt;
    const boss = ob.units[0];

    // Continuous chip damage over BOSS_DURATION, mirroring the model's total.
    const firepower = squadFirepower(this.squadSize, this.stats);
    const chip = Math.min(ob.hp, firepower * dt);
    ob.hp = Math.max(0, ob.hp - chip);
    this.hud.setBossHp(ob.hp / ob.maxHp);

    // Occasional muzzle/hit FX on the boss.
    this.bossFxTimer -= dt;
    if (boss && this.bossFxTimer <= 0) {
      this.playFx(TextureKeys.FxHit, 'fx_hit_play', boss.x + Phaser.Math.Between(-20, 20), boss.y + Phaser.Math.Between(-10, 10), false);
      AudioManager.get(this).playSfx(AudioKeys.Shoot, 0.3);
      this.bossFxTimer = 0.12;
    }

    if (this.bossTimer >= ENEMIES.BOSS_DURATION || ob.hp <= 0) {
      this.finishBoss(ob);
    }
  }

  private finishBoss(ob: Extract<Obstacle, { type: 'cluster' }>): void {
    this.bossActive = false;
    // SAME math as RunSimulator boss resolution.
    const firepower = squadFirepower(this.squadSize, this.stats);
    const damageDealt = Math.min(ob.maxHp, firepower * ENEMIES.BOSS_DURATION);
    const leftover = Math.max(0, ob.maxHp - damageDealt);
    const casualties = Math.floor(leftover * ENEMIES.BOSS_DAMAGE_PER_HP);
    const after = Math.max(0, this.squadSize - casualties);
    const boss = ob.units[0];
    if (leftover <= 0 && after > 0) {
      // Boss down.
      if (boss) {
        this.playFx(TextureKeys.FxHit, 'fx_hit_play', boss.x, boss.y, false);
        this.tweens.add({ targets: boss, alpha: 0, scale: 2.2, angle: 20, duration: 400, onComplete: () => boss.destroy() });
      }
      this.shake(300, 0.014);
    } else {
      if (casualties > 0) this.shake(300, 0.02);
      this.setSquadSize(after, false);
    }
    this.hud.setBossHp(Math.max(0, ob.hp / ob.maxHp));
    this.time.delayedCall(500, () => this.endRun());
  }

  private updateAutoFire(dt: number): void {
    if (this.squadSize <= 0) return;
    // Only fire when an enemy cluster is nearby/engaged and unresolved.
    const engaging = this.obstacles.some(
      (o) => o.type === 'cluster' && o.engaged && !o.resolved && o.distance - this.travelled < 260,
    );
    if (!engaging && !this.bossActive) return;

    this.fireTimer -= dt;
    this.shootSfxTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 1 / Math.max(1, this.stats.fireRate * 2);
      // Muzzle flash on a few front soldiers.
      const front = this.soldiers.slice(0, Math.min(4, this.soldiers.length));
      for (const s of front) {
        const wx = this.squadContainer.x + s.x;
        const wy = this.squadContainer.y + s.y - 12;
        this.playFx(TextureKeys.FxMuzzle, 'fx_muzzle_play', wx, wy, false, 1.2);
      }
      if (!this.bossActive && this.shootSfxTimer <= 0) {
        AudioManager.get(this).playSfx(AudioKeys.Shoot, 0.25);
        this.shootSfxTimer = 0.15;
      }
    }
  }

  private shake(duration: number, intensity: number): void {
    if (AudioManager.get(this).getSettings().shakeEnabled) this.cameras.main.shake(duration, intensity);
  }

  private playFx(tex: string, anim: string, x: number, y: number, tintGood: boolean, scale = 1.6): void {
    const fx = this.add.sprite(x, y, tex).setScale(scale).setDepth(40);
    if (tex === TextureKeys.FxSparkle) fx.setTint(tintGood ? PALETTE.SUCCESS : PALETTE.ACCENT);
    fx.play(anim);
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
  }

  // ---- End of run -------------------------------------------------------

  private endRun(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;

    // Fill in any lane choices for gate rows not yet reached (defaults to
    // current lane) so resolveRun matches what actually happened up to death.
    const rowCount = this.track.rows.length;
    for (let i = 0; i < rowCount; i++) {
      if (this.laneChoices[i] === undefined) this.laneChoices[i] = this.lane;
    }

    // Authoritative, unit-tested result from the pure model.
    const resolved = resolveRun(this.seed, this.stats, this.laneChoices);
    const result: RunResult = resolved.result;

    const settlement = GameStore.get().settleFalconRun(this.runId, result, Date.now());

    AudioManager.get(this).playSfx(result.win ? AudioKeys.Victory : AudioKeys.Defeat, 0.9);

    this.time.delayedCall(400, () => {
      Menu.fadeTo(this, () =>
        this.scene.start(SceneKeys.Results, {
          runId: this.runId,
          result,
          newBestDistance: settlement.newBestDistance,
          newBestScore: settlement.newBestScore,
          reward: settlement.reward,
          grantedMainGame: settlement.grantedMainGame,
          remainingToday: settlement.remainingToday,
        }),
      );
    });
  }
}
