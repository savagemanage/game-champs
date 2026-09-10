import Phaser from 'phaser';
import { CANVAS, PALETTE, RESOURCE_ORDER } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import {
  RESEARCH_BRANCHES,
  techDef,
  techsInBranch,
  type ResearchBranch,
  type TechId,
} from '../config/ResearchConfig';
import type { ResourceKind } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { GameState } from '../systems/GameState';
import type { ResearchDenyReason } from '../systems/ResearchSystem';
import { tr } from '../i18n/i18n';
import { Menu, type MenuButton } from './Menu';
import { textStyle } from './UiText';
import { closeAccessibleModal, openAccessibleModal, refreshAccessibleModalContext } from './Accessibility';

/** Per-tech row widgets that need live updates. */
interface TechRow {
  tech: TechId;
  statusLabel: Phaser.GameObjects.Text;
  button: MenuButton;
}

/**
 * ResearchPanel - the Scholars' Hall tech-tree interface, following the
 * {@link TrainingPanel} pattern (container overlay, Menu.panel/button, dim
 * backdrop, per-frame refresh() with live timers). It lists every tech grouped
 * by branch (Military / Economy) with its cost and research time, and a
 * Research button that is disabled with a DISTINCT translated reason when the
 * tech is locked (needs the Scholars' Hall level, a prior research, more
 * resources, is already unlocked, or another research is in progress).
 *
 * All state lives in the shared {@link GameState}'s {@link ResearchSystem}, so
 * completions (advanced in GameState.tick) and the standing economy stay in one
 * place. It is a plain container overlay so TownScene can toggle it without a
 * scene switch.
 */
export class ResearchPanel {
  private readonly scene: Phaser.Scene;
  private readonly state: GameState;
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: TechRow[] = [];
  private activeText!: Phaser.GameObjects.Text;
  private lockedText!: Phaser.GameObjects.Text;
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
    if (visible) {
      this.refresh();
      openAccessibleModal(this.root, () => this.setVisible(false));
    } else {
      closeAccessibleModal(this.root);
    }
  }

  toggle(): void {
    this.setVisible(!this._visible);
  }

  private build(): void {
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const panelW = 760;
    // Grow toward the 540 canvas (centered at cy=270 -> top 10 / bottom 530)
    // so the taller economic branch's 8 three-line rows all fit above Close.
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

    this.root.add(Menu.title(this.scene, cx, cy - panelH / 2 + 28, tr('research.title'), 28));

    // Active-research readout just under the title.
    this.activeText = this.scene.add
      .text(cx, cy - panelH / 2 + 54, '', textStyle(14, { color: PALETTE.SUCCESS_CSS, align: 'center' }))
      .setOrigin(0.5);
    this.root.add(this.activeText);

    // Two columns, one per branch.
    const colW = panelW / 2;
    const top = cy - panelH / 2 + 78;
    RESEARCH_BRANCHES.forEach((branch, i) => {
      const colX = cx - panelW / 2 + colW * i + 24;
      this.buildBranchColumn(branch, colX, top, colW - 48);
    });

    // Prominent locked banner when the Scholars' Hall is not built.
    this.lockedText = this.scene.add
      .text(cx, cy, '', textStyle(20, {
        color: PALETTE.DANGER_CSS,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: panelW - 160 },
        backgroundColor: PALETTE.PANEL_CSS,
        padding: { x: 12, y: 10 },
      }))
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);
    this.root.add(this.lockedText);

    const close = Menu.button(this.scene, cx, cy + panelH / 2 - 26, tr('common.close'), () => this.setVisible(false), {
      width: 180,
    });
    this.root.add(close.container);
  }

  private buildBranchColumn(branch: ResearchBranch, x: number, y: number, width: number): void {
    const header = this.scene.add
      .text(x, y, tr(`research.branch.${branch}`), textStyle(18, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0, 0);
    this.root.add(header);

    let rowY = y + 28;
    // Tightened from 58 so the economic branch's 8 three-line rows fit inside
    // the panel with Close clearly below the last row.
    const rowStep = 46;
    for (const tech of techsInBranch(branch)) {
      this.buildTechRow(tech, x, rowY, width);
      rowY += rowStep;
    }
  }

  private buildTechRow(tech: TechId, x: number, y: number, width: number): void {
    const def = techDef(tech);

    const name = this.scene.add
      .text(x, y, `${tr(`tech.${tech}`)}  ${tr('research.tier', { tier: def.tier })}`, textStyle(14, { fontStyle: 'bold' }))
      .setOrigin(0, 0);
    this.root.add(name);

    const desc = this.scene.add
      .text(x, y + 15, `${tr(`tech.${tech}.desc`)}`, textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: width - 130 } }))
      .setOrigin(0, 0);
    this.root.add(desc);

    const statusLabel = this.scene.add
      .text(x, y + 29, '', textStyle(11, { color: PALETTE.MUTED_CSS, wordWrap: { width: width - 130 } }))
      .setOrigin(0, 0);
    this.root.add(statusLabel);

    const button = Menu.button(this.scene, x + width - 56, y + 15, tr('research.unlock'), () => this.research(tech), {
      width: 108,
      height: 34,
      fontSize: 13,
    });
    this.root.add(button.container);

    this.rows.push({ tech, statusLabel, button });
  }

  private costString(tech: TechId): string {
    const cost = techDef(tech).cost;
    return (RESOURCE_ORDER as readonly ResourceKind[])
      .filter((r) => (cost[r] ?? 0) > 0)
      .map((r) => `${cost[r]} ${tr(`resource.${r}`)}`)
      .join(', ');
  }

  private research(tech: TechId): void {
    const now = Date.now();
    const level = this.state.buildings.level('research');
    let ok = false;
    const committed = this.state.commitDurableAction(() => {
      ok = this.state.research.startResearch(tech, this.state.resources, now, level).ok;
      return ok;
    }, now);
    if (committed) {
      AudioManager.get(this.scene).playSfx(AudioKeys.UiClick, 0.7);
    }
    this.refresh();
  }

  /** Translate a deny reason to a distinct, human message. */
  private reasonText(reason: ResearchDenyReason | undefined, tech: TechId): string {
    switch (reason) {
      case 'building':
        return tr('research.locked.building', { level: techDef(tech).requiresResearchLevel });
      case 'prereq':
        return tr('research.locked.prereq');
      case 'cost':
        return tr('research.locked.cost');
      case 'busy':
        return tr('research.locked.busy');
      case 'already':
        return tr('research.locked.already');
      default:
        return '';
    }
  }

  refresh(): void {
    if (!this._visible) return;
    const now = Date.now();
    const research = this.state.research;
    const level = this.state.buildings.level('research');
    const hasHall = level >= 1;

    // Locked banner while the Scholars' Hall is missing.
    this.lockedText.setVisible(!hasHall);
    if (!hasHall) this.lockedText.setText(tr('research.noBuildingHint'));

    // Active-research readout with a live timer.
    const active = research.activeTech;
    if (active) {
      const seconds = Math.max(0, Math.ceil(research.remainingMs(now) / 1000));
      this.activeText.setText(tr('research.active', { name: tr(`tech.${active}`), seconds }));
    } else {
      this.activeText.setText(tr('research.idle'));
    }

    for (const row of this.rows) {
      const def = techDef(row.tech);
      if (research.isUnlocked(row.tech)) {
        row.button.setEnabled(false);
        row.button.setText(tr('research.unlocked'));
        row.statusLabel.setText(tr('research.unlocked')).setColor(PALETTE.SUCCESS_CSS);
        continue;
      }
      if (research.activeTech === row.tech) {
        const seconds = Math.max(0, Math.ceil(research.remainingMs(now) / 1000));
        row.button.setEnabled(false);
        row.button.setText(tr('research.researching', { seconds }));
        row.statusLabel.setText(tr('research.researching', { seconds })).setColor(PALETTE.SUCCESS_CSS);
        continue;
      }

      // Cost/time line as the baseline status.
      const costTime = `${tr('research.cost', { cost: this.costString(row.tech) })}   ${tr('research.time', { seconds: Math.round(def.timeMs / 1000) })}`;

      const check = research.canResearch(row.tech, this.state.resources, level);
      if (check.ok) {
        row.button.setEnabled(true);
        row.button.setText(tr('research.unlock'));
        row.statusLabel.setText(costTime).setColor(PALETTE.MUTED_CSS);
      } else {
        row.button.setEnabled(false);
        row.button.setText(tr('research.unlock'));
        row.statusLabel.setText(this.reasonText(check.reason, row.tech)).setColor(PALETTE.DANGER_CSS);
      }
    }
    refreshAccessibleModalContext(this.root);
  }

  update(): void {
    if (this._visible) this.refresh();
  }

  destroy(): void {
    this.root.destroy();
  }
}
