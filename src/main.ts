import Phaser from 'phaser';
import { CANVAS, PHYSICS, PALETTE } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SettingsScene } from './scenes/SettingsScene';
import { HeroScene } from './scenes/HeroScene';
import { SummonScene } from './scenes/SummonScene';
import { CampaignScene } from './scenes/CampaignScene';
import { ResearchScene } from './scenes/ResearchScene';
import { GearScene } from './scenes/GearScene';
import { AllianceScene } from './scenes/AllianceScene';
import { ArenaScene } from './scenes/ArenaScene';
import { QuestsScene } from './scenes/QuestsScene';
import { ensureFontsLoaded } from './ui/fonts';

/**
 * Phaser bootstrap for Frosthold: Last Ember.
 *
 * Scene flow: Boot -> Preload (loads the generated art/audio) -> Title -> Town
 * (the idle front end) with Settings and Battle reachable from the town. The
 * Battle scene resolves a wave via CombatSystem and hands off to GameOver for
 * the result summary before returning to Town.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.BG_SKY_CSS,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS.WIDTH,
    height: CANVAS.HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // Top-down management view: no gravity. Movement (in battle) is planar.
      gravity: { x: 0, y: PHYSICS.GRAVITY_Y },
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    TownScene,
    BattleScene,
    GameOverScene,
    SettingsScene,
    // FEAT-006: player-facing screens for the expanded systems.
    HeroScene,
    SummonScene,
    CampaignScene,
    ResearchScene,
    GearScene,
    AllianceScene,
    ArenaScene,
    QuestsScene,
  ],
};

/**
 * Boot the game once the KOREAN-FIRST UI font is registered. Phaser rasterizes
 * text to a canvas at first paint, so if the bundled Korean face is not ready
 * yet the opening frames fall back to a system font (or tofu). Awaiting
 * ensureFontsLoaded() first guarantees Hangul renders correctly from frame one;
 * it resolves immediately (and never rejects) in environments without the CSS
 * Font Loading API, so boot is never blocked.
 */
function boot(): void {
  const game = new Phaser.Game(config);
  // QA/debug hook: expose the running game only when explicitly requested via
  // ?debug in the URL, so screenshot/e2e tooling can introspect scene state.
  // Has no effect on the normal production page (no query flag).
  if (typeof location !== 'undefined' && location.search.includes('debug')) {
    (globalThis as unknown as { __GAME__?: Phaser.Game }).__GAME__ = game;
  }
}

void ensureFontsLoaded().then(boot);
