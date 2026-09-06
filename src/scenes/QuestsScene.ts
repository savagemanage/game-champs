import Phaser from 'phaser';
import { PALETTE, CANVAS, VIP } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import type { QuestView } from '../systems/QuestSystem';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';
import { HubScene } from './HubScene';

/** One rendered quest row: label + progress + a claim button. */
interface QuestRow {
  id: string;
  daily: boolean;
  label: Phaser.GameObjects.Text;
  progress: Phaser.GameObjects.Text;
  claim: MenuButton;
}

/**
 * QuestsScene - daily duties, growth trials, VIP standing and the active event.
 * Reads the pure {@link QuestSystem} for quest views and claims through
 * {@link GameState.claimDailyQuest} / {@link GameState.claimMilestone} (rewards
 * applied by GameState). VIP standing + perks come straight from
 * {@link VipSystem}. Any running event window is shown with its bonus.
 */
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

    // Column headers.
    this.add.text(60, 62, tr('quest.title'), textStyle(15, { fontStyle: 'bold', color: PALETTE.ICE_CSS })).setOrigin(0, 0.5);
    this.add.text(60, 78, tr('quest.resetsDaily'), textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0);

    const dailies = this.state.quests.dailyViews(now);
    dailies.forEach((q, i) => this.buildRow(q, true, 40, 100 + i * 44));

    const growthX = CANVAS.WIDTH / 2 + 20;
    this.add.text(growthX, 62, tr('quest.growthTitle'), textStyle(15, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS })).setOrigin(0, 0.5);
    const milestones = this.state.quests.milestoneViews();
    milestones.forEach((q, i) => this.buildRow(q, false, growthX - 20, 100 + i * 44));

    // VIP + event footer panel.
    Menu.panel(this, CANVAS.WIDTH / 2, CANVAS.HEIGHT - 78, CANVAS.WIDTH - 80, 96);
    this.vipText = this.add.text(60, CANVAS.HEIGHT - 104, '', textStyle(16, { fontStyle: 'bold', color: PALETTE.SPARK_CSS })).setOrigin(0, 0.5);
    this.vipPerk = this.add.text(60, CANVAS.HEIGHT - 78, '', textStyle(12, { color: PALETTE.SUCCESS_CSS })).setOrigin(0, 0.5);
    this.eventText = this.add.text(60, CANVAS.HEIGHT - 54, '', textStyle(12, { color: PALETTE.ICE_CSS })).setOrigin(0, 0.5);

    this.refresh();
  }

  private buildRow(q: QuestView, daily: boolean, x: number, y: number): void {
    const nameKey = `quest.${q.id}`;
    const label = this.add.text(x, y, trDyn(nameKey), textStyle(13, { fontStyle: 'bold', wordWrap: { width: 300 } })).setOrigin(0, 0.5);
    const progress = this.add.text(x, y + 15, '', textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0.5);
    const claim = Menu.button(this, x + 360, y + 4, tr('quest.claim'), () => this.doClaim(q.id, daily), { width: 96, fontSize: 12, padY: 6 });
    this.rows.push({ id: q.id, daily, label, progress, claim });
  }

  private refresh(): void {
    this.refreshCurrency();
    const now = Date.now();
    const daily = new Map(this.state.quests.dailyViews(now).map((v) => [v.id, v]));
    const growth = new Map(this.state.quests.milestoneViews().map((v) => [v.id, v]));
    for (const row of this.rows) {
      const v = row.daily ? daily.get(row.id) : growth.get(row.id);
      if (!v) continue;
      row.progress.setText(tr('quest.progress', { progress: Math.min(v.progress, v.target), target: v.target }));
      if (v.claimed) {
        row.claim.setText(tr('quest.claimed'));
        row.claim.setEnabled(false);
        row.label.setColor(PALETTE.MUTED_CSS);
      } else if (v.complete) {
        row.claim.setText(tr('quest.claim'));
        row.claim.setEnabled(true);
        row.label.setColor(PALETTE.SUCCESS_CSS);
      } else {
        row.claim.setText(tr('quest.progress', { progress: Math.min(v.progress, v.target), target: v.target }));
        row.claim.setEnabled(false);
        row.label.setColor(PALETTE.TEXT_CSS);
      }
    }

    // VIP.
    this.vipText.setText(tr('vip.level', { level: this.state.vip.level }));
    const perkEco = Math.round(this.state.vip.level * VIP.BONUS_PER_LEVEL.economyOutput * 100);
    const perkBuild = Math.round(this.state.vip.level * VIP.BONUS_PER_LEVEL.buildSpeed * 100);
    this.vipPerk.setText(
      this.state.vip.level >= this.state.vip.maxLevel
        ? tr('vip.maxed')
        : `${tr('vip.perk', { eco: perkEco, build: perkBuild })}  ·  ${tr('vip.toNext', { points: this.state.vip.pointsToNextLevel() })}`,
    );

    // Event.
    const eventId = this.state.quests.activeEvent(now);
    if (eventId) {
      const bonus = this.state.quests.productionBonus(now);
      this.eventText.setText(`${trDyn(`event.${eventId}`)} · ${tr('event.active', { bonus })}`).setVisible(true);
    } else {
      this.eventText.setText('').setVisible(false);
    }
  }

  private doClaim(id: string, daily: boolean): void {
    const now = Date.now();
    const res = daily ? this.state.claimDailyQuest(id, now) : this.state.claimMilestone(id, now);
    if (res.ok) {
      this.audio.playSfx(AudioKeys.QuestClaim, 0.7);
      this.refreshCurrency();
    }
    this.state.save(now);
    this.refresh();
  }
}
