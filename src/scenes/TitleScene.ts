import Phaser from 'phaser';
import { SceneKeys, PALETTE, CANVAS, RUN } from '../config/GameConfig';
import { TextureKeys, AudioKeys } from '../config/AssetKeys';
import { AudioManager } from '../systems/AudioManager';
import { MetaStore } from '../systems/MetaStore';
import { GameStore } from '../systems/GameStore';
import { shouldShowStartHint, startCtaSubKeys } from '../systems/Tutorial';
import { tr } from '../i18n/i18n';
import { Menu } from '../ui/Menu';
import { textStyle } from '../ui/UiText';

/**
 * TitleScene - the LAST SQUAD front end. Shows the original brand name, a
 * tagline, the player's best distance/score from the persisted save, and the
 * primary actions: Deploy (start a run), Upgrades, How to Play, and Settings.
 * A slow-scrolling road and a couple of idle soldier sprites give the screen
 * some life. Keyboard shortcuts mirror the buttons.
 */
export class TitleScene extends Phaser.Scene {
  private road?: Phaser.GameObjects.TileSprite;
  private howtoOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SceneKeys.Title });
  }

  create(): void {
    const cx = CANVAS.WIDTH / 2;
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(PALETTE.BG_SKY_CSS);
    Menu.fadeIn(this);

    // Backdrop: static skyline + scrolling road.
    this.add.image(cx, 0, TextureKeys.BgSkyline).setOrigin(0.5, 0).setAlpha(0.85);
    this.road = this.add
      .tileSprite(cx, CANVAS.HEIGHT, CANVAS.WIDTH, CANVAS.HEIGHT, TextureKeys.BgRoad)
      .setOrigin(0.5, 1)
      .setAlpha(0.6);

    // A small idle squad marching in place near the bottom.
    this.spawnIdleSquad();

    // Start the music bed once (survives across scenes via the singleton).
    AudioManager.get(this).playMusic();

    // Brand + tagline.
    Menu.title(this, cx, CANVAS.HEIGHT * 0.2, tr('brand.name'), 52).setColor(PALETTE.SQUAD_CSS);
    Menu.label(this, cx, CANVAS.HEIGHT * 0.2 + 48, tr('title.tagline'), 20, 0.85);

    // Best readouts from the save.
    const meta = MetaStore.get();
    Menu.label(this, cx, CANVAS.HEIGHT * 0.31, tr('title.best', { meters: meta.bestDistance }), 18, 0.75).setColor(
      PALETTE.ACCENT_CSS,
    );
    Menu.label(this, cx, CANVAS.HEIGHT * 0.31 + 26, tr('title.bestScore', { score: meta.bestScore }), 18, 0.75);

    // Primary actions. The primary action now enters the base-hub HomeScene;
    // the Falcon Rescue mini-game (the gate-runner Run) stays reachable from the
    // Home bottom-nav and via the direct SPACE/ENTER shortcut below.
    let y = CANVAS.HEIGHT * 0.46;
    const step = 66;
    // PRIMARY call-to-action: dominant width + font, SQUAD accent, a '▶ 시작하기'
    // emphasis, and a subtle breathing pulse/glow so a first-timer's eye lands
    // here immediately. SPACE/ENTER remain wired to the same enterHome() path.
    const primary = Menu.button(this, cx, y, tr('title.start'), () => this.enterHome(), {
      width: 300,
      fontSize: 28,
      accent: PALETTE.SQUAD,
    });
    this.emphasizePrimary(primary.container);
    // First-run pointer: only for a brand-new save (tutorial not yet seen).
    if (shouldShowStartHint(GameStore.get().tutorialSeen())) {
      this.spawnStartHint(cx, y);
    }
    // Explainer + desktop keyboard cue rendered directly UNDER the CTA so a
    // first-time player knows exactly what the button does (it enters the base
    // hub) and that SPACE also starts. The keys come from the pure start-flow
    // helper so their presence in the string table is unit-tested. These sit in
    // the gap between the button (above) and the next menu button; `step` below
    // is widened so nothing collides.
    const [subKey, keyCueKey] = startCtaSubKeys();
    this.add
      .text(cx, y + 32, tr(subKey), textStyle(16, { color: PALETTE.MUTED_CSS, align: 'center' }))
      .setOrigin(0.5);
    this.add
      .text(cx, y + 54, tr(keyCueKey), textStyle(15, { color: PALETTE.ACCENT_CSS, fontStyle: 'bold', allowSmall: true }))
      .setOrigin(0.5);
    // The explainer + key cue occupy ~54px below the button; advance past them
    // (larger than the normal step) so the Upgrades button clears the cue.
    y += step + 26;
    Menu.button(this, cx, y, tr('title.upgrades'), () => this.go(SceneKeys.Upgrade), { width: 260 });
    y += step;
    Menu.button(this, cx, y, tr('title.howto'), () => this.toggleHowTo(), { width: 260 });
    y += step;
    Menu.button(this, cx, y, tr('title.settings'), () => this.go(SceneKeys.Settings), { width: 260 });

    Menu.label(this, cx, CANVAS.HEIGHT * 0.95, tr('title.hint'), 18, 0.6);

    // Keyboard shortcuts.
    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => this.enterHome());
    kb?.on('keydown-ENTER', () => this.enterHome());
    kb?.on('keydown-U', () => this.go(SceneKeys.Upgrade));
    kb?.on('keydown-H', () => this.toggleHowTo());
    kb?.on('keydown-S', () => this.go(SceneKeys.Settings));
  }

  update(_time: number, delta: number): void {
    if (this.road) this.road.tilePositionY -= (RUN.SCROLL_SPEED * 0.4 * delta) / 1000;
  }

  private spawnIdleSquad(): void {
    const key = 'title_soldier_march';
    if (!this.anims.exists(key)) {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(TextureKeys.Soldier, { start: 0, end: 1 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    const baseY = CANVAS.HEIGHT * 0.86;
    for (let i = 0; i < 5; i++) {
      const col = i % 3;
      const rowOff = Math.floor(i / 3);
      const s = this.add
        .sprite(CANVAS.WIDTH / 2 + (col - 1) * 34, baseY + rowOff * 26, TextureKeys.Soldier)
        .setScale(2.2)
        .play(key);
      s.anims.setProgress((i % 3) / 3);
    }
  }

  /** Enter the base-hub HomeScene (the new primary action). */
  private enterHome(): void {
    AudioManager.get(this).playSfx(AudioKeys.UiClick, 0.8);
    Menu.fadeTo(this, () => this.scene.start(SceneKeys.Home));
  }

  /**
   * Make the primary START button unmistakable: a slow "breathing" scale pulse
   * plus a soft SQUAD-tinted glow rectangle behind it that pulses in sync. This
   * is purely cosmetic and never gates the click (the button still fires on
   * press) so the SPACE/ENTER shortcut and pointer both keep working.
   */
  private emphasizePrimary(container: Phaser.GameObjects.Container): void {
    const { width, height } = container;
    const glow = this.add
      .rectangle(container.x, container.y, width + 22, height + 22, PALETTE.SQUAD, 0.18)
      .setOrigin(0.5)
      .setStrokeStyle(2, PALETTE.SQUAD)
      .setDepth(container.depth - 1);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.1, to: 0.32 },
      scaleX: { from: 1, to: 1.06 },
      scaleY: { from: 1, to: 1.12 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: container,
      scale: { from: 1, to: 1.04 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * First-run coach hint aimed at the primary START button. Both the arrow and
   * the Korean-first prompt line ('여기를 눌러 시작하세요') are stacked directly ABOVE
   * the button and centred on the same canvas x as everything else, so the hint
   * reinforces the centred layout instead of poking out toward the right margin
   * (a side arrow at cx+176 used to add to a "leans right" feel). The arrow now
   * points DOWN at the button and bobs vertically. Shown only for a fresh save
   * (tutorialSeen === false); returning players never see it.
   */
  private spawnStartHint(cx: number, py: number): void {
    // Centred prompt line above the button.
    const hint = this.add
      .text(cx, py - 48, tr('title.startHint'), textStyle(20, { fontStyle: 'bold', color: PALETTE.ACCENT_CSS }))
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: { from: 0.55, to: 1 }, duration: 720, yoyo: true, repeat: -1 });
    // Bobbing arrow centred between the prompt and the button, pointing DOWN at
    // it. Uses '↓' (U+2193), which is in the bundled subset webfont's arrow set
    // (U+2190..U+2193); the filled triangle '▼' (U+25BC) is NOT in the subset
    // and would render as a missing-glyph box. Centred on cx so it never pulls
    // the eye off-centre.
    const arrow = this.add.text(cx, py - 26, '↓', textStyle(24, { color: PALETTE.ACCENT_CSS })).setOrigin(0.5);
    this.tweens.add({
      targets: arrow,
      y: py - 20,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private go(scene: string): void {
    Menu.fadeTo(this, () => this.scene.start(scene, { returnTo: SceneKeys.Title }));
  }

  /**
   * Toggle a genuinely-helpful How-to-Play guide overlay (FEAT-004). It covers
   * BOTH the meta core loop (기지 base / 영웅 heroes / 전역 battle / 팔콘 구조대) AND
   * the gate-runner controls + goal, with a small illustrated two-lane diagram
   * drawn from Phaser primitives (no new binary assets). Korean-first, closable
   * (닫기), and it leads straight into the guided tutorial via a prominent
   * '튜토리얼 시작' button. Uses a dimmed full-screen scrim so it reads as a modal.
   */
  private toggleHowTo(): void {
    if (this.howtoOverlay) {
      this.howtoOverlay.destroy(true);
      this.howtoOverlay = null;
      return;
    }
    const cx = CANVAS.WIDTH / 2;
    const cy = CANVAS.HEIGHT / 2;
    const overlay = this.add.container(0, 0);

    // Dim scrim + framed panel. The panel is near-full-size so the larger
    // (FEAT-002) body text has room and the widest possible word-wrap, which
    // keeps each bullet to as few lines as possible and prevents overflow.
    const panelW = CANVAS.WIDTH * 0.94;
    const panelH = CANVAS.HEIGHT * 0.9;
    const panelTop = cy - panelH / 2;
    const panelBottom = cy + panelH / 2;
    const scrim = this.add.rectangle(cx, cy, CANVAS.WIDTH, CANVAS.HEIGHT, 0x000000, 0.6).setOrigin(0.5);
    const panel = Menu.panel(this, cx, cy, panelW, panelH);
    overlay.add([scrim, panel]);

    // Reserve room at the bottom for the two stacked action buttons, then flow
    // the copy from the top down so nothing collides with them.
    const startTutY = panelBottom - 84;
    const closeY = panelBottom - 34;

    const pad = 22;
    const left = cx - panelW / 2 + pad;
    const wrap = panelW - pad * 2;
    let ly = panelTop + 14;

    const title = this.add.text(cx, ly, tr('howto.title'), textStyle(24, { fontStyle: 'bold' })).setOrigin(0.5, 0);
    overlay.add(title);
    ly += title.height + 8;

    // GOAL line, accented.
    const goal = this.add
      .text(left, ly, tr('howto.goal'), textStyle(18, { color: PALETTE.ACCENT_CSS, wordWrap: { width: wrap }, align: 'left' }))
      .setOrigin(0, 0);
    overlay.add(goal);
    ly += goal.height + 10;

    // CORE LOOP section header + four labelled bullets.
    const loopHeader = this.add
      .text(left, ly, tr('howto.loopTitle'), textStyle(18, { fontStyle: 'bold', color: PALETTE.SQUAD_CSS }))
      .setOrigin(0, 0);
    overlay.add(loopHeader);
    ly += loopHeader.height + 4;
    for (const key of ['howto.loop.base', 'howto.loop.heroes', 'howto.loop.battle', 'howto.loop.falcon'] as const) {
      const t = this.add
        .text(left, ly, `• ${tr(key)}`, textStyle(17, { wordWrap: { width: wrap }, align: 'left', allowSmall: true }))
        .setOrigin(0, 0);
      overlay.add(t);
      ly += t.height + 3;
    }
    ly += 4;

    // CONTROLS section header.
    const controlsHeader = this.add
      .text(left, ly, tr('howto.controlsTitle'), textStyle(18, { fontStyle: 'bold', color: PALETTE.SQUAD_CSS }))
      .setOrigin(0, 0);
    overlay.add(controlsHeader);
    ly += controlsHeader.height + 4;

    // Illustrated two-lane diagram: a track with two lanes, a squad chip at the
    // bottom, a good (green +/x) gate and a bad (red -/÷) gate, and a boss chip
    // at the top — all Phaser primitives, no new binaries.
    ly += this.drawLaneDiagram(overlay, cx, ly, wrap) + 8;

    // Controls bullets (move / gates / auto-fire / boss).
    for (const key of ['howto.move', 'howto.gates', 'howto.autofire', 'howto.boss'] as const) {
      const t = this.add
        .text(left, ly, `• ${tr(key)}`, textStyle(17, { wordWrap: { width: wrap }, align: 'left', allowSmall: true }))
        .setOrigin(0, 0);
      overlay.add(t);
      ly += t.height + 3;
    }

    // PRIMARY: launch the guided tutorial (ties #3 how-to-start into #2 tutorial).
    const startTut = Menu.button(this, cx, startTutY, tr('howto.startTutorial'), () => this.replayTutorial(), {
      width: 280,
      fontSize: 22,
      accent: PALETTE.SQUAD,
    });
    overlay.add(startTut.container);
    const close = Menu.button(this, cx, closeY, tr('common.close'), () => this.toggleHowTo(), {
      width: 160,
    });
    overlay.add(close.container);

    overlay.setDepth(50);
    this.howtoOverlay = overlay;
  }

  /**
   * Draw a compact two-lane runner diagram (track, lane divider, squad chip,
   * one good and one bad gate, boss chip) into `overlay`, centred on `cx` and
   * starting at `topY`. Returns the diagram height so the caller can advance
   * its layout cursor. Pure Phaser primitives + tr() chip labels — no assets.
   */
  private drawLaneDiagram(
    overlay: Phaser.GameObjects.Container,
    cx: number,
    topY: number,
    maxWidth: number,
  ): number {
    const w = Math.min(maxWidth, 300);
    const h = 100;
    const midY = topY + h / 2;
    // Chip height sized so the ~14px chip captions sit comfortably inside.
    const chipH = 24;

    // Track background + centre lane divider.
    const track = this.add.rectangle(cx, midY, w, h, PALETTE.ROAD, 1).setOrigin(0.5).setStrokeStyle(2, PALETTE.LANE_LINE);
    const divider = this.add.rectangle(cx, midY, 2, h - 8, PALETTE.LANE_LINE, 0.8).setOrigin(0.5);
    overlay.add([track, divider]);

    const laneL = cx - w * 0.25;
    const laneR = cx + w * 0.25;

    // Boss chip at the top spanning both lanes. Chip captions stay compact
    // (allowSmall) so they fit their fixed chip height; the min-font floor is
    // for body/label copy, not tiny decorative diagram tags.
    const bossChip = this.add.rectangle(cx, topY + 18, w * 0.5, chipH, PALETTE.BOSS, 0.9).setOrigin(0.5).setStrokeStyle(1, PALETTE.TEXT);
    const bossLabel = this.add.text(cx, topY + 18, 'BOSS', textStyle(14, { fontStyle: 'bold', allowSmall: true })).setOrigin(0.5);
    overlay.add([bossChip, bossLabel]);

    // Gate row: a good gate (left lane) and a bad gate (right lane).
    const gateY = midY - 6;
    const goodGate = this.add.rectangle(laneL, gateY, w * 0.4, chipH, PALETTE.GATE_GOOD, 0.9).setOrigin(0.5).setStrokeStyle(1, PALETTE.TEXT);
    const goodLabel = this.add.text(laneL, gateY, tr('howto.gateGood'), textStyle(14, { fontStyle: 'bold', allowSmall: true })).setOrigin(0.5);
    const badGate = this.add.rectangle(laneR, gateY, w * 0.4, chipH, PALETTE.GATE_BAD, 0.9).setOrigin(0.5).setStrokeStyle(1, PALETTE.TEXT);
    const badLabel = this.add.text(laneR, gateY, tr('howto.gateBad'), textStyle(14, { fontStyle: 'bold', allowSmall: true })).setOrigin(0.5);
    overlay.add([goodGate, goodLabel, badGate, badLabel]);

    // Squad chip at the bottom (starts in the left lane) using the soldier sprite.
    const squad = this.add.sprite(laneL, topY + h - 16, TextureKeys.Soldier).setScale(2);
    const laneCaption = this.add.text(cx, topY + h - 10, tr('howto.laneLabel'), textStyle(14, { color: PALETTE.MUTED_CSS, allowSmall: true })).setOrigin(0.5, 1);
    overlay.add([squad, laneCaption]);

    return h;
  }

  /**
   * Replay the guided tutorial: reset the persisted "seen" flag so the tutorial
   * is unseen again, then enter the base hub where HomeScene auto-launches the
   * onboarding overlay from the first step.
   */
  private replayTutorial(): void {
    GameStore.get().resetTutorial();
    if (this.howtoOverlay) {
      this.howtoOverlay.destroy(true);
      this.howtoOverlay = null;
    }
    this.enterHome();
  }
}
