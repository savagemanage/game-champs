import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { TROOP_ORDER } from '../config/TroopConfig';
import { waveComposition, TOTAL_WAVES } from '../config/WaveConfig';
import type { Army, EnemyKind, TroopKind } from '../types';
import { GameState } from '../systems/GameState';
import { AudioManager } from '../systems/AudioManager';
import type { CombatResult } from '../systems/CombatSystem';
import { buildTimeline, type BattleTimeline } from '../systems/CasualtyTimeline';
import type { BattleReceipt } from '../systems/BattleReceipt';
import { Battler } from '../entities/Battler';
import { BattleHud } from '../ui/BattleHud';
import { Menu } from '../ui/Menu';
import { onViewportRefit, type VisibleWorldRect } from '@open-games/shared';

const SPEED_STEPS = [1, 2, 4] as const;
const TIMELINE_STEPS = 10;
const STEP_MS = 520;
const ENEMY_ORDER: readonly EnemyKind[] = ['raider', 'brute', 'ram', 'rider'] as const;

export interface BattleSceneData {
  receipt?: BattleReceipt;
}

/** Presentation-only playback of an already committed (or stateless replay) receipt. */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private audio!: AudioManager;
  private hud!: BattleHud;
  private receipt!: BattleReceipt;
  private result!: CombatResult;
  private timeline!: BattleTimeline;
  private friendlyUnits: Battler[] = [];
  private enemyUnits: Battler[] = [];
  private timers = new Set<Phaser.Time.TimerEvent>();
  private speedIndex = 0;
  private stepIndex = 0;
  private finished = false;
  private bgBattle!: Phaser.GameObjects.Image;
  private reducedMotion = false;

  constructor() {
    super({ key: SceneKeys.Battle });
  }

  create(data: BattleSceneData): void {
    this.state = GameState.get();
    this.audio = AudioManager.get(this);
    this.receipt = data?.receipt ?? this.state.lastBattleReceipt!;
    this.reducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    this.bgBattle = this.add.image(0, 0, TextureKeys.BgBattle);
    onViewportRefit(this, { width: CANVAS.WIDTH, height: CANVAS.HEIGHT }, (rect) => this.refitBackdrop(rect));

    if (!this.receipt) {
      this.scene.start(SceneKeys.Town);
      return;
    }
    this.result = {
      win: this.receipt.win,
      wave: this.receipt.wave,
      survivors: { ...this.receipt.survivors },
      casualties: { ...this.receipt.casualties },
      reward: { ...this.receipt.reward },
      penalty: { ...this.receipt.penalty },
      armyPower: this.receipt.armyPower,
      wavePower: this.receipt.wavePower,
      townDefense: this.receipt.townDefense,
    };
    this.timeline = buildTimeline(this.receipt.deployed, this.result, TIMELINE_STEPS);
    this.hud = new BattleHud(this, {
      onSkip: () => this.skipToEnd(),
      onToggleSpeed: () => this.cycleSpeed(),
    });
    this.spawnUnits();
    this.refreshHud();
    const incoming = waveComposition(this.receipt.wave).reduce((sum, entry) => sum + entry.count, 0);
    this.hud.announceWave(this.receipt.wave, TOTAL_WAVES, incoming);
    this.input.keyboard?.on('keydown-ESC', this.skipToEnd, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    if (this.reducedMotion) this.finishBattle(true);
    else this.delay(1100, () => this.beginClash());
  }

  private refitBackdrop(rect: VisibleWorldRect): void {
    this.bgBattle
      .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
      .setDisplaySize(rect.width, rect.height);
  }

  private spawnUnits(): void {
    const friendly: TroopKind[] = [];
    for (const kind of TROOP_ORDER) {
      for (let i = 0; i < this.receipt.deployed[kind]; i++) friendly.push(kind);
    }
    this.friendlyUnits = this.layOut(friendly, 'friendly', 250, -1);
    const enemy: EnemyKind[] = [];
    for (const kind of ENEMY_ORDER) {
      const entry = waveComposition(this.receipt.wave).find((candidate) => candidate.kind === kind);
      if (entry) for (let i = 0; i < entry.count; i++) enemy.push(kind);
    }
    this.enemyUnits = this.layOut(enemy, 'enemy', 710, 1);
  }

  private layOut(
    kinds: (TroopKind | EnemyKind)[],
    side: 'friendly' | 'enemy',
    baseX: number,
    direction: number,
  ): Battler[] {
    const units: Battler[] = [];
    const count = Math.min(kinds.length, 42);
    for (let i = 0; i < count; i++) {
      const column = Math.floor(i / 6);
      const row = i % 6;
      units.push(new Battler(this, side, kinds[i], baseX + direction * column * 34, 210 + row * 52));
    }
    return units;
  }

  private beginClash(): void {
    if (this.finished) return;
    for (const unit of this.friendlyUnits) unit.march(CANVAS.WIDTH / 2 - 75, 900 / this.speedMult());
    for (const unit of this.enemyUnits) unit.march(CANVAS.WIDTH / 2 + 75, 900 / this.speedMult());
    this.delay(950 / this.speedMult(), () => this.scheduleNextStep());
  }

  private scheduleNextStep(): void {
    if (!this.finished) this.delay(STEP_MS / this.speedMult(), () => this.playStep());
  }

  private playStep(): void {
    if (this.finished) return;
    const step = this.timeline.steps[this.stepIndex];
    if (!step) {
      this.finishBattle(false);
      return;
    }
    this.trimSide(this.friendlyUnits, this.armyTotal(step.friendly));
    this.trimSide(this.enemyUnits, this.totalEnemy(step.enemy));
    const hp = 0.4 + 0.6 * (1 - (this.stepIndex + 1) / this.timeline.steps.length);
    for (const unit of this.aliveUnits(this.friendlyUnits)) {
      unit.attack();
      unit.setHpRatio(hp);
    }
    for (const unit of this.aliveUnits(this.enemyUnits)) {
      unit.attack();
      unit.setHpRatio(hp);
    }
    this.stepIndex += 1;
    this.refreshHud();
    if (this.stepIndex >= this.timeline.steps.length) this.delay(500 / this.speedMult(), () => this.finishBattle(false));
    else this.scheduleNextStep();
  }

  private finishBattle(immediate: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.cancelPresentation();
    if (!immediate) {
      this.trimSide(this.friendlyUnits, this.armyTotal(this.receipt.survivors));
      this.trimSide(this.enemyUnits, this.receipt.win ? 0 : this.enemyRemainingOnLoss());
      this.refreshHud();
      this.audio.playSfx(this.receipt.win ? AudioKeys.Victory : AudioKeys.Defeat, 0.9);
      this.delay(900, () => this.openResult());
    } else {
      this.openResult();
    }
  }

  private openResult(): void {
    // No economy/progression mutation occurs here or from Skip. Campaign state
    // was durable before this scene began; replay state was never mutated.
    this.scene.start(SceneKeys.GameOver, { receipt: this.receipt });
  }

  private skipToEnd(): void {
    if (this.finished) return;
    this.finishBattle(true);
  }

  private cycleSpeed(): number {
    this.speedIndex = (this.speedIndex + 1) % SPEED_STEPS.length;
    return SPEED_STEPS[this.speedIndex];
  }

  private speedMult(): number {
    return SPEED_STEPS[this.speedIndex];
  }

  private delay(ms: number, callback: () => void): void {
    let timer!: Phaser.Time.TimerEvent;
    timer = this.time.delayedCall(ms, () => {
      this.timers.delete(timer);
      callback();
    });
    this.timers.add(timer);
  }

  private refreshHud(): void {
    if (!this.hud) return;
    this.hud.update({
      wave: this.receipt.wave,
      totalWaves: TOTAL_WAVES,
      armyRemaining: this.currentAlive('friendly'),
      enemyRemaining: this.currentAlive('enemy'),
    });
  }

  private currentAlive(side: 'friendly' | 'enemy'): number {
    if (this.finished) {
      return side === 'friendly' ? this.armyTotal(this.receipt.survivors) : this.receipt.win ? 0 : this.enemyRemainingOnLoss();
    }
    if (this.stepIndex === 0) {
      return side === 'friendly' ? this.armyTotal(this.timeline.start.friendly) : this.totalEnemy(this.timeline.start.enemy);
    }
    const step = this.timeline.steps[Math.min(this.stepIndex - 1, this.timeline.steps.length - 1)];
    return side === 'friendly' ? this.armyTotal(step.friendly) : this.totalEnemy(step.enemy);
  }

  private trimSide(units: Battler[], targetAlive: number): void {
    const alive = this.aliveUnits(units);
    const trueTotal = units === this.friendlyUnits
      ? this.armyTotal(this.timeline.start.friendly)
      : this.totalEnemy(this.timeline.start.enemy);
    const scaledTarget = Math.min(alive.length, Math.max(0, Math.round(targetAlive * (trueTotal ? units.length / trueTotal : 1))));
    for (let index = alive.length - 1; index >= scaledTarget; index--) alive[index].fall();
  }

  private aliveUnits(units: Battler[]): Battler[] {
    return units.filter((unit) => !unit.isDead);
  }

  private armyTotal(army: Army): number {
    return TROOP_ORDER.reduce((sum, kind) => sum + Math.max(0, army[kind] ?? 0), 0);
  }

  private totalEnemy(enemies: Record<string, number>): number {
    return Object.values(enemies).reduce((sum, count) => sum + Math.max(0, count ?? 0), 0);
  }

  private enemyRemainingOnLoss(): number {
    const last = this.timeline.steps[this.timeline.steps.length - 1];
    return last ? this.totalEnemy(last.enemy) : 0;
  }

  private cancelPresentation(): void {
    for (const timer of this.timers) timer.remove();
    this.timers.clear();
    this.tweens.killAll();
  }

  private cleanup(): void {
    this.cancelPresentation();
    this.input.keyboard?.off('keydown-ESC', this.skipToEnd, this);
    for (const unit of [...this.friendlyUnits, ...this.enemyUnits]) unit.destroy();
    this.friendlyUnits = [];
    this.enemyUnits = [];
  }
}
