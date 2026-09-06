import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RECRUIT } from '../config/GameConfig';
import type { HeroInstance } from '../types';
import {
  TextureKeys,
  AudioKeys,
  GRADE_FRAME_FRAME,
  HERO_PORTRAIT_TYPE_INDEX,
  HERO_PORTRAIT_ROLE_INDEX,
} from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import { HERO_ORDER, heroDef } from '../config/Heroes';
import {
  deriveHeroStats,
  levelUpCost,
  starUpCost,
  skillUpCost,
} from '../systems/Heroes';
import type { RecruitResult } from '../systems/Recruit';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** Data passed when launching the Heroes scene from the HomeScene bottom-nav. */
export interface HeroesSceneData {
  /** Scene key to return to when Heroes closes. Defaults to Home. */
  returnTo?: string;
}

type Tab = 'roster' | 'recruit';

/**
 * HeroesScene - the hero roster + recruit + progression hub, driving the tested
 * FEAT-003 systems (Heroes progression, seeded Recruit with pity). Two tabs:
 *
 *  - Roster: a grid of owned heroes (portrait by type/role via the
 *    HERO_PORTRAIT_* frame maps, grade-frame overlay, level + star). Tapping a
 *    hero opens a detail panel that spends shards on level / star / skill via
 *    {@link GameStore.levelUpHero} / starUpHero / skillUpHero (all tested math).
 *  - Recruit: single + multi (x10) pulls through {@link GameStore.recruitOne}
 *    (seeded, deterministic), animating the pity counter and a result reveal,
 *    with the recruit SFX. Duplicates convert to shards by the tested rule.
 *
 * A shortcut opens the FormationScene. No game math lives here; the scene only
 * calls the store and renders. State persists on every mutation via the store.
 */
export class HeroesScene extends Phaser.Scene {
  private returnTo: string = SceneKeys.Home;
  private tab: Tab = 'roster';
  private shardsText!: Phaser.GameObjects.Text;
  private ownedText!: Phaser.GameObjects.Text;
  /** The dynamic content layer wiped + rebuilt on tab / state change. */
  private content!: Phaser.GameObjects.Container;
  private detail: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SceneKeys.Heroes });
  }

  create(data: HeroesSceneData): void {
    this.returnTo = data?.returnTo ?? SceneKeys.Home;
    this.tab = 'roster';
    this.detail = null;
    const cx = CANVAS.WIDTH / 2;

    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);
    AudioManager.get(this).playMusic();

    Menu.title(this, cx, CANVAS.HEIGHT * 0.06, tr('heroes.title'), 32).setColor(PALETTE.SQUAD_CSS);

    this.shardsText = this.add
      .text(CANVAS.WIDTH - 16, CANVAS.HEIGHT * 0.11, '', textStyle(14, { color: PALETTE.COIN_CSS }))
      .setOrigin(1, 0.5);
    this.ownedText = this.add
      .text(16, CANVAS.HEIGHT * 0.11, '', textStyle(13))
      .setOrigin(0, 0.5);

    // Tab bar: Roster | Recruit, plus a Formation shortcut.
    Menu.button(this, cx - 150, CANVAS.HEIGHT * 0.155, tr('heroes.rosterTab'), () => this.setTab('roster'), { width: 120, fontSize: 14 });
    Menu.button(this, cx, CANVAS.HEIGHT * 0.155, tr('heroes.recruitTab'), () => this.setTab('recruit'), { width: 120, fontSize: 14 });
    Menu.button(this, cx + 150, CANVAS.HEIGHT * 0.155, tr('heroes.formation'), () => this.openFormation(), { width: 120, fontSize: 14, accent: PALETTE.SQUAD });

    this.content = this.add.container(0, 0);

    Menu.button(this, cx, CANVAS.HEIGHT * 0.955, tr('common.back'), () => this.close(), { width: 200 });
    this.input.keyboard?.on('keydown-ESC', () => (this.detail ? this.closeDetail() : this.close()));
    this.input.keyboard?.on('keydown-R', () => this.setTab('recruit'));
    this.input.keyboard?.on('keydown-F', () => this.openFormation());

    this.render();
  }

  private setTab(tab: Tab): void {
    if (this.tab === tab && !this.detail) return;
    this.tab = tab;
    this.closeDetail();
    AudioManager.get(this).playSfx(AudioKeys.TabSwitch, 0.6);
    this.render();
  }

  /** Repaint the header counters and the active tab content. */
  private render(): void {
    const store = GameStore.get();
    this.shardsText.setText(tr('recruit.shards', { shards: store.shards() }));
    const ownedCount = Object.keys(store.state.heroes.roster).length;
    this.ownedText.setText(tr('heroes.owned', { count: ownedCount, total: HERO_ORDER.length }));

    this.content.removeAll(true);
    if (this.tab === 'roster') this.renderRoster(store);
    else this.renderRecruit(store);
  }

  /* ------------------------------------------------------------------ */
  /* Roster tab.                                                         */
  /* ------------------------------------------------------------------ */

  private renderRoster(store: GameStore): void {
    const owned = Object.values(store.state.heroes.roster) as HeroInstance[];
    if (owned.length === 0) {
      const label = Menu.label(this, CANVAS.WIDTH / 2, CANVAS.HEIGHT * 0.45, tr('heroes.rosterEmpty'), 14, 0.85);
      this.content.add(label);
      return;
    }

    // Iterate in canonical catalog order for a stable grid.
    const ids = HERO_ORDER.filter((id) => store.ownsHero(id));
    const cols = 4;
    const cellW = CANVAS.WIDTH / cols;
    const cellH = 96;
    const startY = CANVAS.HEIGHT * 0.24;

    ids.forEach((id, i) => {
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      const x = cellW * col + cellW / 2;
      const y = startY + rowIdx * cellH;
      this.renderRosterCell(id, x, y);
    });
  }

  /** One roster grid cell: portrait + grade frame + level/star, tap for detail. */
  private renderRosterCell(id: string, x: number, y: number): void {
    const store = GameStore.get();
    const instance = store.hero(id);
    const def = heroDef(id);
    if (!instance || !def) return;

    const portraitFrame = HERO_PORTRAIT_TYPE_INDEX[def.type] * 3 + HERO_PORTRAIT_ROLE_INDEX[def.role];
    const bg = this.add.rectangle(x, y, 76, 84, PALETTE.PANEL, 0.9).setStrokeStyle(2, PALETTE.ACCENT);
    const portrait = this.add.image(x, y - 12, TextureKeys.HeroPortraits, portraitFrame).setScale(1.6);
    const frame = this.add.image(x, y - 12, TextureKeys.GradeFrames, GRADE_FRAME_FRAME[def.grade]).setScale(1.6);
    const levelText = this.add.text(x, y + 20, tr('hero.level', { level: instance.level }), textStyle(9, { align: 'center' })).setOrigin(0.5);
    const starText = this.add.text(x, y + 32, tr('hero.stars', { stars: instance.stars }), textStyle(9, { align: 'center', color: PALETTE.COIN_CSS })).setOrigin(0.5);

    const zone = this.add.zone(x, y, 76, 84).setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => this.openDetail(id));

    this.content.add([bg, portrait, frame, levelText, starText, zone]);
  }

  /* ------------------------------------------------------------------ */
  /* Hero detail panel (level / star / skill progression).               */
  /* ------------------------------------------------------------------ */

  private openDetail(id: string): void {
    this.closeDetail();
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT * 0.5;
    const w = CANVAS.WIDTH * 0.86;
    const h = CANVAS.HEIGHT * 0.62;

    const shade = this.add.rectangle(cx, CANVAS.HEIGHT / 2, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.6).setInteractive();
    const panel = Menu.panel(this, cx, cy, w, h, 0.98);
    const container = this.add.container(0, 0, [shade, panel]).setDepth(70);
    this.detail = container;

    this.buildDetailContents(id, container, cx, cy, w);
  }

  /** Fill the detail panel for a hero; rebuilt after each progression spend. */
  private buildDetailContents(id: string, container: Phaser.GameObjects.Container, cx: number, cy: number, w: number): void {
    const store = GameStore.get();
    const instance = store.hero(id);
    const def = heroDef(id);
    if (!instance || !def) return;

    // Wipe everything except the shade + panel (first two children).
    while (container.length > 2) {
      const child = container.getAt(container.length - 1) as Phaser.GameObjects.GameObject;
      container.remove(child, true);
    }

    const top = cy - CANVAS.HEIGHT * 0.29;
    const portraitFrame = HERO_PORTRAIT_TYPE_INDEX[def.type] * 3 + HERO_PORTRAIT_ROLE_INDEX[def.role];
    const portrait = this.add.image(cx - w / 2 + 60, top + 40, TextureKeys.HeroPortraits, portraitFrame).setScale(2.2);
    const frame = this.add.image(cx - w / 2 + 60, top + 40, TextureKeys.GradeFrames, GRADE_FRAME_FRAME[def.grade]).setScale(2.2);

    const name = this.add.text(cx - w / 2 + 110, top + 14, tr(def.nameKey as TrKey), textStyle(18, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS })).setOrigin(0, 0);
    const grade = this.add.text(cx - w / 2 + 110, top + 40, `${tr(`herograde.${def.grade}` as TrKey)}  ${tr(`herotype.${def.type}` as TrKey)}  ${tr(`herorole.${def.role}` as TrKey)}`, textStyle(11, { color: PALETTE.MUTED_CSS })).setOrigin(0, 0);
    const lore = this.add.text(cx - w / 2 + 110, top + 60, tr(def.loreKey as TrKey), textStyle(10, { color: PALETTE.MUTED_CSS, wordWrap: { width: w - 130 } })).setOrigin(0, 0);
    container.add([portrait, frame, name, grade, lore]);

    // Progression readouts: level / stars / skill.
    const progY = top + 100;
    const levelLine = this.add.text(cx - w / 2 + 24, progY, `${tr('hero.level', { level: instance.level })}   ${tr('hero.stars', { stars: instance.stars })}   ${tr('hero.skillLevel', { level: instance.skillLevel })}`, textStyle(12)).setOrigin(0, 0.5);
    container.add(levelLine);

    // Derived stats.
    const stats = deriveHeroStats(instance);
    const statLine = this.add
      .text(
        cx - w / 2 + 24,
        progY + 22,
        `${tr('hero.stat.hp')} ${stats.hp}   ${tr('hero.stat.atk')} ${stats.atk}   ${tr('hero.stat.def')} ${stats.def}   ${tr('hero.stat.speed')} ${stats.speed}`,
        textStyle(11, { color: PALETTE.SQUAD_CSS }),
      )
      .setOrigin(0, 0.5);
    container.add(statLine);

    const shardsLine = this.add.text(cx + w / 2 - 24, progY, tr('recruit.shards', { shards: store.shards() }), textStyle(12, { color: PALETTE.COIN_CSS })).setOrigin(1, 0.5);
    container.add(shardsLine);

    // Three progression buttons with their shard costs.
    const btnY = progY + 66;
    const shards = store.shards();
    this.buildProgressButton(container, cx, btnY, tr('hero.levelUp'), levelUpCost(instance), shards, () => {
      if (store.levelUpHero(id)) this.afterProgress(id, container, cx, cy, w);
    });
    this.buildProgressButton(container, cx, btnY + 52, tr('hero.starUp'), starUpCost(instance), shards, () => {
      if (store.starUpHero(id)) this.afterProgress(id, container, cx, cy, w);
    });
    this.buildProgressButton(container, cx, btnY + 104, tr('hero.skillUp'), skillUpCost(instance), shards, () => {
      if (store.skillUpHero(id)) this.afterProgress(id, container, cx, cy, w);
    });

    const close = Menu.button(this, cx, cy + CANVAS.HEIGHT * 0.26, tr('common.close'), () => this.closeDetail(), { width: 160, fontSize: 14 });
    container.add(close.container);
  }

  /** A labelled progression button showing its shard cost; disabled if unaffordable/capped. */
  private buildProgressButton(
    container: Phaser.GameObjects.Container,
    cx: number,
    y: number,
    label: string,
    cost: number,
    shards: number,
    onClick: () => void,
  ): void {
    const capped = !Number.isFinite(cost);
    const costText = capped ? tr('hero.maxed') : tr('hero.cost', { cost });
    const btn: MenuButton = Menu.button(this, cx - 60, y, label, onClick, { width: 180, fontSize: 14 });
    const price = this.add.text(cx + 70, y, costText, textStyle(12, { color: capped ? PALETTE.MUTED_CSS : PALETTE.COIN_CSS })).setOrigin(0, 0.5);
    btn.setEnabled(!capped && shards >= cost);
    container.add([btn.container, price]);
  }

  /** After a successful spend: SFX, rebuild the detail + header + roster grid. */
  private afterProgress(id: string, container: Phaser.GameObjects.Container, cx: number, cy: number, w: number): void {
    AudioManager.get(this).playSfx(AudioKeys.LevelUp, 0.7);
    this.buildDetailContents(id, container, cx, cy, w);
    // Refresh the header counters + underlying roster grid values.
    const store = GameStore.get();
    this.shardsText.setText(tr('recruit.shards', { shards: store.shards() }));
    // Rerender roster grid underneath so level/star pips update on close.
    this.content.removeAll(true);
    this.renderRoster(store);
  }

  private closeDetail(): void {
    if (this.detail) {
      this.detail.destroy(true);
      this.detail = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Recruit tab (seeded gacha with pity).                               */
  /* ------------------------------------------------------------------ */

  private renderRecruit(store: GameStore): void {
    const cx = CANVAS.WIDTH / 2;
    const panel = Menu.panel(this, cx, CANVAS.HEIGHT * 0.42, CANVAS.WIDTH * 0.86, CANVAS.HEIGHT * 0.42, 0.92);
    this.content.add(panel);

    const title = Menu.title(this, cx, CANVAS.HEIGHT * 0.27, tr('recruit.title'), 26);
    this.content.add(title);

    // Pity counter readout.
    const pity = store.state.heroes.pity;
    const pityLine = this.add
      .text(cx, CANVAS.HEIGHT * 0.32, tr('recruit.pityCount', { count: pity.sinceHighGrade, max: RECRUIT.PITY_THRESHOLD }), textStyle(13, { align: 'center' }))
      .setOrigin(0.5);
    this.content.add(pityLine);

    const remaining = Math.max(0, RECRUIT.PITY_THRESHOLD - pity.sinceHighGrade);
    const pityHint = this.add
      .text(cx, CANVAS.HEIGHT * 0.35, tr('recruit.pity', { count: remaining }), textStyle(11, { align: 'center', color: PALETTE.MUTED_CSS }))
      .setOrigin(0.5);
    this.content.add(pityHint);

    // A pity progress bar.
    const bar = Menu.progressBar(this, cx - 130, CANVAS.HEIGHT * 0.385, 260, 10, PALETTE.BOSS);
    bar.setProgress(pity.sinceHighGrade / RECRUIT.PITY_THRESHOLD);
    this.content.add(bar.container);

    // Reveal area (populated after a pull).
    const reveal = this.add.container(cx, CANVAS.HEIGHT * 0.48);
    this.content.add(reveal);

    const single = Menu.button(this, cx - 90, CANVAS.HEIGHT * 0.6, tr('recruit.pull1'), () => this.pull(1, reveal), { width: 150, accent: PALETTE.SQUAD });
    const multi = Menu.button(this, cx + 90, CANVAS.HEIGHT * 0.6, tr('recruit.pull10'), () => this.pull(10, reveal), { width: 150, accent: PALETTE.ACCENT });
    this.content.add([single.container, multi.container]);
  }

  /** Perform `count` seeded pulls, animate the reveal, and refresh the header. */
  private pull(count: number, reveal: Phaser.GameObjects.Container): void {
    const store = GameStore.get();
    reveal.removeAll(true);
    AudioManager.get(this).playSfx(AudioKeys.Recruit, 0.8);

    const results: (RecruitResult & { duplicate: boolean; shardsGained: number })[] = [];
    for (let i = 0; i < count; i += 1) {
      // Seed each pull from the running total-pulls counter so it is stable +
      // deterministic; the store advances pity/roster/shards on each call.
      const seed = (store.state.heroes.pity.totalPulls * 2654435761 + i * 40503) >>> 0;
      results.push(store.recruitOne(seed));
    }

    const cols = Math.min(5, count);
    const cellW = 62;
    const rows = Math.ceil(count / cols);
    const startX = -((cols - 1) * cellW) / 2;
    const startY = -((rows - 1) * 56) / 2;

    results.forEach((res, i) => {
      const def = heroDef(res.heroId);
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + rowIdx * 56;
      const portraitFrame = def ? HERO_PORTRAIT_TYPE_INDEX[def.type] * 3 + HERO_PORTRAIT_ROLE_INDEX[def.role] : 0;
      const gradeFrame = def ? GRADE_FRAME_FRAME[def.grade] : 0;
      const portrait = this.add.image(x, y, TextureKeys.HeroPortraits, portraitFrame).setScale(0.1);
      const frame = this.add.image(x, y, TextureKeys.GradeFrames, gradeFrame).setScale(0.1);
      const tag = this.add
        .text(x, y + 24, res.duplicate ? tr('recruit.duplicate', { shards: res.shardsGained }) : tr('recruit.new'), textStyle(8, { align: 'center', color: res.duplicate ? PALETTE.MUTED_CSS : PALETTE.SUCCESS_CSS }))
        .setOrigin(0.5);
      reveal.add([portrait, frame, tag]);
      // Pop-in reveal, staggered per pull.
      this.tweens.add({ targets: [portrait, frame], scale: 1.5, duration: 260, delay: i * 70, ease: 'Back.out' });
      if (res.pity) {
        const flash = this.add.text(x, y - 26, tr('recruit.pityHit'), textStyle(9, { color: PALETTE.COIN_CSS })).setOrigin(0.5);
        reveal.add(flash);
      }
    });

    // A pity hit is worth a stronger reward sting.
    if (results.some((r) => r.pity || r.grade === 'UR')) {
      AudioManager.get(this).playSfx(AudioKeys.Reward, 0.7);
    }

    // Re-render the tab so the pity counter/bar + owned count reflect the pulls.
    this.time.delayedCall(count * 70 + 320, () => {
      if (this.tab === 'recruit') this.render();
    });
    this.shardsText.setText(tr('recruit.shards', { shards: store.shards() }));
  }

  private openFormation(): void {
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Formation, { returnTo: SceneKeys.Heroes }));
  }

  private close(): void {
    Menu.fadeTo(this, () => this.scene.start(this.returnTo));
  }
}
