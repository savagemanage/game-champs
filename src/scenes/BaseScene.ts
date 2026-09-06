import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, BUILDING_ORDER, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingId, ResourceKind } from '../types';
import {
  TextureKeys,
  AudioKeys,
  BUILDING_ICON_FRAME,
  RESOURCE_ICON_FRAME,
} from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import {
  maxLevel as buildingMaxLevel,
  upgradeCost,
  upgradeTimeSeconds,
  remainingMs,
} from '../systems/Buildings';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching the Base scene from the HomeScene bottom-nav. */
export interface BaseSceneData {
  /** Scene key to return to when Base closes. Defaults to Home. */
  returnTo?: string;
}

/** One resource cell in the top live resource bar. */
interface ResourceCell {
  kind: ResourceKind;
  amountText: Phaser.GameObjects.Text;
}

/** One building row: icon, level, cost/time labels, an upgrade button + countdown. */
interface BuildingRow {
  id: BuildingId;
  levelText: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  button: MenuButton;
  icon: Phaser.GameObjects.Image;
}

/**
 * BaseScene - interactive base management driven entirely by the tested
 * Economy/Buildings systems (FEAT-002). It renders every building's current
 * level, a live resource bar (amounts + storage caps recomputed from the store
 * tick), and per-building upgrade buttons that show the resource cost + build
 * time. Starting an upgrade calls {@link GameStore.tryStartUpgrade}; the timed
 * upgrade then shows a real-time countdown that also completes offline on
 * return (the store's tick resolves finished upgrades on entry and each frame).
 *
 * Affordability + the HQ-level cap are enforced by the tested
 * {@link GameStore.canUpgrade}; unaffordable / capped / queued upgrades grey
 * out. Completing an upgrade plays the upgrade-complete SFX and a small
 * celebration tween. No game math lives here - the scene only reads the store
 * and renders.
 */
export class BaseScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.Home;
  private cells: ResourceCell[] = [];
  private rows: BuildingRow[] = [];

  constructor() {
    super({ key: SceneKeys.Base });
  }

  create(data: BaseSceneData): void {
    this.returnTo = data?.returnTo ?? SceneKeys.Home;
    this.cells = [];
    this.rows = [];
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    AudioManager.get(this).playMusic();

    // Apply offline progress on entry: resolve finished upgrades + accrue
    // production before the first paint so a returning player sees real state.
    const store = GameStore.get();
    store.tick(Date.now());

    Menu.title(this, cx, CANVAS.HEIGHT * 0.06, tr('base.title'), 34).setColor(PALETTE.SQUAD_CSS);

    this.buildResourceBar();
    this.buildRows();

    Menu.button(this, cx, CANVAS.HEIGHT * 0.955, tr('base.back'), () => this.close(), { width: 200 });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    // Number keys 1..6 mirror the on-screen upgrade buttons (desktop shortcut).
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (Number.isInteger(n) && n >= 1 && n <= BUILDING_ORDER.length) {
        this.tryUpgrade(BUILDING_ORDER[n - 1]);
      }
    });

    this.refresh(store);
  }

  /** Top live resource strip: icon + amount/cap per resource in order. */
  private buildResourceBar(): void {
    const y = CANVAS.HEIGHT * 0.13;
    const cols = RESOURCE_ORDER.length;
    const cellW = CANVAS.WIDTH / cols;
    Menu.panel(this, CANVAS.WIDTH / 2, y, CANVAS.WIDTH * 0.96, 46, 0.9);

    RESOURCE_ORDER.forEach((kind: ResourceKind, i) => {
      const x = cellW * i + cellW / 2;
      this.add.image(x - 26, y, TextureKeys.Resources, RESOURCE_ICON_FRAME[kind]).setScale(1.2);
      const amountText = this.add
        .text(x - 12, y, '', textStyle(10, { allowSmall: true }))
        .setOrigin(0, 0.5);
      this.cells.push({ kind, amountText });
    });
  }

  /** A vertical list of building rows (one per BUILDING_ORDER entry). */
  private buildRows(): void {
    const startY = CANVAS.HEIGHT * 0.19;
    const rowH = 116;
    BUILDING_ORDER.forEach((id: BuildingId, i) => {
      this.buildRow(id, startY + i * rowH, i);
    });
  }

  /** A single building row panel with icon, texts, and an upgrade button. */
  private buildRow(id: BuildingId, y: number, index: number): void {
    const cx = CANVAS.WIDTH / 2;
    const left = cx - CANVAS.WIDTH * 0.44;
    Menu.panel(this, cx, y + 44, CANVAS.WIDTH * 0.92, 104, 0.9);

    const icon = this.add.image(left + 28, y + 40, TextureKeys.Buildings, BUILDING_ICON_FRAME[id]).setScale(1.7);

    this.add
      .text(left + 58, y + 8, `${index + 1}. ${tr(`building.${id}` as TrKey)}`, textStyle(16, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS, allowSmall: true }))
      .setOrigin(0, 0.5);

    const levelText = this.add.text(left + 58, y + 32, '', textStyle(13, { allowSmall: true })).setOrigin(0, 0.5);

    const costText = this.add
      .text(left + 58, y + 56, '', textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: CANVAS.WIDTH * 0.52 }, allowSmall: true }))
      .setOrigin(0, 0);

    const statusText = this.add
      .text(left + 58, y + 78, '', textStyle(11, { color: PALETTE.SUCCESS_CSS, allowSmall: true }))
      .setOrigin(0, 0.5);

    const button = Menu.button(this, cx + CANVAS.WIDTH * 0.34, y + 40, tr('building.upgrade'), () => this.tryUpgrade(id), {
      width: 118,
      fontSize: 15,
    });

    this.rows.push({ id, levelText, costText, statusText, button, icon });
  }

  /** Attempt to start a building's upgrade; toast the block reason on failure. */
  private tryUpgrade(id: BuildingId): void {
    const store = GameStore.get();
    const check = store.canUpgrade(id);
    if (!check.ok) {
      this.showToast(this.blockReasonText(check.reason));
      return;
    }
    if (store.tryStartUpgrade(id, Date.now())) {
      AudioManager.get(this).playSfx(AudioKeys.UiClick, 0.7);
      this.showToast(tr('base.started'));
      this.refresh(store);
    }
  }

  /** Map an UpgradeBlockReason to a localized message. */
  private blockReasonText(reason: string): string {
    switch (reason) {
      case 'max_level':
        return tr('building.maxLevel');
      case 'hq_cap':
        return tr('building.hqCapped');
      case 'queue_full':
        return tr('building.queueFull');
      default:
        return tr('building.insufficient');
    }
  }

  /**
   * Per-frame update: resolve any completed upgrades (offline + real-time),
   * detect a fresh completion to celebrate, and repaint countdown + labels.
   */
  update(): void {
    const store = GameStore.get();
    const ticked = store.tick(Date.now());
    if (ticked.completed.length > 0) {
      for (const id of ticked.completed) this.celebrate(id);
      AudioManager.get(this).playSfx(AudioKeys.UpgradeComplete, 0.7);
      this.showToast(tr('building.complete'));
    }
    this.refresh(store);
  }

  /** A small celebration tween on the finished building's icon. */
  private celebrate(id: BuildingId): void {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    this.tweens.add({
      targets: row.icon,
      scale: { from: 2.4, to: 1.7 },
      angle: { from: -8, to: 0 },
      duration: 480,
      ease: 'Back.out',
    });
  }

  /** Repaint the resource bar and every building row from the store. */
  private refresh(store: GameStore): void {
    const resources = store.resources();
    const caps = store.storageCaps();
    for (const cell of this.cells) {
      const amount = Math.floor(resources[cell.kind] ?? 0);
      const cap = Math.floor(caps[cell.kind] ?? 0);
      cell.amountText.setText(`${amount}/${cap}`);
    }

    const now = Date.now();
    for (const row of this.rows) {
      const level = store.buildingLevel(row.id);
      row.levelText.setText(tr('building.level', { level }));

      const active = store.state.buildings.queue.find((u) => u.building === row.id);
      if (active) {
        // This building is under construction: show a live countdown.
        const seconds = Math.ceil(remainingMs(active, now) / 1000);
        row.statusText.setText(tr('building.building', { seconds }));
        row.statusText.setColor(PALETTE.ACCENT_CSS);
        row.costText.setText('');
        row.button.setEnabled(false);
        continue;
      }
      row.statusText.setText('');

      if (level >= buildingMaxLevel(row.id)) {
        row.costText.setText(tr('building.maxLevel'));
        row.button.setText(tr('upgrade.max'));
        row.button.setEnabled(false);
        continue;
      }

      row.costText.setText(this.costLine(row.id, level));
      row.button.setText(tr('building.upgrade'));
      const check = store.canUpgrade(row.id);
      row.button.setEnabled(check.ok);
    }
  }

  /** A compact "cost + build time" line for the next level of a building. */
  private costLine(id: BuildingId, level: number): string {
    const cost = upgradeCost(id, level);
    const parts = RESOURCE_ORDER.filter((k) => (cost[k] ?? 0) > 0).map(
      (k) => `${tr(`resource.${k}` as TrKey)} ${Math.round(cost[k])}`,
    );
    const seconds = upgradeTimeSeconds(id, level);
    const next = tr('base.next', { level: level + 1 });
    return `${next}  ${parts.join('  ')}  (${formatDuration(seconds)})`;
  }

  private toast: Phaser.GameObjects.Container | null = null;

  /** A short auto-dismissing toast. */
  private showToast(message: string): void {
    if (this.toast) {
      this.toast.destroy(true);
      this.toast = null;
    }
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.9;
    const text = this.add.text(0, 0, message, textStyle(13, { align: 'center' })).setOrigin(0.5);
    const bg = Menu.panel(this, 0, 0, Math.ceil(text.width) + 40, 40, 0.96);
    const toast = this.add.container(cx, y, [bg, text]).setDepth(60);
    this.toast = toast;
    this.tweens.add({
      targets: toast,
      alpha: { from: 1, to: 0 },
      delay: 1100,
      duration: 400,
      onComplete: () => {
        toast.destroy(true);
        if (this.toast === toast) this.toast = null;
      },
    });
  }

  private close(): void {
    Menu.fadeTo(this, () => this.scene.start(this.returnTo));
  }
}

/** Format a whole-second duration as `Mm Ss` (or `Ss` under a minute). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
