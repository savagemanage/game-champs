import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';

/**
 * BootScene is the very first scene. It shows a minimal loading indicator for
 * any tiny boot-time assets, then hands off to PreloadScene which loads the
 * full art/audio bundle before the Title screen.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Boot });
  }

  preload(): void {
    // A tiny loading indicator so the boot step is visible even before assets
    // exist. The full asset bundle is loaded in PreloadScene. Use the LOGICAL
    // canvas size (CANVAS) rather than this.scale: the backbuffer is sized to
    // device pixels for crisp text (see main.ts) and the main camera is zoomed
    // to keep the 960x540 logical coordinate system, so layout must use CANVAS.
    const { WIDTH: width, HEIGHT: height } = CANVAS;
    const barWidth = Math.floor(width * 0.5);
    const barX = Math.floor((width - barWidth) / 2);
    const barY = Math.floor(height / 2);

    const border = this.add.rectangle(width / 2, barY, barWidth + 4, 10, PALETTE.STONE_DARK);
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
    this.scene.start(SceneKeys.Preload);
  }
}
