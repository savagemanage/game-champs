import Phaser from 'phaser';
import { SceneKeys, PALETTE } from '../config/GameConfig';

/**
 * BootScene doubles as the preload scene. It configures pixel-art defaults and
 * (in later features) loads the texture atlases, audio, and fonts. For now it
 * boots straight into the Title scene once any queued assets are ready.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Boot });
  }

  preload(): void {
    // A tiny loading indicator so the boot step is visible even before assets
    // exist. Real asset loading is wired up in a later feature.
    const { width, height } = this.scale;
    const barWidth = Math.floor(width * 0.5);
    const barX = Math.floor((width - barWidth) / 2);
    const barY = Math.floor(height / 2);

    const border = this.add.rectangle(width / 2, barY, barWidth + 4, 10, PALETTE.WALL_DARK);
    const bar = this.add.rectangle(barX, barY, 1, 6, PALETTE.ACCENT).setOrigin(0, 0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bar.width = Math.max(1, Math.floor(barWidth * value));
    });

    this.load.on(Phaser.Loader.Events.COMPLETE, () => {
      border.destroy();
      bar.destroy();
    });
  }

  create(): void {
    this.scene.start(SceneKeys.Title);
  }
}
