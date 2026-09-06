import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { TROOP_ORDER } from '../config/TroopConfig';
import { waveComposition, TOTAL_WAVES } from '../config/WaveConfig';
import type { Army, EnemyKind, TroopKind } from '../types';
import { GameState } from '../systems/GameState';
import { AudioManager } from '../systems/AudioManager';
import { CombatSystem, type CombatResult } from '../systems/CombatSystem';
import { buildTimeline, type BattleTimeline } from '../systems/CasualtyTimeline';
import { Battler } from '../entities/Battler';
import { BattleHud } from '../ui/BattleHud';
import { Menu } from '../ui/Menu';
import { tr } from '../i18n/i18n';
import type { GameOverData } from './GameOverScene';

/** Playback speed multipliers cycled by the HUD's speed toggle. */
const SPEED_STEPS = [1, 2, 4] as const;

/** How many discrete casualty ticks the timeline animation is spread over. */
const TIMELINE_STEPS = 10;

/** Base milliseconds per casualty tick at 1x speed. */
const STEP_MS = 520;

/** Enemy kinds in draw order (frost wolves front, heavies behind). */
const ENEMY_ORDER: readonly EnemyKind[] = ['frost_wolf', 'ravager', 'frost_titan'] as const;

/**
 * BattleScene - the animated wave battle, a VISUALIZATION of CombatSystem.
 *
 * Flow:
 *   1. Read the current wave (waveCleared + 1) and the standing army from the
 *      shared {@link GameState}. If the army is empty, show a hint and route
 *      straight back to Town without starting a battle.
 *   2. Resolve the battle ONCE via {@link CombatSystem.resolve} - the single
 *      source of truth for the outcome - and turn it into a per-tick casualty
 *      {@link BattleTimeline} that ends exactly on that resolution.
 *   3. Lay out one {@link Battler} per living unit (soldiers left, Horde right)
 *      over the battle backdrop, march the two lines together, then play the
 *      timeline: on each tick some units on each side fall (spark/dust + hit
 *      SFX) and the survivors' HP bars drain, so the on-screen counts always
 *      land on the deterministic result.
 *   4. Apply the result to GameState (reward + wave progress on a win;
 *      casualties on a loss), persist via GameState.save, play victory/defeat
 *      audio, and hand off to {@link GameOverScene} with a summary.
 *
 * A HUD overlay shows wave / army-remaining / enemy-remaining and offers Skip
 * and Speed controls. All combat math stays in CombatSystem; this scene never
 * decides who wins.
 */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private audio!: AudioManager;
  private hud!: BattleHud;

  private wave = 1;
  private army!: Army;
  private result!: CombatResult;
  private timeline!: BattleTimeline;

  private friendlyUnits: Battler[] = [];
  private enemyUnits: Battler[] = [];

  private speedIndex = 0;
  private stepIndex = 0;
  private resolved = false;
  private finished = false;
  private stepEvent?: Phaser.Time.TimerEvent;

  private static readonly FRIENDLY_X = 250;
  private static readonly ENEMY_X = 710;
  private static readonly LINE_TOP = 210;
  private static readonly LINE_BOTTOM = 470;

  constructor() {
    super({ key: SceneKeys.Battle });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.state = GameState.get();
    this.audio = AudioManager.get(this);

    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgBattle).setDisplaySize(CANVAS.WIDTH, CANVAS.HEIGHT);

    this.wave = this.state.waveCleared + 1;
    this.army = { ...this.state.army };

    // Guard: no army to send. Show a hint and bounce back to Town.
    if (this.armyTotal(this.army) <= 0) {
      Menu.title(this, cx, CANVAS.HEIGHT * 0.4, tr('battle.title'), 44);
      Menu.label(this, cx, CANVAS.HEIGHT * 0.54, tr('battle.noTroops'), 20, 1).setColor(PALETTE.DANGER_CSS);
      Menu.button(this, cx, CANVAS.HEIGHT * 0.72, tr('common.back'), () => this.goTown(), { width: 220 });
      this.input.keyboard?.on('keydown-ESC', () => this.goTown());
      return;
    }

    // Resolve the battle deterministically, then build the animation timeline.
    this.result = CombatSystem.resolve(this.army, this.wave);
    this.timeline = buildTimeline(this.army, this.result, TIMELINE_STEPS);

    // HUD overlay with skip + speed controls.
    this.hud = new BattleHud(this, {
      onSkip: () => this.skipToEnd(),
      onToggleSpeed: () => this.cycleSpeed(),
    });

    this.spawnUnits();
    this.refreshHud();

    const incoming = waveComposition(this.wave).reduce((s, e) => s + e.count, 0);
    this.hud.announceWave(this.wave, TOTAL_WAVES, incoming);

    this.input.keyboard?.on('keydown-ESC', () => this.skipToEnd());

    // Short beat, then the two lines march together and the battle plays out.
    this.time.delayedCall(1100, () => this.beginClash());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  // ---- Layout / spawning ---------------------------------------------------

  private spawnUnits(): void {
    // Friendly troops, grouped by kind, stacked in columns on the left.
    const friendlyList: TroopKind[] = [];
    for (const kind of TROOP_ORDER) {
      for (let i = 0; i < (this.army[kind] ?? 0); i++) friendlyList.push(kind);
    }
    this.friendlyUnits = this.layOut(friendlyList, 'friendly', BattleScene.FRIENDLY_X, -1);

    // Frozen Horde from the wave composition on the right.
    const enemyList: EnemyKind[] = [];
    for (const kind of ENEMY_ORDER) {
      const entry = waveComposition(this.wave).find((e) => e.kind === kind);
      if (entry) for (let i = 0; i < entry.count; i++) enemyList.push(kind);
    }
    this.enemyUnits = this.layOut(enemyList, 'enemy', BattleScene.ENEMY_X, 1);
  }

  /**
   * Lay a list of units into a tidy formation of columns near `baseX`. `dir`
   * is -1 for the friendly side (columns extend left) / +1 for the enemy side
   * (columns extend right). Caps the visible sprite count so huge armies stay
   * readable; the extra units are still counted in the HUD via the timeline.
   */
  private layOut(kinds: (TroopKind | EnemyKind)[], side: 'friendly' | 'enemy', baseX: number, dir: number): Battler[] {
    const units: Battler[] = [];
    const perColumn = 6;
    const colGap = 34;
    const rowGap = (BattleScene.LINE_BOTTOM - BattleScene.LINE_TOP) / (perColumn - 1);
    const maxVisible = 42;
    const count = Math.min(kinds.length, maxVisible);

    for (let i = 0; i < count; i++) {
      const col = Math.floor(i / perColumn);
      const row = i % perColumn;
      const x = baseX + dir * col * colGap;
      const y = BattleScene.LINE_TOP + row * rowGap;
      units.push(new Battler(this, side, kinds[i], x, y));
    }
    return units;
  }

  // ---- Battle sequence -----------------------------------------------------

  private beginClash(): void {
    if (this.finished) return;
    // March both lines toward the centre so they visibly meet.
    const meetLeft = CANVAS.WIDTH / 2 - 70;
    const meetRight = CANVAS.WIDTH / 2 + 70;
    for (const u of this.friendlyUnits) u.march(meetLeft + Phaser.Math.Between(-30, 10), 900);
    for (const u of this.enemyUnits) u.march(meetRight + Phaser.Math.Between(-10, 30), 900);

    this.time.delayedCall(950 / this.speedMult(), () => {
      if (!this.finished) this.scheduleNextStep();
    });
  }

  private scheduleNextStep(): void {
    if (this.finished) return;
    this.stepEvent = this.time.delayedCall(STEP_MS / this.speedMult(), () => this.playStep());
  }

  private playStep(): void {
    if (this.finished) return;
    const step = this.timeline.steps[this.stepIndex];
    if (!step) {
      this.finishBattle();
      return;
    }

    // Trim each side down to the count this tick prescribes, killing the tail
    // units so the visible counts match the timeline exactly.
    this.trimSide(this.friendlyUnits, this.totalFriendly(step.friendly));
    this.trimSide(this.enemyUnits, this.totalEnemy(step.enemy));

    // Survivors lunge + lose a bit of HP each tick to read as combat.
    const remainingFraction = 1 - (this.stepIndex + 1) / this.timeline.steps.length;
    for (const u of this.aliveUnits(this.friendlyUnits)) {
      u.attack();
      u.setHpRatio(0.4 + 0.6 * remainingFraction);
    }
    for (const u of this.aliveUnits(this.enemyUnits)) {
      u.attack();
      u.setHpRatio(0.4 + 0.6 * remainingFraction);
    }

    this.refreshHud();
    this.stepIndex++;

    if (this.stepIndex >= this.timeline.steps.length) {
      this.time.delayedCall(500 / this.speedMult(), () => this.finishBattle());
    } else {
      this.scheduleNextStep();
    }
  }

  /** Kill visible units beyond the target survivor count (tail-first). */
  private trimSide(units: Battler[], targetAlive: number): void {
    const alive = this.aliveUnits(units);
    // Scale the target down to the number we actually spawned (armies are
    // capped for readability) so we never try to keep more sprites than exist.
    const scaledTarget = Math.min(alive.length, Math.max(0, Math.round(targetAlive * this.visibleRatio(units))));
    let toKill = alive.length - scaledTarget;
    for (let i = alive.length - 1; i >= 0 && toKill > 0; i--) {
      alive[i].fall();
      toKill--;
    }
  }

  /**
   * Ratio of spawned sprites to true unit count for a side, so a capped visual
   * army still drains proportionally to the real (timeline) counts.
   */
  private visibleRatio(units: Battler[]): number {
    const side = units === this.friendlyUnits ? 'friendly' : 'enemy';
    const trueTotal =
      side === 'friendly'
        ? this.armyTotal(this.timeline.start.friendly)
        : this.enemyStartTotal();
    const spawned = units.length;
    return trueTotal > 0 ? spawned / trueTotal : 1;
  }

  private finishBattle(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.finished = true;
    this.stepEvent?.remove();

    // Snap BOTH visible sides to the exact terminal resolution as a final beat
    // so a maxed (sprite-capped) army reads cleanly on the last frame: friendly
    // to the survivor total, enemy to its terminal timeline count (0 on a win,
    // the surviving remainder on a loss). Without snapping the enemy side too,
    // visibleRatio rounding could leave a stray beast standing at 42/side.
    this.trimSide(this.friendlyUnits, this.result.win ? this.armyTotal(this.result.survivors) : 0);
    this.trimSide(this.enemyUnits, this.result.win ? 0 : this.enemyRemainingOnLoss());

    this.applyResult();
    this.refreshHud();

    this.audio.playSfx(this.result.win ? AudioKeys.Victory : AudioKeys.Defeat, 0.9);

    const clearedNow = this.result.win ? Math.max(this.state.waveCleared, this.wave) : this.state.waveCleared;
    const fullVictory = this.result.win && this.wave >= TOTAL_WAVES;

    const data: GameOverData = {
      win: this.result.win,
      wave: this.wave,
      wavesCleared: clearedNow,
      fullVictory,
      reward: this.result.reward,
      casualties: this.armyTotal(this.result.casualties),
      survivors: this.armyTotal(this.result.survivors),
    };

    this.time.delayedCall(900, () => {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.GameOver, data));
    });
  }

  /**
   * Commit the deterministic result to the shared GameState and persist it.
   * Victory: pay the reward and advance wave progress. Defeat: apply casualties
   * (survivors become the new standing army), town untouched. Either way the
   * army is set to the survivors so the loss of troops is reflected in Town.
   */
  private applyResult(): void {
    const now = Date.now();
    if (this.result.win) {
      this.state.resources.add(this.result.reward);
      this.state.recordWaveCleared(this.wave);
    }
    // On a win survivors < army (casualties), on a loss survivors are all zero.
    this.state.setArmy(this.result.survivors);
    this.state.save(now);
  }

  // ---- HUD / controls ------------------------------------------------------

  private refreshHud(): void {
    if (!this.hud) return;
    this.hud.update({
      wave: this.wave,
      totalWaves: TOTAL_WAVES,
      armyRemaining: this.currentAlive('friendly'),
      enemyRemaining: this.currentAlive('enemy'),
    });
  }

  /**
   * The true (un-capped) count still alive on a side, derived from the current
   * timeline step so the HUD reports real numbers even when sprites are capped.
   */
  private currentAlive(side: 'friendly' | 'enemy'): number {
    if (this.finished) {
      if (side === 'friendly') return this.armyTotal(this.result.survivors);
      return this.result.win ? 0 : this.enemyRemainingOnLoss();
    }
    const step = this.timeline.steps[Math.min(this.stepIndex, this.timeline.steps.length - 1)];
    if (this.stepIndex === 0) {
      return side === 'friendly' ? this.armyTotal(this.timeline.start.friendly) : this.enemyStartTotal();
    }
    return side === 'friendly' ? this.totalFriendly(step.friendly) : this.totalEnemy(step.enemy);
  }

  private cycleSpeed(): number {
    this.speedIndex = (this.speedIndex + 1) % SPEED_STEPS.length;
    return SPEED_STEPS[this.speedIndex];
  }

  private speedMult(): number {
    return SPEED_STEPS[this.speedIndex];
  }

  /** Fast-forward: kill remaining animation and jump to the resolution. */
  private skipToEnd(): void {
    if (this.finished) return;
    this.stepEvent?.remove();
    this.stepIndex = this.timeline.steps.length;
    this.finishBattle();
  }

  // ---- Small helpers -------------------------------------------------------

  private aliveUnits(units: Battler[]): Battler[] {
    return units.filter((u) => !u.isDead);
  }

  private armyTotal(a: Army): number {
    return TROOP_ORDER.reduce((s, k) => s + Math.max(0, Math.floor(a[k] ?? 0)), 0);
  }

  private totalFriendly(a: Army): number {
    return this.armyTotal(a);
  }

  private totalEnemy(e: Record<string, number>): number {
    return Object.keys(e).reduce((s, k) => s + Math.max(0, Math.floor(e[k] ?? 0)), 0);
  }

  private enemyStartTotal(): number {
    return this.totalEnemy(this.timeline.start.enemy);
  }

  private enemyRemainingOnLoss(): number {
    const last = this.timeline.steps[this.timeline.steps.length - 1];
    return last ? this.totalEnemy(last.enemy) : 0;
  }

  private cleanup(): void {
    this.stepEvent?.remove();
    for (const u of [...this.friendlyUnits, ...this.enemyUnits]) u.destroy();
    this.friendlyUnits = [];
    this.enemyUnits = [];
  }

  private goTown(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Town));
  }
}
