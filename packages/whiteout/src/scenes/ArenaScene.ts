import Phaser from 'phaser';
import { PALETTE, CANVAS } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import { HubScene } from './HubScene';

/**
 * ArenaScene - the simulated PvP ladder. Shows the player's rank + record and
 * the current opponent's deterministically-generated power, with a Challenge
 * button. A match runs through {@link GameState.fightArena} (the pure
 * {@link ArenaSystem} decides win/loss from the power comparison and credits
 * sparks on a win). No networking.
 */
export class ArenaScene extends HubScene {
  private rankText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private oppText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ArenaScene' });
  }

  protected titleKey(): string {
    return 'arena.title';
  }

  protected build(): void {
    const cx = CANVAS.WIDTH / 2;
    Menu.panel(this, cx, 250, 420, 320);
    this.rankText = this.add.text(cx, 130, '', textStyle(30, { fontStyle: 'bold', align: 'center', color: PALETTE.ACCENT_CSS })).setOrigin(0.5);
    this.recordText = this.add.text(cx, 176, '', textStyle(15, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5);
    this.powerText = this.add.text(cx, 220, '', textStyle(15, { align: 'center', color: PALETTE.SUCCESS_CSS })).setOrigin(0.5);
    this.oppText = this.add.text(cx, 250, '', textStyle(15, { align: 'center', color: PALETTE.ICE_CSS })).setOrigin(0.5);
    this.resultText = this.add.text(cx, 306, '', textStyle(16, { align: 'center', fontStyle: 'bold', wordWrap: { width: 380 } })).setOrigin(0.5);

    Menu.button(this, cx, CANVAS.HEIGHT - 90, tr('arena.fight'), () => this.doFight(), { width: 260, accent: PALETTE.DANGER });
    this.refresh();
  }

  private refresh(): void {
    this.refreshCurrency();
    this.rankText.setText(tr('arena.rank', { rank: this.state.arena.rank }));
    this.recordText.setText(tr('arena.record', { wins: this.state.arena.wins, losses: this.state.arena.losses }));
    this.powerText.setText(tr('hero.power', { power: Math.round(this.state.campaignPower()) }));
    this.oppText.setText(tr('arena.opponentPower', { power: Math.round(this.state.arena.previewOpponentPower()) }));
  }

  private doFight(): void {
    const now = Date.now();
    const result = this.state.fightArena(now);
    if (result.win) {
      this.audio.playSfx(AudioKeys.Victory, 0.6);
      this.resultText.setText(`${tr('arena.win', { rank: result.rankAfter })}\n${tr('arena.reward', { sparks: result.sparks })}`).setColor(PALETTE.SUCCESS_CSS);
    } else {
      this.audio.playSfx(AudioKeys.Defeat, 0.5);
      this.resultText.setText(tr('arena.loss', { rank: result.rankAfter })).setColor(PALETTE.DANGER_CSS);
    }
    this.state.save(now);
    this.refresh();
  }
}
