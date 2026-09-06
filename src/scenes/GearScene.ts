import Phaser from 'phaser';
import { PALETTE, CANVAS, GEAR } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { GEAR_SLOT_ORDER, CHARM_KIND_ORDER } from '../types';
import type { CharmKind, GearSlot } from '../types';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr } from '../i18n/i18n';
import { HubScene } from './HubScene';

/**
 * GearScene - the chief-gear + charm screen. Lists the six gear slots down the
 * left; selecting one shows its level, socketed charm, next upgrade cost, and
 * buttons to Forge/Upgrade the piece, Socket a charm (cycling the three charm
 * kinds) and Upgrade the socketed charm. All cost/level enforcement is in the
 * pure {@link GearSystem}; this scene renders and calls its methods.
 */
export class GearScene extends HubScene {
  private selected: GearSlot = GEAR_SLOT_ORDER[0];
  private charmChoice = 0;
  private slotButtons: { slot: GearSlot; button: MenuButton }[] = [];
  private detailTitle!: Phaser.GameObjects.Text;
  private detailBody!: Phaser.GameObjects.Text;
  private detailStatus!: Phaser.GameObjects.Text;
  private upgradeButton!: MenuButton;
  private charmButton!: MenuButton;

  constructor() {
    super({ key: 'GearScene' });
  }

  protected titleKey(): string {
    return 'gear.title';
  }

  protected build(): void {
    GEAR_SLOT_ORDER.forEach((slot, i) => {
      const y = 90 + i * 52;
      const button = Menu.button(this, 150, y, tr(`gear.slot.${slot}`), () => this.select(slot), { width: 240, fontSize: 14 });
      this.slotButtons.push({ slot, button });
    });

    const px = CANVAS.WIDTH - 220;
    const py = CANVAS.HEIGHT / 2 + 8;
    Menu.panel(this, px, py, 380, 320);
    this.detailTitle = this.add.text(px, py - 140, '', textStyle(20, { fontStyle: 'bold', align: 'center', wordWrap: { width: 350 } })).setOrigin(0.5, 0);
    this.detailBody = this.add.text(px - 170, py - 96, '', textStyle(13, { color: PALETTE.TEXT_CSS, wordWrap: { width: 340 }, lineSpacing: 4 })).setOrigin(0, 0);
    this.detailStatus = this.add.text(px, py + 60, '', textStyle(12, { align: 'center', wordWrap: { width: 340 } })).setOrigin(0.5, 0);
    this.upgradeButton = Menu.button(this, px - 96, py + 118, tr('gear.upgrade'), () => this.doUpgradeGear(), { width: 180, fontSize: 15 });
    this.charmButton = Menu.button(this, px + 100, py + 118, tr('gear.socket'), () => this.doCharm(), { width: 180, fontSize: 15 });

    this.select(this.selected);
  }

  private select(slot: GearSlot): void {
    this.selected = slot;
    this.audio.playSfx(AudioKeys.UiClick, 0.5);
    this.refreshDetail();
  }

  private cycleCharm(): void {
    this.charmChoice = (this.charmChoice + 1) % CHARM_KIND_ORDER.length;
  }

  private currentCharmKind(): CharmKind {
    return CHARM_KIND_ORDER[this.charmChoice];
  }

  private refreshSlots(): void {
    for (const { slot, button } of this.slotButtons) {
      const lvl = this.state.gear.level(slot);
      const charm = this.state.gear.charm(slot);
      const suffix = lvl > 0 ? ` · ${tr('gear.level', { level: lvl })}${charm ? ' \u25C6' : ''}` : '';
      button.label.setText(tr(`gear.slot.${slot}`) + suffix);
      button.label.setColor(slot === this.selected ? PALETTE.ACCENT_CSS : PALETTE.TEXT_CSS);
    }
  }

  private refreshDetail(): void {
    this.refreshSlots();
    const slot = this.selected;
    const level = this.state.gear.level(slot);
    const charm = this.state.gear.charm(slot);
    this.detailTitle.setText(tr(`gear.slot.${slot}`));

    const lines: string[] = [];
    lines.push(level > 0 ? tr('gear.level', { level }) : tr('gear.forge'));
    if (level < GEAR.MAX_GEAR_LEVEL) {
      lines.push(`${tr('gear.upgrade')}: ${this.costString(this.state.gear.nextGearCost(slot))}`);
    } else {
      lines.push(tr('gear.maxLevel'));
    }
    if (charm) {
      lines.push(`${tr(`gear.charm.${charm.kind}`)} ${tr('gear.level', { level: charm.level })}`);
    } else {
      lines.push(tr('gear.emptySocket'));
    }
    this.detailBody.setText(lines.join('\n'));

    // Gear upgrade button.
    if (level >= GEAR.MAX_GEAR_LEVEL) {
      this.upgradeButton.setText(tr('gear.maxLevel'));
      this.upgradeButton.setEnabled(false);
    } else {
      this.upgradeButton.setText(level > 0 ? tr('gear.upgrade') : tr('gear.forge'));
      this.upgradeButton.setEnabled(this.canAfford(this.state.gear.nextGearCost(slot)));
    }

    // Charm button: socket a (cycling) charm, or upgrade the socketed one.
    if (level <= 0) {
      this.charmButton.setText(tr('gear.socket'));
      this.charmButton.setEnabled(false);
      this.detailStatus.setText(tr('gear.noCharm')).setColor(PALETTE.MUTED_CSS);
      return;
    }
    this.detailStatus.setText('');
    if (charm && charm.level < GEAR.MAX_CHARM_LEVEL) {
      const cost = this.state.gear.nextCharmCost(charm.kind, charm.level);
      this.charmButton.setText(tr('gear.upgradeCharm'));
      this.charmButton.setEnabled(this.canAfford(cost));
    } else if (charm) {
      this.charmButton.setText(tr('gear.maxLevel'));
      this.charmButton.setEnabled(false);
    } else {
      const kind = this.currentCharmKind();
      const cost = this.state.gear.nextCharmCost(kind, 0);
      this.charmButton.setText(`${tr(`gear.charm.${kind}`)} >`);
      this.charmButton.setEnabled(this.canAfford(cost));
    }
  }

  private doUpgradeGear(): void {
    const res = this.state.gear.upgradeGear(this.selected, this.state.resources);
    if (res.ok) {
      this.audio.playSfx(AudioKeys.BuildComplete, 0.5);
      this.state.save(Date.now());
    }
    this.refreshDetail();
  }

  private doCharm(): void {
    const slot = this.selected;
    const charm = this.state.gear.charm(slot);
    if (charm) {
      const res = this.state.gear.upgradeCharm(slot, this.state.resources);
      if (res.ok) this.audio.playSfx(AudioKeys.BuildComplete, 0.5);
    } else {
      const res = this.state.gear.socketCharm(slot, this.currentCharmKind(), this.state.resources);
      if (res.ok) {
        this.audio.playSfx(AudioKeys.BuildComplete, 0.5);
      } else {
        // If they can't afford this charm kind, still let them cycle the choice.
        this.cycleCharm();
      }
    }
    this.state.save(Date.now());
    this.refreshDetail();
  }
}
