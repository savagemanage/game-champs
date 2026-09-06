import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';

/**
 * TitleScene - the front door. Renders the layered pixel backdrop, the game
 * title, and Start / Settings buttons, and kicks off the music bed. Deploys
 * into the GameScene with a fade transition.
 */
export class TitleScene extends Phaser.Scene {
  private bgSky!: Phaser.GameObjects.TileSprite;
  private bgHills!: Phaser.GameObjects.TileSprite;
  private drift = 0;

  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    const cx = CANVAS.WIDTH / 2;

    // Parallax backdrop from the loaded background layers (slow auto-drift).
    this.bgSky = this.add.tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgSky).setOrigin(0, 0);
    this.bgHills = this.add
      .tileSprite(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgHills)
      .setOrigin(0, 0)
      .setAlpha(0.92);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgWall).setAlpha(0.85);

    // Hero silhouette perched on the wall.
    this.add.image(cx + 300, CANVAS.HEIGHT * 0.62, TextureKeys.Hero, 0).setScale(4).setFlipX(true);

    // Title + tagline.
    const title = Menu.title(this, cx, CANVAS.HEIGHT * 0.3, tr('brand.name'), 64);
    this.tweens.add({ targets: title, y: title.y - 4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    Menu.label(this, cx, CANVAS.HEIGHT * 0.44, tr('title.tagline'), 20, 0.85);

    // Menu buttons.
    Menu.button(this, cx, CANVAS.HEIGHT * 0.62, tr('title.deploy'), () => this.startGame(), { width: 240 });
    Menu.button(this, cx, CANVAS.HEIGHT * 0.77, tr('title.settings'), () => this.openSettings(), { width: 240 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.92, tr('title.hint'), 14, 0.5);

    // Keyboard shortcuts mirror the buttons.
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.on('keydown-S', () => this.openSettings());

    // Start the music bed (idempotent; survives across scenes via AudioManager).
    const audio = AudioManager.get(this);
    // The browser may hold audio locked until the first gesture; retry on input.
    audio.playMusic(AudioKeys.MusicLoop);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.playMusic(AudioKeys.MusicLoop));
  }

  update(_time: number, delta: number): void {
    this.drift += delta * 0.004;
    this.bgSky.tilePositionX = this.drift * 0.4;
    this.bgHills.tilePositionX = this.drift;
  }

  private startGame(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Game));
  }

  private openSettings(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Settings));
  }
}
