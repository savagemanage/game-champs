import Phaser from 'phaser';
import { PALETTE, CANVAS, RESEARCH } from '../config/GameConfig';
import { AudioKeys } from '../config/AssetKeys';
import { RESEARCH_BRANCH_ORDER } from '../types';
import type { BuildingKind, ResearchBranch } from '../types';
import type { TrKey } from '../i18n/strings';
import { nodesOfBranch, researchDef } from '../config/ResearchConfig';
import { Menu, type MenuButton } from '../ui/Menu';
import { textStyle } from '../ui/UiText';
import { tr, trDyn } from '../i18n/i18n';
import { HubScene } from './HubScene';

/**
 * ResearchScene - the Ember Archive tech tree. Renders the four branches
 * (economy / battle / survival / development) as columns of nodes; a selected
 * node shows its cost, duration and gate, with a Research button. All gating
 * (prereqs, lab level, affordability, one-at-a-time) is enforced by the pure
 * {@link ResearchSystem}; this scene only renders and calls start().
 */
export class ResearchScene extends HubScene {
  private selected: string | null = null;
  private detailTitle!: Phaser.GameObjects.Text;
  private detailDesc!: Phaser.GameObjects.Text;
  private detailCost!: Phaser.GameObjects.Text;
  private detailStatus!: Phaser.GameObjects.Text;
  private startButton!: MenuButton;
  private nodeButtons: { id: string; button: MenuButton }[] = [];

  constructor() {
    super({ key: 'ResearchScene' });
  }

  protected titleKey(): string {
    return 'research.title';
  }

  protected build(): void {
    // Symmetric horizontal framing at 960x540: a single outer margin M sets the
    // left edge of the leftmost column AND the right edge of the detail panel to
    // 960-M, with an even gutter between the four-column block and the panel so
    // there is no hollow band in the middle. The columns are widened to fill the
    // reclaimed space while the panel still clears the rightmost node column.
    const M = 24;
    const panelW = 236;
    const px = CANVAS.WIDTH - M - panelW / 2; // panel right edge = 960 - M
    const gutter = 32;
    const nodeW = 152;
    const colW = 164;
    const startX = M;
    RESEARCH_BRANCH_ORDER.forEach((branch: ResearchBranch, ci) => {
      const x = startX + ci * colW;
      this.add.text(x, 60, tr(`research.branch.${branch}`), textStyle(16, { fontStyle: 'bold', color: PALETTE.ICE_CSS })).setOrigin(0, 0.5);
      nodesOfBranch(branch).forEach((id, ni) => {
        const y = 90 + ni * 44;
        const btn = Menu.button(this, x + nodeW / 2, y, trDyn(`research.${id}.name`), () => this.select(id), { width: nodeW, fontSize: 12, padY: 6 });
        this.nodeButtons.push({ id, button: btn });
      });
    });
    // Sanity: the rightmost node column must clear the panel's left edge by the
    // gutter (columns block right edge + gutter = panel left edge).
    void (startX + 3 * colW + nodeW + gutter);

    // Detail panel anchored in the reserved right band (its left edge clears
    // the widest node column above). A solid panel body keeps it legible.
    const py = CANVAS.HEIGHT / 2 + 10;
    Menu.panel(this, px, py, panelW, 300);
    this.detailTitle = this.add.text(px, py - 130, '', textStyle(18, { fontStyle: 'bold', align: 'center', wordWrap: { width: 230 } })).setOrigin(0.5, 0);
    this.detailDesc = this.add.text(px - 118, py - 80, '', textStyle(12, { color: PALETTE.MUTED_CSS, wordWrap: { width: 236 } })).setOrigin(0, 0);
    this.detailCost = this.add.text(px - 118, py + 6, '', textStyle(12, { color: PALETTE.TEXT_CSS, wordWrap: { width: 236 } })).setOrigin(0, 0);
    this.detailStatus = this.add.text(px, py + 78, '', textStyle(12, { align: 'center', wordWrap: { width: 236 } })).setOrigin(0.5, 0);
    this.startButton = Menu.button(this, px, py + 118, tr('research.start'), () => this.doStart(), { width: 220 });
    this.startButton.setEnabled(false);

    this.refreshNodes(Date.now());
  }

  update(_t: number, _d: number): void {
    const now = Date.now();
    // Advance research on its timer so the UI reflects completions live.
    this.state.tick(now, 0);
    this.refreshNodes(now);
    if (this.selected) this.refreshDetail(now);
  }

  private select(id: string): void {
    this.selected = id;
    this.audio.playSfx(AudioKeys.UiClick, 0.5);
    this.refreshDetail(Date.now());
  }

  private labLevel(): number {
    return this.state.buildings.level(RESEARCH.LAB_BUILDING as BuildingKind);
  }

  private refreshNodes(now: number): void {
    void now;
    for (const { id, button } of this.nodeButtons) {
      const done = this.state.research.isCompleted(id);
      const active = this.state.research.active?.nodeId === id;
      const color = done ? PALETTE.SUCCESS_CSS : active ? PALETTE.ACCENT_CSS : PALETTE.TEXT_CSS;
      button.label.setColor(color);
      const prefix = done ? '\u2713 ' : active ? '\u2699 ' : '';
      button.label.setText(prefix + trDyn(`research.${id}.name`));
    }
  }

  private refreshDetail(now: number): void {
    if (!this.selected) return;
    const id = this.selected;
    const def = researchDef(id);
    if (!def) return;
    this.detailTitle.setText(trDyn(`research.${id}.name`));
    this.detailDesc.setText(trDyn(`research.${id}.desc`));
    this.detailCost.setText(
      `${this.costString(def.cost)}\n${tr('tooltip.time', { seconds: Math.round(def.durationMs / 1000) })}`,
    );

    if (this.state.research.isCompleted(id)) {
      this.detailStatus.setText(tr('research.completed')).setColor(PALETTE.SUCCESS_CSS);
      this.startButton.setText(tr('research.completed'));
      this.startButton.setEnabled(false);
      return;
    }
    const active = this.state.research.active;
    if (active?.nodeId === id) {
      const secs = Math.ceil(Math.max(0, active.endsAt - now) / 1000);
      this.detailStatus.setText(tr('research.researching', { seconds: secs })).setColor(PALETTE.ACCENT_CSS);
      this.startButton.setText(tr('research.researching', { seconds: secs }));
      this.startButton.setEnabled(false);
      return;
    }

    const check = this.state.research.canResearch(id, this.state.resources, this.labLevel());
    if (check.ok) {
      this.detailStatus.setText('');
      this.startButton.setText(tr('research.start'));
      this.startButton.setEnabled(true);
    } else {
      this.startButton.setEnabled(false);
      this.startButton.setText(tr('research.start'));
      const reasonKey =
        check.reason === 'busy'
          ? 'research.busy'
          : check.reason === 'prereq'
            ? 'research.locked'
            : check.reason === 'lab_level'
              ? 'research.needsLab'
              : check.reason === 'cost'
                ? 'research.insufficient'
                : '';
      this.detailStatus
        .setText(reasonKey ? tr(reasonKey as TrKey, { level: def.requiresLabLevel }) : '')
        .setColor(PALETTE.DANGER_CSS);
    }
  }

  private doStart(): void {
    if (!this.selected) return;
    const now = Date.now();
    const res = this.state.research.start(
      this.selected,
      this.state.resources,
      this.labLevel(),
      now,
      this.state.modifiers().buildSpeed,
    );
    if (res.ok) {
      this.audio.playSfx(AudioKeys.UiClick, 0.7);
      this.state.save(now);
    }
    this.refreshDetail(now);
    this.refreshNodes(now);
  }
}
