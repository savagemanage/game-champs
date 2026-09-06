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
import { resolveRenderPlan } from './ui/renderScale';

/**
 * Phaser bootstrap for Frosthold: Last Ember.
 *
 * Scene flow: Boot -> Preload (loads the generated art/audio) -> Title -> Town
 * (the idle front end) with Settings and Battle reachable from the town. The
 * Battle scene resolves a wave via CombatSystem and hands off to GameOver for
 * the result summary before returning to Town.
 *
 * CRISP-TEXT RENDER PIPELINE (FEAT-002)
 * -------------------------------------
 * The whole game is laid out in a fixed 960x540 LOGICAL coordinate system
 * (CANVAS). Previously the Phaser drawing buffer was ALSO 960x540 and the
 * browser scaled that low-res buffer up to the physical display, so every UI
 * glyph was nearest-neighbour-upscaled and looked blurry. To fix that WITHOUT
 * changing any scene's coordinates we size the backbuffer to the device's real
 * pixel resolution (logical size * renderScale, where renderScale tracks
 * window.devicePixelRatio - see ui/renderScale.ts) and then zoom each scene's
 * main camera by the same factor so the 960x540 logical world still fills the
 * buffer. Text now rasterizes at device pixels and stays sharp; sprites keep
 * NEAREST filtering (pixelArt:true) so they remain crisp pixel-art. Scale.FIT +
 * autoCenter then letterbox that device-resolution buffer to the viewport at a
 * 1:1 device-pixel ratio, so the browser no longer upscales a low-res canvas.
 */
const RENDER_PLAN = resolveRenderPlan(
  CANVAS.WIDTH,
  CANVAS.HEIGHT,
  typeof window !== 'undefined' ? window.devicePixelRatio : 1,
);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.BG_SKY_CSS,
  // pixelArt keeps the global texture filter at NEAREST so building/enemy/troop
  // SPRITES stay crisp pixel-art (no bilinear smoothing). It does NOT make text
  // blurry any more, because the backbuffer below is rendered at device pixels
  // rather than being nearest-neighbour-upscaled from a low-res 960x540 buffer.
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Backbuffer sized to DEVICE pixels (logical 960x540 * renderScale). Each
    // scene's main camera is zoomed by RENDER_PLAN.scale (see applyRenderScale)
    // so the 960x540 logical layout is preserved and simply drawn at higher
    // resolution.
    width: RENDER_PLAN.bufferWidth,
    height: RENDER_PLAN.bufferHeight,
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
  registerRenderScale(game);
  // QA/debug hook: expose the running game only when explicitly requested via
  // ?debug in the URL, so screenshot/e2e tooling can introspect scene state.
  // Has no effect on the normal production page (no query flag).
  if (typeof location !== 'undefined' && location.search.includes('debug')) {
    (globalThis as unknown as { __GAME__?: Phaser.Game }).__GAME__ = game;
  }
}

/**
 * Zoom every scene's main camera by RENDER_PLAN.scale so the 960x540 LOGICAL
 * layout fills the device-resolution backbuffer (see the pipeline note above).
 * Because the backbuffer is `logical * scale` and the camera is zoomed by the
 * same `scale`, the camera's world view is exactly 960x540 again - we only
 * re-anchor it to logical (0,0) via the plan's scroll offset (a zoomed camera
 * otherwise centres its world view on the buffer midpoint). Every scene in this
 * game is a static full-screen 960x540 layout that only touches `cameras.main`
 * (no scrolling/following cameras), so this single global hook is sufficient
 * and keeps all per-scene coordinates and pointer input in logical space.
 *
 * When RENDER_PLAN.scale is 1 (a 1x display) this is a no-op zoom, so nothing
 * changes on non-HiDPI screens.
 */
function registerRenderScale(game: Phaser.Game): void {
  if (RENDER_PLAN.scale === 1) {
    return;
  }
  const apply = (cam: Phaser.Cameras.Scene2D.Camera | undefined): void => {
    if (!cam) return;
    cam.setZoom(RENDER_PLAN.scale);
    cam.setScroll(RENDER_PLAN.scrollX, RENDER_PLAN.scrollY);
  };
  // Attach the zoom to a scene's main camera on every CREATE (create() runs on
  // first start AND on every restart/return, so the zoom re-applies to the
  // fresh camera) plus once immediately in case the scene already created.
  const attach = (scene: Phaser.Scene): void => {
    scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => apply(scene.cameras.main));
    apply(scene.cameras.main);
  };
  // The Scene Manager instantiates the config `scene` classes ASYNCHRONOUSLY
  // during boot, so `game.scene.scenes` is empty synchronously after
  // `new Phaser.Game(config)`. Wait for the game READY event (fired once the
  // boot sequence, incl. scene creation, has completed) before attaching to
  // every scene from this single place.
  game.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of game.scene.scenes) {
      attach(scene);
    }
  });
}

void ensureFontsLoaded().then(boot);
