import Phaser from 'phaser';
import { SceneKeys, PALETTE, WALL } from '../config/GameConfig';
import { AudioKeys, TextureKeys } from '../config/AssetKeys';
import { HERO_THREAT } from '../config/EnemyConfig';
import { ARENA, CAMERA, GAS } from '../config/PlayerConfig';
import { Player } from '../entities/Player';
import { Wall } from '../entities/Wall';
import { Citizen } from '../entities/Citizen';
import { GasSystem } from '../systems/GasSystem';
import { GrappleSystem, type GrappleSurface, type GrappleTarget } from '../systems/GrappleSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { AudioManager } from '../systems/AudioManager';
import { Hud } from '../ui/Hud';
import type { GameOverData } from './GameOverScene';
import {
  AttackTarget,
  DebrisProjectile,
  type AttackEvent,
  type Enemy,
  type EnemyContext,
} from '../entities/enemies';

/**
 * GameScene wires the hero, ODM traversal, and the top-down wall-defense loop:
 * waves of six giant types besieging the settlement from every angle, blade
 * combat with nape criticals, a concentric DOUBLE ring wall (outer + inner)
 * around a citizen core at the arena center, fleeing citizens, and the
 * game-over conditions (the hero's HP hits zero, all citizens eaten, OR the
 * inner ring falls; clearing every wave is a victory).
 *
 * Controls (top-down):
 *   - W / A / S / D (or arrows): 8-direction planar movement
 *   - Mouse aim + Left click (hold): fire & hold the grapple wire; release to fling
 *   - Right click: aimed BLADE SLASH (nape hits = critical)
 *   - Shift: OMNIDIRECTIONAL dash toward the aim/movement direction
 *   - P: pause    ESC: abandon the run
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private gas!: GasSystem;
  private grapple!: GrappleSystem;
  private combat!: CombatSystem;
  private waves!: WaveSystem;
  private wall!: Wall;
  private hud!: Hud;
  private audio!: AudioManager;

  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
    pause: Phaser.Input.Keyboard.Key;
    reelIn: Phaser.Input.Keyboard.Key;
    reelOut: Phaser.Input.Keyboard.Key;
  };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private surfaces: GrappleSurface[] = [];

  private enemies: Enemy[] = [];
  private projectiles: DebrisProjectile[] = [];
  private citizens: Citizen[] = [];

  // --- game state ---
  private score = 0;
  private wave = 0;
  private citizensSaved = 0;
  private gameEnded = false;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.physics.world.setBounds(0, 0, ARENA.WIDTH, ARENA.HEIGHT);

    this.audio = AudioManager.get(this);
    this.audio.playMusic(AudioKeys.MusicLoop);

    this.score = 0;
    this.wave = 0;
    this.gameEnded = false;
    this.enemies = [];
    this.projectiles = [];
    this.citizens = [];

    this.buildArena();
    this.buildWall();
    this.buildPlayer();
    this.buildCitizens();
    this.buildSystems();
    this.buildCamera();
    this.buildInput();
    this.hud = new Hud(this);
    this.hud.showHint();

    this.waves.start(this.time.now);
  }

  /** Top-down arena floor: a tiled ground fill spanning the whole arena. */
  private buildArena(): void {
    this.add
      .tileSprite(0, 0, ARENA.WIDTH, ARENA.HEIGHT, TextureKeys.BgSky)
      .setOrigin(0, 0)
      .setDepth(-30)
      .setTint(PALETTE.GROUND);
    // A subtle concentric guide ring at the center reads as the plaza floor.
    const plaza = this.add.graphics().setDepth(-29);
    plaza.fillStyle(PALETTE.BG_NEAR, 0.35);
    plaza.fillCircle(ARENA.CENTER_X, ARENA.CENTER_Y, WALL.INNER_RADIUS);
    plaza.lineStyle(2, PALETTE.WALL_DARK, 0.5);
    plaza.strokeCircle(ARENA.CENTER_X, ARENA.CENTER_Y, WALL.OUTER_RADIUS);
    plaza.strokeCircle(ARENA.CENTER_X, ARENA.CENTER_Y, WALL.INNER_RADIUS);
  }

  private buildWall(): void {
    // Wall creates its own static bodies for each ring block; the scene just
    // wires colliders (see buildPlayer) and reads grapple surfaces.
    this.wall = new Wall(this);
    this.refreshGrappleSurfaces();
  }

  /** Rebuild the grapple anchor surfaces from the current (un-breached) rings. */
  private refreshGrappleSurfaces(): void {
    this.surfaces = this.wall.grappleSurfaces;
    if (this.grapple) this.grapple.setSurfaces(this.surfaces);
  }

  /**
   * Build fresh MOVING grapple-target adapters from the live giants so the wire
   * can hook onto them (not just walls). Each adapter reads the giant's LIVE
   * position + AABB and reports isValid=false the moment the giant is dying or
   * inactive, so the GrappleSystem tracks a moving anchor and detaches cleanly
   * on death without ever holding a hard Enemy reference across frames.
   */
  private buildGrappleTargets(): GrappleTarget[] {
    const targets: GrappleTarget[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isDying) continue;
      const body = enemy.body;
      if (!body) continue;
      targets.push({
        get x() {
          return enemy.x;
        },
        get y() {
          return enemy.y;
        },
        get bounds() {
          return new Phaser.Geom.Rectangle(body.left, body.top, body.width, body.height);
        },
        get isValid() {
          return enemy.active && !enemy.isDying;
        },
      });
    }
    return targets;
  }

  private buildPlayer(): void {
    // Spawn the hero between the inner and outer rings, ready to defend.
    const spawnR = (WALL.OUTER_RADIUS + WALL.INNER_RADIUS) / 2;
    this.player = new Player(this, ARENA.CENTER_X, ARENA.CENTER_Y - spawnR);
    this.player.setDepth(6);
    for (const block of this.wall.colliders) {
      this.physics.add.collider(this.player, block);
    }
  }

  /** Populate the citizen core at the arena center (inside the inner ring). */
  private buildCitizens(): void {
    const home = {
      centerX: ARENA.CENTER_X,
      centerY: ARENA.CENTER_Y,
      radius: WALL.INNER_RADIUS - 30,
    };
    this.citizensSaved = WALL.START_CITIZENS;
    for (let i = 0; i < WALL.START_CITIZENS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * home.radius * 0.8;
      const x = home.centerX + Math.cos(angle) * r;
      const y = home.centerY + Math.sin(angle) * r;
      this.citizens.push(new Citizen(this, x, y, home));
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
      onSpawn: (enemy) => {
        enemy.setDepth(5);
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
    cam.setBounds(0, 0, ARENA.WIDTH, ARENA.HEIGHT);
    cam.startFollow(this.player, true, CAMERA.LERP_X, CAMERA.LERP_Y);
    cam.setDeadzone(CAMERA.DEADZONE_W, CAMERA.DEADZONE_H);
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
      dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      pause: kb.addKey(Phaser.Input.Keyboard.KeyCodes.P),
      reelIn: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      reelOut: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
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

    // ESC abandons the run outright; P opens the pause overlay.
    kb.on('keydown-ESC', () => this.endGame(false));
    this.keys.pause.on('down', () => this.pauseGame());
    this.keys.dash.on('down', () => this.tryDash());
  }

  /** Pause the sim and launch the Pause overlay on top of this scene. */
  private pauseGame(): void {
    if (this.gameEnded) return;
    this.scene.pause();
    this.scene.launch(SceneKeys.Pause);
  }

  private announceWave(wave: number, size: number): void {
    this.hud.announceWave(wave, this.waves.totalWaves, size);
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  /**
   * Fire the dash toward WHERE THE CHARACTER IS FACING (its planar
   * movement/facing direction), NOT the mouse cursor. Player.dashFacing yields
   * the current move direction while moving, else the last-held facing, so a
   * dash while standing still still shoots toward the last faced direction.
   * Player.startDash normalizes and applies it unmodified (never inverts).
   */
  private tryDash(): void {
    const now = this.time.now;
    if (!this.player.isDashReady(now)) return;
    if (!this.gas.canAfford(GAS.COST_DASH)) return;

    const dir = this.player.dashFacing;
    if (!this.gas.spend(GAS.COST_DASH, now)) return;
    this.player.startDash(dir.x, dir.y, now);
    this.audio.playSfx(AudioKeys.SwingWhoosh, 0.7);
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    if (this.gameEnded) return;

    // --- 8-direction planar input ---
    const left = this.keys.left.isDown || this.cursors.left.isDown;
    const right = this.keys.right.isDown || this.cursors.right.isDown;
    const up = this.keys.up.isDown || this.cursors.up.isDown;
    const down = this.keys.down.isDown || this.cursors.down.isDown;

    // --- grapple / fling ---
    const pointer = this.input.activePointer;
    const world = this.pointerWorld(pointer);
    const reelIn = this.keys.reelIn.isDown;
    const reelOut = this.keys.reelOut.isDown;
    // Refresh the moving giant targets the grapple may hook onto BEFORE the
    // grapple steps, so a hooked giant's anchor tracks its current position and
    // a giant that died this frame is dropped gracefully.
    this.grapple.setTargets(this.buildGrappleTargets());
    this.grapple.update({ fireHeld: pointer.leftButtonDown(), aimX: world.x, aimY: world.y, reelIn, reelOut }, delta, now);

    // --- player + gas ---
    this.player.updatePlayer({ up, down, left, right }, delta, now);
    // Top-down has no "grounded"; regen at the settled rate when not swinging.
    this.gas.regen(!this.player.swinging, delta, now);

    // --- world simulation ---
    this.updateEnemies(now, delta);
    this.updateProjectiles(delta);
    this.updateCitizens(now, delta);

    // --- combat targets in sync ---
    this.combat.setEnemies(this.enemies);

    // --- waves ---
    this.waves.update(now, this.enemies.filter((e) => !e.isDying).length);

    // --- presentation ---
    this.updateHud();
  }

  /** Step every giant, apply its attack events, cull dead. */
  private updateEnemies(now: number, delta: number): void {
    const ctx: EnemyContext = {
      centerX: ARENA.CENTER_X,
      centerY: ARENA.CENTER_Y,
      heroX: this.player.x,
      heroY: this.player.y,
      innerBreached: this.wall.isInnerBreached,
      nearestTarget: (x, y) => this.wall.nearestTarget(x, y),
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

  /**
   * Resolve a giant's attack. Hero-aimed swipes (a giant that diverted to hunt
   * the player) go straight to the hero via damageHero when the swing lands
   * within melee reach - so standing next to a giant hurts (fix for reported
   * issue 4). Structure-aimed attacks eat the nearest citizen once past a breach
   * at the core, otherwise chip the nearest un-breached ring segment.
   */
  private resolveEnemyAttack(attack: AttackEvent): void {
    if (attack.target === AttackTarget.Hero) {
      // Diverted hero swipe: only lands if the hero is within melee reach.
      if (
        Phaser.Math.Distance.Between(attack.x, attack.y, this.player.x, this.player.y) <=
        HERO_THREAT.MELEE_HERO_RANGE
      ) {
        this.damageHero(attack.damage, attack.x, attack.y);
      }
      return;
    }

    if (this.wall.isInsideInner(attack.x, attack.y)) {
      // Past the rings, at the core: eat the nearest citizen.
      this.eatNearestCitizen(attack.x, attack.y);
    } else {
      // Otherwise chip the nearest un-breached ring segment.
      const breached = this.wall.damageNearest(attack.x, attack.y, attack.damage);
      if (breached) this.onSegmentBreached();
    }
  }

  /**
   * Route damage into the hero. The Player owns i-frames/knockback/anim, so a
   * blocked (invulnerable) hit is a no-op; a landed hit plays the hurt SFX and
   * ends the run if it drops the hero.
   */
  private damageHero(amount: number, srcX: number, srcY: number): void {
    if (this.gameEnded) return;
    const landed = this.player.hurt(amount, srcX, srcY, this.time.now);
    if (!landed) return;
    this.audio.playSfx(AudioKeys.Hit, 0.8);
    this.cameras.main.shake(200, 0.012);
    if (this.player.isDead) this.endGame(false);
  }

  /**
   * A ring segment was breached. Refresh grapple surfaces (the collapsed block
   * is no longer an anchor) and, if the inner ring has now fully fallen, the
   * core is exposed and the run is lost.
   */
  private onSegmentBreached(): void {
    this.refreshGrappleSurfaces();
    if (this.wall.isInnerBreached) this.endGame(false);
  }

  private eatNearestCitizen(x: number, y: number): void {
    let nearest: Citizen | null = null;
    let best = Infinity;
    for (const c of this.citizens) {
      if (c.isConsumed) continue;
      const d = Phaser.Math.Distance.Between(c.x, c.y, x, y);
      if (d < best) {
        best = d;
        nearest = c;
      }
    }
    if (nearest && best < 60) {
      nearest.devour();
      this.citizensSaved = Math.max(0, this.citizensSaved - 1);
      this.audio.playSfx(AudioKeys.CitizenScream, 0.6);
      if (this.citizensSaved <= 0) this.endGame(false);
    }
  }

  private updateProjectiles(delta: number): void {
    const alive: DebrisProjectile[] = [];
    for (const proj of this.projectiles) {
      if (!proj.active || proj.isSpent) continue;
      proj.updateProjectile(delta);

      // Direct hit on the hero: apply the projectile's hero damage.
      if (Phaser.Math.Distance.Between(proj.x, proj.y, this.player.x, this.player.y) < 16) {
        this.damageHero(proj.heroDamage, proj.x, proj.y);
        proj.onImpact();
        continue;
      }
      // Impact with a standing ring segment (outside the core).
      if (!this.wall.isInsideInner(proj.x, proj.y)) {
        const contact = this.wall.hitNearestIfClose(proj.x, proj.y, proj.wallDamage);
        if (contact.hit) {
          if (contact.breached) this.onSegmentBreached();
          proj.onImpact();
          continue;
        }
      }
      // Left the arena.
      if (proj.x < -40 || proj.x > ARENA.WIDTH + 40 || proj.y < -40 || proj.y > ARENA.HEIGHT + 40) {
        proj.onImpact();
        continue;
      }
      alive.push(proj);
    }
    this.projectiles = alive;
  }

  private updateCitizens(now: number, delta: number): void {
    // Nearest giant that has crossed inside the inner ring, for flee behaviour.
    let threat: { x: number; y: number } | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      if (e.isDying) continue;
      if (!this.wall.isInsideInner(e.x, e.y)) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, ARENA.CENTER_X, ARENA.CENTER_Y);
      if (d < best) {
        best = d;
        threat = { x: e.x, y: e.y };
      }
    }
    const alive: Citizen[] = [];
    for (const c of this.citizens) {
      if (!c.active) continue;
      c.updateCitizen(now, delta, threat);
      if (!c.isConsumed) alive.push(c);
    }
    this.citizens = alive.filter((c) => c.active);
  }

  private updateHud(): void {
    this.hud.update({
      hpRatio: this.player.maxHp > 0 ? this.player.hp / this.player.maxHp : 0,
      gasRatio: this.gas.ratio,
      gasEmpty: this.gas.isEmpty,
      outerRatio: this.wall.outerRatio,
      innerRatio: this.wall.innerRatio,
      citizensSaved: this.citizensSaved,
      citizensTotal: WALL.START_CITIZENS,
      wave: this.wave,
      totalWaves: this.waves.totalWaves,
      score: this.score,
    });
    this.updateWeakPointCue();
  }

  /**
   * Highlight the nape of the enemy the player is aiming at. We pick the giant
   * whose nape is nearest the aim point (within a screen tolerance) and mark it;
   * the cue goes "hot" when that nape is within blade reach so the player knows
   * a slash there will crit.
   */
  private updateWeakPointCue(): void {
    const pointer = this.input.activePointer;
    const aim = this.pointerWorld(pointer);

    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.isDying || !enemy.active) continue;
      const nape = enemy.getNapeWorld();
      const d = Phaser.Math.Distance.Between(aim.x, aim.y, nape.x, nape.y);
      // Only consider napes the aim is reasonably close to (aim assist window).
      if (d < enemy.getNapeRadius() + 26 && d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }

    if (!best) {
      this.hud.drawWeakPointCue(null);
      return;
    }

    const nape = best.getNapeWorld();
    const cam = this.cameras.main;
    const screenX = (nape.x - cam.scrollX) * cam.zoom;
    const screenY = (nape.y - cam.scrollY) * cam.zoom;
    const playerToNape = Phaser.Math.Distance.Between(this.player.x, this.player.y, nape.x, nape.y);
    const inRange = playerToNape <= this.combat.napeStrikeRange;
    this.hud.drawWeakPointCue({
      screenX,
      screenY,
      radius: Math.max(5, best.getNapeRadius() + 3),
      inRange,
    });
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
