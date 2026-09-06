import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RESOURCE_ORDER } from '../config/GameConfig';
import type { ResourceKind } from '../types';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import { SEASON, type RewardBundle } from '../config/Progression';
import { resistanceCost } from '../systems/Season';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching the Season scene from the Home bottom-nav. */
export interface SeasonSceneData {
  /** Scene key to return to when Season closes. Defaults to Home. */
  returnTo?: string;
}

/**
 * SeasonScene - the battle-pass track + the seasonal virus-RESISTANCE opener
 * (FEAT-003). It reads the whole season state from the {@link GameStore} and
 * renders:
 *
 *  - the current season / tier / banked XP header;
 *  - the free + premium tier-reward tracks from {@link SEASON.TIER_REWARDS}
 *    (premium shown locked until {@link GameStore.premiumUnlocked});
 *  - the RESISTANCE opener: the current resistance level, its next XP cost from
 *    the pure {@link resistanceCost}, and a button that calls
 *    {@link GameStore.raiseResistance} - the ONLY path that unlocks the
 *    resistance-gated campaign tail (and, at the threshold, the premium track).
 *
 * No season math lives here; the scene only reads the store and calls its
 * mutator, then repaints. State persists inside the store on every mutation.
 */
export class SeasonScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.Home;
  private toast: Phaser.GameObjects.Container | null = null;
  /** Dynamic layer wiped + rebuilt after a resistance spend. */
  private content!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SceneKeys.Season });
  }

  create(data: SeasonSceneData): void {
    this.returnTo = data?.returnTo ?? SceneKeys.Home;
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    AudioManager.get(this).playMusic();

    this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setAlpha(0.5);

    Menu.title(this, cx, CANVAS.HEIGHT * 0.06, tr('season.title'), 30).setColor(PALETTE.SQUAD_CSS);

    this.content = this.add.container(0, 0);

    Menu.button(this, cx, CANVAS.HEIGHT * 0.955, tr('common.back'), () => this.close(), { width: 160 });
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  /** Repaint the whole dynamic body from the current store state. */
  private render(): void {
    this.content.removeAll(true);
    const store = GameStore.get();
    this.buildHeader(store);
    this.buildTierTrack(store);
    this.buildResistancePanel(store);
  }

  /** Season / tier / banked-XP summary. */
  private buildHeader(store: GameStore): void {
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.115;
    const line = this.add
      .text(
        cx,
        y,
        `${tr('season.current', { season: store.state.season.current })}   ${tr('season.tier', { tier: store.seasonTier() })}   ${tr('season.xp', { xp: store.state.season.xp })}`,
        textStyle(14, { align: 'center', allowSmall: true }),
      )
      .setOrigin(0.5);
    this.content.add(line);

    const premiumLine = this.add
      .text(
        cx,
        y + 22,
        store.premiumUnlocked()
          ? tr('season.premiumUnlocked')
          : tr('season.premiumLocked', { level: SEASON.PREMIUM_UNLOCK_RESISTANCE }),
        textStyle(11, { align: 'center', color: store.premiumUnlocked() ? PALETTE.SUCCESS_CSS : PALETTE.MUTED_CSS, allowSmall: true }),
      )
      .setOrigin(0.5);
    this.content.add(premiumLine);
  }

  /** The free/premium reward track from SEASON.TIER_REWARDS as tier rows. */
  private buildTierTrack(store: GameStore): void {
    const cx = CANVAS.WIDTH / 2;
    const startY = CANVAS.HEIGHT * 0.18;
    const rowH = 48;
    const rowW = CANVAS.WIDTH - 40;
    const currentTier = store.seasonTier();
    const premiumUnlocked = store.premiumUnlocked();

    SEASON.TIER_REWARDS.forEach((pair, i) => {
      const tier = i + 1;
      const y = startY + i * rowH;
      const reached = currentTier >= tier;

      const panel = Menu.panel(this, cx, y, rowW, rowH - 8, reached ? 0.92 : 0.55);
      panel.setStrokeStyle(2, reached ? PALETTE.SUCCESS : PALETTE.LANE_LINE);
      this.content.add(panel);

      const tierLabel = this.add
        .text(cx - rowW / 2 + 12, y, tr('season.tier', { tier }), textStyle(12, { fontStyle: 'bold', color: reached ? PALETTE.SUCCESS_CSS : PALETTE.TEXT_CSS, allowSmall: true }))
        .setOrigin(0, 0.5);
      this.content.add(tierLabel);

      const freeText = this.add
        .text(cx - rowW / 2 + 74, y, `${tr('season.free')}: ${this.rewardSummary(pair.free)}`, textStyle(10, { allowSmall: true }))
        .setOrigin(0, 0.5);
      this.content.add(freeText);

      const premColor = premiumUnlocked ? PALETTE.COIN_CSS : PALETTE.MUTED_CSS;
      const premText = this.add
        .text(cx + rowW / 2 - 12, y, `${tr('season.premium')}: ${this.rewardSummary(pair.premium)}`, textStyle(10, { align: 'right', color: premColor, allowSmall: true }))
        .setOrigin(1, 0.5);
      this.content.add(premText);
    });
  }

  /** The RESISTANCE opener panel: current level, next cost, and the raise button. */
  private buildResistancePanel(store: GameStore): void {
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.8;
    const panel = Menu.panel(this, cx, y + 8, CANVAS.WIDTH - 40, 128, 0.95);
    panel.setStrokeStyle(2, PALETTE.BOSS);
    this.content.add(panel);

    const level = store.resistance();
    this.content.add(
      Menu.title(this, cx, y - 36, tr('season.resistance', { level }), 18).setColor(PALETTE.BOSS_CSS),
    );
    this.content.add(
      this.add
        .text(cx, y - 10, tr('season.resistanceDesc'), textStyle(10, { align: 'center', color: PALETTE.MUTED_CSS, wordWrap: { width: CANVAS.WIDTH - 80 }, allowSmall: true }))
        .setOrigin(0.5),
    );

    const cost = resistanceCost(level);
    const capped = !Number.isFinite(cost);
    const costText = capped ? tr('hero.maxed') : tr('hero.cost', { cost });
    this.content.add(
      this.add
        .text(cx, y + 24, costText, textStyle(12, { align: 'center', color: capped ? PALETTE.MUTED_CSS : PALETTE.COIN_CSS, allowSmall: true }))
        .setOrigin(0.5),
    );

    const btn = Menu.button(this, cx, y + 54, tr('season.resistanceUp'), () => this.raiseResistance(), {
      width: 220,
      accent: PALETTE.BOSS,
      fontSize: 15,
      allowSmall: true,
    });
    // Disable when capped or the player cannot afford the next level.
    btn.setEnabled(!capped && store.state.season.xp >= cost);
    this.content.add(btn.container);
  }

  /** Attempt to raise resistance one level; toast + SFX on the outcome. */
  private raiseResistance(): void {
    const store = GameStore.get();
    const premiumBefore = store.premiumUnlocked();
    const ok = store.raiseResistance();
    if (!ok) {
      this.showToast(tr('season.resistanceDesc'));
      return;
    }
    AudioManager.get(this).playSfx(AudioKeys.UpgradeComplete, 0.8);
    // Surface the premium-track unlock the moment it crosses the threshold.
    if (!premiumBefore && store.premiumUnlocked()) {
      this.showToast(tr('season.premiumUnlocked'));
    } else {
      this.showToast(tr('season.resistance', { level: store.resistance() }));
    }
    // Repaint so tier gating, cost, and the level all refresh.
    this.render();
  }

  /** A compact one-line summary of a reward bundle for a track row. */
  private rewardSummary(reward: RewardBundle): string {
    const parts: string[] = [];
    if (reward.resources) {
      for (const kind of RESOURCE_ORDER as readonly ResourceKind[]) {
        const amount = reward.resources[kind];
        if (amount) parts.push(`${tr(`resource.${kind}` as TrKey)}+${amount}`);
      }
    }
    if (reward.shards) parts.push(tr('recruit.shards', { shards: reward.shards }));
    if (reward.seasonXp) parts.push(tr('season.xp', { xp: reward.seasonXp }));
    if (reward.coins) parts.push(tr('result.coinsEarned', { coins: reward.coins }));
    return parts.length > 0 ? parts.join(' ') : '-';
  }

  /** A short auto-dismissing toast. */
  private showToast(message: string): void {
    if (this.toast) {
      this.toast.destroy(true);
      this.toast = null;
    }
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.9;
    const text = this.add.text(0, 0, message, textStyle(13, { align: 'center' })).setOrigin(0.5);
    const bg = Menu.panel(this, 0, 0, Math.ceil(text.width) + 40, 40, 0.96);
    const toast = this.add.container(cx, y, [bg, text]).setDepth(60);
    this.toast = toast;
    this.tweens.add({
      targets: toast,
      alpha: { from: 1, to: 0 },
      delay: 1200,
      duration: 400,
      onComplete: () => {
        toast.destroy(true);
        if (this.toast === toast) this.toast = null;
      },
    });
  }

  private close(): void {
    Menu.fadeTo(this, () => this.scene.start(this.returnTo, { returnTo: SceneKeys.Home }));
  }
}
