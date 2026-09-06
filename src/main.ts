import Phaser from 'phaser';
import { CANVAS, PHYSICS, PALETTE } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { RunScene } from './scenes/RunScene';
import { ResultsScene } from './scenes/ResultsScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { SettingsScene } from './scenes/SettingsScene';

/**
 * Phaser bootstrap for LAST SQUAD (라스트 스쿼드).
 *
 * Scene flow: Boot -> Preload (loads the generated art/audio) -> Title. From
 * the Title the player deploys into a Run (the core lane gate-runner loop),
 * which resolves to Results, from which they can Redeploy, spend coins in the
 * Upgrade screen, or return to the Title. Settings is reachable from Title.
 *
 * The canvas is a portrait 540x960 design resolution, scaled to fit while
 * centred, with nearest-neighbour pixel-art upscaling.
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
      // Forward-runner view: no gravity. Motion is planar, driven by velocity.
      gravity: { x: 0, y: PHYSICS.GRAVITY_Y },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, TitleScene, RunScene, ResultsScene, UpgradeScene, SettingsScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
