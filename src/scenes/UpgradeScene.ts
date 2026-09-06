import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, UPGRADE_ORDER } from '../config/GameConfig';
import { TextureKeys, HUD_ICON_FRAME, AudioKeys } from '../config/AssetKeys';
import type { MetaUpgradeKind } from '../types';
import type { TrKey } from '../i18n/strings';
import { MetaStore } from '../systems/MetaStore';
import { AudioManager } from '../systems/AudioManager';
import { maxLevel, upgradeCost, canAfford } from '../systems/MetaProgress';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching the Upgrade scene. */
export interface UpgradeData {
  returnTo?: string;
}

interface UpgradeRow {
  kind: MetaUpgradeKind;
  levelText: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
  button: MenuButton;
}

/**
 * UpgradeScene - spend earned coins on permanent meta-upgrades between runs.
 *
 * Lists every {@link MetaUpgradeKind} with its name, description, current level,
 * and the cost of the next level. Buying routes through {@link MetaStore}, which
 * spends coins, raises the level, and persists to localStorage; the derived
 * stats it produces feed the next run's starting squad / firepower / coin gain.
 * From here the player can Deploy straight into a run or go Back to the Title.
 */
export class UpgradeScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.Title;
  private coinsText!: Phaser.GameObjects.Text;
  private rows: UpgradeRow[] = [];

  constructor() {
    super({ key: SceneKeys.Upgrade });
  }

  create(data: UpgradeData): void {
    this.returnTo = data?.returnTo ?? SceneKeys.Title;
    this.rows = [];
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    Menu.title(this, cx, CANVAS.HEIGHT * 0.09, tr('upgrade.title'), 40);

    // Coins readout.
    this.add.image(cx - 60, CANVAS.HEIGHT * 0.15, TextureKeys.UiIcons, HUD_ICON_FRAME.coin).setScale(1.6);
    this.coinsText = this.add
      .text(cx - 44, CANVAS.HEIGHT * 0.15, '', textStyle(22, { fontStyle: 'bold', color: PALETTE.COIN_CSS }))
      .setOrigin(0, 0.5);

    // Upgrade rows.
    let y = CANVAS.HEIGHT * 0.24;
    const rowH = 128;
    for (const kind of UPGRADE_ORDER) {
      this.buildRow(kind, y);
      y += rowH;
    }

    // Deploy + Back.
    Menu.button(this, cx - 90, CANVAS.HEIGHT * 0.93, tr('upgrade.deploy'), () => this.deploy(), {
      width: 170,
      accent: PALETTE.SQUAD,
    });
    Menu.button(this, cx + 90, CANVAS.HEIGHT * 0.93, tr('upgrade.back'), () => this.close(), { width: 170 });

    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-SPACE', () => this.deploy());

    this.refresh();
  }

  private buildRow(kind: MetaUpgradeKind, y: number): void {
    const cx = CANVAS.WIDTH / 2;
    Menu.panel(this, cx, y + 44, CANVAS.WIDTH * 0.9, 112, 0.9);

    this.add
      .text(cx - CANVAS.WIDTH * 0.4, y, tr(`upgrade.${kind}` as TrKey), textStyle(20, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0, 0.5);

    this.add
      .text(cx - CANVAS.WIDTH * 0.4, y + 26, tr(`upgrade.${kind}.desc` as TrKey), textStyle(13, {
        color: PALETTE.MUTED_CSS,
        wordWrap: { width: CANVAS.WIDTH * 0.5 },
        allowSmall: true,
      }))
      .setOrigin(0, 0);

    const levelText = this.add
      .text(cx - CANVAS.WIDTH * 0.4, y + 66, '', textStyle(15, { allowSmall: true }))
      .setOrigin(0, 0.5);

    const costText = this.add
      .text(cx + CANVAS.WIDTH * 0.14, y + 66, '', textStyle(14, { color: PALETTE.COIN_CSS, allowSmall: true }))
      .setOrigin(0, 0.5);

    const button = Menu.button(this, cx + CANVAS.WIDTH * 0.33, y + 40, tr('upgrade.buy'), () => this.buy(kind), {
      width: 110,
      fontSize: 16,
      allowSmall: true,
    });

    this.rows.push({ kind, levelText, costText, button });
  }

  private buy(kind: MetaUpgradeKind): void {
    const meta = MetaStore.get();
    if (meta.buyUpgrade(kind)) {
      AudioManager.get(this).playSfx(AudioKeys.LevelUp, 0.7);
      this.refresh();
    }
  }

  /** Repaint coins + every row's level/cost/affordability. */
  private refresh(): void {
    const meta = MetaStore.get();
    this.coinsText.setText(String(meta.coins));

    for (const row of this.rows) {
      const level = meta.levelOf(row.kind);
      const max = maxLevel(row.kind);
      row.levelText.setText(tr('upgrade.levelOf', { level, max }));
      if (level >= max) {
        row.costText.setText(tr('upgrade.max'));
        row.button.setText(tr('upgrade.max'));
        row.button.setEnabled(false);
      } else {
        const cost = upgradeCost(row.kind, level);
        row.costText.setText(tr('upgrade.cost', { cost }));
        row.button.setText(tr('upgrade.buy'));
        row.button.setEnabled(canAfford(row.kind, meta.upgradeState(), meta.coins));
      }
    }
  }

  private deploy(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Run));
  }

  private close(): void {
    Menu.fadeTo(this, () => this.scene.start(this.returnTo));
  }
}
