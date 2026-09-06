import Phaser from 'phaser';
import { CANVAS, PALETTE, RESOURCE_ORDER } from '../config/GameConfig';
import { AudioKeys, HERO_TEXTURE_BY_ID } from '../config/AssetKeys';
import {
  HERO_ROLES,
  heroDef,
  heroLevelUpCost,
  heroMultiplierAt,
  heroesInRole,
  type HeroId,
  type HeroRole,
} from '../config/HeroConfig';
import type { ResourceCost, ResourceKind } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import type { HeroDenyReason } from '../systems/HeroSystem';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from './Menu';
import { textStyle } from './UiText';

/** Per-hero row widgets that need live updates. */
interface HeroRow {
  hero: HeroId;
  portrait: Phaser.GameObjects.Image;
  statusLabel: Phaser.GameObjects.Text;
  recruitButton: MenuButton;
  levelButton: MenuButton;
  starButton: MenuButton;
  activeButton: MenuButton;
}

/**
 * HeroPanel - the hero recruitment / roster interface, following the
 * {@link TrainingPanel} / {@link ResearchPanel} pattern (container overlay,
 * Menu.panel/button, dim backdrop, per-frame refresh()).
 *
 * It lists every hero grouped by role (War / Economy) with a portrait, level +
 * star readout, and buttons to Recruit, Level Up, Star Up (spends shards), and
 * Set Active. A locked reason is shown with a DISTINCT translated message when
 * an action is unavailable (not enough resources, already recruited, not enough
 * shards, max level). A banner at the top shows the active hero and the exact
 * bonus it currently grants.
 *
 * All state lives in the shared {@link GameState}'s {@link HeroSystem}, so the
 * active hero's bonus (wired into combat + economy) stays in one place.
 */
export class HeroPanel {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: HeroRow[] = [];
  private activeText!: Phaser.GameObjects.Text;
  private _visible = false;

  constructor(scene: Phaser.Scene, state: GameState) {
    this.scene = scene;
    this.state = state;
    this.root = scene.add.container(0, 0).setDepth(50).setVisible(false);
    this.build();
  }

  get visible(): boolean {
    return this._visible;
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this.root.setVisible(visible);
    if (visible) this.refresh();
  }

  toggle(): void {
    this.setVisible(!this._visible);
  }

  private build(): void {
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const panelW = 780;
    const panelH = 520;

    const backdrop = this.scene.add
      .rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setInteractive();
    backdrop.on(Phaser.Input.Events.POINTER_DOWN, () => this.setVisible(false));
    this.root.add(backdrop);

    const panel = Menu.panel(this.scene, cx, cy, panelW, panelH);
    panel.setInteractive();
    this.root.add(panel);

    this.root.add(Menu.title(this.scene, cx, cy - panelH / 2 + 28, tr('hero.title'), 28));

    // Active-hero readout just under the title.
    this.activeText = this.scene.add
      .text(cx, cy - panelH / 2 + 54, '', textStyle(14, { color: PALETTE.SUCCESS_CSS, align: 'center' }))
      .setOrigin(0.5);
    this.root.add(this.activeText);

    // Two columns, one per role.
    const colW = panelW / 2;
    const top = cy - panelH / 2 + 82;
    HERO_ROLES.forEach((role, i) => {
      const colX = cx - panelW / 2 + colW * i + 24;
      this.buildRoleColumn(role, colX, top, colW - 48);
    });

    const close = Menu.button(this.scene, cx, cy + panelH / 2 - 26, tr('common.close'), () => this.setVisible(false), {
      width: 180,
    });
    this.root.add(close.container);
  }

  private buildRoleColumn(role: HeroRole, x: number, y: number, width: number): void {
    const header = this.scene.add
      .text(x, y, tr(`hero.role.${role}`), textStyle(18, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0, 0);
    this.root.add(header);

    let rowY = y + 30;
    const rowStep = 150;
    for (const hero of heroesInRole(role)) {
      this.buildHeroRow(hero, x, rowY, width);
      rowY += rowStep;
    }
  }

  private buildHeroRow(hero: HeroId, x: number, y: number, width: number): void {
    const portrait = this.scene.add.image(x + 20, y + 20, HERO_TEXTURE_BY_ID[hero]).setOrigin(0.5).setScale(1.2);
    this.root.add(portrait);

    const name = this.scene.add
      .text(x + 44, y, tr(`hero.${hero}`), textStyle(15, { fontStyle: 'bold' }))
      .setOrigin(0, 0);
    this.root.add(name);

    const desc = this.scene.add
      .text(x + 44, y + 18, tr(`hero.${hero}.desc`), textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: width - 60 } }))
      .setOrigin(0, 0);
    this.root.add(desc);

    const statusLabel = this.scene.add
      .text(x, y + 46, '', textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: width - 8 } }))
      .setOrigin(0, 0);
    this.root.add(statusLabel);

    // Action buttons row.
    const btnY = y + 90;
    const recruitButton = Menu.button(this.scene, x + 60, btnY, tr('hero.recruit'), () => this.recruit(hero), {
      width: 112,
      height: 30,
      fontSize: 12,
    });
    const levelButton = Menu.button(this.scene, x + 176, btnY, tr('hero.levelUp'), () => this.levelUp(hero), {
      width: 108,
      height: 30,
      fontSize: 12,
    });
    const starButton = Menu.button(this.scene, x + 60, btnY + 34, tr('hero.starUp'), () => this.starUp(hero), {
      width: 112,
      height: 30,
      fontSize: 12,
    });
    const activeButton = Menu.button(this.scene, x + 176, btnY + 34, tr('hero.setActive'), () => this.setActive(hero), {
      width: 108,
      height: 30,
      fontSize: 12,
    });
    this.root.add(recruitButton.container);
    this.root.add(levelButton.container);
    this.root.add(starButton.container);
    this.root.add(activeButton.container);

    this.rows.push({ hero, portrait, statusLabel, recruitButton, levelButton, starButton, activeButton });
  }

  private costString(cost: ResourceCost): string {
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  private recruit(hero: HeroId): void {
    const result = this.state.heroes.recruit(hero, this.state.resources);
    this.afterAction(result.ok);
  }

  private levelUp(hero: HeroId): void {
    const result = this.state.heroes.levelUp(hero, this.state.resources);
    this.afterAction(result.ok);
  }

  private starUp(hero: HeroId): void {
    const result = this.state.heroes.starUp(hero);
    this.afterAction(result.ok);
  }

  private setActive(hero: HeroId): void {
    // Toggle: clicking the already-active hero clears the assignment.
    const already = this.state.heroes.activeHero === hero;
    this.state.heroes.setActive(already ? null : hero);
    this.afterAction(true);
  }

  private afterAction(ok: boolean): void {
    if (ok) {
      AudioManager.get(this.scene).playSfx(AudioKeys.UiClick, 0.7);
      this.state.save(Date.now());
    }
    this.refresh();
  }

  /** Translate a deny reason to a distinct, human message. */
  private reasonText(reason: HeroDenyReason | undefined): string {
    switch (reason) {
      case 'already':
        return tr('hero.locked.already');
      case 'cost':
        return tr('hero.locked.cost');
      case 'shards':
        return tr('hero.locked.shards');
      case 'maxLevel':
        return tr('hero.locked.maxLevel');
      case 'notRecruited':
        return tr('hero.locked.notRecruited');
      default:
        return '';
    }
  }

  refresh(): void {
    if (!this._visible) return;
    const heroes = this.state.heroes;
    const store = this.state.resources;

    // Active-hero banner with the exact bonus it grants.
    const active = heroes.activeHero;
    if (active) {
      const p = heroes.progress(active)!;
      const def = heroDef(active);
      const mult = heroMultiplierAt(active, p.level, p.stars);
      const pct = Math.round((mult - 1) * 100);
      const domain = def.role === 'war' ? tr('hero.bonus.combat') : tr('hero.bonus.economy');
      this.activeText.setText(tr('hero.activeBonus', { name: tr(`hero.${active}`), domain, pct }));
    } else {
      this.activeText.setText(tr('hero.noneActive'));
    }

    for (const row of this.rows) {
      const hero = row.hero;
      const def = heroDef(hero);
      const recruited = heroes.isRecruited(hero);

      if (!recruited) {
        // Not recruited: only the recruit button is meaningful.
        row.portrait.setAlpha(0.5);
        const check = heroes.canRecruit(hero, store);
        row.recruitButton.setEnabled(check.ok);
        row.recruitButton.setText(tr('hero.recruit'));
        row.levelButton.setEnabled(false);
        row.starButton.setEnabled(false);
        row.activeButton.setEnabled(false);
        row.activeButton.setText(tr('hero.setActive'));
        const cost = tr('hero.recruitCost', { cost: this.costString(def.recruitCost) });
        row.statusLabel
          .setText(check.ok ? cost : `${cost}\n${this.reasonText(check.reason)}`)
          .setColor(check.ok ? PALETTE.MUTED_CSS : PALETTE.DANGER_CSS);
        continue;
      }

      // Recruited: show level/stars + level-up and star-up controls.
      row.portrait.setAlpha(1);
      const p = heroes.progress(hero)!;
      const stars = `${'\u2605'.repeat(p.stars)}${'\u2606'.repeat(def.starMax - p.stars)}`;
      const levelLine = tr('hero.levelStars', { level: p.level, max: def.maxLevel, stars });
      const shardLine = tr('hero.shards', { shards: p.shards, per: def.shardsPerStar });
      row.statusLabel.setText(`${levelLine}\n${shardLine}`).setColor(PALETTE.ACCENT_CSS);

      row.recruitButton.setEnabled(false);
      row.recruitButton.setText(tr('hero.recruited'));

      // Level up.
      const lvlCheck = heroes.canLevelUp(hero, store);
      if (p.level >= def.maxLevel) {
        row.levelButton.setEnabled(false);
        row.levelButton.setText(tr('hero.maxLevel'));
      } else {
        row.levelButton.setEnabled(lvlCheck.ok);
        row.levelButton.setText(tr('hero.levelUpCost', { cost: this.costString(heroLevelUpCost(hero, p.level)) }));
      }

      // Star up.
      const starCheck = heroes.canStarUp(hero);
      if (p.stars >= def.starMax) {
        row.starButton.setEnabled(false);
        row.starButton.setText(tr('hero.maxStars'));
      } else {
        row.starButton.setEnabled(starCheck.ok);
        row.starButton.setText(tr('hero.starUpCost', { shards: def.shardsPerStar }));
      }

      // Set active (toggle label reflects current active hero).
      const isActive = heroes.activeHero === hero;
      row.activeButton.setEnabled(true);
      row.activeButton.setText(isActive ? tr('hero.active') : tr('hero.setActive'));
    }
  }

  update(): void {
    if (this._visible) this.refresh();
  }

  destroy(): void {
    this.root.destroy();
  }
}
