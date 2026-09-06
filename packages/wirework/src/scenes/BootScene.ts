import Phaser from 'phaser';
import { SceneKeys, PALETTE } from '../config/GameConfig';
import { AudioManager } from '../systems/AudioManager';
import { setLanguage } from '../i18n/i18n';

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
    // Mirror the PERSISTED language into the i18n runtime BEFORE PreloadScene
    // renders its first tr() text (brand name + "Loading %"). The i18n module
    // defaults to Korean, and the AudioManager singleton (which normally mirrors
    // the persisted choice) is not constructed until the Title screen; without
    // this, a returning English user would see the preload screen flash Korean
    // then snap to English at the Title. A brand-new user with no persisted
    // value resolves to the Korean-first default, so ko stays the true default.
    setLanguage(AudioManager.peekPersistedLanguage());

    this.scene.start(SceneKeys.Preload);
  }
}
