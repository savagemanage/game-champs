import Phaser from 'phaser';
import { PALETTE, CANVAS } from '../config/GameConfig';
import { textStyle } from './UiText';
import { Menu, type MenuButton } from './Menu';
import { tr } from '../i18n/i18n';

/** The live state the battle HUD renders each frame. */
export interface BattleHudState {
  /** Current wave number (1-based). */
  wave: number;
  /** Total waves in the campaign. */
  totalWaves: number;
  /** Friendly troops still standing. */
  armyRemaining: number;
  /** Enemy raiders still standing. */
  enemyRemaining: number;
}

/** Options wiring the HUD's control buttons back to the scene. */
export interface BattleHudCallbacks {
  /** Instantly resolve to the end (skip the animation). */
  onSkip: () => void;
  /** Cycle the playback speed; returns the new multiplier to display. */
  onToggleSpeed: () => number;
}

/**
 * BattleHud - the battle heads-up overlay.
 *
 * Shows the wave number, a friendly army-remaining readout on the left and an
 * enemy-remaining readout on the right (each with a coloured banner tint), plus
 * a Skip button and a Speed toggle so the player can fast-forward or jump to
 * the result. It is a pure view: the scene feeds it a {@link BattleHudState}
 * every frame via {@link BattleHud.update} and the HUD never touches gameplay.
 * A transient centre banner announces each wave.
 */
export class BattleHud {
  private readonly scene: Phaser.Scene;

  private readonly waveText: Phaser.GameObjects.Text;
  private readonly armyText: Phaser.GameObjects.Text;
  private readonly enemyText: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly speedButton: MenuButton;

  private static readonly DEPTH = 100;

  constructor(scene: Phaser.Scene, callbacks: BattleHudCallbacks) {
    this.scene = scene;

    // Top bar backdrop.
    scene.add
      .rectangle(0, 0, CANVAS.WIDTH, 40, PALETTE.PANEL, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(2, PALETTE.STONE_DARK)
      .setScrollFactor(0)
      .setDepth(BattleHud.DEPTH);

    // Friendly army count (left, friendly-banner tint).
    this.armyText = scene.add
      .text(16, 20, '', textStyle(16, { fontStyle: 'bold', color: '#8fb4ec' }))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(BattleHud.DEPTH + 1);

    // Wave number (centre).
    this.waveText = scene.add
      .text(CANVAS.WIDTH / 2, 20, '', textStyle(18, { fontStyle: 'bold', align: 'center' }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(BattleHud.DEPTH + 1);

    // Enemy count (right, enemy-banner tint).
    this.enemyText = scene.add
      .text(CANVAS.WIDTH - 16, 20, '', textStyle(16, { fontStyle: 'bold', color: PALETTE.DANGER_CSS }))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(BattleHud.DEPTH + 1);

    // Centre wave banner (transient).
    this.banner = scene.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.3, '', textStyle(34, { color: PALETTE.ACCENT_CSS, fontStyle: 'bold', align: 'center' }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(BattleHud.DEPTH + 3)
      .setAlpha(0);

    // Controls: Skip + Speed toggle, bottom-right.
    const y = CANVAS.HEIGHT - 26;
    const skip = Menu.button(scene, CANVAS.WIDTH - 210, y, tr('battle.skip'), () => callbacks.onSkip(), {
      width: 120,
      fontSize: 15,
    });
    skip.container.setScrollFactor(0).setDepth(BattleHud.DEPTH + 1);

    this.speedButton = Menu.button(
      scene,
      CANVAS.WIDTH - 80,
      y,
      tr('battle.speed', { mult: 1 }),
      () => {
        const mult = callbacks.onToggleSpeed();
        this.speedButton.setText(tr('battle.speed', { mult }));
      },
      { width: 120, fontSize: 15 },
    );
    this.speedButton.container.setScrollFactor(0).setDepth(BattleHud.DEPTH + 1);
  }

  /** Refresh the readouts from the current battle state. */
  update(state: BattleHudState): void {
    this.waveText.setText(tr('battle.wave', { wave: state.wave, total: state.totalWaves }));
    this.armyText.setText(`${tr('battle.armyRemaining')} ${state.armyRemaining}`);
    this.enemyText.setText(`${state.enemyRemaining} ${tr('battle.enemyRemaining')}`);
  }

  /** Flash the transient wave banner announcing the incoming raiders. */
  announceWave(wave: number, totalWaves: number, incoming: number): void {
    this.banner.setText(`${tr('battle.wave', { wave, total: totalWaves })}\n${tr('battle.incoming', { count: incoming })}`);
    this.banner.setAlpha(1);
    this.scene.tweens.add({ targets: this.banner, alpha: 0, duration: 1400, delay: 1000 });
  }
}
