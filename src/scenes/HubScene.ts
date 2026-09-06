import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RESOURCE_ORDER } from '../config/GameConfig';
import { TextureKeys, RESOURCE_ICON_FRAME, SPARK_ICON_FRAME } from '../config/AssetKeys';
import type { ResourceKind } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';

/**
 * HubScene - the shared base for the FEAT-006 system screens (Hero, Summon,
 * Campaign, Research, Gear, Alliance, Arena, Quests). It keeps those scenes
 * THIN by owning the common chrome they all need:
 *
 *   - the frozen town backdrop + a fade-in,
 *   - a top title bar with a live resource + Ember Sparks readout (so a player
 *     always sees what they can spend),
 *   - a Back button (and ESC / B shortcuts) that returns to the Town hub,
 *   - small helpers for formatting resource costs and flashing a toast.
 *
 * All logic still lives in the already-tested pure systems reached through the
 * single {@link GameState} instance; subclasses only render state and call
 * GameState actions in {@link HubScene.build}.
 */
export abstract class HubScene extends Phaser.Scene {
  protected state!: GameState;
  protected audio!: AudioManager;
  private currencyText!: Phaser.GameObjects.Text;
  private toastText?: Phaser.GameObjects.Text;

  /** The i18n key for this screen's title (subclass supplies it). */
  protected abstract titleKey(): string;

  /** Build the screen body. Called after the shared chrome is in place. */
  protected abstract build(): void;

  create(): void {
    this.state = GameState.get();
    this.audio = AudioManager.get(this);

    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    this.add
      .image(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2, TextureKeys.BgTown)
      .setDisplaySize(CANVAS.WIDTH, CANVAS.HEIGHT)
      .setAlpha(0.55);
    // A dim panel so busy screens stay legible over the town art.
    this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, PALETTE.BG_SKY, 0.35).setOrigin(0, 0);

    this.buildTopBar();

    Menu.button(this, 90, CANVAS.HEIGHT - 30, tr('common.back'), () => this.goBack(), { width: 150 });
    this.input.keyboard?.on('keydown-ESC', () => this.goBack());
    this.input.keyboard?.on('keydown-B', () => this.goBack());

    this.build();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.state.save(Date.now()));
  }

  /** Top bar: the screen title on the left, a compact currency strip on the right. */
  private buildTopBar(): void {
    const bar = this.add.rectangle(0, 0, CANVAS.WIDTH, 44, PALETTE.PANEL, 0.94).setOrigin(0, 0);
    bar.setStrokeStyle(2, PALETTE.STONE_DARK);
    this.add.text(20, 22, trDyn(this.titleKey()), textStyle(22, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS })).setOrigin(0, 0.5);

    // Ember Sparks readout (top-right).
    this.add.image(CANVAS.WIDTH - 150, 22, TextureKeys.ResourceIcons, SPARK_ICON_FRAME).setOrigin(0.5).setScale(1.3);
    this.currencyText = this.add
      .text(CANVAS.WIDTH - 134, 22, '', textStyle(16, { fontStyle: 'bold', color: PALETTE.SPARK_CSS }))
      .setOrigin(0, 0.5);
    this.refreshCurrency();
  }

  /** Refresh the Ember Sparks readout (call after spending / earning). */
  protected refreshCurrency(): void {
    this.currencyText.setText(String(Math.floor(this.state.premium.sparks)));
  }

  /** Format a resource cost bundle as "n Rations, m Iron" using i18n names. */
  protected costString(cost: Partial<Record<ResourceKind, number>>): string {
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  /** Whether the resource store can currently afford a cost bundle. */
  protected canAfford(cost: Partial<Record<ResourceKind, number>>): boolean {
    return (RESOURCE_ORDER as readonly ResourceKind[]).every(
      (r) => this.state.resources.get(r) >= (cost[r] ?? 0),
    );
  }

  /** A small icon for a resource kind (for cost rows). */
  protected resourceIcon(x: number, y: number, res: ResourceKind): Phaser.GameObjects.Image {
    return this.add.image(x, y, TextureKeys.ResourceIcons, RESOURCE_ICON_FRAME[res]).setOrigin(0.5).setScale(1.1);
  }

  /** Flash a brief centred toast message (auto-fades). */
  protected toast(message: string, color: string = PALETTE.SUCCESS_CSS): void {
    this.toastText?.destroy();
    this.toastText = this.add
      .text(CANVAS.WIDTH / 2, CANVAS.HEIGHT - 70, message, textStyle(15, { color, backgroundColor: PALETTE.PANEL_CSS, padding: { x: 10, y: 6 }, align: 'center', wordWrap: { width: 620 } }))
      .setOrigin(0.5)
      .setDepth(80);
    const t = this.toastText;
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 700, onComplete: () => t.destroy() });
  }

  private goBack(): void {
    this.state.save(Date.now());
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
  }
}
