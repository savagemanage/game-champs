import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS } from '../config/GameConfig';
import {
  TextureKeys,
  AudioKeys,
  GRADE_FRAME_FRAME,
  HERO_PORTRAIT_TYPE_INDEX,
  HERO_PORTRAIT_ROLE_INDEX,
} from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { heroDef } from '../config/Heroes';
import type { Combatant, Team } from '../systems/Formation';
import type { BattleEvent, Side } from '../systems/Combat';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/**
 * Launch data for {@link BattleScene}. This is the reusable animated-view
 * contract: any caller that has ALREADY resolved a battle (a campaign stage, a
 * zombie wave, or a FEAT-003 league match) hands the scene the resolved
 * {@link BattleEvent} timeline plus the two teams' member data to render and
 * label sprites, the win flag, a localized title, and a return path.
 *
 * IMPORTANT: BattleScene is presentation-only. It NEVER runs combat or computes
 * rewards. The caller resolves the battle through the store's attempt* methods
 * (which already apply + persist rewards) and passes the resulting
 * `outcome.battle.timeline` and `outcome.win` here. All members / events are
 * plain data objects (Combatant / BattleEvent), so they satisfy Phaser's
 * plain-data scene-init requirement.
 */
export interface BattleSceneData {
  /** The ordered event timeline to replay (from BattleResult.timeline). */
  timeline: BattleEvent[];
  /** Whether the player (attacker side) won the resolved battle. */
  win: boolean;
  /** The player squad (attacker side): member ids/type/role/row + stats. */
  playerTeam: Team;
  /** The enemy squad (defender side): member ids/type/role/row + stats. */
  enemyTeam: Team;
  /** Localized banner title for this battle (e.g. the stage / wave name). */
  title: string;
  /** Scene key to return to when the replay finishes. */
  returnTo: string;
  /**
   * Optional pass-through payload handed back to `returnTo` via scene data so
   * the caller can surface the result overlay (rewards it already applied).
   */
  returnData?: Record<string, unknown>;
}

/** How long each timeline step is held on screen (ms). */
const STEP_MS = 380;

/** A rendered combatant: sprite/portrait, grade frame, and an HP bar. */
interface Actor {
  id: string;
  side: Side;
  maxHp: number;
  hp: number;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  portrait: Phaser.GameObjects.Image;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpBarWidth: number;
  dead: boolean;
}

/**
 * Composite key for the actor map: a unit is uniquely identified by its
 * `(side, id)` pair, NOT by id alone. Combat.BattleEvent carries the side of
 * every referenced unit (attackerSide/targetSide/healerSide, death `side`), so
 * keying and resolving by side removes the latent hazard of a hero id colliding
 * with an enemy formation id and animating the wrong sprite.
 */
function actorKey(side: Side, id: string): string {
  return `${side}:${id}`;
}

/**
 * BattleScene - the reusable animated REPLAY of an already-resolved battle
 * (FEAT-002). It lays the player squad along the bottom and the enemy squad
 * along the top over the battle backdrop, draws an HP bar per unit, then steps
 * through the passed {@link BattleEvent} timeline on a fixed interval: attacks
 * lunge the attacker at the target with FxMuzzle/FxHit particles + a hit SFX and
 * shrink the target's HP bar by the event's exact `damage`; a type-advantage
 * event (typeMult>1) flashes the tr('battle.advantage') cue and shakes the
 * camera; heals pop a green number and regrow the ally bar; deaths fade the unit
 * out. Every number comes straight off the event - nothing is recomputed here.
 *
 * At the end it shows the victory/defeat banner, plays the win/lose + victory/
 * defeat stingers, and after a short beat returns to `returnTo` (passing back
 * `returnData` so the caller can show the reward summary the store already
 * applied). All tweens/timers are torn down on shutdown.
 */
export class BattleScene extends Phaser.Scene {
  private battle!: BattleSceneData;
  private actorsById = new Map<string, Actor>();
  private stepTimer: Phaser.Time.TimerEvent | null = null;
  private endTimer: Phaser.Time.TimerEvent | null = null;
  private cursor = 0;
  private advantageCue!: Phaser.GameObjects.Text;
  private finished = false;

  constructor() {
    super({ key: SceneKeys.Battle });
  }

  create(data: BattleSceneData): void {
    this.battle = data;
    this.actorsById = new Map();
    this.stepTimer = null;
    this.endTimer = null;
    this.cursor = 0;
    this.finished = false;

    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    AudioManager.get(this).playMusic();

    this.add.image(cx, CANVAS.HEIGHT / 2, TextureKeys.BgBattle).setOrigin(0.5).setAlpha(0.55);

    Menu.title(this, cx, CANVAS.HEIGHT * 0.06, data.title, 26).setColor(PALETTE.SQUAD_CSS);

    // Enemy squad along the top, player squad along the bottom.
    this.layoutTeam(data.enemyTeam, 'defender', CANVAS.HEIGHT * 0.22, CANVAS.HEIGHT * 0.34);
    this.layoutTeam(data.playerTeam, 'attacker', CANVAS.HEIGHT * 0.72, CANVAS.HEIGHT * 0.6);

    // A hidden type-advantage cue, flashed on advantageous attacks.
    this.advantageCue = this.add
      .text(cx, CANVAS.HEIGHT * 0.46, tr('battle.advantage'), textStyle(20, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(80);

    // Clean up on shutdown/destroy so no timer/tween outlives the scene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());

    // Kick off the replay after a short beat so the layout is readable first.
    this.stepTimer = this.time.delayedCall(STEP_MS, () => this.step());
  }

  /**
   * Lay a team out as a row of framed portraits with an HP bar each. Front-row
   * units sit closer to midfield (larger y offset toward centre) so the layout
   * reads front-vs-back. `frontY` is the front-row line, `backY` the back-row.
   */
  private layoutTeam(team: Team, side: Side, frontY: number, backY: number): void {
    const front = team.members.filter((m) => m.row === 'front');
    const back = team.members.filter((m) => m.row === 'back');
    this.layoutRow(front, side, frontY);
    this.layoutRow(back, side, backY);
  }

  /** Lay one row of combatants centered horizontally at `y`. */
  private layoutRow(members: Combatant[], side: Side, y: number): void {
    if (members.length === 0) return;
    const gap = 96;
    const totalW = (members.length - 1) * gap;
    const startX = CANVAS.WIDTH / 2 - totalW / 2;
    members.forEach((m, i) => {
      const x = startX + i * gap;
      this.makeActor(m, side, x, y);
    });
  }

  /** Build one rendered actor (portrait + grade frame + name + HP bar). */
  private makeActor(member: Combatant, side: Side, x: number, y: number): void {
    const def = heroDef(member.id);
    const portraitFrame = HERO_PORTRAIT_TYPE_INDEX[member.type] * 3 + HERO_PORTRAIT_ROLE_INDEX[member.role];
    const gradeFrame = def ? GRADE_FRAME_FRAME[def.grade] : 0;
    const label = def ? tr(def.nameKey as TrKey) : this.enemyLabel(member);

    const bg = this.add.rectangle(0, 0, 56, 56, PALETTE.PANEL, 0.7).setStrokeStyle(2, side === 'attacker' ? PALETTE.SQUAD : PALETTE.ENEMY);
    const portrait = this.add.image(0, -2, TextureKeys.HeroPortraits, portraitFrame).setScale(1.5);
    const frame = this.add.image(0, -2, TextureKeys.GradeFrames, gradeFrame).setScale(1.5);
    // Enemy portraits read as hostile with a red tint over the shared sheet.
    if (side === 'defender') portrait.setTint(0xff9a90);
    const nameText = this.add.text(0, 26, label, textStyle(8, { align: 'center' })).setOrigin(0.5);

    // HP bar under the portrait.
    const hpBarWidth = 48;
    const barBg = this.add.rectangle(0, -34, hpBarWidth + 2, 7, PALETTE.ROAD_DARK).setStrokeStyle(1, PALETTE.LANE_LINE);
    const hpBarFill = this.add
      .rectangle(-hpBarWidth / 2, -34, hpBarWidth, 5, side === 'attacker' ? PALETTE.SUCCESS : PALETTE.DANGER)
      .setOrigin(0, 0.5);

    const container = this.add.container(x, y, [bg, portrait, frame, nameText, barBg, hpBarFill]);
    container.setSize(56, 56);

    this.actorsById.set(actorKey(side, member.id), {
      id: member.id,
      side,
      maxHp: member.maxHp,
      hp: member.maxHp,
      x,
      y,
      container,
      portrait,
      hpBarFill,
      hpBarWidth,
      dead: false,
    });
  }

  /** A short label for an enemy unit that has no hero-catalog entry. */
  private enemyLabel(member: Combatant): string {
    return tr(`herotype.${member.type}` as TrKey);
  }

  /** Advance the timeline by one event, scheduling the next step. */
  private step(): void {
    if (this.finished) return;
    if (this.cursor >= this.battle.timeline.length) {
      this.finish();
      return;
    }
    const event = this.battle.timeline[this.cursor];
    this.cursor += 1;
    this.playEvent(event);
    this.stepTimer = this.time.delayedCall(STEP_MS, () => this.step());
  }

  /** Animate a single battle event straight off its (already-resolved) numbers. */
  private playEvent(event: BattleEvent): void {
    if (event.kind === 'attack') {
      this.playAttack(event);
    } else if (event.kind === 'heal') {
      this.playHeal(event);
    } else {
      this.playDeath(event.side, event.unit);
    }
  }

  /** Lunge the attacker, spawn FX, play the hit SFX, and shrink the HP bar. */
  private playAttack(event: Extract<BattleEvent, { kind: 'attack' }>): void {
    const attacker = this.actorsById.get(actorKey(event.attackerSide, event.attacker));
    const target = this.actorsById.get(actorKey(event.targetSide, event.target));
    if (target) {
      this.applyDamage(target, event.damage);
      this.spawnFx(target.x, target.y, TextureKeys.FxHit);
      this.floatNumber(target.x, target.y - 20, `-${event.damage}`, PALETTE.DANGER_CSS);
    }
    if (attacker && target) {
      this.spawnFx(attacker.x + Math.sign(target.x - attacker.x) * 24, attacker.y, TextureKeys.FxMuzzle);
      this.lunge(attacker, target);
    }
    AudioManager.get(this).playSfx(AudioKeys.BattleHit, 0.6);

    // Type-advantage cue + extra shake when the resolved event was advantageous.
    if (event.typeMult > 1) {
      this.flashAdvantage();
      this.cameras.main.shake(160, 0.006);
    } else {
      this.cameras.main.shake(80, 0.002);
    }
  }

  /** Pop a green heal number and regrow the ally's HP bar by the exact amount. */
  private playHeal(event: Extract<BattleEvent, { kind: 'heal' }>): void {
    const target = this.actorsById.get(actorKey(event.targetSide, event.target));
    if (!target || target.dead) return;
    target.hp = Math.min(target.maxHp, target.hp + event.amount);
    this.setHpBar(target);
    this.floatNumber(target.x, target.y - 20, `+${event.amount}`, PALETTE.SUCCESS_CSS);
    this.spawnFx(target.x, target.y, TextureKeys.FxSparkle);
  }

  /** Fade a downed unit out. */
  private playDeath(side: Side, unitId: string): void {
    const actor = this.actorsById.get(actorKey(side, unitId));
    if (!actor || actor.dead) return;
    actor.dead = true;
    this.tweens.add({
      targets: actor.container,
      alpha: 0.15,
      scale: 0.8,
      duration: 260,
      ease: 'Quad.in',
    });
  }

  /** Apply exact damage to an actor's tracked HP and repaint its bar. */
  private applyDamage(actor: Actor, damage: number): void {
    actor.hp = Math.max(0, actor.hp - damage);
    this.setHpBar(actor);
  }

  /** Repaint an actor's HP-bar fill to its current HP fraction. */
  private setHpBar(actor: Actor): void {
    const frac = actor.maxHp > 0 ? actor.hp / actor.maxHp : 0;
    this.tweens.add({
      targets: actor.hpBarFill,
      width: Math.max(0, Math.floor(actor.hpBarWidth * frac)),
      duration: 200,
      ease: 'Quad.out',
    });
  }

  /** Briefly lunge an attacker toward its target and back. */
  private lunge(attacker: Actor, target: Actor): void {
    const dx = Phaser.Math.Clamp(target.x - attacker.x, -20, 20);
    const dy = Phaser.Math.Clamp(target.y - attacker.y, -20, 20);
    this.tweens.add({
      targets: attacker.container,
      x: attacker.x + dx,
      y: attacker.y + dy,
      duration: 120,
      yoyo: true,
      ease: 'Quad.out',
    });
  }

  /** Spawn a short-lived FX sprite that plays through its frames then dies. */
  private spawnFx(x: number, y: number, texture: string): void {
    const fx = this.add.image(x, y, texture, 0).setDepth(70).setScale(2);
    let frame = 0;
    const timer = this.time.addEvent({
      delay: 45,
      repeat: 3,
      callback: () => {
        frame += 1;
        if (frame <= 3) fx.setFrame(frame);
      },
    });
    this.tweens.add({
      targets: fx,
      alpha: 0,
      duration: 220,
      delay: 60,
      onComplete: () => {
        timer.remove();
        fx.destroy();
      },
    });
  }

  /** Float a damage/heal number up and fade it out. */
  private floatNumber(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, textStyle(14, { fontStyle: 'bold', color }))
      .setOrigin(0.5)
      .setDepth(75);
    this.tweens.add({
      targets: label,
      y: y - 26,
      alpha: 0,
      duration: 520,
      ease: 'Quad.out',
      onComplete: () => label.destroy(),
    });
  }

  /** Flash the type-advantage cue in the middle of the field. */
  private flashAdvantage(): void {
    this.advantageCue.setAlpha(1).setScale(0.8);
    this.tweens.add({
      targets: this.advantageCue,
      alpha: 0,
      scale: 1.2,
      duration: 520,
      ease: 'Quad.out',
    });
  }

  /** End of timeline: banner + stinger, then return to the caller. */
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const win = this.battle.win;

    const audio = AudioManager.get(this);
    audio.playSfx(win ? AudioKeys.BattleWin : AudioKeys.BattleLose, 0.8);
    audio.playSfx(win ? AudioKeys.Victory : AudioKeys.Defeat, 0.7);

    const bannerText = win ? tr('battle.victory') : tr('battle.defeat');
    const color = win ? PALETTE.SUCCESS_CSS : PALETTE.DANGER_CSS;
    const banner = this.add
      .text(cx, cy, bannerText, textStyle(40, { fontStyle: 'bold', color }))
      .setOrigin(0.5)
      .setDepth(90)
      .setAlpha(0)
      .setScale(0.6);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 320, ease: 'Back.out' });
    this.cameras.main.shake(220, win ? 0.004 : 0.008);

    // Return to the caller after a beat so it can surface the reward summary.
    this.endTimer = this.time.delayedCall(1200, () => {
      Menu.fadeTo(this, () =>
        this.scene.start(this.battle.returnTo, {
          returnTo: SceneKeys.Home,
          battleResult: { win, ...(this.battle.returnData ?? {}) },
        }),
      );
    });
  }

  /** Cancel timers and stop tweens so nothing outlives the scene. */
  private teardown(): void {
    this.finished = true;
    if (this.stepTimer) {
      this.stepTimer.remove();
      this.stepTimer = null;
    }
    if (this.endTimer) {
      this.endTimer.remove();
      this.endTimer = null;
    }
    this.tweens.killAll();
    this.time.removeAllEvents();
  }
}
