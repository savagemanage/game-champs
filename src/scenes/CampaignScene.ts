import Phaser from 'phaser';
import { PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys, ENEMY_TEXTURE_BY_KIND } from '../config/AssetKeys';
import { CAMPAIGN_STAGES, stageById, stageRequiredPower } from '../config/CampaignConfig';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';
import { HubScene } from './HubScene';

/**
 * CampaignScene - the staged Expedition map. Renders each stage as a node along
 * a winding trail (locked / cleared / current), with a detail panel showing the
 * chapter, narrative blurb, enemy preview, recommended power and a March Out
 * button. Attempts run through {@link GameState.attemptCampaignStage} which uses
 * the pure {@link CampaignSystem} + hero-boosted power and grants first-clear
 * rewards once.
 */
export class CampaignScene extends HubScene {
  private selected: string = CAMPAIGN_STAGES[0].id;
  private nodes: { id: string; container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }[] = [];
  private detailTitle!: Phaser.GameObjects.Text;
  private detailBlurb!: Phaser.GameObjects.Text;
  private detailPower!: Phaser.GameObjects.Text;
  private detailStatus!: Phaser.GameObjects.Text;
  private enemyIcons: Phaser.GameObjects.GameObject[] = [];
  private marchButton!: MenuButton;
  private powerText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'CampaignScene' });
  }

  protected titleKey(): string {
    return 'campaign.title';
  }

  protected build(): void {
    // Stage nodes along a trail.
    CAMPAIGN_STAGES.forEach((stage, i) => {
      const x = 90 + (i % 3) * 150;
      const y = 130 + Math.floor(i / 3) * 130;
      const container = this.add.container(x, y);
      const dot = this.add.circle(0, 0, 22, PALETTE.PANEL).setStrokeStyle(3, PALETTE.STONE);
      dot.setInteractive({ useHandCursor: true });
      dot.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(stage.id));
      const num = this.add.text(0, 0, String(stage.order), textStyle(18, { fontStyle: 'bold' })).setOrigin(0.5);
      const label = this.add.text(0, 34, trDyn(`campaign.${stage.id}.name`), textStyle(11, { align: 'center', wordWrap: { width: 130 } })).setOrigin(0.5, 0);
      container.add([dot, num, label]);
      this.nodes.push({ id: stage.id, container, label });
    });

    // Detail panel.
    const px = CANVAS.WIDTH - 190;
    const py = CANVAS.HEIGHT / 2 + 6;
    Menu.panel(this, px, py, 340, 330);
    this.detailTitle = this.add.text(px, py - 148, '', textStyle(18, { fontStyle: 'bold', align: 'center', wordWrap: { width: 310 } })).setOrigin(0.5, 0);
    this.detailBlurb = this.add.text(px - 150, py - 96, '', textStyle(12, { color: PALETTE.MUTED_CSS, wordWrap: { width: 300 }, lineSpacing: 3 })).setOrigin(0, 0);
    this.detailPower = this.add.text(px, py + 20, '', textStyle(13, { align: 'center', color: PALETTE.ICE_CSS })).setOrigin(0.5, 0);
    this.powerText = this.add.text(px, py + 44, '', textStyle(13, { align: 'center', color: PALETTE.ACCENT_CSS })).setOrigin(0.5, 0);
    this.detailStatus = this.add.text(px, py + 72, '', textStyle(12, { align: 'center', wordWrap: { width: 300 } })).setOrigin(0.5, 0);
    this.marchButton = Menu.button(this, px, py + 122, tr('campaign.attempt'), () => this.doMarch(), { width: 240, accent: PALETTE.DANGER });

    this.select(this.selected);
  }

  private select(id: string): void {
    this.selected = id;
    this.audio.playSfx(AudioKeys.UiClick, 0.5);
    this.refresh();
  }

  private refresh(): void {
    const campaign = this.state.campaign;
    for (const { id, container, label } of this.nodes) {
      const dot = container.list[0] as Phaser.GameObjects.Arc;
      const cleared = campaign.isCleared(id);
      const unlocked = campaign.isUnlocked(id);
      dot.setStrokeStyle(3, id === this.selected ? PALETTE.ACCENT : cleared ? PALETTE.SUCCESS : unlocked ? PALETTE.ICE : PALETTE.STONE_DARK);
      dot.setFillStyle(cleared ? PALETTE.STONE_DARK : PALETTE.PANEL, 1);
      container.setAlpha(unlocked || cleared ? 1 : 0.5);
      label.setColor(cleared ? PALETTE.SUCCESS_CSS : PALETTE.TEXT_CSS);
    }
    this.refreshDetail();
  }

  private refreshDetail(): void {
    const id = this.selected;
    const stage = stageById(id);
    if (!stage) return;
    const campaign = this.state.campaign;
    this.detailTitle.setText(`${tr('campaign.chapter', { chapter: stage.chapter })} · ${trDyn(`campaign.${id}.name`)}`);
    this.detailBlurb.setText(trDyn(`campaign.${id}.blurb`));
    this.detailPower.setText(tr('campaign.recommendedPower', { power: Math.round(stageRequiredPower(id)) }));
    this.powerText.setText(tr('hero.power', { power: Math.round(this.state.campaignPower()) }));

    // Enemy preview icons.
    for (const icon of this.enemyIcons) icon.destroy();
    this.enemyIcons = [];
    const px = CANVAS.WIDTH - 190;
    const py = CANVAS.HEIGHT / 2 - 34;
    let ex = px - 120;
    for (const e of stage.enemies) {
      const tex = ENEMY_TEXTURE_BY_KIND[e.kind];
      const img = this.add.image(ex, py, tex, 0).setOrigin(0, 0.5).setScale(0.8);
      this.enemyIcons.push(img);
      const cnt = this.add.text(ex + img.displayWidth + 2, py, `x${e.count}`, textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0.5);
      this.enemyIcons.push(cnt);
      ex += img.displayWidth + 34;
    }

    // March button + status.
    if (!campaign.isUnlocked(id)) {
      this.marchButton.setEnabled(false);
      this.detailStatus.setText(tr('campaign.locked')).setColor(PALETTE.DANGER_CSS);
      return;
    }
    this.marchButton.setEnabled(true);
    if (campaign.isCleared(id)) {
      this.detailStatus.setText(tr('campaign.cleared')).setColor(PALETTE.SUCCESS_CSS);
    } else {
      this.detailStatus.setText('');
    }
  }

  private doMarch(): void {
    const id = this.selected;
    const result = this.state.attemptCampaignStage(id);
    if (result.win) {
      this.audio.playSfx(AudioKeys.Victory, 0.6);
      this.refreshCurrency();
      this.toast(result.firstClear ? `${tr('campaign.victory')} ${tr('campaign.rewardClaimed')}` : tr('campaign.victory'));
      if (this.state.campaign.complete) this.toast(tr('campaign.complete'), PALETTE.ACCENT_CSS);
    } else {
      this.audio.playSfx(AudioKeys.Defeat, 0.5);
      this.toast(tr('campaign.defeat'), PALETTE.DANGER_CSS);
    }
    this.state.save(Date.now());
    this.refresh();
  }
}
