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
 * (CANVAS). Previously the Phaser drawing buffer was 960x540 (or only
 * DPR-scaled) and Scale.FIT stretched that low-res buffer up to fill the
 * window, so every UI glyph was upscaled by the browser and looked blurry. The
 * magnification a canvas undergoes on screen is
 * `devicePixelRatio * (displayedCssSize / logicalSize)`, NOT just DPR: on a
 * normal dpr=1 desktop the canvas is still CSS-stretched (e.g. 960x540 -> a
 * 1920x1080 window is a 2x blow-up), so keying the buffer off DPR alone left
 * text blurry for most desktop users.
 *
 * To fix that WITHOUT changing any scene's coordinates we size the backbuffer
 * to the REAL number of physical pixels the canvas occupies on screen (logical
 * size * renderScale, where renderScale tracks BOTH the device pixel ratio AND
 * the displayed-vs-logical size ratio - see ui/renderScale.ts) and then zoom
 * each scene's main camera by the same factor so the 960x540 logical world
 * still fills the buffer. Text now rasterizes at display resolution and stays
 * sharp; sprites keep NEAREST filtering (pixelArt:true) so they remain crisp
 * pixel-art. Because the buffer is now at least the displayed physical size,
 * Scale.FIT + autoCenter only ever DOWNSCALES it to the viewport (a sharp
 * minification), never upscales a low-res canvas.
 *
 * The plan is recomputed on every window resize (see registerRenderScale) so
 * the buffer/zoom track the live window size - maximise the window on a dpr=1
 * display and the buffer grows to keep text crisp.
 */

/** Measure the container the game is displayed in (CSS pixels) + the DPR. */
function measureDisplay(): { cssWidth: number; cssHeight: number; dpr: number } {
  if (typeof window === 'undefined') {
    return { cssWidth: CANVAS.WIDTH, cssHeight: CANVAS.HEIGHT, dpr: 1 };
  }
  const parent = typeof document !== 'undefined' ? document.getElementById('game') : null;
  const rect = parent?.getBoundingClientRect();
  const cssWidth = rect && rect.width > 0 ? rect.width : window.innerWidth || CANVAS.WIDTH;
  const cssHeight = rect && rect.height > 0 ? rect.height : window.innerHeight || CANVAS.HEIGHT;
  return { cssWidth, cssHeight, dpr: window.devicePixelRatio || 1 };
}

function planFromDisplay(): ReturnType<typeof resolveRenderPlan> {
  const { cssWidth, cssHeight, dpr } = measureDisplay();
  return resolveRenderPlan(CANVAS.WIDTH, CANVAS.HEIGHT, cssWidth, cssHeight, dpr);
}

const RENDER_PLAN = planFromDisplay();

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
    // Backbuffer sized to the DISPLAYED physical pixels (logical 960x540 *
    // renderScale, derived from DPR AND the displayed-vs-logical size ratio).
    // Each scene's main camera is zoomed by the same scale (see
    // registerRenderScale) so the 960x540 logical layout is preserved and
    // simply drawn at higher resolution. This is the BOOT size; the plan is
    // recomputed and game.scale.resize()d on every window resize.
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
 * The live render plan. Starts at the boot-time RENDER_PLAN and is recomputed on
 * every window resize so the backbuffer and camera zoom track the current
 * displayed size (see the pipeline note above). Kept module-level so the resize
 * handler and the per-scene camera hook read one source of truth.
 */
let currentPlan = RENDER_PLAN;

/**
 * Zoom a scene's main camera by the current plan's scale so the 960x540 LOGICAL
 * layout fills the display-resolution backbuffer (see the pipeline note above).
 * Because the backbuffer is `logical * scale` and the camera is zoomed by the
 * same `scale`, the camera's world view is exactly 960x540 again - we only
 * re-anchor it to logical (0,0) via the plan's scroll offset (a zoomed camera
 * otherwise centres its world view on the buffer midpoint). Every scene in this
 * game is a static full-screen 960x540 layout that only touches `cameras.main`
 * (no scrolling/following cameras), so applying to `cameras.main` is sufficient
 * and keeps all per-scene coordinates and pointer input in logical space.
 *
 * At scale 1 (a small/1x display) zoom becomes 1 and scroll 0, i.e. a no-op, so
 * nothing changes on displays that don't need a scaled buffer.
 */
function applyCameraZoom(cam: Phaser.Cameras.Scene2D.Camera | undefined): void {
  if (!cam) return;
  cam.setZoom(currentPlan.scale);
  cam.setScroll(currentPlan.scrollX, currentPlan.scrollY);
}

/**
 * Wire the render-scale pipeline: zoom every scene's main camera to the current
 * plan, and recompute the plan (resize the backbuffer + re-zoom every camera)
 * whenever the window/container size or DPR changes. This keeps UI text crisp as
 * the window is resized on a dpr=1 display (the buffer grows/shrinks to match
 * the real displayed pixel size) while the 960x540 logical layout and input map
 * stay identical.
 */
function registerRenderScale(game: Phaser.Game): void {
  // Attach the zoom to a scene's main camera on every CREATE (create() runs on
  // first start AND on every restart/return, so the zoom re-applies to the
  // fresh camera) plus once immediately in case the scene already created.
  const attach = (scene: Phaser.Scene): void => {
    scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => applyCameraZoom(scene.cameras.main));
    applyCameraZoom(scene.cameras.main);
  };

  // Recompute buffer size + camera zoom for the live displayed size. Only
  // resize the game when the buffer dimensions actually change (avoids churn on
  // spurious resize events) and always re-apply the zoom to every live camera.
  const recompute = (): void => {
    const next = planFromDisplay();
    const changed =
      next.bufferWidth !== currentPlan.bufferWidth ||
      next.bufferHeight !== currentPlan.bufferHeight;
    currentPlan = next;
    if (changed) {
      game.scale.resize(next.bufferWidth, next.bufferHeight);
    }
    for (const scene of game.scene.scenes) {
      applyCameraZoom(scene.cameras.main);
    }
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
    // Re-measure once now that the canvas is in the DOM (the boot-time measure
    // may have run before layout settled), then track subsequent resizes.
    recompute();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', recompute);
    }
  });
}

void ensureFontsLoaded().then(boot);
