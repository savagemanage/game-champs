import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, BUILDING_ORDER, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingId, ResourceKind } from '../types';
import {
  TextureKeys,
  AudioKeys,
  BUILDING_ICON_FRAME,
  RESOURCE_ICON_FRAME,
  NAV_ICON_FRAME,
  type NavIconName,
} from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { GameStore } from '../systems/GameStore';
import { tr } from '../i18n/i18n';
import type { TrKey } from '../i18n/strings';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/** A single bottom-nav tab definition: its icon, label, and target scene key. */
interface NavTab {
  icon: NavIconName;
  labelKey: TrKey;
  scene: string;
}

/**
 * HomeScene - the base-hub landing screen shown after the Title. It renders the
 * player's survival base (a grid of building plots keyed off the economy state)
 * with a resource readout, and a PERSISTENT bottom-navigation bar that reaches
 * every top-level system: Base management, the Heroes roster, the Campaign, the
 * Missions/Season meta, and the Falcon Rescue mini-game (the gate-runner).
 *
 * All game math stays in the tested pure systems; HomeScene only reads the
 * GameStore and renders. On entry it runs the store's economy tick (offline
 * production + upgrade resolution) and refreshes the daily/weekly missions so a
 * returning player's offline progress is applied before anything is shown.
 *
 * The meta scenes behind the nav (Base/Heroes/Campaign/Missions/Season) are
 * built in FEAT-006/007; HomeScene guards each hop with a scene-existence check
 * (navTo) so tapping a not-yet-registered tab is a safe no-op that shows a
 * "coming soon" toast rather than crashing. The Falcon Rescue tab always works:
 * it launches the existing RunScene.
 */
export class HomeScene extends Phaser.Scene {
  /** The persistent bottom-nav tabs, left to right. */
  private static readonly TABS: readonly NavTab[] = [
    { icon: 'base', labelKey: 'nav.base', scene: SceneKeys.Base },
    { icon: 'heroes', labelKey: 'nav.heroes', scene: SceneKeys.Heroes },
    { icon: 'campaign', labelKey: 'nav.campaign', scene: SceneKeys.Campaign },
    { icon: 'missions', labelKey: 'nav.missions', scene: SceneKeys.Missions },
    { icon: 'season', labelKey: 'nav.season', scene: SceneKeys.Season },
    { icon: 'falcon', labelKey: 'nav.falcon', scene: SceneKeys.Run },
  ];

  private toast: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SceneKeys.Home });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Apply offline progress BEFORE rendering: resolve finished upgrades +
    // accrue offline production, then roll daily/weekly missions to real time.
    const store = GameStore.get();
    const now = Date.now();
    const ticked = store.tick(now);
    store.refreshMissions(now);

    // Keep the music bed going across scenes.
    AudioManager.get(this).playMusic();

    // Backdrop: static skyline over a dim road strip (the base sits on it).
    this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setAlpha(0.7);
    this.add
      .tileSprite(cx, CANVAS.HEIGHT * 0.62, CANVAS.WIDTH, CANVAS.HEIGHT * 0.62, TextureKeys.BgRoad)
      .setOrigin(0.5, 1)
      .setAlpha(0.35);

    // Header.
    Menu.title(this, cx, CANVAS.HEIGHT * 0.07, tr('home.title'), 34).setColor(PALETTE.SQUAD_CSS);
    Menu.label(this, cx, CANVAS.HEIGHT * 0.07 + 32, tr('home.welcome'), 13, 0.75);

    this.buildResourceBar(store);
    this.buildBasePlots(store);
    this.buildBottomNav();

    // A cog to reach Settings without occupying a nav tab.
    Menu.button(this, CANVAS.WIDTH - 44, CANVAS.HEIGHT * 0.07, tr('title.settings'), () => this.navTo(SceneKeys.Settings), {
      width: 72,
      fontSize: 12,
    });

    // Surface offline construction completions as a toast.
    if (ticked.completed.length > 0) {
      this.showToast(tr('home.buildComplete'));
      AudioManager.get(this).playSfx(AudioKeys.UpgradeComplete, 0.7);
    }
  }

  /** Top resource strip: one icon + amount per resource in RESOURCE_ORDER. */
  private buildResourceBar(store: GameStore): void {
    const y = CANVAS.HEIGHT * 0.15;
    const cols = RESOURCE_ORDER.length;
    const cellW = CANVAS.WIDTH / cols;
    const resources = store.resources();
    const caps = store.storageCaps();

    RESOURCE_ORDER.forEach((kind: ResourceKind, i) => {
      const x = cellW * i + cellW / 2;
      this.add
        .image(x - 24, y, TextureKeys.Resources, RESOURCE_ICON_FRAME[kind])
        .setScale(1.4);
      const amount = Math.floor(resources[kind] ?? 0);
      const cap = Math.floor(caps[kind] ?? 0);
      this.add
        .text(x - 8, y, `${amount}/${cap}`, textStyle(11))
        .setOrigin(0, 0.5);
    });
  }

  /** A grid of base plots, one per building in BUILDING_ORDER. */
  private buildBasePlots(store: GameStore): void {
    const cols = 3;
    const cellW = CANVAS.WIDTH / (cols + 0.5);
    const cellH = 118;
    const startX = cellW * 0.75;
    const startY = CANVAS.HEIGHT * 0.28;

    BUILDING_ORDER.forEach((id: BuildingId, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + row * cellH;
      this.buildPlot(x, y, id, store);
    });

    Menu.label(this, CANVAS.WIDTH / 2, startY + 2 * cellH + 4, tr('nav.hint'), 11, 0.55);
  }

  /** A single building plot: framed panel, icon, localized name + level. */
  private buildPlot(x: number, y: number, id: BuildingId, store: GameStore): void {
    Menu.panel(this, x, y, cellSize().w, cellSize().h, 0.9);
    const level = store.buildingLevel(id);
    this.add.image(x, y - 16, TextureKeys.Buildings, BUILDING_ICON_FRAME[id]).setScale(2);

    const nameKey = `building.${id}` as TrKey;
    this.add.text(x, y + 22, tr(nameKey), textStyle(11, { align: 'center' })).setOrigin(0.5);

    const levelText = level > 0 ? tr('home.buildingLevel', { level }) : tr('home.plotEmpty');
    this.add
      .text(x, y + 36, levelText, textStyle(10, { color: level > 0 ? PALETTE.ACCENT_CSS : PALETTE.MUTED_CSS }))
      .setOrigin(0.5);

    // Tapping a plot opens Base management (FEAT-006). Guarded no-op until then.
    const zone = this.add
      .zone(x, y, cellSize().w, cellSize().h)
      .setInteractive({ useHandCursor: true });
    zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
      AudioManager.get(this).playSfx(AudioKeys.UiClick, 0.6);
      this.navTo(SceneKeys.Base);
    });
  }

  /** The persistent bottom navigation bar. */
  private buildBottomNav(): void {
    const barH = 92;
    const barY = CANVAS.HEIGHT - barH / 2;
    const bar = this.add
      .image(CANVAS.WIDTH / 2, barY, TextureKeys.UiTabBar)
      .setDisplaySize(CANVAS.WIDTH, barH);
    bar.setDepth(40);

    const tabs = HomeScene.TABS;
    const cellW = CANVAS.WIDTH / tabs.length;
    tabs.forEach((tab, i) => {
      const x = cellW * i + cellW / 2;
      const icon = this.add
        .image(x, barY - 14, TextureKeys.NavIcons, NAV_ICON_FRAME[tab.icon])
        .setScale(1.6)
        .setDepth(41);
      const label = this.add
        .text(x, barY + 20, tr(tab.labelKey), textStyle(10, { align: 'center' }))
        .setOrigin(0.5)
        .setDepth(41);

      const zone = this.add
        .zone(x, barY, cellW, barH)
        .setInteractive({ useHandCursor: true })
        .setDepth(42);
      const highlight = (on: boolean): void => {
        icon.setTint(on ? PALETTE.SQUAD : 0xffffff);
        label.setColor(on ? PALETTE.SQUAD_CSS : PALETTE.TEXT_CSS);
      };
      zone.on(Phaser.Input.Events.POINTER_OVER, () => highlight(true));
      zone.on(Phaser.Input.Events.POINTER_OUT, () => highlight(false));
      zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
        AudioManager.get(this).playSfx(AudioKeys.TabSwitch, 0.7);
        this.onTab(tab);
      });
    });
  }

  /** Handle a nav tab press: the Falcon tab starts the run; others navTo. */
  private onTab(tab: NavTab): void {
    if (tab.scene === SceneKeys.Run) {
      Menu.fadeTo(this, () => this.scene.start(SceneKeys.Run));
      return;
    }
    this.navTo(tab.scene);
  }

  /**
   * Navigate to a scene if it has been registered, otherwise show a friendly
   * "coming soon" toast. This keeps the shell functional before FEAT-006/007
   * register their scenes without ever attempting to start a missing scene.
   */
  private navTo(sceneKey: string): void {
    const target = this.scene.get(sceneKey);
    if (!target) {
      this.showToast(tr('home.comingSoon'));
      return;
    }
    Menu.fadeTo(this, () => this.scene.start(sceneKey, { returnTo: SceneKeys.Home }));
  }

  /** A short auto-dismissing toast near the bottom-nav. */
  private showToast(message: string): void {
    if (this.toast) {
      this.toast.destroy(true);
      this.toast = null;
    }
    const cx = CANVAS.WIDTH / 2;
    const y = CANVAS.HEIGHT * 0.82;
    const text = this.add.text(0, 0, message, textStyle(14, { align: 'center' })).setOrigin(0.5);
    const bg = Menu.panel(this, 0, 0, Math.ceil(text.width) + 40, 44, 0.95);
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
}

/** Shared plot-panel size (kept small so 6 plots fit a 3x2 grid comfortably). */
function cellSize(): { w: number; h: number } {
  return { w: 132, h: 104 };
}
