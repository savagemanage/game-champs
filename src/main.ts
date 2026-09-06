import Phaser from 'phaser';
import { CANVAS, PHYSICS, PALETTE } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { HomeScene } from './scenes/HomeScene';
import { RunScene } from './scenes/RunScene';
import { ResultsScene } from './scenes/ResultsScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { SettingsScene } from './scenes/SettingsScene';
import { BaseScene } from './scenes/BaseScene';
import { HeroesScene } from './scenes/HeroesScene';
import { FormationScene } from './scenes/FormationScene';
import { CampaignScene } from './scenes/CampaignScene';
import { BattleScene } from './scenes/BattleScene';
import { MissionsScene } from './scenes/MissionsScene';
import { SeasonScene } from './scenes/SeasonScene';

/**
 * Phaser bootstrap for LAST SQUAD (라스트 스쿼드).
 *
 * Scene flow: Boot -> Preload (loads the generated art/audio) -> Title -> Home.
 * The Title's primary action enters the HomeScene base hub, whose persistent
 * bottom-nav reaches every top-level system (Base, Heroes, Campaign, Missions,
 * Season) and launches the Falcon Rescue mini-game: a Run (the core lane
 * gate-runner loop) that resolves to Results, from which the player can
 * Redeploy, spend coins in the Upgrade screen, or return. Settings is reachable
 * from both the Title and the Home hub. Base management, the Heroes roster, and
 * the squad Formation board (FEAT-006) are registered here and reached from the
 * Home nav; the Campaign/Missions/Season/Battle scenes are added by FEAT-007
 * (until then the Home nav guards those hops with a scene-existence check).
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
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    HomeScene,
    RunScene,
    ResultsScene,
    UpgradeScene,
    SettingsScene,
    BaseScene,
    HeroesScene,
    FormationScene,
    CampaignScene,
    BattleScene,
    MissionsScene,
    SeasonScene,
  ],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
