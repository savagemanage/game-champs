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

/**
 * The UI is Korean-first and every glyph is drawn by Phaser to its own texture,
 * with metrics cached on first draw. If Phaser boots before the bundled Hangul
 * webfont (GalmuriMono9, declared via @font-face in index.html) is ready, those
 * first frames rasterize Korean text with the Latin-only fallback as tofu boxes
 * (□) and cache the wrong glyphs. So we WAIT for the font to load before
 * constructing the game.
 *
 * We ask the FontFaceSet to load the exact family at a representative size with
 * a Hangul sample ('한글') so the download is actually kicked off, then also
 * await document.fonts.ready. A short timeout guarantees the game still boots
 * (with the fallback stack) if the Font Loading API is unavailable or stalls,
 * rather than leaving a blank screen.
 */
const FONT_FAMILY = 'GalmuriMono9';
const FONT_SAMPLE = '한글';
const FONT_TIMEOUT_MS = 3000;

function startGame(): void {
  // eslint-disable-next-line no-new
  new Phaser.Game(config);
}

function whenFontReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') {
    return Promise.resolve();
  }
  // Load the font at the largest size the UI draws (the Title/brand at 32px) so
  // its glyphs are available before the first text is rasterized.
  const loads = ['16px', '32px'].map((size) =>
    fonts.load(`${size} "${FONT_FAMILY}"`, FONT_SAMPLE).catch(() => undefined),
  );
  return Promise.all([Promise.all(loads), fonts.ready]).then(() => undefined);
}

function bootWhenFontReady(): void {
  let started = false;
  const boot = (): void => {
    if (started) return;
    started = true;
    startGame();
  };
  // Never block the game forever on a stalled/absent font loader.
  const timer = window.setTimeout(boot, FONT_TIMEOUT_MS);
  whenFontReady()
    .catch(() => undefined)
    .then(() => {
      window.clearTimeout(timer);
      boot();
    });
}

bootWhenFontReady();
