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
import { TutorialScene } from './scenes/TutorialScene';

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
 * centred.
 *
 * TEXT-CRISPNESS: the config deliberately does NOT set `pixelArt: true` and
 * does NOT force `image-rendering: pixelated` on the canvas (that CSS rule was
 * removed from index.html too). Under Scale.FIT the 540x960 canvas is almost
 * always displayed at a NON-INTEGER scale (e.g. 0.75x on a narrow phone, 1.04x
 * on a slightly wider one). With nearest-neighbour canvas scaling, that
 * fractional resample smears/breaks every Phaser Text glyph - dense Hangul
 * strokes turn blurry, broken, and visually mis-centred. Letting the browser
 * scale the canvas with SMOOTH (bilinear) interpolation instead keeps the
 * high-resolution text (see TEXT_RESOLUTION in src/ui/UiText.ts, which
 * rasterizes glyphs at >=3x and scales up with devicePixelRatio) sharp at every
 * viewport size and DPR. The pixel-art world/UI sprites are kept crisp by
 * applying NEAREST filtering PER-TEXTURE in PreloadScene, not by pixelating the
 * whole canvas.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.BG_SKY_CSS,
  render: {
    // Smooth (bilinear) canvas scaling: no `image-rendering: pixelated`, so the
    // fractional Scale.FIT resample does NOT nearest-neighbour-crush the text.
    antialias: true,
    // Do NOT snap draw positions to integers: on a fractionally scaled canvas
    // rounding shifts centred labels off-centre by up to half a logical pixel.
    roundPixels: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    // CENTERING: do NOT let Phaser center the canvas. autoCenter (CENTER_BOTH)
    // injects an inline `margin-left`/`margin-top` onto the canvas to center it
    // inside the parent. But the parent `#game` in index.html is already a
    // full-viewport flexbox (align-items/justify-content: center) that centers
    // the canvas. Stacking both mechanisms DOUBLE-centers: the flex parent puts
    // the canvas in the middle, then Phaser's extra margin-left shoves it a
    // further ~half-a-gutter to the right (measured ~207px off on a 1280x800
    // viewport). With NO_CENTER, Phaser leaves margin:0 and the flex parent is
    // the sole centering owner, so the canvas center matches the viewport
    // center at every window size (and vertically too).
    autoCenter: Phaser.Scale.NO_CENTER,
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
    TutorialScene,
  ],
};

/**
 * The UI is Korean-first and every glyph is drawn by Phaser to its own texture,
 * with metrics cached on first draw. If Phaser boots before the bundled Hangul
 * webfont (NotoSansKR, declared via @font-face in index.html) is ready, those
 * first frames rasterize Korean text with the Latin-only fallback as tofu boxes
 * (□) and cache the wrong glyphs. So we WAIT for the font to load before
 * constructing the game.
 *
 * We ask the FontFaceSet to load the exact family at the small AND large sizes
 * the UI actually draws (a 12px HUD/sublabel size and the 32px Title/brand
 * size), each with a Hangul sample ('한글'), so the download is kicked off and
 * the glyphs are ready before the first text is rasterized, then also await
 * document.fonts.ready. A short timeout guarantees the game still boots (with
 * the fallback stack) if the Font Loading API is unavailable or stalls, rather
 * than leaving a blank screen.
 */
const FONT_FAMILY = 'NotoSansKR';
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
  // Load the font at the small UI size (12px sublabels/HUD, where the pixel
  // font used to smear) as well as the largest size the UI draws (the
  // Title/brand at 32px) so its glyphs are available before the first text is
  // rasterized.
  const loads = ['12px', '16px', '32px'].map((size) =>
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
