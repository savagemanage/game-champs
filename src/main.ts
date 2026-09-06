import Phaser from 'phaser';
import { CANVAS, PHYSICS, PALETTE } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SettingsScene } from './scenes/SettingsScene';

/**
 * Phaser bootstrap for Kingdom Rise.
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
    // The #game parent is a flexbox that already centers the canvas both axes.
    // Letting Phaser ALSO center (CENTER_BOTH sets CSS margins on the canvas)
    // compounds with the flex centering and produces asymmetric letterbox
    // margins (top != bottom, left != right). Use NO_CENTER so flexbox is the
    // single source of centering and opposing margins stay equal at any size.
    autoCenter: Phaser.Scale.NO_CENTER,
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
  scene: [BootScene, PreloadScene, TitleScene, TownScene, BattleScene, GameOverScene, SettingsScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
