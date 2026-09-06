// One-shot screenshot capture for Frosthold: Last Ember (서리성채: 마지막 불씨).
//
// Produces the README screenshots in docs/screenshots/. Everything runs in a
// SINGLE process so the static server stays alive for the whole browser session
// (detached background servers are reaped between separate shell invocations in
// the CI sandbox). The flow is:
//   1. serve dist/ over HTTP under the production base /game-whiteout/
//   2. launch headless Chromium (playwright-core, --no-sandbox)
//   3. wait for the canvas + bundled Korean web font to be ready
//   4. drive the UI (Play, panels, Command menu -> hub screens, Battle)
//   5. capture each screen and verify Hangul renders as real glyphs (no tofu)
//
// Requires a production build first (`npm run build`). Chromium and
// playwright-core are located via env overrides (CHROME_PATH / PW_CORE_PATH)
// with sensible defaults for this sandbox.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// playwright-core lives in the global @playwright/mcp install here; ESM does not
// honour NODE_PATH, so resolve it by absolute path (overridable via env).
const require = createRequire(import.meta.url);
const PW_CORE =
  process.env.PW_CORE_PATH ||
  '/opt/toolchains/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const CHROME =
  process.env.CHROME_PATH || '/opt/playwright/chromium-1232/chrome-linux64/chrome';
const { chromium } = require(PW_CORE);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const BASE = '/game-whiteout/';
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.startsWith(BASE)) urlPath = urlPath.slice(BASE.length - 1);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    let filePath = path.join(DIST, urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(`dist/ not found - run "npm run build" first (looked in ${DIST})`);
  }
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`serving ${DIST} at http://127.0.0.1:${PORT}${BASE}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  // Logical 960x540 at 2x for crisp pixel-art screenshots.
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  const shots = [];
  const shot = async (name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    const size = fs.statSync(file).size;
    shots.push({ name, size });
    console.log(`  captured ${name}.png (${(size / 1024).toFixed(1)} KB)`);
  };

  // Poll until the canvas paints a non-black frame. Phaser renders via WebGL,
  // so we judge "rendered" by the compressed size of a throwaway screenshot: a
  // full-black fade frame compresses to ~8-9 KB, a real busy screen is larger.
  const waitForRendered = async (timeoutMs = 8000, minKB = 12) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const buf = await page.screenshot();
      if (buf.length / 1024 >= minKB) return true;
      await sleep(250);
    }
    return false;
  };

  // Which scene is currently active (via the ?debug game handle).
  const activeScene = () =>
    page.evaluate(() => {
      const g = globalThis.__GAME__;
      if (!g) return '?';
      const s = g.scene.scenes.find((sc) => g.scene.isActive(sc.scene.key));
      return s ? s.scene.key : '?';
    });

  // Fresh state so we always land on the deterministic first-run flow. ?debug
  // exposes the game handle for scene introspection (a no-op on the live page).
  const APP = `http://127.0.0.1:${PORT}${BASE}?debug`;
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Wait for the canvas + the bundled Korean font so no frame paints with a
  // tofu fallback (the app awaits ensureFontsLoaded before booting Phaser).
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(
    () => document.fonts && document.fonts.check("16px 'Nanum Gothic Coding'"),
    { timeout: 30000 },
  );
  await sleep(1500); // let the Title scene settle (parallax + fade-in)

  // --- Title screen ---
  await shot('title');

  // Drive via the canvas. Phaser input is on the single canvas element, so we
  // click at logical coordinates (CSS pixels map 1:1 to the 960x540 viewport).
  const box = await (await page.$('canvas')).boundingBox();
  const clickLogical = async (lx, ly) => {
    await page.mouse.click(box.x + lx, box.y + ly);
    await sleep(700);
  };

  // Title: Play button at ~0.64*540=345, centred (x=480). Enter the Town.
  await clickLogical(480, 345);
  await sleep(1800); // town fade-in + onboarding card

  // The first-run onboarding card sits on a full-screen overlay that intercepts
  // clicks; dismiss it (button centred at cy + h/2 - 34 = 346) before driving
  // the Town UI. Shown on every fresh-hold Town entry, so re-dismiss on return.
  const dismissOnboarding = async () => {
    await clickLogical(480, 346);
    await sleep(500);
  };
  await dismissOnboarding();

  // --- Town hub: furnace, resource HUD, warmth bar, command bar ---
  await shot('town');

  // Workforce / population panel (P shortcut mirrors the survivor readout).
  await page.keyboard.press('p');
  await sleep(900);
  await shot('population');
  await page.keyboard.press('p');
  await sleep(700);

  // Troop training panel (bottom-left button at x=100, y=510).
  await clickLogical(100, 510);
  await sleep(900);
  await shot('training');
  await clickLogical(100, 510);
  await sleep(700);

  // Command-menu hub grid: 4 columns centred on screen. Row 1 buttons at y=202
  // (Heroes, Summon, Campaign, Research), row 2 at y=322 (Gear, Alliance, Arena,
  // Quests); columns at x = 180, 380, 580, 780.
  const HUB = { hero: [180, 202], summon: [380, 202], campaign: [580, 202], research: [780, 202] };
  const SCENE_OF = { hero: 'HeroScene', summon: 'SummonScene', campaign: 'CampaignScene', research: 'ResearchScene' };

  const openCommandMenu = async () => {
    await dismissOnboarding();
    await clickLogical(260, 510); // bottom bar, second button
    await sleep(900);
  };
  // Return to the Town via the on-screen 뒤로 (Back) button at (90, 510).
  const backToTown = async () => {
    await clickLogical(90, 510);
    await waitForRendered();
    await sleep(600);
  };
  // Open a hub screen from the Town, verify (via the ?debug handle) the target
  // scene actually became active, screenshot, then return. Retries the click if
  // the first attempt didn't land (e.g. an onboarding overlay ate it).
  const captureHub = async (link, name) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await openCommandMenu();
      await clickLogical(...HUB[link]);
      await waitForRendered();
      await sleep(500);
      if ((await activeScene()) === SCENE_OF[link]) break;
      await page.keyboard.press('Escape');
      await sleep(800);
    }
    await shot(name);
    await backToTown();
  };

  // Command-menu overview, then the expanded-systems screens.
  await openCommandMenu();
  await shot('command-menu');
  await clickLogical(...HUB.summon);
  await waitForRendered();
  await sleep(600);
  await shot('summon');
  await backToTown();

  await captureHub('research', 'research');
  await captureHub('campaign', 'campaign');
  await captureHub('hero', 'heroes');

  // --- Tofu / glyph verification -------------------------------------------
  // Render the Korean UI strings on an offscreen canvas with the bundled font
  // vs. a deliberately-missing font. If the bundled face yields a DIFFERENT
  // (wider, real-glyph) measurement than the .notdef fallback, Hangul is
  // rendering correctly rather than as tofu boxes.
  const fontReport = await page.evaluate(() => {
    const samples = ['서리성채', '마지막 불씨', '지휘', '연구', '소환', '병력 훈련', '온기'];
    const measure = (family) => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `20px ${family}`;
      return samples.map((s) => ctx.measureText(s).width);
    };
    const withFont = measure("'Nanum Gothic Coding', monospace");
    const fallback = measure("'ZZ No Such Font ZZ'");
    const differs = withFont.some((w, i) => Math.abs(w - fallback[i]) > 0.5);
    return { loaded: document.fonts.check("16px 'Nanum Gothic Coding'"), differs, withFont };
  });

  await browser.close();
  server.close();

  console.log('\nCaptured screenshots:');
  for (const s of shots) console.log(`  ${s.name}.png  ${(s.size / 1024).toFixed(1)} KB`);
  console.log(`\nKorean font loaded: ${fontReport.loaded}; renders real glyphs (not tofu): ${fontReport.differs}`);
  if (!fontReport.loaded || !fontReport.differs) {
    console.error('WARNING: Korean font not rendering correctly!');
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  try {
    server.close();
  } catch {}
  process.exit(1);
});
