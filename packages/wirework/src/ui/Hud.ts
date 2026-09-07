import Phaser from 'phaser';
import { PALETTE, CANVAS, WALL } from '../config/GameConfig';
import { textStyle } from './UiText';
import { tr } from '../i18n/i18n';

/**
 * Snapshot of the state the HUD renders each frame. GameScene assembles this
 * from its systems (gas, wall, wave, score, citizens) and hands it to
 * {@link Hud.update} so the HUD stays a pure view with no gameplay coupling.
 */
export interface HudState {
  /** Hero health ratio [0..1]. */
  hpRatio: number;
  /** Gas/stamina ratio [0..1]. */
  gasRatio: number;
  /** Whether gas is fully depleted (drives the danger tint). */
  gasEmpty: boolean;
  /** Outer ring integrity ratio [0..1]. */
  outerRatio: number;
  /** Inner ring integrity ratio [0..1]. */
  innerRatio: number;
  /** Living citizens remaining. */
  citizensSaved: number;
  /** Citizen total at the start of the run. */
  citizensTotal: number;
  /** Current wave number (1-based; 0 before the first wave). */
  wave: number;
  /** Total waves in the run. */
  totalWaves: number;
  /** Accumulated score. */
  score: number;
}

/** A weak-point (nape) cue to draw at a world position, if any. */
export interface WeakPointCue {
  /** Screen-space (post-camera) position of the nape. */
  screenX: number;
  screenY: number;
  /** Cue radius in screen px. */
  radius: number;
  /** True when the current aim/slash would actually connect (turns the cue hot). */
  inRange: boolean;
}

/**
 * Hud - the in-game heads-up display overlay.
 *
 * Owns and renders: the gas/stamina meter, the wall-integrity meter, the
 * score / wave / citizen readout, the transient wave banner, and the on-screen
 * WEAK-POINT cue that highlights an enemy nape the player is aiming at. Every
 * element is fixed to the camera (scrollFactor 0) and lives on a high depth so
 * it sits above the world.
 *
 * The HUD reads a plain {@link HudState} each frame; it never reaches into the
 * game systems directly, so it can be unit-reasoned and reused.
 */
export class Hud {
  private readonly scene: Phaser.Scene;

  private readonly hpBar: Phaser.GameObjects.Rectangle;
  private readonly gasBar: Phaser.GameObjects.Rectangle;
  private readonly outerBar: Phaser.GameObjects.Rectangle;
  private readonly innerBar: Phaser.GameObjects.Rectangle;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly waveBanner: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  /** Vector graphics used for the aimed weak-point reticle. */
  private readonly cueGfx: Phaser.GameObjects.Graphics;

  // Sized for the 960x540 canvas (2x the original 480x270 layout).
  private static readonly BAR_W = 168;
  private static readonly BAR_H = 12;
  private static readonly DEPTH = 50;

  /**
   * Every HUD element, with the design-space offset it was authored at.
   *
   * These were pinned with `setScrollFactor(0)`, which anchors an object to the
   * camera's SCROLL ORIGIN rather than to the visible viewport. GameScene's
   * camera follows the player, so that origin moves: the HUD slid off the top
   * of the frame and only a sliver of one gauge stayed on screen. Anchoring to
   * `camera.worldView` every frame instead is exact whatever the camera is
   * doing, at any viewport aspect.
   */
  private readonly anchored: { obj: Phaser.GameObjects.GameObject & { x: number; y: number }; ox: number; oy: number }[] = [];

  /**
   * Record everything the constructor added to the display list. Snapshotting
   * the list either side of construction avoids threading a registration call
   * through two dozen builder chains.
   */
  private captureAnchors(from: number): void {
    const list = this.scene.children.list;
    for (let i = from; i < list.length; i += 1) {
      const obj = list[i] as Phaser.GameObjects.GameObject & { x?: number; y?: number };
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') continue;
      // World-space now; `layout` does the following, so the object must move
      // with the camera rather than being pinned to its scroll origin.
      (obj as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(1);
      this.anchored.push({ obj: obj as never, ox: obj.x, oy: obj.y });
    }
  }

  /** Re-place every HUD element against the camera's current visible rect. */
  layout(): void {
    const view = this.scene.cameras.main.worldView;
    for (const a of this.anchored) {
      a.obj.x = view.x + a.ox;
      a.obj.y = view.y + a.oy;
    }
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const displayListStart = scene.children.list.length;

    // --- Health gauge ---
    scene.add
      .rectangle(12, 16, Hud.BAR_W, Hud.BAR_H, PALETTE.WALL_DARK)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH);
    this.hpBar = scene.add
      .rectangle(12, 16, Hud.BAR_W, Hud.BAR_H, PALETTE.CITIZEN)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(12, 26, tr('hud.hp'), textStyle(14))
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Gas gauge ---
    scene.add
      .rectangle(12, 52, Hud.BAR_W, Hud.BAR_H, PALETTE.WALL_DARK)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH);
    this.gasBar = scene.add
      .rectangle(12, 52, Hud.BAR_W, Hud.BAR_H, PALETTE.PLAYER)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(12, 62, tr('hud.gas'), textStyle(14))
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Outer ring integrity gauge ---
    scene.add
      .rectangle(12, 88, Hud.BAR_W, Hud.BAR_H, PALETTE.WALL_DARK)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH);
    this.outerBar = scene.add
      .rectangle(12, 88, Hud.BAR_W, Hud.BAR_H, PALETTE.ACCENT)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(12, 98, tr('hud.outer'), textStyle(14))
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Inner ring integrity gauge ---
    scene.add
      .rectangle(12, 124, Hud.BAR_W, Hud.BAR_H, PALETTE.WALL_DARK)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH);
    this.innerBar = scene.add
      .rectangle(12, 124, Hud.BAR_W, Hud.BAR_H, PALETTE.ACCENT)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(12, 134, tr('hud.inner'), textStyle(14))
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Score / wave / citizens readout (top-right) ---
    this.statusText = scene.add
      .text(CANVAS.WIDTH - 12, 16, '', textStyle(16, { align: 'right' }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Center wave banner (transient) ---
    this.waveBanner = scene.add
      .text(
        CANVAS.WIDTH / 2,
        CANVAS.HEIGHT * 0.35,
        '',
        textStyle(32, { color: PALETTE.DANGER_CSS, fontStyle: 'bold', align: 'center' }),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 2)
      .setAlpha(0);

    // --- Controls hint (bottom, low-key) ---
    this.hint = scene.add
      .text(
        CANVAS.WIDTH / 2,
        CANVAS.HEIGHT - 16,
        tr('hud.hint'),
        textStyle(14),
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1)
      .setAlpha(0.4);

    // --- Weak-point reticle graphics ---
    this.cueGfx = scene.add.graphics().setScrollFactor(0).setDepth(Hud.DEPTH + 2);
    this.captureAnchors(displayListStart);
    this.layout();
  }

  /** Refresh the bars + readout from the current game state. */
  update(state: HudState): void {
    this.layout();

    // setSize(), not `.width =`. A Phaser Shape renders from its cached `geom`
    // and path data; assigning the display width alone leaves that geometry
    // stale, so the gauges did not track the values they were reporting.
    const fill = (ratio: number): number => Math.max(0, Math.floor(Hud.BAR_W * ratio));

    this.hpBar.setSize(fill(state.hpRatio), Hud.BAR_H);
    this.hpBar.fillColor = state.hpRatio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.CITIZEN;

    this.gasBar.setSize(fill(state.gasRatio), Hud.BAR_H);
    this.gasBar.fillColor = state.gasEmpty ? PALETTE.ENEMY_WEAKPOINT : PALETTE.PLAYER;

    this.outerBar.setSize(fill(state.outerRatio), Hud.BAR_H);
    this.outerBar.fillColor = state.outerRatio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.ACCENT;

    this.innerBar.setSize(fill(state.innerRatio), Hud.BAR_H);
    this.innerBar.fillColor = state.innerRatio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.ACCENT;

    const total = state.citizensTotal || WALL.START_CITIZENS;
    this.statusText.setText(
      tr('hud.status', {
        score: state.score,
        wave: state.wave,
        total: state.totalWaves,
        saved: state.citizensSaved,
        citizensTotal: total,
      }),
    );
  }

  /**
   * Draw (or clear) the on-screen weak-point cue. Pass the cue for the nape the
   * player is aiming at, or null to hide it. When {@link WeakPointCue.inRange}
   * is true the reticle goes "hot" (bright + a lock chevron) to tell the player
   * a slash will crit; otherwise it's a dim locate marker.
   */
  drawWeakPointCue(cue: WeakPointCue | null): void {
    this.cueGfx.clear();
    if (!cue) return;

    const color = cue.inRange ? PALETTE.ENEMY_WEAKPOINT : PALETTE.ACCENT;
    const alpha = cue.inRange ? 1 : 0.6;
    const r = cue.radius;

    // Pulsing ring.
    const pulse = cue.inRange ? 1 + 0.12 * Math.sin(this.scene.time.now / 90) : 1;
    this.cueGfx.lineStyle(1, color, alpha);
    this.cueGfx.strokeCircle(cue.screenX, cue.screenY, r * pulse);

    // Cross-hair ticks.
    this.cueGfx.lineBetween(cue.screenX - r - 2, cue.screenY, cue.screenX - r + 2, cue.screenY);
    this.cueGfx.lineBetween(cue.screenX + r - 2, cue.screenY, cue.screenX + r + 2, cue.screenY);
    this.cueGfx.lineBetween(cue.screenX, cue.screenY - r - 2, cue.screenX, cue.screenY - r + 2);
    this.cueGfx.lineBetween(cue.screenX, cue.screenY + r - 2, cue.screenX, cue.screenY + r + 2);

    // A small inner dot marks the exact weak point.
    this.cueGfx.fillStyle(color, alpha);
    this.cueGfx.fillCircle(cue.screenX, cue.screenY, 1.5);
  }

  /** Flash the transient wave banner. */
  announceWave(wave: number, totalWaves: number, size: number): void {
    this.waveBanner.setText(
      `${tr('hud.wave', { wave, total: totalWaves })}\n${tr('hud.incoming', { count: size })}`,
    );
    this.waveBanner.setAlpha(1);
    this.scene.tweens.add({ targets: this.waveBanner, alpha: 0, duration: 1600, delay: 900 });
  }

  /** Temporarily reveal the controls hint (e.g. at the start of a run). */
  showHint(durationMs = 4000): void {
    this.hint.setAlpha(0.75);
    this.scene.tweens.add({ targets: this.hint, alpha: 0.25, delay: durationMs, duration: 900 });
  }
}
