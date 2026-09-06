import Phaser from 'phaser';
import { PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, HUD_ICON_FRAME } from '../config/AssetKeys';
import { tr } from '../i18n/i18n';
import { textStyle } from './UiText';

/**
 * RunHud - the in-run heads-up display for LAST SQUAD.
 *
 * A compact top strip shows the live squad size, distance travelled, and score,
 * each with its icon from the packed HUD icon sheet. A boss HP bar (drawn inside
 * the ui_bar_frame graphic) is hidden until the boss appears, then tracks the
 * boss's remaining HP fraction. All labels go through tr().
 *
 * This is a plain helper that owns its own game objects; the scene creates one
 * in create() and calls the setters each frame, then destroy() on shutdown.
 */
export class RunHud {
  private readonly scene: Phaser.Scene;
  private readonly squadText: Phaser.GameObjects.Text;
  private readonly distanceText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;

  private readonly bossGroup: Phaser.GameObjects.Container;
  private readonly bossFrame: Phaser.GameObjects.Image;
  private readonly bossFill: Phaser.GameObjects.Rectangle;
  private readonly bossFillWidth: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const pad = 12;

    // Backing strip.
    const strip = scene.add.rectangle(CANVAS.WIDTH / 2, 22, CANVAS.WIDTH - 8, 40, PALETTE.PANEL, 0.85).setDepth(90);
    strip.setStrokeStyle(1, PALETTE.LANE_LINE);

    // Squad (left).
    scene.add.image(pad + 8, 22, TextureKeys.UiIcons, HUD_ICON_FRAME.squad).setScale(1.4).setDepth(91);
    this.squadText = scene.add
      .text(pad + 22, 22, '', textStyle(18, { fontStyle: 'bold', color: PALETTE.SQUAD_CSS }))
      .setOrigin(0, 0.5)
      .setDepth(91);

    // Score (centre).
    scene.add.image(CANVAS.WIDTH / 2 - 34, 22, TextureKeys.UiIcons, HUD_ICON_FRAME.coin).setScale(1.4).setDepth(91);
    this.scoreText = scene.add
      .text(CANVAS.WIDTH / 2 - 20, 22, '', textStyle(16, { color: PALETTE.COIN_CSS, allowSmall: true }))
      .setOrigin(0, 0.5)
      .setDepth(91);

    // Distance (right).
    this.distanceText = scene.add
      .text(CANVAS.WIDTH - pad, 22, '', textStyle(16, { allowSmall: true }))
      .setOrigin(1, 0.5)
      .setDepth(91);
    scene.add
      .image(CANVAS.WIDTH - pad - 70, 22, TextureKeys.UiIcons, HUD_ICON_FRAME.distance)
      .setScale(1.4)
      .setDepth(91);

    // Boss HP bar (hidden until the boss shows).
    const barY = 56;
    this.bossFrame = scene.add.image(CANVAS.WIDTH / 2, barY, TextureKeys.UiBarFrame).setScale(6, 2.4).setDepth(91);
    this.bossFillWidth = 64 * 6 - 12;
    this.bossFill = scene.add
      .rectangle(CANVAS.WIDTH / 2 - this.bossFillWidth / 2, barY, this.bossFillWidth, 12, PALETTE.BOSS)
      .setOrigin(0, 0.5)
      .setDepth(91);
    const bossIcon = scene.add.image(CANVAS.WIDTH / 2 - this.bossFillWidth / 2 - 16, barY, TextureKeys.UiIcons, HUD_ICON_FRAME.boss).setScale(1.4).setDepth(91);
    this.bossGroup = scene.add.container(0, 0, [this.bossFrame, this.bossFill, bossIcon]).setDepth(91);
    this.bossGroup.setVisible(false);
  }

  setSquad(count: number): void {
    this.squadText.setText(tr('run.squadSize', { count }));
  }

  setDistance(meters: number): void {
    this.distanceText.setText(tr('run.distanceValue', { meters }));
  }

  setScore(score: number): void {
    this.scoreText.setText(String(score));
  }

  showBossBar(show: boolean): void {
    this.bossGroup.setVisible(show);
  }

  /** Set the boss HP fill fraction [0..1]. */
  setBossHp(fraction: number): void {
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    this.bossFill.width = Math.max(1, this.bossFillWidth * f);
    this.bossFill.setFillStyle(f > 0.35 ? PALETTE.BOSS : PALETTE.DANGER);
  }

  destroy(): void {
    // Objects live on the scene; nothing extra to release beyond letting the
    // scene shutdown clear them. Explicit no-op kept for symmetry / future use.
    void this.scene;
  }
}
