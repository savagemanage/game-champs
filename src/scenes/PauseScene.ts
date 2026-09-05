import Phaser from 'phaser';
import { SceneKeys, CANVAS } from '../config/GameConfig';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';

/**
 * PauseScene is a translucent overlay launched ON TOP of a paused GameScene.
 * It offers Resume, Settings, and Quit-to-Title. While it is up, GameScene's
 * update loop is halted (the GameScene pauses itself before launching this).
 *
 * Resume/P/ESC resume the game; Settings opens the Settings scene (from which
 * "back" returns here); Quit fades out to the Title and stops the run.
 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Pause });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;

    // Dim the world behind the overlay.
    this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.55).setOrigin(0, 0);

    Menu.title(this, cx, CANVAS.HEIGHT * 0.24, tr('pause.title'), 44);

    Menu.button(this, cx, CANVAS.HEIGHT * 0.46, tr('pause.resume'), () => this.resume(), { width: 240 });
    Menu.button(this, cx, CANVAS.HEIGHT * 0.62, tr('pause.settings'), () => this.openSettings(), { width: 240 });
    Menu.button(this, cx, CANVAS.HEIGHT * 0.78, tr('pause.quit'), () => this.quit(), { width: 240 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.9, tr('pause.hint'), 14, 0.5);

    this.input.keyboard?.on('keydown-P', () => this.resume());
    this.input.keyboard?.on('keydown-ESC', () => this.resume());

    // If Settings was closed and returned focus here, make the overlay visible
    // again (see openSettings + SettingsScene's returnTo handling).
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.scene.setVisible(true));
  }

  private resume(): void {
    this.scene.stop();
    this.scene.resume(SceneKeys.Game);
  }

  private openSettings(): void {
    // Open Settings as its own overlay on top; keep this Pause scene alive but
    // asleep + hidden. When Settings closes with returnTo=Pause it wakes us.
    this.scene.launch(SceneKeys.Settings, { returnTo: SceneKeys.Pause });
    this.scene.setVisible(false);
    this.scene.sleep();
  }

  private quit(): void {
    Menu.fadeTo(this, () => {
      this.scene.stop(SceneKeys.Game);
      this.scene.stop();
      this.scene.start(SceneKeys.Title);
    });
  }
}
