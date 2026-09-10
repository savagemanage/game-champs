import Phaser from 'phaser';
import { CANVAS, PALETTE, TRAINING } from '../config/GameConfig';
import { AudioKeys, TROOP_TEXTURE_BY_KIND } from '../config/AssetKeys';
import { TROOP_ORDER, troopTierCost, troopTierTrainTimeMs } from '../config/TroopConfig';
import type { ResourceKind, TroopKind } from '../types';
import { RESOURCE_ORDER } from '../config/GameConfig';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from './Menu';
import { textStyle } from './UiText';

/** Per-troop row widgets that need live updates. */
interface TroopRow {
  troop: TroopKind;
  count: number;
  countLabel: Phaser.GameObjects.Text;
  costLine: Phaser.GameObjects.Text;
  armyLabel: Phaser.GameObjects.Text;
  trainButton: MenuButton;
}

/**
 * TrainingPanel - the War Camp troop-training interface (the FEAT-003 "Hud"
 * component). It lists each troop type with its cost and per-unit train time,
 * a +/- batch-count selector, and a Train button that enqueues a batch through
 * the shared {@link GameState}'s {@link TrainingQueue} (which enforces the
 * up-front cost charge and the War Camp prerequisite). Below the roster it
 * shows the live training queue with remaining times and the standing army
 * counts, both refreshed every frame from the same queue.
 *
 * It is a plain container overlay (not a Scene) so TownScene can toggle it on
 * top of the town without a scene switch, keeping one shared state.
 */
export class TrainingPanel {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: TroopRow[] = [];
  private queueText!: Phaser.GameObjects.Text;
  private _visible = false;
  /** The troop TIER every row trains at (1..maxTroopTier). Shared across rows. */
  private tier = 1;
  private tierLabel!: Phaser.GameObjects.Text;
  private tierMinus!: MenuButton;
  private tierPlus!: MenuButton;

  constructor(scene: Phaser.Scene, state: GameState) {
    this.scene = scene;
    this.state = state;
    this.root = scene.add.container(0, 0).setDepth(50).setVisible(false);
    this.build();
  }

  get visible(): boolean {
    return this._visible;
  }

  /** Show/hide the panel; refreshes contents on show. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    this.root.setVisible(visible);
    if (visible) this.refresh();
  }

  toggle(): void {
    this.setVisible(!this._visible);
  }

  private build(): void {
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const panelW = 620;
    const panelH = 440;

    // Dim backdrop that also swallows clicks behind the panel (closes it).
    const backdrop = this.scene.add
      .rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setInteractive();
    backdrop.on(Phaser.Input.Events.POINTER_DOWN, () => this.setVisible(false));
    this.root.add(backdrop);

    const panel = Menu.panel(this.scene, cx, cy, panelW, panelH);
    // Absorb clicks on the panel body so they do not fall through to backdrop.
    panel.setInteractive();
    this.root.add(panel);

    this.root.add(Menu.title(this.scene, cx, cy - panelH / 2 + 34, tr('training.title'), 30));

    const left = cx - panelW / 2 + 40;
    let y = cy - panelH / 2 + 84;
    const rowStep = 78;

    for (const troop of TROOP_ORDER) {
      this.buildTroopRow(troop, left, y, panelW - 80);
      y += rowStep;
    }

    // Shared troop-TIER selector (gated by research-unlocked max tier). Higher
    // tiers cost more, train slower, and field stronger stats; every row trains
    // at the selected tier.
    this.buildTierSelector(left, y + 4, panelW - 80);
    y += 40;

    // Live training queue readout.
    this.queueText = this.scene.add
      .text(left, y + 6, '', textStyle(15, { color: PALETTE.MUTED_CSS, wordWrap: { width: panelW - 80 } }))
      .setOrigin(0, 0);
    this.root.add(this.queueText);

    const close = Menu.button(this.scene, cx, cy + panelH / 2 - 30, tr('common.close'), () => this.setVisible(false), {
      width: 180,
    });
    this.root.add(close.container);
  }

  private buildTroopRow(troop: TroopKind, x: number, y: number, width: number): void {
    // Troop icon.
    const icon = this.scene.add.image(x + 16, y + 16, TROOP_TEXTURE_BY_KIND[troop], 0).setOrigin(0.5).setScale(1.4);
    this.root.add(icon);

    // Name + cost/time line (updated live for the selected tier).
    const name = this.scene.add.text(x + 40, y, tr(`troop.${troop}`), textStyle(18, { fontStyle: 'bold' })).setOrigin(0, 0);
    this.root.add(name);

    const costLine = this.scene.add
      .text(x + 40, y + 22, '', textStyle(13, { color: PALETTE.MUTED_CSS }))
      .setOrigin(0, 0);
    this.root.add(costLine);

    // Standing army count for this troop.
    const armyLabel = this.scene.add
      .text(x + 40, y + 42, '', textStyle(13, { color: PALETTE.ACCENT_CSS }))
      .setOrigin(0, 0);
    this.root.add(armyLabel);

    // +/- count selector.
    const selectorX = x + width - 250;
    const row: TroopRow = {
      troop,
      count: 1,
      countLabel: this.scene.add.text(selectorX + 60, y + 16, '1', textStyle(20)).setOrigin(0.5),
      costLine,
      armyLabel,
      trainButton: undefined as unknown as MenuButton,
    };

    const minus = Menu.button(this.scene, selectorX + 20, y + 16, '\u2212', () => this.changeCount(row, -1), {
      width: 36,
      height: 36,
      fontSize: 20,
    });
    const plus = Menu.button(this.scene, selectorX + 100, y + 16, '+', () => this.changeCount(row, 1), {
      width: 36,
      height: 36,
      fontSize: 20,
    });
    this.root.add(minus.container);
    this.root.add(row.countLabel);
    this.root.add(plus.container);

    row.trainButton = Menu.button(this.scene, selectorX + 195, y + 16, tr('training.train'), () => this.train(row), {
      width: 120,
      height: 40,
      fontSize: 16,
    });
    this.root.add(row.trainButton.container);

    this.rows.push(row);
  }

  private costString(troop: TroopKind): string {
    const cost = troopTierCost(troop, this.tier);
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  /** Build the shared tier selector (−/label/+), clamped to the unlocked max. */
  private buildTierSelector(x: number, y: number, width: number): void {
    const label = this.scene.add
      .text(x, y, '', textStyle(15, { fontStyle: 'bold', color: PALETTE.ICE_CSS }))
      .setOrigin(0, 0.5);
    this.tierLabel = label;
    this.root.add(label);

    const selectorX = x + width - 250;
    this.tierMinus = Menu.button(this.scene, selectorX + 20, y, '\u2212', () => this.changeTier(-1), {
      width: 36,
      height: 36,
      fontSize: 20,
    });
    this.tierPlus = Menu.button(this.scene, selectorX + 100, y, '+', () => this.changeTier(1), {
      width: 36,
      height: 36,
      fontSize: 20,
    });
    this.root.add(this.tierMinus.container);
    this.root.add(this.tierPlus.container);
  }

  private changeTier(delta: number): void {
    const max = this.state.maxTroopTier();
    this.tier = Phaser.Math.Clamp(this.tier + delta, 1, max);
    this.refresh();
  }

  private changeCount(row: TroopRow, delta: number): void {
    row.count = Phaser.Math.Clamp(row.count + delta, 1, TRAINING.MAX_BATCH);
    row.countLabel.setText(String(row.count));
    this.refresh();
  }

  private train(row: TroopRow): void {
    const now = Date.now();
    const result = this.state.training.enqueue(
      row.troop,
      row.count,
      this.state.resources,
      now,
      this.state.buildings.hasWarCamp,
      this.tier,
      this.state.maxTroopTier(),
      this.hasYard(row.troop),
    );
    if (result.ok) {
      AudioManager.get(this.scene).playSfx(AudioKeys.TrainComplete, 0.5);
      // Training a batch progresses the daily 'train' quest metric.
      this.state.recordQuest('troopTrained', 1, now);
      this.state.save(now);
    }
    this.refresh();
  }

  /** Refresh all live labels + button enablement against current state. */
  refresh(): void {
    if (!this._visible) return;
    const now = Date.now();
    const hasWarCamp = this.state.buildings.hasWarCamp;
    const army = this.state.training.army;

    // Tier selector: clamp to the unlocked max, then reflect it in the label
    // + button enablement.
    const maxTier = this.state.maxTroopTier();
    this.tier = Phaser.Math.Clamp(this.tier, 1, maxTier);
    this.tierLabel.setText(tr('training.tier', { tier: this.tier, max: maxTier }));
    this.tierMinus.setEnabled(this.tier > 1);
    this.tierPlus.setEnabled(this.tier < maxTier);

    for (const row of this.rows) {
      const seconds = Math.round(troopTierTrainTimeMs(row.troop, this.tier) / 1000);
      row.costLine.setText(
        `${tr('training.cost', { cost: this.costString(row.troop) })}   ${tr('training.time', { seconds })}`,
      );
      row.armyLabel.setText(tr('training.army', { count: army[row.troop] }));
      row.trainButton.setEnabled(hasWarCamp && this.hasYard(row.troop) && this.affordable(row));
      row.trainButton.setText(tr('training.trainCount', { count: row.count }));
    }

    // Queue readout.
    const orders = this.state.training.orders;
    if (!hasWarCamp) {
      this.queueText.setText(tr('training.noWarCamp'));
    } else if (orders.length === 0) {
      this.queueText.setText(`${tr('training.queue')}: ${tr('training.queueEmpty')}`);
    } else {
      const lines = orders.map((o) => {
        const seconds = Math.max(0, Math.ceil((o.completesAt - now) / 1000));
        return tr('training.queueItem', { count: o.count, troop: tr(`troop.${o.troop}`), seconds });
      });
      this.queueText.setText(`${tr('training.queue')}:\n${lines.join('\n')}`);
    }
  }

  private hasYard(troop: TroopKind): boolean {
    const yard = troop === 'vanguard' ? 'infantry_yard' : troop === 'trapper' ? 'lancer_yard' : 'marksman_range';
    return this.state.buildings.level(yard) > 0;
  }

  /** Whether the player can currently afford a batch (without enqueuing). */
  private affordable(row: TroopRow): boolean {
    const per = troopTierCost(row.troop, this.tier);
    const cost: Partial<Record<ResourceKind, number>> = {};
    for (const r of RESOURCE_ORDER as readonly ResourceKind[]) {
      const amount = per[r] ?? 0;
      if (amount > 0) cost[r] = amount * row.count;
    }
    const queueHasRoom = this.state.training.length < TRAINING.MAX_QUEUE;
    return queueHasRoom && this.state.resources.canAfford(cost);
  }

  /** Called every frame by the owning scene to keep timers ticking. */
  update(): void {
    if (this._visible) this.refresh();
  }

  destroy(): void {
    this.root.destroy();
  }
}
