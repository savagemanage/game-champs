import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RESOURCE_ORDER } from '../config/GameConfig';
import { TextureKeys, AudioKeys, BUILDING_TEXTURE_BY_KIND, RESOURCE_ICON_FRAME } from '../config/AssetKeys';
import { BUILDING_ORDER, buildingDef, isProducer } from '../config/BuildingConfig';
import type { BuildingKind, ResourceKind } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import { Menu, type MenuButton, type ProgressBar } from '../ui/Menu';
import { TrainingPanel } from '../ui/TrainingPanel';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';

/**
 * Format a NET offline resource delta for the "while away" banner. The amount
 * can be negative (the Furnace burned more fuel than was produced), so a
 * positive value is prefixed with '+' and a negative one keeps its '-', making
 * the honest net change unambiguous. Magnitude is floored so tiny fractional
 * drift renders as 0 rather than noise.
 */
function signed(value: number): string {
  const whole = value < 0 ? Math.ceil(value) : Math.floor(value);
  return whole > 0 ? `+${whole}` : String(whole);
}

/** Fixed layout position for each building sprite on the town map. */
const BUILDING_LAYOUT: Record<BuildingKind, { x: number; y: number; scale: number }> = {
  furnace: { x: 480, y: 250, scale: 2.0 },
  hunters_hut: { x: 250, y: 300, scale: 1.8 },
  sawmill: { x: 700, y: 300, scale: 1.8 },
  coal_pit: { x: 170, y: 400, scale: 1.8 },
  iron_mine: { x: 790, y: 400, scale: 1.8 },
  war_camp: { x: 480, y: 420, scale: 1.9 },
};

/** Per-resource live widgets in the top bar. */
interface ResourceWidget {
  res: ResourceKind;
  amount: Phaser.GameObjects.Text;
  rate: Phaser.GameObjects.Text;
}

/** Per-building interactive marker + its overhead level badge. */
interface BuildingMarker {
  kind: BuildingKind;
  sprite: Phaser.GameObjects.Image;
  levelBadge: Phaser.GameObjects.Text;
}

/** Live warmth readout widgets in the HUD. */
interface WarmthWidgets {
  bar: ProgressBar;
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

/**
 * TownScene - the main idle screen.
 *
 * Draws the town backdrop and each building sprite at its map position, a top
 * resource bar (food/wood/coal/iron with icons) that updates every frame from
 * the shared {@link GameState}'s ResourceStore, and ticks idle production live
 * through GameState.tick(delta). Clicking a building opens an upgrade panel
 * showing its current level, next-level cost, upgrade time and an Upgrade
 * button (disabled + greyed when unaffordable or the Furnace prerequisite is
 * unmet) plus an in-progress timer/progress bar while an upgrade builds. A War
 * Camp button opens the {@link TrainingPanel}; a Battle button routes to the
 * BattleScene; a Settings button opens SettingsScene.
 *
 * All state lives in the single GameState instance, so the training panel, the
 * upgrade flow, and (later) the battle all read/write the same simulation.
 */
export class TownScene extends Phaser.Scene {
  private state!: GameState;
  private audio!: AudioManager;

  private resourceWidgets: ResourceWidget[] = [];
  private markers: BuildingMarker[] = [];
  private warmthWidgets!: WarmthWidgets;

  private trainingPanel!: TrainingPanel;

  // Upgrade panel widgets (rebuilt per selected building).
  private upgradePanel!: Phaser.GameObjects.Container;
  private selected: BuildingKind | null = null;
  private upgradeTitle!: Phaser.GameObjects.Text;
  private upgradeLevel!: Phaser.GameObjects.Text;
  private upgradeDesc!: Phaser.GameObjects.Text;
  private upgradeOutput!: Phaser.GameObjects.Text;
  private upgradeCostLabel!: Phaser.GameObjects.Text;
  private upgradeStatus!: Phaser.GameObjects.Text;
  private upgradeButton!: MenuButton;
  private upgradeProgress!: ProgressBar;

  constructor() {
    super({ key: SceneKeys.Town });
  }

  create(): void {
    this.state = GameState.get();
    this.audio = AudioManager.get(this);

    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Backdrop.
    this.add.image(CANVAS.WIDTH / 2, CANVAS.HEIGHT / 2, TextureKeys.BgTown).setDisplaySize(CANVAS.WIDTH, CANVAS.HEIGHT);

    this.buildBuildings();
    this.buildTopBar();
    this.buildWarmthBar();
    this.buildBottomBar();
    this.buildUpgradePanel();

    this.trainingPanel = new TrainingPanel(this, this.state);

    // Keyboard shortcuts.
    this.input.keyboard?.on('keydown-B', () => this.goBattle());
    this.input.keyboard?.on('keydown-S', () => this.openSettings());
    this.input.keyboard?.on('keydown-ESC', () => this.closeUpgradePanel());

    this.audio.playMusic(AudioKeys.MusicLoop);

    // Surface offline gains once, if any were credited on load; on a brand-new
    // hold, show a one-time onboarding hint instead.
    if (this.state.loaded) {
      this.maybeShowOfflineGains();
    } else {
      this.showOnboarding();
    }

    // Persist on leaving the tab / closing.
    this.game.events.on(Phaser.Core.Events.BLUR, this.saveNow, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.saveNow, this);
      this.saveNow();
    });
  }

  update(_time: number, delta: number): void {
    const now = Date.now();
    // Advance the shared simulation: idle production + building/training timers.
    const done = this.state.tick(now, delta);
    if (done.buildingsDone.length > 0) {
      this.audio.playSfx(AudioKeys.BuildComplete, 0.6);
    }

    this.refreshResourceBar();
    this.refreshWarmthBar();
    this.refreshBuildingBadges();
    this.refreshUpgradePanel(now);
    this.trainingPanel.update();
  }

  // ---- Buildings -----------------------------------------------------------

  private buildBuildings(): void {
    for (const kind of BUILDING_ORDER) {
      const layout = BUILDING_LAYOUT[kind];
      const tex = BUILDING_TEXTURE_BY_KIND[kind];
      const sprite = this.add
        .image(layout.x, layout.y, tex, 0)
        .setScale(layout.scale)
        .setInteractive({ useHandCursor: true });
      sprite.on(Phaser.Input.Events.POINTER_OVER, () => sprite.setTint(0xfff0c0));
      sprite.on(Phaser.Input.Events.POINTER_OUT, () => sprite.clearTint());
      sprite.on(Phaser.Input.Events.POINTER_DOWN, () => this.selectBuilding(kind));

      const levelBadge = this.add
        .text(layout.x, layout.y - 34 * layout.scale * 0.5 - 10, '', textStyle(13, { color: PALETTE.ACCENT_CSS, fontStyle: 'bold' }))
        .setOrigin(0.5);

      this.markers.push({ kind, sprite, levelBadge });
    }
  }

  private refreshBuildingBadges(): void {
    for (const marker of this.markers) {
      const level = this.state.buildings.level(marker.kind);
      const upgrading = this.state.buildings.isUpgrading(marker.kind);
      // Building sprites show their upgraded-tier frame once past level 1.
      const frame = level >= 2 ? 1 : 0;
      if (marker.sprite.frame.name !== String(frame)) marker.sprite.setFrame(frame);
      if (level <= 0) {
        marker.levelBadge.setText(tr('town.locked')).setColor(PALETTE.MUTED_CSS);
        marker.sprite.setAlpha(0.5);
      } else {
        marker.levelBadge.setText(tr('building.level', { level })).setColor(upgrading ? PALETTE.SUCCESS_CSS : PALETTE.ACCENT_CSS);
        marker.sprite.setAlpha(1);
      }
    }
  }

  // ---- Top resource bar ----------------------------------------------------

  private buildTopBar(): void {
    const bar = this.add.rectangle(0, 0, CANVAS.WIDTH, 44, PALETTE.PANEL, 0.92).setOrigin(0, 0);
    bar.setStrokeStyle(2, PALETTE.STONE_DARK);

    const slotW = CANVAS.WIDTH / RESOURCE_ORDER.length;
    RESOURCE_ORDER.forEach((res, i) => {
      const x = slotW * i + 20;
      this.add.image(x, 22, TextureKeys.ResourceIcons, RESOURCE_ICON_FRAME[res]).setOrigin(0.5).setScale(1.4);
      const amount = this.add.text(x + 20, 10, '0', textStyle(18, { fontStyle: 'bold' })).setOrigin(0, 0);
      const rate = this.add.text(x + 20, 28, '', textStyle(11, { color: PALETTE.SUCCESS_CSS })).setOrigin(0, 0);
      this.resourceWidgets.push({ res, amount, rate });
    });

    Menu.label(this, CANVAS.WIDTH / 2, 84, tr('town.hint'), 12, 0.55).setColor(PALETTE.MUTED_CSS);
  }

  // ---- Warmth HUD ----------------------------------------------------------

  /**
   * A live warmth strip below the resource bar: an ember-coloured progress bar
   * fed each frame from GameState.warmth, its current/max readout, a production
   * -efficiency percentage, and a FREEZING warning when warmth runs low.
   */
  private buildWarmthBar(): void {
    const barW = 240;
    const barX = CANVAS.WIDTH / 2 - barW / 2;
    const barY = 60;

    const label = this.add
      .text(barX - 8, barY, tr('warmth.label'), textStyle(13, { fontStyle: 'bold', color: PALETTE.EMBER_CSS }))
      .setOrigin(1, 0.5);
    const bar = Menu.progressBar(this, barX, barY, barW, 12, PALETTE.EMBER);
    const value = this.add.text(barX + barW + 12, barY, '', textStyle(12, { color: PALETTE.FROST_CSS })).setOrigin(0, 0.5);
    const status = this.add.text(CANVAS.WIDTH / 2, barY + 16, '', textStyle(12, { fontStyle: 'bold' })).setOrigin(0.5);

    this.warmthWidgets = { bar, label, value, status };
  }

  private refreshWarmthBar(): void {
    const furnaceLevel = this.state.buildings.furnaceLevel;
    const warmth = this.state.warmth;
    const current = warmth.warmth;
    const max = warmth.maxWarmth(furnaceLevel);
    const ratio = warmth.warmthRatio(furnaceLevel);
    const pct = Math.round(warmth.productionMultiplier(furnaceLevel) * 100);

    const w = this.warmthWidgets;
    w.bar.setProgress(ratio);
    // Fill drifts from warm ember to biting frost-blue as warmth drops.
    w.bar.setFillColor(ratio <= 0.25 ? PALETTE.DANGER : ratio <= 0.5 ? PALETTE.ICE : PALETTE.EMBER);
    w.value.setText(tr('warmth.value', { warmth: Math.floor(current), max: Math.floor(max) }));

    if (ratio <= 0.25) {
      w.status.setText(tr('warmth.freezing')).setColor(PALETTE.DANGER_CSS).setVisible(true);
    } else {
      w.status.setText(tr('warmth.output', { pct })).setColor(pct >= 100 ? PALETTE.SUCCESS_CSS : PALETTE.MUTED_CSS).setVisible(true);
    }
  }

  private refreshResourceBar(): void {
    const rates = this.state.buildings.productionRates();
    for (const w of this.resourceWidgets) {
      w.amount.setText(String(Math.floor(this.state.resources.get(w.res))));
      const rate = rates[w.res];
      w.rate.setText(rate > 0 ? tr('resource.perSecond', { amount: rate.toFixed(1) }) : '');
    }
  }

  // ---- Bottom action bar ---------------------------------------------------

  private buildBottomBar(): void {
    const y = CANVAS.HEIGHT - 30;
    Menu.button(this, 120, y, tr('town.training'), () => this.openTraining(), { width: 180 });
    Menu.button(this, CANVAS.WIDTH / 2, y, tr('town.battle'), () => this.goBattle(), { width: 180, accent: PALETTE.DANGER });
    Menu.button(this, CANVAS.WIDTH - 120, y, tr('town.settings'), () => this.openSettings(), { width: 180 });
  }

  // ---- Upgrade panel -------------------------------------------------------

  private buildUpgradePanel(): void {
    const w = 300;
    const h = 300;
    const x = CANVAS.WIDTH - w / 2 - 20;
    const y = CANVAS.HEIGHT / 2 - 10;
    this.upgradePanel = this.add.container(0, 0).setDepth(30).setVisible(false);

    const panel = Menu.panel(this, x, y, w, h);
    panel.setInteractive();
    this.upgradePanel.add(panel);

    const left = x - w / 2 + 20;
    this.upgradeTitle = this.add.text(x, y - h / 2 + 22, '', textStyle(22, { fontStyle: 'bold' })).setOrigin(0.5);
    this.upgradeLevel = this.add.text(x, y - h / 2 + 48, '', textStyle(15, { color: PALETTE.ACCENT_CSS })).setOrigin(0.5);
    this.upgradeDesc = this.add
      .text(left, y - h / 2 + 74, '', textStyle(12, { color: PALETTE.MUTED_CSS, wordWrap: { width: w - 40 } }))
      .setOrigin(0, 0);
    this.upgradeOutput = this.add.text(left, y - 30, '', textStyle(13, { color: PALETTE.SUCCESS_CSS })).setOrigin(0, 0);
    this.upgradeCostLabel = this.add
      .text(left, y - 8, '', textStyle(13, { color: PALETTE.TEXT_CSS, wordWrap: { width: w - 40 } }))
      .setOrigin(0, 0);
    this.upgradeStatus = this.add.text(x, y + 44, '', textStyle(12, { color: PALETTE.DANGER_CSS })).setOrigin(0.5);

    this.upgradeProgress = Menu.progressBar(this, left, y + 66, w - 44, 12, PALETTE.SUCCESS);
    this.upgradeProgress.container.setVisible(false);

    this.upgradeButton = Menu.button(this, x, y + h / 2 - 54, tr('building.upgrade'), () => this.doUpgrade(), {
      width: w - 60,
    });
    const close = Menu.button(this, x, y + h / 2 - 20, tr('common.close'), () => this.closeUpgradePanel(), {
      width: w - 60,
      fontSize: 15,
    });

    this.upgradePanel.add([
      this.upgradeTitle,
      this.upgradeLevel,
      this.upgradeDesc,
      this.upgradeOutput,
      this.upgradeCostLabel,
      this.upgradeStatus,
      this.upgradeProgress.container,
      this.upgradeButton.container,
      close.container,
    ]);
  }

  private selectBuilding(kind: BuildingKind): void {
    this.selected = kind;
    this.upgradePanel.setVisible(true);
    this.upgradeTitle.setText(tr(`building.${kind}`));
    this.upgradeDesc.setText(tr(`building.${kind}.desc`));
    this.refreshUpgradePanel(Date.now());
  }

  private closeUpgradePanel(): void {
    this.selected = null;
    this.upgradePanel.setVisible(false);
  }

  private refreshUpgradePanel(now: number): void {
    if (!this.selected || !this.upgradePanel.visible) return;
    const kind = this.selected;
    const buildings = this.state.buildings;
    const level = buildings.level(kind);
    const def = buildingDef(kind);

    this.upgradeLevel.setText(level > 0 ? tr('building.level', { level }) : tr('town.locked'));

    // Producer output at current level; the Furnace instead shows its warmth
    // reserve and per-second fuel burn (its defining role).
    if (isProducer(kind) && level > 0) {
      this.upgradeOutput.setText(tr('building.output', { amount: buildings.outputOf(def.produces!).toFixed(1) }));
    } else if (kind === 'furnace' && level > 0) {
      const warmth = this.state.warmth;
      const burn = warmth.fuelPerSecond(level);
      this.upgradeOutput.setColor(PALETTE.EMBER_CSS).setText(
        `${tr('warmth.furnaceInfo', {
          warmth: Math.floor(warmth.warmth),
          max: Math.floor(warmth.maxWarmth(level)),
        })}\n${tr('warmth.fuelBurn', { wood: burn.wood.toFixed(2), coal: burn.coal.toFixed(2) })}`,
      );
    } else {
      this.upgradeOutput.setColor(PALETTE.SUCCESS_CSS).setText('');
    }

    const upgrading = buildings.isUpgrading(kind);
    if (upgrading) {
      const endsAt = buildings.upgradeEndsAt(kind) ?? now;
      const total = buildings.nextUpgradeTimeMs(kind); // not exact if mid-build, but a stable denominator
      const remainingMs = Math.max(0, endsAt - now);
      const seconds = Math.ceil(remainingMs / 1000);
      this.upgradeProgress.container.setVisible(true);
      this.upgradeProgress.setProgress(total > 0 ? 1 - remainingMs / total : 1);
      this.upgradeStatus.setText(tr('building.upgrading', { seconds })).setColor(PALETTE.SUCCESS_CSS);
      this.upgradeCostLabel.setText('');
      this.upgradeButton.setText(tr('building.upgrading', { seconds }));
      this.upgradeButton.setEnabled(false);
      return;
    }

    this.upgradeProgress.container.setVisible(false);

    if (level >= def.maxLevel) {
      this.upgradeCostLabel.setText('');
      this.upgradeStatus.setText(tr('building.maxLevel')).setColor(PALETTE.ACCENT_CSS);
      this.upgradeButton.setText(tr('building.maxLevel'));
      this.upgradeButton.setEnabled(false);
      return;
    }

    // Next-level cost + time.
    const cost = buildings.nextUpgradeCost(kind);
    const timeSec = Math.round(buildings.nextUpgradeTimeMs(kind) / 1000);
    this.upgradeCostLabel.setText(`${this.costString(cost)}\n${tr('tooltip.time', { seconds: timeSec })}`);
    this.upgradeButton.setText(tr('building.upgradeTo', { level: level + 1 }));

    const check = buildings.canUpgrade(kind, this.state.resources);
    if (check.ok) {
      this.upgradeStatus.setText('');
      this.upgradeButton.setEnabled(true);
    } else {
      this.upgradeButton.setEnabled(false);
      if (check.reason === 'prereq') {
        this.upgradeStatus.setText(tr('building.lockedByFurnace', { level: def.requiresFurnaceLevel }));
      } else if (check.reason === 'cost') {
        this.upgradeStatus.setText(tr('building.insufficient'));
      } else {
        this.upgradeStatus.setText('');
      }
    }
  }

  private doUpgrade(): void {
    if (!this.selected) return;
    const now = Date.now();
    const result = this.state.buildings.startUpgrade(this.selected, this.state.resources, now);
    if (result.ok) {
      this.audio.playSfx(AudioKeys.UiClick, 0.7);
      this.state.save(now);
    }
    this.refreshUpgradePanel(now);
  }

  private costString(cost: Partial<Record<ResourceKind, number>>): string {
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  // ---- Navigation ----------------------------------------------------------

  private openTraining(): void {
    this.closeUpgradePanel();
    this.trainingPanel.toggle();
  }

  private goBattle(): void {
    this.saveNow();
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Battle));
  }

  private openSettings(): void {
    this.saveNow();
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Settings, { returnTo: SceneKeys.Town }));
  }

  private saveNow(): void {
    this.state.save(Date.now());
  }

  /**
   * First-run onboarding: a dismissible centred card explaining the core loop
   * (gather -> upgrade -> train -> battle). Only shown for a brand-new hold
   * (no save was loaded), so returning players are never nagged.
   */
  private showOnboarding(): void {
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const w = 560;
    const h = 220;

    const overlay = this.add.rectangle(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.5).setOrigin(0, 0).setDepth(70).setInteractive();
    const card = this.add.container(0, 0).setDepth(71);

    const panel = Menu.panel(this, cx, cy, w, h);
    const title = Menu.title(this, cx, cy - h / 2 + 30, tr('brand.name'), 30).setColor(PALETTE.ACCENT_CSS);
    const body = this.add
      .text(cx, cy - 6, tr('town.onboarding'), textStyle(15, { align: 'center', color: PALETTE.TEXT_CSS, wordWrap: { width: w - 60 } }))
      .setOrigin(0.5)
      .setLineSpacing(6);

    const dismiss = (): void => {
      this.tweens.add({
        targets: [overlay, card],
        alpha: 0,
        duration: 250,
        onComplete: () => {
          overlay.destroy();
          card.destroy();
        },
      });
    };
    const ok = Menu.button(this, cx, cy + h / 2 - 34, tr('town.onboardingDismiss'), dismiss, { width: 200 });

    card.add([panel, title, body, ok.container]);
    // A gentle entrance so it reads as an intentional, polished welcome.
    card.setAlpha(0);
    overlay.setAlpha(0);
    this.tweens.add({ targets: [overlay, card], alpha: 1, duration: 300, ease: 'Sine.easeOut' });
  }

  private maybeShowOfflineGains(): void {
    if (!this.state.loaded || this.state.offlineSeconds <= 1) return;
    const g = this.state.offlineGains;
    // offlineGains is a NET bundle: production minus furnace fuel burn, so
    // wood/coal can be negative. Suppress only a truly negligible window - use
    // the summed MAGNITUDE of the net change so a meaningful net loss (e.g. the
    // Furnace outburned production) still surfaces, not just net gains.
    const magnitude = Math.abs(g.food) + Math.abs(g.wood) + Math.abs(g.coal) + Math.abs(g.iron);
    if (magnitude < 1) return;
    const banner = this.add
      .text(
        CANVAS.WIDTH / 2,
        90,
        tr('save.offlineGains', {
          food: signed(g.food),
          wood: signed(g.wood),
          coal: signed(g.coal),
          iron: signed(g.iron),
        }),
        textStyle(13, { color: PALETTE.ACCENT_CSS, backgroundColor: PALETTE.PANEL_CSS, padding: { x: 8, y: 6 }, wordWrap: { width: 600 }, align: 'center' }),
      )
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({ targets: banner, alpha: 0, delay: 4500, duration: 800, onComplete: () => banner.destroy() });
  }
}
