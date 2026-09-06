import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import { MISSIONS } from '../config/Progression';
import { dailyTasksFor, allianceAiScore } from '../systems/DailyMissions';
import { matchOpponent, type AllianceStanding } from '../systems/League';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import type { BattleSceneData } from './BattleScene';

/** Data passed when launching Missions, and echoed back from a league battle. */
export interface MissionsSceneData {
  /** Scene key to return to (the Home hub). */
  returnTo?: string;
  /**
   * Result echoed back by BattleScene when a league match replay finishes so
   * the scene can surface the win/loss (the store already recorded the record).
   */
  battleResult?: {
    win: boolean;
    kind?: 'league';
  };
}

/** Which panel of the Missions scene is showing. */
type View = 'missions' | 'league';

/**
 * MissionsScene - the daily arms-race + weekly alliance-duel status board, which
 * also hosts the LEAGUE view (FEAT-003). The Missions tab covers the whole
 * alliance / PvP meta, so both live here behind a toggle.
 *
 *  - Missions view (read-only status): the active daily arms-race tasks for
 *    today ({@link dailyTasksFor} mapped against stored progress), the arms-race
 *    score + milestone hints, and the weekly alliance-duel panel. Progress is
 *    recorded by gameplay elsewhere; this view only reports it.
 *  - League view (OFFLINE simulation): the disclaimer, the standings from
 *    {@link GameStore.leagueStandings} with the player's alliance highlighted,
 *    the player's rank + record, and a match button that resolves an offline
 *    PvP match via {@link GameStore.playLeagueMatch} and animates it through the
 *    presentation-only {@link BattleScene}. A completed match records a 'combat'
 *    arms-race tick.
 *
 * No progression math lives here; the scene only reads the store and calls its
 * mutators for the league match.
 */
export class MissionsScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.Home;
  private view: View = 'missions';
  private toast: Phaser.GameObjects.Container | null = null;
  /** Dynamic body wiped + rebuilt on view toggle. */
  private content!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SceneKeys.Missions });
  }

  create(data: MissionsSceneData): void {
    this.returnTo = data?.returnTo ?? SceneKeys.Home;
    this.view = 'missions';
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    AudioManager.get(this).playMusic();

    this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setAlpha(0.45);

    Menu.title(this, cx, CANVAS.HEIGHT * 0.06, tr('mission.daily.title'), 28).setColor(PALETTE.SQUAD_CSS);

    // View toggle: Missions | League.
    Menu.button(this, cx - 90, CANVAS.HEIGHT * 0.115, tr('mission.daily.title'), () => this.setView('missions'), { width: 150, fontSize: 13 });
    Menu.button(this, cx + 90, CANVAS.HEIGHT * 0.115, tr('league.title'), () => this.setView('league'), { width: 150, fontSize: 13, accent: PALETTE.BOSS });

    this.content = this.add.container(0, 0);

    Menu.button(this, cx, CANVAS.HEIGHT * 0.955, tr('common.back'), () => this.close(), { width: 160 });
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();

    // If we returned from a league battle, surface the win/loss overlay.
    if (data?.battleResult) this.showLeagueResult(data.battleResult.win);
  }

  private setView(view: View): void {
    if (this.view === view) return;
    this.view = view;
    AudioManager.get(this).playSfx(AudioKeys.TabSwitch, 0.6);
    this.render();
  }

  private render(): void {
    this.content.removeAll(true);
    if (this.view === 'missions') this.buildMissionsView();
    else this.buildLeagueView();
  }

  /* ------------------------------------------------------------------ */
  /* Missions view: daily arms-race tasks + weekly alliance duel.        */
  /* ------------------------------------------------------------------ */

  private buildMissionsView(): void {
    const store = GameStore.get();
    const cx = CANVAS.WIDTH / 2;
    const now = Date.now();
    const day = store.dayOf(now);

    // Arms-race score + milestone hint.
    this.content.add(
      this.add
        .text(cx, CANVAS.HEIGHT * 0.165, tr('mission.daily.score', { score: store.armsRaceScore() }), textStyle(15, { align: 'center', color: PALETTE.COIN_CSS }))
        .setOrigin(0.5),
    );
    const nextMilestone = MISSIONS.DAILY_MILESTONES.find((m) => store.armsRaceScore() < m.points);
    this.content.add(
      this.add
        .text(cx, CANVAS.HEIGHT * 0.195, nextMilestone ? tr('mission.daily.milestone', { points: nextMilestone.points }) : tr('mission.daily.reset'), textStyle(11, { align: 'center', color: PALETTE.MUTED_CSS }))
        .setOrigin(0.5),
    );

    // The active daily tasks with progress/target and points.
    const tasks = dailyTasksFor(day);
    const progress = store.state.missions.daily;
    const startY = CANVAS.HEIGHT * 0.24;
    const rowH = 58;
    const rowW = CANVAS.WIDTH - 40;

    tasks.forEach((task, i) => {
      const y = startY + i * rowH;
      const done = (progress[task.id] ?? 0);
      const complete = done >= task.target;

      const panel = Menu.panel(this, cx, y, rowW, rowH - 10, complete ? 0.92 : 0.7);
      panel.setStrokeStyle(2, complete ? PALETTE.SUCCESS : PALETTE.ACCENT);
      this.content.add(panel);

      this.content.add(
        this.add
          .text(cx - rowW / 2 + 14, y - 10, tr(task.nameKey as TrKey), textStyle(13, { fontStyle: 'bold' }))
          .setOrigin(0, 0.5),
      );
      this.content.add(
        this.add
          .text(cx - rowW / 2 + 14, y + 12, `${Math.min(done, task.target)} / ${task.target}`, textStyle(11, { color: complete ? PALETTE.SUCCESS_CSS : PALETTE.MUTED_CSS }))
          .setOrigin(0, 0.5),
      );
      this.content.add(
        this.add
          .text(cx + rowW / 2 - 14, y, `+${task.points}`, textStyle(13, { align: 'right', color: PALETTE.COIN_CSS }))
          .setOrigin(1, 0.5),
      );
    });

    this.buildDuelPanel(store, startY + tasks.length * rowH + 6);
  }

  /** The weekly alliance-duel status panel (read-only). */
  private buildDuelPanel(store: GameStore, topY: number): void {
    const cx = CANVAS.WIDTH / 2;
    const y = Math.min(topY, CANVAS.HEIGHT * 0.8);
    const panel = Menu.panel(this, cx, y + 6, CANVAS.WIDTH - 40, 108, 0.95);
    panel.setStrokeStyle(2, PALETTE.SQUAD);
    this.content.add(panel);

    this.content.add(Menu.title(this, cx, y - 30, tr('mission.duel.title'), 16).setColor(PALETTE.SQUAD_CSS));
    this.content.add(
      this.add.text(cx, y - 8, tr('mission.duel.desc'), textStyle(10, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5),
    );

    // Player's weekly activity vs the seeded rival alliance score for this week.
    const playerScore = store.state.missions.weekActivity;
    const rivalScore = allianceAiScore(store.state.missions.weekKey < 0 ? 0 : store.state.missions.weekKey);
    this.content.add(
      this.add.text(cx, y + 14, tr('mission.duel.you', { score: playerScore }), textStyle(12, { align: 'center', color: PALETTE.SUCCESS_CSS })).setOrigin(0.5),
    );
    this.content.add(
      this.add.text(cx, y + 32, tr('mission.duel.rival', { score: rivalScore }), textStyle(12, { align: 'center', color: PALETTE.DANGER_CSS })).setOrigin(0.5),
    );
    this.content.add(
      this.add.text(cx + (CANVAS.WIDTH - 40) / 2 - 12, y - 30, tr('mission.duel.resets'), textStyle(9, { align: 'right', color: PALETTE.MUTED_CSS })).setOrigin(1, 0.5),
    );
  }

  /* ------------------------------------------------------------------ */
  /* League view: standings + offline PvP match.                         */
  /* ------------------------------------------------------------------ */

  private buildLeagueView(): void {
    const store = GameStore.get();
    const cx = CANVAS.WIDTH / 2;

    this.content.add(Menu.title(this, cx, CANVAS.HEIGHT * 0.165, tr('league.title'), 22).setColor(PALETTE.BOSS_CSS));
    this.content.add(
      this.add.text(cx, CANVAS.HEIGHT * 0.2, tr('league.simNote'), textStyle(10, { align: 'center', color: PALETTE.MUTED_CSS })).setOrigin(0.5),
    );

    // Player rank + record.
    this.content.add(
      this.add
        .text(cx, CANVAS.HEIGHT * 0.235, `${tr('league.rank', { rank: store.leagueRank() })}   ${tr('league.record', { wins: store.state.league.wins, losses: store.state.league.losses })}`, textStyle(13, { align: 'center', color: PALETTE.COIN_CSS }))
        .setOrigin(0.5),
    );

    // Standings table (player highlighted).
    const standings = store.leagueStandings();
    const startY = CANVAS.HEIGHT * 0.27;
    const rowH = 40;
    const rowW = CANVAS.WIDTH - 40;
    standings.forEach((entry: AllianceStanding, i) => {
      const y = startY + i * rowH;
      const panel = Menu.panel(this, cx, y, rowW, rowH - 8, entry.isPlayer ? 0.95 : 0.6);
      panel.setStrokeStyle(2, entry.isPlayer ? PALETTE.SUCCESS : PALETTE.LANE_LINE);
      this.content.add(panel);

      const color = entry.isPlayer ? PALETTE.SUCCESS_CSS : PALETTE.TEXT_CSS;
      this.content.add(
        this.add.text(cx - rowW / 2 + 12, y, `${entry.rank}.`, textStyle(12, { fontStyle: 'bold', color })).setOrigin(0, 0.5),
      );
      this.content.add(
        this.add.text(cx - rowW / 2 + 44, y, tr(entry.nameKey as TrKey), textStyle(12, { color })).setOrigin(0, 0.5),
      );
      this.content.add(
        this.add.text(cx + rowW / 2 - 12, y, tr('league.power', { power: entry.power }), textStyle(11, { align: 'right', color: PALETTE.MUTED_CSS })).setOrigin(1, 0.5),
      );
    });

    // Match button (guards a non-empty battle team on press).
    const matchBtn = Menu.button(this, cx, CANVAS.HEIGHT * 0.9, tr('league.match'), () => this.playMatch(), {
      width: 220,
      accent: PALETTE.BOSS,
      fontSize: 15,
    });
    this.content.add(matchBtn.container);
  }

  /** Guard a filled squad, resolve an offline league match, launch Battle. */
  private playMatch(): void {
    const store = GameStore.get();
    const team = store.battleTeam();
    if (team.members.length === 0) {
      this.showToast(tr('formation.needFive'));
      return;
    }
    const seed = (Date.now() ^ 0x5bd1e995) >>> 0;
    const outcome = store.playLeagueMatch(seed);
    if (!outcome) {
      this.showToast(tr('formation.needFive'));
      return;
    }
    // A completed match advances the daily 'combat' arms-race task.
    store.recordMissionProgress('combat', 1, Date.now());

    const battleData: BattleSceneData = {
      timeline: outcome.battle.timeline,
      win: outcome.win,
      playerTeam: team,
      enemyTeam: matchOpponent(seed),
      title: tr('league.match'),
      returnTo: SceneKeys.Missions,
      returnData: { kind: 'league' },
    };
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Battle, battleData));
  }

  /** Overlay the league match win/loss on return from BattleScene. */
  private showLeagueResult(win: boolean): void {
    this.view = 'league';
    this.render();
    this.showToast(win ? tr('league.matchWin') : tr('league.matchLoss'));
    AudioManager.get(this).playSfx(win ? AudioKeys.BattleWin : AudioKeys.BattleLose, 0.7);
  }

  /** A short auto-dismissing toast. */
  private showToast(message: string): void {
    if (this.toast) {
      this.toast.destroy(true);
      this.toast = null;
    }
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.85;
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
