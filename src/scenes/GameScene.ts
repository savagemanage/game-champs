import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, WALL } from '../config/GameConfig';
import { AudioKeys, TextureKeys } from '../config/AssetKeys';
import { CAMERA, GAS, LEVEL } from '../config/PlayerConfig';
import { Player } from '../entities/Player';
import { GasSystem } from '../systems/GasSystem';
import { GrappleSystem, type GrappleSurface } from '../systems/GrappleSystem';

/**
 * GameScene wires the hero, the ODM grapple/dash traversal, and the gas meter
 * into a side-scrolling arena with verticality (a tall wall on the right).
 *
 * Controls:
 *   - A / D (or arrows): run left/right
 *   - W / Space: jump
 *   - Mouse aim + Left click (hold): fire & hold the grapple wire; release to fling
 *   - Right mouse (hold) or W/S while swinging: reel in / out
 *   - Shift: dash burst toward the aim/movement direction
 *   - ESC: end the run
 *
 * The wave spawner, enemies, combat, and full HUD arrive in later features;
 * a minimal gas/status readout is drawn here so traversal is legible.
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private gas!: GasSystem;
  private grapple!: GrappleSystem;

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
  private wallBody!: Phaser.GameObjects.Rectangle;

  private bgSky!: Phaser.GameObjects.TileSprite;
  private bgHills!: Phaser.GameObjects.TileSprite;
  private bgWall!: Phaser.GameObjects.Image;

  private gasBar!: Phaser.GameObjects.Rectangle;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SceneKeys.Game });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    this.physics.world.setBounds(0, 0, LEVEL.WIDTH, LEVEL.HEIGHT);

    this.buildBackground();
    this.buildLevel();
    this.buildPlayer();
    this.buildSystems();
    this.buildCamera();
    this.buildInput();
    this.buildHud();
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
    // The wall art anchored near the level's wall section for depth.
    this.bgWall = this.add
      .image(LEVEL.WALL_X, LEVEL.GROUND_Y, TextureKeys.BgWall)
      .setOrigin(0.5, 1)
      .setScrollFactor(0.6)
      .setDepth(-10);
  }

  /** Ground floor + a tall defensive wall on the right for verticality. */
  private buildLevel(): void {
    const groundH = LEVEL.HEIGHT - LEVEL.GROUND_Y;
    this.groundBody = this.add
      .rectangle(LEVEL.WIDTH / 2, LEVEL.GROUND_Y + groundH / 2, LEVEL.WIDTH, groundH, PALETTE.GROUND)
      .setDepth(1);
    this.physics.add.existing(this.groundBody, true);

    const wallH = LEVEL.GROUND_Y - LEVEL.WALL_TOP_Y;
    const wallW = 60;
    this.wallBody = this.add
      .rectangle(LEVEL.WALL_X, LEVEL.WALL_TOP_Y + wallH / 2, wallW, wallH, PALETTE.WALL)
      .setDepth(1);
    this.wallBody.setStrokeStyle(2, PALETTE.WALL_DARK);
    this.physics.add.existing(this.wallBody, true);

    // Grapple-attachable surfaces: the ground top and both wall faces.
    this.surfaces = [
      { bounds: new Phaser.Geom.Rectangle(0, LEVEL.GROUND_Y, LEVEL.WIDTH, groundH) },
      { bounds: new Phaser.Geom.Rectangle(LEVEL.WALL_X - wallW / 2, LEVEL.WALL_TOP_Y, wallW, wallH) },
    ];

    // A couple of floating anchor pylons so the open sky is traversable too.
    for (const px of [640, 1040, 1360]) {
      const py = 220;
      const pylon = this.add.rectangle(px, py, 20, 20, PALETTE.WALL_DARK).setDepth(1);
      pylon.setStrokeStyle(1, PALETTE.WALL);
      this.physics.add.existing(pylon, true);
      this.physics.add.collider(this.playerColliderTarget(), pylon);
      this.surfaces.push({ bounds: new Phaser.Geom.Rectangle(px - 10, py - 10, 20, 20) });
    }
  }

  private playerColliderTarget(): Phaser.GameObjects.GameObject {
    return this.player;
  }

  private buildPlayer(): void {
    this.player = new Player(this, 120, LEVEL.GROUND_Y - 40);
    this.player.setDepth(6);
    this.physics.add.collider(this.player, this.groundBody);
    this.physics.add.collider(this.player, this.wallBody);
  }

  private buildSystems(): void {
    this.gas = new GasSystem(GAS.START, GAS.MAX);
    this.grapple = new GrappleSystem(this, this.player, this.gas);
    this.grapple.setSurfaces(this.surfaces);
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

    // Left-click fires the grapple toward the cursor; releasing lets go.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        const world = this.pointerWorld(pointer);
        this.grapple.fire(world.x, world.y, this.time.now);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) this.grapple.release();
    });

    // Disable the browser context menu so right-click can reel.
    this.input.mouse?.disableContextMenu();

    kb.on('keydown-ESC', () => {
      this.scene.start(SceneKeys.GameOver, { victory: false, wavesSurvived: 0, citizensSaved: WALL.START_CITIZENS });
    });

    // Dash on Shift press.
    this.keys.dash.on('down', () => this.tryDash());
  }

  private buildHud(): void {
    this.add
      .rectangle(6, 8, 84, 6, PALETTE.WALL_DARK)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(50);
    this.gasBar = this.add
      .rectangle(6, 8, 84, 6, PALETTE.PLAYER)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(51);
    this.add
      .text(6, 14, 'GAS', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS })
      .setScrollFactor(0)
      .setDepth(51);

    this.hintText = this.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT - 8, 'MOVE A/D  JUMP W/Space  GRAPPLE L-Click  REEL R-Click/W-S  DASH Shift', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(51)
      .setAlpha(0.7);
  }

  /** Convert a pointer to world coordinates via the main camera. */
  private pointerWorld(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private tryDash(): void {
    const now = this.time.now;
    if (!this.player.isDashReady(now)) return;
    if (!this.gas.canAfford(GAS.COST_DASH)) return;

    // Dash toward the aim direction if a pointer is active, else movement dir.
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
    if (this.cache.audio.exists(AudioKeys.SwingWhoosh)) {
      this.sound.play(AudioKeys.SwingWhoosh, { volume: 0.7 });
    }
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;

    // --- gather input ---
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
    const reelIn = pointer.rightButtonDown() || this.keys.up.isDown;
    const reelOut = this.keys.down.isDown;
    this.grapple.update(
      {
        fireHeld: pointer.leftButtonDown(),
        aimX: world.x,
        aimY: world.y,
        reelIn,
        reelOut,
      },
      delta,
      now,
    );

    // --- player movement (air control defers to swing state) ---
    this.player.updatePlayer({ left, right, jumpPressed, jumpHeld: jumpDown }, delta, now);

    // --- gas regen when not spending (grounded fills fast) ---
    this.gas.regen(this.player.grounded, delta, now);

    // --- parallax + hud ---
    this.updateParallax();
    this.gasBar.width = Math.max(0, Math.floor(84 * this.gas.ratio));
    this.gasBar.fillColor = this.gas.isEmpty ? PALETTE.ENEMY_WEAKPOINT : PALETTE.PLAYER;
    void this.hintText;
    void this.bgWall;
  }

  private updateParallax(): void {
    const scrollX = this.cameras.main.scrollX;
    this.bgSky.tilePositionX = scrollX * 0.1;
    this.bgHills.tilePositionX = scrollX * 0.3;
  }
}
