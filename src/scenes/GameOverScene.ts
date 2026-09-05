import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys } from '../config/AssetKeys';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import type { ResourceCost } from '../types';

/** Data passed from BattleScene to the result overlay. */
export interface GameOverData {
  /** Whether the player won the battle. */
  win: boolean;
  /** The wave that was just fought. */
  wave: number;
  /** Highest wave cleared after this battle (for the "waves cleared" line). */
  wavesCleared: number;
  /** Whether the final configured wave was cleared (a full campaign victory). */
  fullVictory: boolean;
  /** Reward paid out on a win (empty on a loss). */
  reward: ResourceCost;
  /** Friendly troops lost this battle. */
  casualties: number;
  /** Friendly troops that survived. */
  survivors: number;
}

/**
 * GameOverScene - the post-battle result overlay.
 *
 * Reuses the {@link Menu} pixel-UI helpers to present the battle outcome over a
 * dimmed battle backdrop: a VICTORY / DEFEAT (or full-campaign KINGDOM
 * TRIUMPHANT) headline, the reward or casualty summary, and the running waves
 * cleared. It never mutates state itself - BattleScene has already applied the
 * reward / casualties and persisted through GameState before starting this
 * scene - so this is a pure presentational end-cap with two exits:
 *   - Retry: fight the next (or same, on a loss) wave again by re-entering the
 *     BattleScene.
 *   - To Town: return to the idle town, which reflects the updated resources,
 *     army and wave progress from the shared GameState.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.GameOver });
  }

  create(data: GameOverData): void {
    const cx = CANVAS.WIDTH / 2;
    Menu.fadeIn(this);

    // Dimmed battle backdrop.
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgBattle).setDisplaySize(CANVAS.WIDTH, CANVAS.HEIGHT).setTint(0x556070);
    this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.55).setOrigin(0, 0);

    const panelW = 560;
    const panelH = 340;
    Menu.panel(this, cx, CANVAS.HEIGHT / 2, panelW, panelH);

    let headline: string;
    let headlineColor: string;
    if (data.fullVictory) {
      headline = tr('result.fullVictory');
      headlineColor = PALETTE.GOLD_CSS;
    } else if (data.win) {
      headline = tr('result.victory');
      headlineColor = PALETTE.SUCCESS_CSS;
    } else {
      headline = tr('result.defeat');
      headlineColor = PALETTE.DANGER_CSS;
    }

    Menu.title(this, cx, CANVAS.HEIGHT / 2 - 120, headline, 46).setColor(headlineColor);

    const lines: string[] = [];
    if (data.fullVictory) {
      lines.push(tr('result.fullVictoryDesc'));
    } else if (!data.win) {
      lines.push(tr('result.defeatDesc'));
    }
    lines.push(tr('result.wavesCleared', { waves: data.wavesCleared }));

    if (data.win) {
      lines.push(
        tr('result.rewardLine', {
          food: data.reward.food ?? 0,
          wood: data.reward.wood ?? 0,
          stone: data.reward.stone ?? 0,
          gold: data.reward.gold ?? 0,
        }),
      );
      lines.push(tr('result.survivors', { count: data.survivors }));
      if (!data.fullVictory) lines.push(tr('result.nextWave', { wave: data.wave + 1 }));
    } else {
      lines.push(tr('result.casualties', { count: data.casualties }));
    }

    this.add
      .text(cx, CANVAS.HEIGHT / 2 - 40, lines.join('\n'), textStyle(16, { align: 'center', color: PALETTE.TEXT_CSS }))
      .setOrigin(0.5)
      .setLineSpacing(8);

    // Buttons. "Retry" only makes sense when there is still an army to send
    // back into battle. A defeat wipes the army (survivors === 0), so re-entering
    // BattleScene would just bounce off its empty-army guard back to Town - a
    // dead button. In that case we instead offer "Train Troops" (routes to the
    // Town, where the Barracks/training lives) so the action the player is given
    // can actually be accomplished. Retry is also suppressed on a full-campaign
    // victory (there is no next wave).
    const btnY = CANVAS.HEIGHT / 2 + 110;
    const canRetry = !data.fullVictory && data.survivors > 0;
    if (canRetry) {
      Menu.button(this, cx - 110, btnY, tr('result.retry'), () => this.go(SceneKeys.Battle), {
        width: 180,
        accent: PALETTE.DANGER,
      });
      Menu.button(this, cx + 110, btnY, tr('result.toTown'), () => this.go(SceneKeys.Town), { width: 180 });
    } else if (!data.win) {
      // Defeat with no survivors: guide the player to rebuild their army.
      Menu.button(this, cx - 110, btnY, tr('result.train'), () => this.go(SceneKeys.Town), {
        width: 180,
        accent: PALETTE.DANGER,
      });
      Menu.button(this, cx + 110, btnY, tr('result.toTown'), () => this.go(SceneKeys.Town), { width: 180 });
    } else {
      Menu.button(this, cx, btnY, tr('result.toTown'), () => this.go(SceneKeys.Town), { width: 220 });
    }

    Menu.label(this, cx, CANVAS.HEIGHT / 2 + 150, tr(canRetry ? 'result.keyhint' : 'result.keyhintNoRetry'), 12, 0.6);

    // Keyboard shortcuts. `R` only bound when a real Retry is offered.
    if (canRetry) {
      this.input.keyboard?.on('keydown-R', () => this.go(SceneKeys.Battle));
    }
    this.input.keyboard?.on('keydown-SPACE', () => this.go(SceneKeys.Town));
    this.input.keyboard?.on('keydown-ESC', () => this.go(SceneKeys.Town));
  }

  private go(scene: string): void {
    Menu.fadeTo(this, () => this.scene.start(scene));
  }
}
