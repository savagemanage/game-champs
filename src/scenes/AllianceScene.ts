import Phaser from 'phaser';
import { PALETTE, CANVAS, ALLIANCE } from '../config/GameConfig';
import { AudioKeys, ENEMY_TEXTURE_BY_KIND } from '../config/AssetKeys';
import { RALLY_BOSSES, rallyBoss } from '../config/RallyConfig';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';
import { HubScene } from './HubScene';

/**
 * AllianceScene - the simulated NPC alliance (the Frosthold Pact) + world-boss
 * rallies. Left: the pact roster count, banked help charges (spend to shorten
 * the active build/research timer) and the pact-tech contribution track. Right:
 * the Frostbeast rally bosses with their HP pool, progress bar and a Rally
 * button that chips the pool via {@link GameState.attackRally}. All AI: no
 * servers. Logic lives in AllianceSystem + RallySystem.
 */
export class AllianceScene extends HubScene {
  private helpText!: Phaser.GameObjects.Text;
  private techText!: Phaser.GameObjects.Text;
  private techPointsText!: Phaser.GameObjects.Text;
  private helpButton!: MenuButton;
  private contributeButton!: MenuButton;
  private selectedBoss = RALLY_BOSSES[0].id;
  private bossButtons: { id: string; button: MenuButton }[] = [];
  private bossTitle!: Phaser.GameObjects.Text;
  private bossDesc!: Phaser.GameObjects.Text;
  private bossHp!: Phaser.GameObjects.Text;
  private bossBar!: ReturnType<typeof Menu.progressBar>;
  private bossIcon!: Phaser.GameObjects.Image;
  private rallyButton!: MenuButton;
  private rallyStatus!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'AllianceScene' });
  }

  protected titleKey(): string {
    return 'alliance.title';
  }

  protected build(): void {
    // --- Left: the Pact (members, help, tech) ---
    Menu.panel(this, 210, 190, 360, 240);
    this.add.text(210, 90, tr('alliance.members', { count: ALLIANCE.MEMBER_COUNT }), textStyle(15, { align: 'center', color: PALETTE.ICE_CSS })).setOrigin(0.5);
    this.helpText = this.add.text(210, 130, '', textStyle(14, { align: 'center' })).setOrigin(0.5);
    this.helpButton = Menu.button(this, 210, 168, tr('alliance.help'), () => this.doHelp(), { width: 240, fontSize: 14 });
    this.techText = this.add.text(210, 214, '', textStyle(14, { align: 'center', color: PALETTE.ACCENT_CSS })).setOrigin(0.5);
    this.techPointsText = this.add.text(210, 238, '', textStyle(12, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5);
    this.contributeButton = Menu.button(this, 210, 278, tr('alliance.contribute'), () => this.doContribute(), { width: 240, fontSize: 14 });

    // --- Right: Frostbeast rallies ---
    const rx = CANVAS.WIDTH - 250;
    this.add.text(rx, 82, tr('rally.title'), textStyle(15, { align: 'center', color: PALETTE.EMBER_CSS })).setOrigin(0.5);
    RALLY_BOSSES.forEach((b, i) => {
      const btn = Menu.button(this, rx, 116 + i * 40, trDyn(`enemy.${b.id}`), () => this.selectBoss(b.id), { width: 260, fontSize: 13, padY: 6 });
      this.bossButtons.push({ id: b.id, button: btn });
    });

    Menu.panel(this, rx, 340, 320, 220);
    this.bossIcon = this.add.image(rx, 268, ENEMY_TEXTURE_BY_KIND[this.selectedBoss], 0).setOrigin(0.5).setScale(1.1);
    this.bossTitle = this.add.text(rx, 300, '', textStyle(16, { fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.bossDesc = this.add.text(rx - 148, 320, '', textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: 296 }, align: 'left' })).setOrigin(0, 0);
    this.bossHp = this.add.text(rx, 372, '', textStyle(12, { align: 'center', color: PALETTE.ICE_CSS })).setOrigin(0.5);
    this.bossBar = Menu.progressBar(this, rx - 130, 392, 260, 12, PALETTE.DANGER);
    this.rallyStatus = this.add.text(rx, 406, '', textStyle(11, { align: 'center', color: PALETTE.SUCCESS_CSS, wordWrap: { width: 296 } })).setOrigin(0.5, 0);
    this.rallyButton = Menu.button(this, rx, CANVAS.HEIGHT - 90, tr('rally.attack'), () => this.doRally(), { width: 260, accent: PALETTE.EMBER });

    this.selectBoss(this.selectedBoss);
    this.refreshPact();
  }

  private refreshPact(): void {
    this.refreshCurrency();
    this.helpText.setText(tr('alliance.helpsAvailable', { count: this.state.alliance.helpsAvailable }));
    this.helpButton.setEnabled(this.state.alliance.helpsAvailable > 0);
    this.techText.setText(tr('alliance.techLevel', { level: this.state.alliance.techLevel }));
    this.techPointsText.setText(tr('alliance.techPoints', { points: this.state.alliance.techPoints }));
    this.contributeButton.setEnabled(this.state.alliance.techLevel < ALLIANCE.MAX_TECH_LEVEL);
  }

  private selectBoss(id: string): void {
    this.selectedBoss = id;
    this.audio.playSfx(AudioKeys.UiClick, 0.5);
    this.refreshBoss();
  }

  private refreshBoss(): void {
    const id = this.selectedBoss;
    const boss = rallyBoss(id);
    if (!boss) return;
    for (const { id: bid, button } of this.bossButtons) {
      const defeated = this.state.rally.isDefeated(bid);
      button.label.setColor(bid === this.selectedBoss ? PALETTE.ACCENT_CSS : defeated ? PALETTE.SUCCESS_CSS : PALETTE.TEXT_CSS);
    }
    this.bossIcon.setTexture(ENEMY_TEXTURE_BY_KIND[id], 0);
    this.bossTitle.setText(trDyn(`enemy.${id}`));
    this.bossDesc.setText(`${trDyn(`rally.${id}.desc`)}\n${tr('rally.recommended', { power: boss.recommendedPower })}`);
    const remaining = this.state.rally.remaining(id);
    this.bossHp.setText(`${tr('rally.remaining', { remaining: Math.round(remaining), pool: boss.hpPool })}  ·  ${tr('rally.attempts', { count: this.state.rally.attempts(id) })}`);
    this.bossBar.setProgress(1 - this.state.rally.progress(id));
    if (this.state.rally.isDefeated(id)) {
      this.rallyStatus.setText(tr('rally.defeated')).setColor(PALETTE.SUCCESS_CSS);
      this.rallyButton.setEnabled(false);
    } else {
      this.rallyButton.setEnabled(true);
    }
  }

  private doHelp(): void {
    const now = Date.now();
    const shaved = this.state.useAllianceHelp(now);
    if (shaved > 0) this.toast(tr('alliance.helpApplied', { seconds: Math.round(shaved / 1000) }));
    else this.toast(tr('alliance.noTimer'), PALETTE.MUTED_CSS);
    this.audio.playSfx(AudioKeys.UiClick, 0.6);
    this.state.save(now);
    this.refreshPact();
  }

  private doContribute(): void {
    this.state.alliance.contribute(25);
    this.audio.playSfx(AudioKeys.UiClick, 0.6);
    this.state.save(Date.now());
    this.refreshPact();
  }

  private doRally(): void {
    const now = Date.now();
    const result = this.state.attackRally(this.selectedBoss, now);
    this.audio.playSfx(AudioKeys.BossHit, 0.7);
    const parts = [tr('rally.allianceShare', { amount: Math.round(result.allianceDamage) })];
    if (result.defeated) parts.push(tr('rally.defeated'));
    this.toast(parts.join('  '), result.defeated ? PALETTE.SUCCESS_CSS : PALETTE.ICE_CSS);
    this.refreshCurrency();
    this.state.save(now);
    this.refreshBoss();
    this.refreshPact();
  }
}
