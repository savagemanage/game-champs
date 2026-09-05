import Phaser from 'phaser';
import { PALETTE, CANVAS, WALL } from '../config/GameConfig';

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
  /** Wall integrity ratio [0..1]. */
  wallRatio: number;
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
  private readonly wallBar: Phaser.GameObjects.Rectangle;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly waveBanner: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  /** Vector graphics used for the aimed weak-point reticle. */
  private readonly cueGfx: Phaser.GameObjects.Graphics;

  private static readonly BAR_W = 84;
  private static readonly DEPTH = 50;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // --- Health gauge ---
    scene.add.rectangle(6, 8, Hud.BAR_W, 6, PALETTE.WALL_DARK).setOrigin(0, 0.5).setScrollFactor(0).setDepth(Hud.DEPTH);
    this.hpBar = scene.add
      .rectangle(6, 8, Hud.BAR_W, 6, PALETTE.CITIZEN)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(6, 13, 'HP', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS })
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Gas gauge ---
    scene.add.rectangle(6, 26, Hud.BAR_W, 6, PALETTE.WALL_DARK).setOrigin(0, 0.5).setScrollFactor(0).setDepth(Hud.DEPTH);
    this.gasBar = scene.add
      .rectangle(6, 26, Hud.BAR_W, 6, PALETTE.PLAYER)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(6, 31, 'GAS', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS })
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Wall-integrity gauge ---
    scene.add.rectangle(6, 44, Hud.BAR_W, 6, PALETTE.WALL_DARK).setOrigin(0, 0.5).setScrollFactor(0).setDepth(Hud.DEPTH);
    this.wallBar = scene.add
      .rectangle(6, 44, Hud.BAR_W, 6, PALETTE.ACCENT)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);
    scene.add
      .text(6, 49, 'WALL', { fontFamily: 'monospace', fontSize: '7px', color: PALETTE.TEXT_CSS })
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Score / wave / citizens readout (top-right) ---
    this.statusText = scene.add
      .text(CANVAS.WIDTH - 6, 8, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: PALETTE.TEXT_CSS,
        align: 'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1);

    // --- Center wave banner (transient) ---
    this.waveBanner = scene.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.35, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: PALETTE.DANGER_CSS,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 2)
      .setAlpha(0);

    // --- Controls hint (bottom, low-key) ---
    this.hint = scene.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT - 8, 'P Pause    L-Click Grapple    R-Click Slash', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: PALETTE.TEXT_CSS,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(Hud.DEPTH + 1)
      .setAlpha(0.4);

    // --- Weak-point reticle graphics ---
    this.cueGfx = scene.add.graphics().setScrollFactor(0).setDepth(Hud.DEPTH + 2);
  }

  /** Refresh the bars + readout from the current game state. */
  update(state: HudState): void {
    this.hpBar.width = Math.max(0, Math.floor(Hud.BAR_W * state.hpRatio));
    this.hpBar.fillColor = state.hpRatio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.CITIZEN;

    this.gasBar.width = Math.max(0, Math.floor(Hud.BAR_W * state.gasRatio));
    this.gasBar.fillColor = state.gasEmpty ? PALETTE.ENEMY_WEAKPOINT : PALETTE.PLAYER;

    this.wallBar.width = Math.max(0, Math.floor(Hud.BAR_W * state.wallRatio));
    this.wallBar.fillColor = state.wallRatio < 0.3 ? PALETTE.ENEMY_WEAKPOINT : PALETTE.ACCENT;

    const total = state.citizensTotal || WALL.START_CITIZENS;
    this.statusText.setText(
      `SCORE ${state.score}\nWAVE ${state.wave}/${state.totalWaves}\nCITIZENS ${state.citizensSaved}/${total}`,
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
    this.waveBanner.setText(`WAVE ${wave} / ${totalWaves}\n${size} INCOMING`);
    this.waveBanner.setAlpha(1);
    this.scene.tweens.add({ targets: this.waveBanner, alpha: 0, duration: 1600, delay: 900 });
  }

  /** Temporarily reveal the controls hint (e.g. at the start of a run). */
  showHint(durationMs = 4000): void {
    this.hint.setAlpha(0.75);
    this.scene.tweens.add({ targets: this.hint, alpha: 0.25, delay: durationMs, duration: 900 });
  }
}
