import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys } from '../config/AssetKeys';
import { TROOP_ORDER } from '../config/TroopConfig';
import { TOTAL_WAVES } from '../config/WaveConfig';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import type { BattleReceipt } from '../systems/BattleReceipt';
import { GameState } from '../systems/GameState';
import { announceStatus, removeAccessibleState, updateAccessibleState } from '../ui/Accessibility';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';

export interface GameOverData {
  receipt: BattleReceipt;
}

/** Explanatory, presentation-only view of the committed battle receipt. */
export class GameOverScene extends Phaser.Scene {
  private bgBattle!: Phaser.GameObjects.Image;
  private bgDim!: Phaser.GameObjects.Rectangle;
  private navigating = false;

  constructor() {
    super({ key: SceneKeys.GameOver });
  }

  create(data: GameOverData): void {
    const receipt = data?.receipt ?? GameState.get().lastBattleReceipt;
    if (!receipt) {
      this.scene.start(SceneKeys.Town);
      return;
    }
    const state = GameState.get();
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    this.bgBattle = this.add.image(0, 0, TextureKeys.BgBattle).setTint(0x556070);
    this.bgDim = this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.65).setOrigin(0, 0);
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));

    Menu.panel(this, cx, CANVAS.HEIGHT / 2, 720, 470);
    const fullVictory = receipt.mode === 'campaign' && receipt.win && receipt.wave === TOTAL_WAVES;
    const headline = fullVictory
      ? tr('result.fullVictory')
      : receipt.win
        ? tr('result.victory')
        : tr('result.defeat');
    Menu.title(this, cx, 58, headline, 38).setColor(
      fullVictory ? PALETTE.GOLD_CSS : receipt.win ? PALETTE.SUCCESS_CSS : PALETTE.DANGER_CSS,
    );

    const totals = TROOP_ORDER.map((kind) =>
      tr('result.stackLine', {
        troop: tr(`troop.${kind}`),
        deployed: receipt.deployed[kind],
        lost: receipt.casualties[kind],
        survived: receipt.survivors[kind],
        power: Math.round(receipt.contributions[kind] ?? 0),
      }),
    );
    const economy = receipt.mode === 'replay'
      ? tr('result.replayNotice')
      : receipt.win
        ? tr('result.rewardLine', {
            food: receipt.reward.food ?? 0,
            wood: receipt.reward.wood ?? 0,
            stone: receipt.reward.stone ?? 0,
            gold: receipt.reward.gold ?? 0,
          })
        : tr('result.penaltyLine', {
            food: receipt.penalty.food ?? 0,
            wood: receipt.penalty.wood ?? 0,
            stone: receipt.penalty.stone ?? 0,
            gold: receipt.penalty.gold ?? 0,
          });
    const details = [
      tr('result.powerLine', { army: receipt.armyPower.toFixed(1), enemy: receipt.wavePower.toFixed(1) }),
      tr('result.multiplierLine', {
        attack: receipt.attackMultiplier.toFixed(2),
        defense: receipt.defenseMultiplier.toFixed(2),
        town: Math.round(receipt.townDefense),
      }),
      ...totals,
      economy,
      tr('result.wavesCleared', { waves: state.waveCleared }),
    ];
    this.add
      .text(cx, 115, details.join('\n'), textStyle(14, { align: 'left', color: PALETTE.TEXT_CSS, wordWrap: { width: 650 } }))
      .setOrigin(0.5, 0)
      .setLineSpacing(4);
    const semanticResult = `${headline}. ${details.join(' ')}`;
    updateAccessibleState('battle-result', headline, semanticResult);
    announceStatus(semanticResult);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => removeAccessibleState('battle-result'));

    const canFightAgain = receipt.mode === 'replay' || state.nextCampaignWave !== null;
    const nextWave = receipt.mode === 'replay'
      ? receipt.wave
      : receipt.win
        ? state.nextCampaignWave
        : receipt.wave;
    const canRetry = canFightAgain && nextWave !== null && state.armyCount > 0;
    const retryStatus = this.add
      .text(cx, 447, '', textStyle(12, { color: PALETTE.DANGER_CSS, align: 'center', wordWrap: { width: 620 } }))
      .setOrigin(0.5);
    const attemptBattle = (): void => {
      if (this.navigating || nextWave === null) return;
      const committed = state.commitBattle(receipt.mode, nextWave, Date.now());
      if (committed.ok && committed.receipt) {
        this.navigating = true;
        this.scene.start(SceneKeys.Battle, { receipt: committed.receipt });
        return;
      }
      const message = committed.reason === 'saveFailed' ? tr('battle.saveFailed') : tr('battle.cannotStart');
      retryStatus.setText(message);
      announceStatus(message);
    };
    if (canRetry) {
      Menu.button(this, cx - 120, 480, receipt.mode === 'replay' ? tr('result.replayAgain') : tr('result.retry'), attemptBattle, { width: 200, accent: PALETTE.DANGER });
      Menu.button(this, cx + 120, 480, tr('result.toTown'), () => this.goTown(), { width: 200 });
    } else {
      Menu.button(this, cx, 480, tr('result.toTown'), () => this.goTown(), { width: 220 });
    }
    if (canRetry) this.input.keyboard?.on('keydown-R', attemptBattle);
    this.input.keyboard?.on('keydown-SPACE', () => this.goTown());
    this.input.keyboard?.on('keydown-ESC', () => this.goTown());
    if (receipt.mode === 'campaign') state.acknowledgeBattleReceipt();
  }

  private refitBackdrop(rect: VisibleWorldRect): void {
    this.bgBattle.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2).setDisplaySize(rect.width, rect.height);
    this.bgDim.setPosition(rect.x, rect.y).setSize(rect.width, rect.height);
  }

  private goTown(): void {
    if (this.navigating) return;
    this.navigating = true;
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
  }
}
