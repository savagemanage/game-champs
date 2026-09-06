import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, HEROES } from '../config/GameConfig';
import { AudioKeys, TextureKeys, HERO_PORTRAIT_FRAME } from '../config/AssetKeys';
import { HERO_IDS } from '../types';
import type { HeroId } from '../types';
import { heroDef, maxStars, shardsForStar, shardsToOwn } from '../config/HeroConfig';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import { HubScene } from './HubScene';

/** Rarity accent colour for a hero (matches the portrait ring). */
function rarityColor(id: HeroId): string {
  switch (heroDef(id).rarity) {
    case 'legendary':
      return PALETTE.SPARK_CSS;
    case 'epic':
      return PALETTE.EMBER_CSS;
    case 'rare':
      return PALETTE.ICE_CSS;
    default:
      return PALETTE.MUTED_CSS;
  }
}

/**
 * HeroScene - the hero roster + development screen. A scrollable grid of every
 * roster hero (portrait + rarity ring + level/star), a detail panel for the
 * selected hero (class, bonus, skills) with Recruit (craft from shards), Train
 * (spark->XP level up), Star Up (shards) and Set/Clear Lead actions, and a
 * shortcut to the Summon screen. All logic lives in HeroRoster / GameState.
 */
export class HeroScene extends HubScene {
  private selected: HeroId = HERO_IDS[0];
  private tiles: { id: HeroId; container: Phaser.GameObjects.Container; badge: Phaser.GameObjects.Text }[] = [];
  private detailName!: Phaser.GameObjects.Text;
  private detailInfo!: Phaser.GameObjects.Text;
  private detailBonus!: Phaser.GameObjects.Text;
  private detailStatus!: Phaser.GameObjects.Text;
  private trainButton!: MenuButton;
  private starButton!: MenuButton;
  private leadButton!: MenuButton;

  constructor() {
    super({ key: 'HeroScene' });
  }

  protected titleKey(): string {
    return 'hero.title';
  }

  protected build(): void {
    // A Summon shortcut, top-right under the currency bar.
    Menu.button(this, CANVAS.WIDTH - 90, 66, tr('summon.title'), () => this.goSummon(), { width: 150, fontSize: 14, padY: 6 });

    // Roster grid (6 columns) on the left.
    const cols = 4;
    const cellW = 96;
    const cellH = 92;
    const ox = 70;
    const oy = 120;
    HERO_IDS.forEach((id, i) => {
      const gx = ox + (i % cols) * cellW;
      const gy = oy + Math.floor(i / cols) * cellH;
      const container = this.add.container(gx, gy);
      const portrait = this.add.image(0, 0, TextureKeys.HeroPortraits, HERO_PORTRAIT_FRAME[id]).setOrigin(0.5).setScale(2);
      portrait.setInteractive({ useHandCursor: true });
      portrait.on(Phaser.Input.Events.POINTER_DOWN, () => this.select(id));
      const badge = this.add.text(0, 36, '', textStyle(11, { align: 'center' })).setOrigin(0.5);
      container.add([portrait, badge]);
      this.tiles.push({ id, container, badge });
    });

    // Detail panel on the right.
    const px = CANVAS.WIDTH - 210;
    const py = CANVAS.HEIGHT / 2 + 16;
    Menu.panel(this, px, py, 380, 340);
    this.add.image(px - 150, py - 120, TextureKeys.HeroPortraits, 0).setScale(2.4).setName('detailPortrait');
    this.detailName = this.add.text(px - 110, py - 140, '', textStyle(18, { fontStyle: 'bold', wordWrap: { width: 250 } })).setOrigin(0, 0);
    this.detailInfo = this.add.text(px - 170, py - 70, '', textStyle(13, { color: PALETTE.TEXT_CSS, wordWrap: { width: 340 }, lineSpacing: 4 })).setOrigin(0, 0);
    this.detailBonus = this.add.text(px - 170, py + 20, '', textStyle(12, { color: PALETTE.SUCCESS_CSS, wordWrap: { width: 340 } })).setOrigin(0, 0);
    this.detailStatus = this.add.text(px, py + 70, '', textStyle(12, { align: 'center', wordWrap: { width: 340 } })).setOrigin(0.5, 0);

    this.trainButton = Menu.button(this, px - 118, py + 118, tr('hero.levelUp'), () => this.doTrain(), { width: 116, fontSize: 13, padY: 8 });
    this.starButton = Menu.button(this, px, py + 118, tr('hero.starUp'), () => this.doStar(), { width: 116, fontSize: 13, padY: 8 });
    this.leadButton = Menu.button(this, px + 118, py + 118, tr('hero.setLead'), () => this.doLead(), { width: 116, fontSize: 13, padY: 8 });

    this.refreshAll();
  }

  private detailPortrait(): Phaser.GameObjects.Image {
    return this.children.getByName('detailPortrait') as Phaser.GameObjects.Image;
  }

  private select(id: HeroId): void {
    this.selected = id;
    this.audio.playSfx(AudioKeys.UiClick, 0.5);
    this.refreshDetail();
    this.refreshTiles();
  }

  private refreshAll(): void {
    this.refreshTiles();
    this.refreshDetail();
  }

  private refreshTiles(): void {
    for (const { id, container, badge } of this.tiles) {
      const owned = this.state.heroes.isOwned(id);
      const isLead = this.state.heroes.lead.includes(id);
      container.setAlpha(id === this.selected ? 1 : owned ? 0.95 : 0.5);
      const portrait = container.list[0] as Phaser.GameObjects.Image;
      portrait.setTint(id === this.selected ? 0xffffff : owned ? 0xffffff : 0x8899aa);
      if (owned) {
        const h = this.state.heroes.get(id)!;
        badge.setText(`${tr('hero.level', { level: h.level })} ${tr('hero.stars', { stars: h.stars })}${isLead ? '\n\u2605LEAD' : ''}`).setColor(isLead ? PALETTE.ACCENT_CSS : PALETTE.TEXT_CSS);
      } else {
        const shards = this.state.heroes.shards(id);
        badge.setText(shards > 0 ? tr('hero.shards', { count: shards }) : tr('hero.locked')).setColor(PALETTE.MUTED_CSS);
      }
    }
  }

  private refreshDetail(): void {
    const id = this.selected;
    const def = heroDef(id);
    this.detailPortrait().setFrame(HERO_PORTRAIT_FRAME[id]);
    this.detailName.setText(tr(`hero.${id}.name`)).setColor(rarityColor(id));

    const owned = this.state.heroes.isOwned(id);
    const info: string[] = [];
    info.push(`${tr(`rarity.${def.rarity}`)} · ${tr(`heroClass.${def.heroClass}`)}`);
    if (owned) {
      const h = this.state.heroes.get(id)!;
      info.push(`${tr('hero.level', { level: h.level })} · ${tr('hero.stars', { stars: h.stars })} / ${maxStars(id)}\u2605`);
      info.push(tr('hero.power', { power: Math.round(this.state.heroes.power(id)) }));
      info.push(tr('hero.shards', { count: h.shards }));
    } else {
      info.push(tr('hero.locked'));
      info.push(tr('hero.shards', { count: this.state.heroes.shards(id) }));
    }
    info.push(tr(`hero.${id}.desc`));
    this.detailInfo.setText(info.join('\n'));

    const bonusPct = Math.round(def.bonus.base * 100);
    this.detailBonus.setText(def.bonus.kind === 'army' ? tr('hero.bonusArmy', { pct: bonusPct }) : tr('hero.bonusEconomy', { pct: bonusPct }));

    this.detailStatus.setText('');

    // --- Buttons ---
    if (!owned) {
      const cost = shardsToOwn(id);
      this.trainButton.setText(tr('hero.craft', { shards: cost }));
      this.trainButton.setEnabled(this.state.heroes.shards(id) >= cost);
      this.starButton.setEnabled(false);
      this.starButton.setText(tr('hero.starUp'));
      this.leadButton.setEnabled(false);
      this.leadButton.setText(tr('hero.setLead'));
      return;
    }

    const h = this.state.heroes.get(id)!;
    // Train (spark -> XP level up).
    this.trainButton.setText(tr('hero.levelUp'));
    this.trainButton.setEnabled(this.state.premium.sparks >= HEROES.TRAIN_SPARK_COST);

    // Star up.
    if (h.stars >= maxStars(id)) {
      this.starButton.setText(tr('hero.maxStars'));
      this.starButton.setEnabled(false);
    } else {
      const cost = shardsForStar(id, h.stars);
      this.starButton.setText(tr('hero.starUpCost', { shards: cost }));
      this.starButton.setEnabled(h.shards >= cost);
    }

    // Lead toggle.
    const isLead = this.state.heroes.lead.includes(id);
    this.leadButton.setText(isLead ? tr('common.confirm') : tr('hero.setLead'));
    this.leadButton.setEnabled(isLead || this.state.heroes.lead.length < HEROES.MAX_LEAD);
    if (isLead) this.leadButton.label.setColor(PALETTE.ACCENT_CSS);
    else this.leadButton.label.setColor(PALETTE.TEXT_CSS);
  }

  private doTrain(): void {
    const id = this.selected;
    if (!this.state.heroes.isOwned(id)) {
      // Recruit from shards.
      if (this.state.heroes.craftFromShards(id)) {
        this.audio.playSfx(AudioKeys.Summon, 0.6);
        this.toast(tr('summon.gotHero', { name: tr(`hero.${id}.name`) }));
      }
    } else {
      const levels = this.state.trainHero(id);
      if (levels >= 0) {
        this.audio.playSfx(AudioKeys.LevelUp, 0.6);
        this.refreshCurrency();
      }
    }
    this.state.save(Date.now());
    this.refreshAll();
  }

  private doStar(): void {
    const id = this.selected;
    if (this.state.heroes.starUp(id)) {
      this.audio.playSfx(AudioKeys.LevelUp, 0.7);
      this.toast(tr('hero.starUp'));
      this.state.save(Date.now());
    }
    this.refreshAll();
  }

  private doLead(): void {
    const id = this.selected;
    const lead = this.state.heroes.lead;
    const next = lead.includes(id) ? lead.filter((h) => h !== id) : [...lead, id];
    this.state.heroes.setLead(next);
    this.audio.playSfx(AudioKeys.UiClick, 0.6);
    this.state.save(Date.now());
    this.refreshAll();
  }

  private goSummon(): void {
    this.state.save(Date.now());
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Summon));
  }
}
