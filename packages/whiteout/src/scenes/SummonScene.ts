import Phaser from 'phaser';
import { PALETTE, CANVAS, SUMMON } from '../config/GameConfig';
import { AudioKeys, TextureKeys, HERO_PORTRAIT_FRAME } from '../config/AssetKeys';
import type { HeroId } from '../types';
import { heroDef } from '../config/HeroConfig';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import { HubScene } from './HubScene';

/** Rarity accent colour for a hero (matches the portrait ring). */
function rarityColor(id: HeroId): string {
  switch (heroDef(id).rarity) {
    case 'legendary':
      return PALETTE.SPARK_CSS;
    case 'epic':
      return PALETTE.EMBER_CSS;
    case 'rare':
      return PALETTE.ICE_CSS;
    default:
      return PALETTE.MUTED_CSS;
  }
}

/**
 * SummonScene - the deterministic hero gacha with a reveal. Shows the summon
 * cost, the pity progress, and a big Summon button; a pull spends Ember Sparks
 * through {@link GameState.summonOnce} (the pure, seedable SummonSystem does the
 * roll) and reveals the recruited hero or the shards from a duplicate with a
 * portrait flourish. No new heroes/art here — purely surfaces the system.
 */
export class SummonScene extends HubScene {
  private pityText!: Phaser.GameObjects.Text;
  private totalText!: Phaser.GameObjects.Text;
  private summonButton!: MenuButton;
  private revealPortrait!: Phaser.GameObjects.Image;
  private revealName!: Phaser.GameObjects.Text;
  private revealNote!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SummonScene' });
  }

  protected titleKey(): string {
    return 'summon.title';
  }

  protected build(): void {
    const cx = CANVAS.WIDTH / 2;

    // Central reveal altar.
    Menu.panel(this, cx, 250, 320, 300);
    this.revealPortrait = this.add.image(cx, 210, TextureKeys.HeroPortraits, 0).setScale(4).setVisible(false);
    this.revealName = this.add.text(cx, 300, '', textStyle(22, { fontStyle: 'bold', align: 'center' })).setOrigin(0.5);
    this.revealNote = this.add.text(cx, 336, tr('summon.pull', { cost: SUMMON.SPARK_COST }), textStyle(14, { color: PALETTE.MUTED_CSS, align: 'center', wordWrap: { width: 300 } })).setOrigin(0.5);

    this.pityText = this.add.text(cx, 120, '', textStyle(14, { align: 'center', color: PALETTE.ICE_CSS })).setOrigin(0.5);
    this.totalText = this.add.text(cx, 142, '', textStyle(13, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5);
    const weights = SUMMON.RARITY_WEIGHTS;
    this.add.text(cx, 164, `${tr('rarity.common')} ${weights.common} · ${tr('rarity.rare')} ${weights.rare} · ${tr('rarity.epic')} ${weights.epic} · ${tr('rarity.legendary')} ${weights.legendary}`,
      textStyle(11, { align: 'center', color: PALETTE.FROST_CSS })).setOrigin(0.5);

    this.summonButton = Menu.button(this, cx, CANVAS.HEIGHT - 90, tr('summon.pull', { cost: SUMMON.SPARK_COST }), () => this.doSummon(), { width: 300, accent: PALETTE.EMBER });

    this.refresh();
  }

  private pityRemaining(): number {
    // The guarantee triggers once pityCounter reaches PITY_THRESHOLD.
    return Math.max(0, SUMMON.PITY_THRESHOLD - this.state.summon.pityCounter);
  }

  private refresh(): void {
    this.refreshCurrency();
    const remaining = this.pityRemaining();
    this.pityText.setText(remaining <= 0 ? tr('summon.pityReady') : tr('summon.pity', { count: remaining }));
    this.totalText.setText(tr('summon.totalPulls', { count: this.state.summon.totalPulls }));
    const affordable = this.state.premium.sparks >= SUMMON.SPARK_COST;
    this.summonButton.setEnabled(affordable);
    if (!affordable) this.revealNote.setText(tr('summon.notEnough')).setColor(PALETTE.DANGER_CSS);
  }

  private doSummon(): void {
    const now = Date.now();
    const result = this.state.summonOnce(undefined, now, `summon:${now}`);
    if (!result) {
      this.revealNote.setText(tr('summon.notEnough')).setColor(PALETTE.DANGER_CSS);
      return;
    }
    this.audio.playSfx(AudioKeys.Summon, 0.8);
    this.reveal(result.hero, result.outcome === 'hero' ? null : result.shards);
    this.state.save(now);
    this.refresh();
  }

  private reveal(id: HeroId, shards: number | null): void {
    this.revealPortrait.setFrame(HERO_PORTRAIT_FRAME[id]).setVisible(true).setScale(2);
    this.revealName.setText(tr(`hero.${id}.name`)).setColor(rarityColor(id));
    this.revealNote
      .setColor(PALETTE.SUCCESS_CSS)
      .setText(shards === null ? tr('summon.gotHero', { name: tr(`hero.${id}.name`) }) : tr('summon.gotShards', { name: tr(`hero.${id}.name`), shards }));
    // A small pop-in flourish.
    this.tweens.add({ targets: this.revealPortrait, scale: { from: 2, to: 4 }, duration: 300, ease: 'Back.easeOut' });
  }
}
