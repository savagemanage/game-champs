import Phaser from 'phaser';
import { PALETTE, CANVAS, VIP } from '../config/GameConfig';
import type { QuestView } from '../systems/QuestSystem';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';
import { HubScene } from './HubScene';

interface QuestRow {
  id: string;
  daily: boolean;
  label: Phaser.GameObjects.Text;
  progress: Phaser.GameObjects.Text;
}

/** Daily, Growth, Event, and activity-earned VIP status. Quest rewards auto-claim. */
export class QuestsScene extends HubScene {
  private rows: QuestRow[] = [];
  private vipText!: Phaser.GameObjects.Text;
  private vipPerk!: Phaser.GameObjects.Text;
  private eventText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'QuestsScene' });
  }

  protected titleKey(): string {
    return 'quest.title';
  }

  protected build(): void {
    const now = Date.now();
    this.add.text(CANVAS.WIDTH / 2, 50, tr('meta.localDisclosure'),
      textStyle(11, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5);
    this.add.text(60, 68, tr('quest.title'), textStyle(15, { fontStyle: 'bold', color: PALETTE.ICE_CSS })).setOrigin(0, 0.5);
    this.add.text(60, 84, tr('quest.resetsDaily'), textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0);
    this.state.quests.dailyViews(now).forEach((q, i) => this.buildRow(q, true, 40, 108 + i * 44));

    const growthX = CANVAS.WIDTH / 2 + 20;
    this.add.text(growthX, 68, tr('quest.growthTitle'), textStyle(15, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS })).setOrigin(0, 0.5);
    this.state.quests.milestoneViews().forEach((q, i) => this.buildRow(q, false, growthX - 20, 108 + i * 44));

    Menu.panel(this, CANVAS.WIDTH / 2, CANVAS.HEIGHT - 78, CANVAS.WIDTH - 80, 96);
    this.vipText = this.add.text(60, CANVAS.HEIGHT - 104, '', textStyle(16, { fontStyle: 'bold', color: PALETTE.SPARK_CSS })).setOrigin(0, 0.5);
    this.vipPerk = this.add.text(60, CANVAS.HEIGHT - 78, '', textStyle(12, { color: PALETTE.SUCCESS_CSS })).setOrigin(0, 0.5);
    this.eventText = this.add.text(60, CANVAS.HEIGHT - 54, '', textStyle(12, { color: PALETTE.ICE_CSS })).setOrigin(0, 0.5);
    this.refresh();
  }

  private buildRow(q: QuestView, daily: boolean, x: number, y: number): void {
    const label = this.add.text(x, y, trDyn(`quest.${q.id}`), textStyle(13, { fontStyle: 'bold', wordWrap: { width: 370 } })).setOrigin(0, 0.5);
    const progress = this.add.text(x, y + 15, '', textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0.5);
    this.rows.push({ id: q.id, daily, label, progress });
  }

  private refresh(): void {
    this.refreshCurrency();
    const now = Date.now();
    const daily = new Map(this.state.quests.dailyViews(now).map((view) => [view.id, view]));
    const growth = new Map(this.state.quests.milestoneViews().map((view) => [view.id, view]));
    for (const row of this.rows) {
      const view = row.daily ? daily.get(row.id) : growth.get(row.id);
      if (!view) continue;
      row.progress.setText(view.claimed
        ? `${tr('quest.progress', { progress: view.target, target: view.target })} · ${tr('quest.claimed')}`
        : tr('quest.progress', { progress: Math.min(view.progress, view.target), target: view.target }));
      row.label.setColor(view.claimed ? PALETTE.SUCCESS_CSS : PALETTE.TEXT_CSS);
    }

    this.vipText.setText(tr('vip.level', { level: this.state.vip.level }));
    const perkEco = Math.round(this.state.vip.level * VIP.BONUS_PER_LEVEL.economyOutput * 100);
    const perkBuild = Math.round(this.state.vip.level * VIP.BONUS_PER_LEVEL.buildSpeed * 100);
    this.vipPerk.setText(this.state.vip.level >= this.state.vip.maxLevel
      ? tr('vip.maxed')
      : `${tr('vip.perk', { eco: perkEco, build: perkBuild })} · ${tr('vip.toNext', { points: this.state.vip.pointsToNextLevel() })}`);

    const eventId = this.state.quests.activeEvent(now);
    this.eventText.setText(eventId
      ? `${trDyn(`event.${eventId}`)} · ${tr('event.active', { bonus: this.state.quests.productionBonus(now) })}`
      : '');
  }
}
