import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, WALL } from '../config/GameConfig';
import { AudioKeys, TextureKeys } from '../config/AssetKeys';
import { CAMERA, GAS, LEVEL } from '../config/PlayerConfig';
import { Player } from '../entities/Player';
import { Wall } from '../entities/Wall';
import { Citizen } from '../entities/Citizen';
import { GasSystem } from '../systems/GasSystem';
import { GrappleSystem, type GrappleSurface } from '../systems/GrappleSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { WaveSystem } from '../systems/WaveSystem';
import type { GameOverData } from './GameOverScene';
import { DebrisProjectile, type AttackEvent, type Enemy } from '../entities/enemies';

/**
 * GameScene wires the hero, ODM traversal, and the full wall-defense combat
 * loop: waves of six giant types marching on the settlement, blade combat with
 * nape criticals, a defendable wall, fleeing citizens, and the game-over
 * conditions (all citizens eaten OR the wall breached; clearing every wave is a
 * victory).
 *
 * Controls:
 *   - A / D (or arrows): run left/right
 *   - W / Space: jump
 *   - Mouse aim + Left click (hold): fire & hold the grapple wire; release to fling
 *   - Right click: aimed BLADE SLASH (nape hits = critical)
 *   - W / S while swinging: reel in / out
 *   - Shift: dash burst toward the aim/movement direction
 *   - ESC: abandon the run
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private gas!: GasSystem;
  private grapple!: GrappleSystem;
  private combat!: CombatSystem;
  private waves!: WaveSystem;
  private wall!: Wall;

  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
  };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private surfaces: GrappleSurface[] = [];
  private groundBody!: Phaser.GameObjects.Rectangle;

  private bgSky!: Phaser.GameObjects.TileSprite;
  private bgHills!: Phaser.GameObjects.TileSprite;
  private bgWall!: Phaser.GameObjects.Image;

  private enemies: Enemy[] = [];
  private projectiles: DebrisProjectile[] = [];
  private citizens: Citizen[] = [];

  // --- game state ---
  private score = 0;
  private wave = 0;
  private citizensSaved = 0;
  private gameEnded = false;

  // --- HUD ---
  private gasBar!: Phaser.GameObjects.Rectangle;
  private wallBar!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private waveBanner!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    this.physics.world.setBounds(0, 0, LEVEL.WIDTH, LEVEL.HEIGHT);

    this.score = 0;
    this.wave = 0;
    this.gameEnded = false;
    this.enemies = [];
    this.projectiles = [];
    this.citizens = [];

    this.buildBackground();
    this.buildLevel();
    this.buildWall();
    this.buildPlayer();
    this.buildCitizens();
    this.buildSystems();
    this.buildCamera();
    this.buildInput();
    this.buildHud();

    this.waves.start(this.time.now);
  }

  /** Parallax background layers spanning the level. */
  private buildBackground(): void {
    this.bgSky = this.add
      .tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-30);
    this.bgHills = this.add
      .tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgHills)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20)
      .setAlpha(0.95);
    this.bgWall = this.add
      .image(LEVEL.WALL_X, LEVEL.GROUND_Y, TextureKeys.BgWall)
      .setOrigin(0.5, 1)
      .setScrollFactor(0.6)
      .setDepth(-10);
  }

  /** Ground floor + floating anchor pylons for verticality. */
  private buildLevel(): void {
    const groundH = LEVEL.HEIGHT - LEVEL.GROUND_Y;
    this.groundBody = this.add
      .rectangle(LEVEL.WIDTH / 2, LEVEL.GROUND_Y + groundH / 2, LEVEL.WIDTH, groundH, PALETTE.GROUND)
      .setDepth(1);
    this.physics.add.existing(this.groundBody, true);

    this.surfaces = [{ bounds: new Phaser.Geom.Rectangle(0, LEVEL.GROUND_Y, LEVEL.WIDTH, groundH) }];

    for (const px of [640, 1040, 1360]) {
      const py = 220;
      const pylon = this.add.rectangle(px, py, 20, 20, PALETTE.WALL_DARK).setDepth(1);
      pylon.setStrokeStyle(1, PALETTE.WALL);
      this.physics.add.existing(pylon, true);
      this.surfaces.push({ bounds: new Phaser.Geom.Rectangle(px - 10, py - 10, 20, 20) });
    }
  }

  private buildWall(): void {
    this.wall = new Wall(this);
    const wallH = LEVEL.GROUND_Y - LEVEL.WALL_TOP_Y;
    this.surfaces.push({
      bounds: new Phaser.Geom.Rectangle(this.wall.faceX, LEVEL.WALL_TOP_Y, 60, wallH),
    });
  }

  private buildPlayer(): void {
    this.player = new Player(this, 120, LEVEL.GROUND_Y - 40);
    this.player.setDepth(6);
    this.physics.add.collider(this.player, this.groundBody);
    this.physics.add.collider(this.player, this.wall.body);
  }

  /** Populate the settlement (right of the wall) with citizens to protect. */
  private buildCitizens(): void {
    const minX = LEVEL.WALL_X + 40;
    const maxX = LEVEL.WIDTH - 20;
    const home = { minX, maxX, groundY: LEVEL.GROUND_Y };
    this.citizensSaved = WALL.START_CITIZENS;
    for (let i = 0; i < WALL.START_CITIZENS; i++) {
      const x = Phaser.Math.Between(minX, maxX);
      this.citizens.push(new Citizen(this, x, home));
    }
  }

  private buildSystems(): void {
    this.gas = new GasSystem(GAS.START, GAS.MAX);
    this.grapple = new GrappleSystem(this, this.player, this.gas);
    this.grapple.setSurfaces(this.surfaces);

    this.combat = new CombatSystem(this, this.player, {
      onDamage: () => {
        /* HUD score is refreshed each frame; hook reserved for popups. */
      },
      onKill: (_enemy, score) => {
        this.score += score;
      },
    });

    this.waves = new WaveSystem(this, {
      spawnDebris: (proj) => this.projectiles.push(proj),
      heroPos: () => new Phaser.Math.Vector2(this.player.x, this.player.y),
      onSpawn: (enemy) => {
        enemy.setDepth(5);
        this.physics.add.collider(enemy, this.groundBody);
        this.enemies.push(enemy);
      },
      onWaveStart: (wave, size) => {
        this.wave = wave;
        this.announceWave(wave, size);
      },
      onAllWavesCleared: () => this.endGame(true),
    });
  }

  private buildCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, LEVEL.WIDTH, LEVEL.HEIGHT);
    cam.startFollow(this.player, true, CAMERA.LERP_X, CAMERA.LERP_Y);
    cam.setDeadzone(CAMERA.DEADZONE_W, CAMERA.DEADZONE_H);
    cam.setFollowOffset(0, 20);
  }

  private buildInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable');
    this.cursors = kb.createCursorKeys();
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const world = this.pointerWorld(pointer);
      if (pointer.leftButtonDown()) {
        this.grapple.fire(world.x, world.y, this.time.now);
      } else if (pointer.rightButtonDown()) {
        // Right click: aimed blade slash.
        this.combat.slash(world.x, world.y, this.time.now);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) this.grapple.release();
    });

    this.input.mouse?.disableContextMenu();

    kb.on('keydown-ESC', () => this.endGame(false));
    this.keys.dash.on('down', () => this.tryDash());
  }

  private buildHud(): void {
    // Gas gauge.
    this.add.rectangle(6, 8, 84, 6, PALETTE.WALL_DARK).setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);
    this.gasBar = this.add.rectangle(6, 8, 84, 6, PALETTE.PLAYER).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);
    this.add.text(6, 13, 'GAS', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS }).setScrollFactor(0).setDepth(51);

    // Wall-integrity gauge.
    this.add.rectangle(6, 26, 84, 6, PALETTE.WALL_DARK).setOrigin(0, 0.5).setScrollFactor(0).setDepth(50);
    this.wallBar = this.add.rectangle(6, 26, 84, 6, PALETTE.ACCENT).setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);
    this.add.text(6, 31, 'WALL', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS }).setScrollFactor(0).setDepth(51);

    // Score / wave / citizens readout.
    this.statusText = this.add
      .text(CANVAS.WIDTH - 6, 8, '', { fontFamily: 'monospace', fontSize: '8px', color: PALETTE.TEXT_CSS, align: 'right' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(51);

    // Center wave banner (transient).
    this.waveBanner = this.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.35, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: PALETTE.DANGER_CSS,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(52)
      .setAlpha(0);
  }

  private announceWave(wave: number, size: number): void {
    this.waveBanner.setText(`WAVE ${wave} / ${this.waves.totalWaves}\n${size} INCOMING`);
    this.waveBanner.setAlpha(1);
    this.tweens.add({ targets: this.waveBanner, alpha: 0, duration: 1600, delay: 900 });
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private tryDash(): void {
    const now = this.time.now;
    if (!this.player.isDashReady(now)) return;
    if (!this.gas.canAfford(GAS.COST_DASH)) return;

    const pointer = this.input.activePointer;
    const world = this.pointerWorld(pointer);
    let dx = world.x - this.player.x;
    let dy = world.y - this.player.y;
    if (Math.hypot(dx, dy) < 8) {
      dx = this.player.facingDir;
      dy = 0;
    }
    if (!this.gas.spend(GAS.COST_DASH, now)) return;
    this.player.startDash(dx, dy, now);
    if (this.cache.audio.exists(AudioKeys.SwingWhoosh)) this.sound.play(AudioKeys.SwingWhoosh, { volume: 0.7 });
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    if (this.gameEnded) return;

    // --- input ---
    const left = this.keys.left.isDown || this.cursors.left.isDown;
    const right = this.keys.right.isDown || this.cursors.right.isDown;
    const jumpDown = this.keys.jump.isDown || this.keys.up.isDown || this.cursors.up.isDown;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.jump) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up);

    // --- grapple / swing ---
    const pointer = this.input.activePointer;
    const world = this.pointerWorld(pointer);
    const reelIn = this.keys.up.isDown;
    const reelOut = this.keys.down.isDown;
    this.grapple.update({ fireHeld: pointer.leftButtonDown(), aimX: world.x, aimY: world.y, reelIn, reelOut }, delta, now);

    // --- player + gas ---
    this.player.updatePlayer({ left, right, jumpPressed, jumpHeld: jumpDown }, delta, now);
    this.gas.regen(this.player.grounded, delta, now);

    // --- world simulation ---
    this.updateEnemies(now, delta);
    this.updateProjectiles(delta);
    this.updateCitizens(now, delta);

    // --- combat targets in sync ---
    this.combat.setEnemies(this.enemies);

    // --- waves ---
    this.waves.update(now, this.enemies.filter((e) => !e.isDying).length);

    // --- presentation ---
    this.updateParallax();
    this.updateHud();
  }

  /** Step every giant, apply its attack events to the wall/citizens, cull dead. */
  private updateEnemies(now: number, delta: number): void {
    const ctx = {
      wallX: this.wall.faceX,
      groundY: LEVEL.GROUND_Y,
      wallBreached: this.wall.isBreached,
      nowMs: now,
      dtMs: delta,
    };
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDying) continue;
      const attack = enemy.update(ctx);
      if (attack) this.resolveEnemyAttack(attack);
    }
    // Drop destroyed (inactive) entities; dying giants stay until their tween
    // finishes and marks them inactive.
    this.enemies = this.enemies.filter((e) => e.active);
  }

  /** Apply a melee giant attack: damage the wall, or eat a citizen past a breach. */
  private resolveEnemyAttack(attack: AttackEvent): void {
    if (!this.wall.isBreached) {
      const breached = this.wall.damage(attack.damage);
      if (breached) this.onWallBreached();
    } else {
      // Past the breach: attack the nearest citizen (eat it).
      this.eatNearestCitizen(attack.x);
    }
  }

  private onWallBreached(): void {
    // Open the wall as a grapple/traversal surface change is unnecessary; the
    // breach simply lets giants path onward. Losing the wall ends the run.
    this.endGame(false);
  }

  private eatNearestCitizen(x: number): void {
    let nearest: Citizen | null = null;
    let best = Infinity;
    for (const c of this.citizens) {
      if (c.isConsumed) continue;
      const d = Math.abs(c.x - x);
      if (d < best) {
        best = d;
        nearest = c;
      }
    }
    if (nearest && best < 60) {
      nearest.devour();
      this.citizensSaved = Math.max(0, this.citizensSaved - 1);
      if (this.cache.audio.exists(AudioKeys.CitizenScream)) this.sound.play(AudioKeys.CitizenScream, { volume: 0.6 });
      if (this.citizensSaved <= 0) this.endGame(false);
    }
  }

  private updateProjectiles(delta: number): void {
    const alive: DebrisProjectile[] = [];
    for (const proj of this.projectiles) {
      if (!proj.active || proj.isSpent) continue;
      proj.updateProjectile(delta);

      // Impact with the wall face.
      if (!this.wall.isBreached && proj.x >= this.wall.faceX - 6 && proj.y > LEVEL.WALL_TOP_Y) {
        if (this.wall.damage(proj.wallDamage)) this.onWallBreached();
        proj.onImpact();
        continue;
      }
      // Direct hit on the hero.
      if (Phaser.Math.Distance.Between(proj.x, proj.y, this.player.x, this.player.y) < 16) {
        this.cameras.main.shake(160, 0.01);
        proj.onImpact();
        continue;
      }
      // Hit the ground or left the world.
      if (proj.y >= LEVEL.GROUND_Y || proj.x < -40 || proj.x > LEVEL.WIDTH + 40) {
        proj.onImpact();
        continue;
      }
      alive.push(proj);
    }
    this.projectiles = alive;
  }

  private updateCitizens(now: number, delta: number): void {
    // Nearest giant that has crossed the (breached) wall, for flee behaviour.
    let threatX: number | null = null;
    if (this.wall.isBreached) {
      let best = Infinity;
      for (const e of this.enemies) {
        if (e.isDying) continue;
        if (e.x > this.wall.faceX && e.x < best) {
          best = e.x;
          threatX = e.x;
        }
      }
    }
    const alive: Citizen[] = [];
    for (const c of this.citizens) {
      if (!c.active) continue;
      c.updateCitizen(now, delta, threatX);
      if (!c.isConsumed) alive.push(c);
    }
    this.citizens = alive.filter((c) => c.active);
  }

  private updateParallax(): void {
    const scrollX = this.cameras.main.scrollX;
    this.bgSky.tilePositionX = scrollX * 0.1;
    this.bgHills.tilePositionX = scrollX * 0.3;
    void this.bgWall;
  }

  private updateHud(): void {
    this.gasBar.width = Math.max(0, Math.floor(84 * this.gas.ratio));
    this.gasBar.fillColor = this.gas.isEmpty ? PALETTE.ENEMY_WEAKPOINT : PALETTE.PLAYER;

    this.wallBar.width = Math.max(0, Math.floor(84 * this.wall.ratio));
    this.wallBar.fillColor = this.wall.ratio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.ACCENT;

    this.statusText.setText(
      `SCORE ${this.score}\nWAVE ${this.wave}/${this.waves.totalWaves}\nCITIZENS ${this.citizensSaved}/${WALL.START_CITIZENS}`,
    );
  }

  /** End the run and transition to the summary with the results payload. */
  private endGame(victory: boolean): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.world.timeScale = 1;

    const data: GameOverData = {
      victory,
      wavesSurvived: victory ? this.waves.totalWaves : Math.max(0, this.wave),
      citizensSaved: this.citizensSaved,
      score: this.score,
    };
    this.combat.destroy();
    this.time.delayedCall(500, () => this.scene.start(SceneKeys.GameOver, data));
  }
}
