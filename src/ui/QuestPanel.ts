import Phaser from 'phaser';
import { CANVAS, PALETTE, RESOURCE_ORDER } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import {
  QUEST_ORDER,
  conditionProgress,
  questDef,
  type QuestId,
} from '../config/QuestConfig';
import type { ResourceCost, ResourceKind } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from './Menu';
import { textStyle } from './UiText';

/** Per-quest row widgets that need live updates. */
interface QuestRow {
  quest: QuestId;
  nameLabel: Phaser.GameObjects.Text;
  descLabel: Phaser.GameObjects.Text;
  progressLabel: Phaser.GameObjects.Text;
  rewardLabel: Phaser.GameObjects.Text;
  claimButton: MenuButton;
}

/**
 * QuestPanel - the progression-quest / objectives interface, following the
 * {@link TrainingPanel} / {@link HeroPanel} pattern (container overlay,
 * Menu.panel/button, dim backdrop, per-frame refresh()).
 *
 * It lists every quest in chain order with its description, a "3 / 10" style
 * progress readout, its reward, and a Claim button that is enabled ONLY when the
 * quest is completable. A locked quest shows a translated hint ("complete the
 * previous quest first"); an unmet quest shows "in progress"; a claimed quest
 * shows a claimed state. Claiming routes through {@link GameState.claimQuest},
 * which applies the reward (resources + hero shards) exactly once and persists.
 *
 * All state lives in the shared {@link GameState}'s {@link QuestSystem}, so the
 * quest log stays in one place. Korean-first.
 */
export class QuestPanel {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: QuestRow[] = [];
  private summaryText!: Phaser.GameObjects.Text;
  private _visible = false;

  constructor(scene: Phaser.Scene, state: GameState) {
    this.scene = scene;
    this.state = state;
    this.root = scene.add.container(0, 0).setDepth(50).setVisible(false);
    this.build();
  }

  get visible(): boolean {
    return this._visible;
  }

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
    const panelW = 720;
    const panelH = 500;

    const backdrop = this.scene.add
      .rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setInteractive();
    backdrop.on(Phaser.Input.Events.POINTER_DOWN, () => this.setVisible(false));
    this.root.add(backdrop);

    const panel = Menu.panel(this.scene, cx, cy, panelW, panelH);
    panel.setInteractive();
    this.root.add(panel);

    this.root.add(Menu.title(this.scene, cx, cy - panelH / 2 + 26, tr('quest.title'), 28));

    this.summaryText = this.scene.add
      .text(cx, cy - panelH / 2 + 52, '', textStyle(13, { color: PALETTE.SUCCESS_CSS, align: 'center' }))
      .setOrigin(0.5);
    this.root.add(this.summaryText);

    const left = cx - panelW / 2 + 30;
    const rowStep = 50;
    let y = cy - panelH / 2 + 78;
    for (const quest of QUEST_ORDER) {
      this.buildQuestRow(quest, left, y, panelW - 60);
      y += rowStep;
    }

    const close = Menu.button(this.scene, cx, cy + panelH / 2 - 26, tr('common.close'), () => this.setVisible(false), {
      width: 180,
    });
    this.root.add(close.container);
  }

  private buildQuestRow(quest: QuestId, x: number, y: number, width: number): void {
    const nameLabel = this.scene.add
      .text(x, y, tr(`quest.${quest}`), textStyle(15, { fontStyle: 'bold' }))
      .setOrigin(0, 0);
    this.root.add(nameLabel);

    const descLabel = this.scene.add
      .text(x, y + 18, tr(`quest.${quest}.desc`), textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: width - 320 } }))
      .setOrigin(0, 0);
    this.root.add(descLabel);

    const progressLabel = this.scene.add
      .text(x + width - 300, y, '', textStyle(12, { color: PALETTE.ACCENT_CSS }))
      .setOrigin(0, 0);
    this.root.add(progressLabel);

    const rewardLabel = this.scene.add
      .text(x + width - 300, y + 18, '', textStyle(10, { color: PALETTE.MUTED_CSS, wordWrap: { width: 180 } }))
      .setOrigin(0, 0);
    this.root.add(rewardLabel);

    const claimButton = Menu.button(this.scene, x + width - 60, y + 16, tr('quest.claim'), () => this.claim(quest), {
      width: 110,
      height: 34,
      fontSize: 13,
    });
    this.root.add(claimButton.container);

    this.rows.push({ quest, nameLabel, descLabel, progressLabel, rewardLabel, claimButton });
  }

  /** A human reward summary: resources and/or hero shards. */
  private rewardString(quest: QuestId): string {
    const reward = questDef(quest).reward;
    const parts: string[] = [];
    if (reward.resources) parts.push(this.costString(reward.resources));
    if (reward.shards) {
      parts.push(tr('quest.rewardShards', { shards: reward.shards.shards, hero: tr(`hero.${reward.shards.heroId}`) }));
    }
    return parts.filter((p) => p.length > 0).join(', ');
  }

  private costString(cost: ResourceCost): string {
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  private claim(quest: QuestId): void {
    const ok = this.state.claimQuest(quest);
    if (ok) {
      AudioManager.get(this.scene).playSfx(AudioKeys.BuildComplete, 0.6);
    }
    this.refresh();
  }

  refresh(): void {
    if (!this._visible) return;
    const quests = this.state.quests;
    const progress = this.state.questProgress();
    // Keep the derived statuses fresh against the current snapshot.
    quests.refresh(progress);

    const claimedCount = quests.claimed.length;
    if (claimedCount >= QUEST_ORDER.length) {
      this.summaryText.setText(tr('quest.allDone'));
    } else {
      this.summaryText.setText(tr('quest.summary', { claimed: claimedCount, total: QUEST_ORDER.length }));
    }

    for (const row of this.rows) {
      const quest = row.quest;
      const status = quests.status(quest);
      const { have, need } = conditionProgress(questDef(quest), progress);

      row.rewardLabel.setText(tr('quest.reward', { reward: this.rewardString(quest) }));

      if (status === 'locked') {
        row.progressLabel.setText(tr('quest.locked')).setColor(PALETTE.MUTED_CSS);
        row.nameLabel.setAlpha(0.5);
        row.descLabel.setAlpha(0.5);
        row.claimButton.setEnabled(false);
        row.claimButton.setText(tr('quest.locked'));
        continue;
      }

      row.nameLabel.setAlpha(1);
      row.descLabel.setAlpha(1);
      row.progressLabel.setText(tr('quest.progress', { have, need }));

      if (status === 'claimed') {
        row.progressLabel.setColor(PALETTE.SUCCESS_CSS);
        row.claimButton.setEnabled(false);
        row.claimButton.setText(tr('quest.claimed'));
      } else if (status === 'completable') {
        row.progressLabel.setColor(PALETTE.SUCCESS_CSS);
        row.claimButton.setEnabled(true);
        row.claimButton.setText(tr('quest.claim'));
      } else {
        // active: unlocked but condition not yet met.
        row.progressLabel.setColor(PALETTE.ACCENT_CSS);
        row.claimButton.setEnabled(false);
        row.claimButton.setText(tr('quest.inProgress'));
      }
    }
  }

  update(): void {
    if (this._visible) this.refresh();
  }

  destroy(): void {
    this.root.destroy();
  }
}
