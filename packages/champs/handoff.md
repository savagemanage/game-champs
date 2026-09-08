# Handoff — Arena Champions (game-champs)

A League of Legends–style web game. React + TypeScript + Vite single‑page app with a
Phaser 3 battle canvas, bilingual (한국어 / English), deployed to GitHub Pages. **Not
affiliated with Riot Games** — all champion names, art, and lore are original and inspired
only by generic MOBA archetypes.

- **Live site:** https://savagemanage.github.io/open-games/champs/
- **Repo:** https://github.com/savagemanage/open-games (default branch: `main`)

---

## Current state (what works)

- **Client‑style lobby UI** (LoL‑client‑inspired, Hextech dark theme): top nav bar
  (logo + HOME / TFT / CLASH tabs + essence/RP currency + profile + language toggle +
  settings gear), five vertical champion cards with circular SVG portraits and Q/W/E/R
  spell slots (self card highlighted), a glowing **게임 찾기 / FIND MATCH** lock‑in
  button, and a decorative social/friends side panel.
- **Modes:** Summoner's Rift (3 lanes) and ARAM (single mid lane, random champs).
- **Genuine 5v5:** 10 champions per match (the human + 9 AI‑driven). Bots lane, fight,
  cast abilities, die/respawn, and push toward the enemy Nexus.
- **Full Rift systems:** three lanes with turrets/inhibitors/Nexus and LoL gating,
  minion waves (+ super minions after inhibitor down), jungle camps with Blue/Red buffs,
  epic monsters (Dragon / Rift Herald / Baron Nashor), gold + XP economy, leveling to 18,
  a 12‑item shop, per‑champion lane roles. Win by destroying the enemy Nexus.
- **Camera:** zoomed in and follows the player's champion (the whole map is only visible
  on the minimap), so the world feels large.
- **Controls (LoL‑style):** left/right **click to move**; **Q/W/E/R** cast toward the
  cursor; auto‑attack the nearest enemy in range; **B** opens the shop. (No WASD — that
  earlier collided with the Q/W/E/R skill keys.)
- **Graphics:** procedural **SVG** art for champions, structures, minions, epic monsters,
  skill icons, and combat VFX, plus layered terrain, drop shadows, depth sorting, and
  combat "juice" (hit‑flash, screen shake, knockback, damage popups, kill slow‑mo).
- **Zero binary assets:** all art is SVG/procedural (rasterized once to cached Phaser
  textures for the canvas; inline SVG in the DOM for UI); audio is procedural Web Audio.
- **i18n:** Korean (default) + English, switchable at runtime; `ko.json` and `en.json`
  are kept at identical key parity by a test.

---

## Tech stack

- **Vite 5** (dev server + bundler), **React 18** + **TypeScript** (strict), **Phaser 3**
  (battle scene), **react-i18next** (+ language detector), **Web Audio API** (procedural
  SFX), **Vitest** + **@testing-library/react** (unit tests).

## Local development

Requires **Node 22** and npm.

```bash
npm install            # install dependencies
npm run dev            # Vite dev server (hot reload)
npm run build          # type-check (tsc -b) then produce dist/
npm run preview        # serve the production build locally
npm run test -- --run  # run unit tests once (CI mode)
npm run typecheck      # tsc --noEmit type-check only
```

## Deployment (GitHub Pages)

- Served from the **`/open-games/champs/`** subpath (project page); `base: '/open-games/champs/'` in
  `vite.config.ts`. Do not hardcode the base — use Vite asset handling.
- `.github/workflows/deploy.yml` builds on push to `main` and deploys `dist/` via
  GitHub Actions (Pages **Source: GitHub Actions**). CI/workflow files must go through a
  PR, never a direct push to `main`.

---

## Architecture map

```
src/
  App.tsx                     # screen router (menu | mode | select | battle | result) + shared nav/controls
  components/
    ClientNav.tsx             # Hextech top nav bar (tabs, currency, profile, settings, language)
    ChampionCard.tsx          # lobby champion card (SVG portrait + spell slots)
    ChampionFigure.tsx        # renders a champion's SVG illustration in the DOM
    SettingsPanel.tsx         # localized settings + help (keybinds, audio, language)
    ShopPanel.tsx             # in-battle item shop
    AbilityCard.tsx, LanguageToggle.tsx
  screens/
    MainMenu.tsx, ModeSelect.tsx, ChampionSelect.tsx (client-style lobby),
    BattleScreen.tsx (hosts Phaser + HUD), ResultScreen.tsx
  game/
    PhaserGame.tsx            # mounts one Phaser.Game (StrictMode-safe); camera context-menu suppression
    BattleHud.tsx             # React HUD overlay (bars, objectives, minimap, ability bar) via useSyncExternalStore
    battleStore.ts            # external store bridging scene <-> React HUD
    scenes/BattleScene.ts     # the arena: 10 champions, minions, jungle, objectives, camera, VFX
    ai.ts                     # pure bot decision logic (unit-tested)
    audio.ts                  # procedural Web Audio SFX (no-ops headless)
    render/
      svgArt.ts               # pure SVG-string builders (champions/structures/minions/epics/VFX)
      sprites.ts              # rasterizes SVG -> cached Phaser textures (headless-guarded)
      palette.ts              # pure accent -> tone-ramp color math
      juice.ts                # pure hit -> effect-magnitude classifier
      abilityIcons.ts         # inline DOM SVG skill icons
    rift/                     # PURE, Phaser-free, unit-tested gameplay/render-math modules:
      map.ts (lanes/structures/jungle/epics), minions.ts, structures.ts, jungle.ts,
      objectives.ts, economy.ts, loadout.ts, teams.ts (5v5 composition), iso.ts (dimetric projection)
  data/champions.ts           # 10 champions (2 per lane role): ashborne, nightveil, ironhold,
                              #   embermage, dawnsong, thornwarden, grimtrail, frostquill,
                              #   duskarrow, wardlight
  data/items.ts               # shop items
  i18n/                       # react-i18next setup + ko/en locales (parity-tested)
  styles/global.css           # Hextech theme, fullscreen no-scroll shell, HUD/lobby styles
```

### Key invariants (please preserve)

- **Gameplay math lives on the flat top-down plane** (`src/game/rift/*`). The dimetric
  projection in `iso.ts` (`worldToScreen`/`screenToWorld`/`depthFor`) is **rendering-only**;
  the Phaser camera zoom/follow layers on top. Pointer input is mapped back to world space
  via `screenToWorld` (Phaser's camera transform is already applied to `pointer.worldX/Y`).
- **Pure modules stay Phaser-free and unit-tested.** SVG→texture rasterization needs a
  browser canvas, so it is guarded to no-op under jsdom (same pattern as `audio.ts`) to keep
  tests/build green.
- **No binary assets.** Add art as SVG (text) or procedural drawing; never commit PNG/atlas/
  audio binaries and never fetch external art/fonts/CDNs.
- **No page scrollbar / fullscreen shell.** The app fills the viewport (`height: 100vh/100dvh;
  overflow: hidden`); the in-game camera pans, the page never scrolls.
- **i18n parity:** every user-visible string is a key present in **both** `ko.json` and
  `en.json` (Korean is the default). A parity test fails the build if a key is missing.

---

## Verification (last known-good)

- `npm run typecheck`: clean
- `npm run test -- --run`: **330 tests / 26 files** pass
- `npm run build`: succeeds; `dist/index.html` references assets under `/open-games/champs/`
- i18n: `ko.json` / `en.json` at **297 identical keys** (ko/en at identical key parity)
- `npm run docs:check`: clean (game.json unchanged, so generated README tables are unaffected)
- Deploy workflow green on `main`.
- Visual checks are done with the demo-recorder skill (headless Chromium): build, run the
  scenario, then open the battle/select screenshots and confirm the look/behaviour by eye;
  automated assertions alone have missed visual/UX regressions before, so always look.

---

## Recently shipped

- **Roster expansion + de-mirrored 5v5 (FEAT-002).** The roster grew from 5 to 10 original
  champions with at least two per lane role (top/jungle/mid/bot/support): added Thornwarden
  (top bruiser), Grimtrail (jungle assassin), Frostquill (mid mage), Duskarrow (bot marksman)
  and Wardlight (support enchanter). `src/game/rift/teams.ts` `composeTeams` now SELECTS five
  champions per team (one per lane role, filled in a fixed `top→jungle→mid→bot→support`
  order) instead of fielding the whole roster, so ally and enemy field DIFFERENT champions in
  every role, so mirror matchups are gone. The human's pick stays on ally and the enemy
  player-facing pick stays on enemy; selection is deterministic (no `Math.random` on the
  tested path) and the module stays Phaser-free. Exported signatures (`composeTeams`,
  `laneForRole`, `enemyFacingSlot`) and the `TeamSlot`/`TeamComposition` shapes are unchanged;
  ARAM still piles five per side into mid. All new content is data + i18n + procedural icons,
  zero binary assets. Flavored ability glyphs for the five new champions were added to
  `src/game/render/abilityIcons.ts` (per-behavior fallback still covers anything unmapped).
  Champs suite is now 330 tests / 26 files.

---

## Known follow-ups / polish ideas (not blocking)

- At the zoomed camera framing, the enemy base's stacked towers can still look dense; the
  zoom/bounds framing (zoom 2.4, bounds padding 220) is coupled and sensitive to retuning.
- Champion SVG art is stylized/simple; could be illustrated in more detail.
- A couple of decorative i18n keys are currently unused (parity still holds).
- The Phaser bundle is a large dynamic-import chunk (gzip ~350KB) and trips Vite's 500KB
  chunk-size advisory; expected and non-fatal.
- `composeTeams` selects lanes in a fixed `top->jungle->mid->bot->support` order and always
  pulls the first eligible champion per role; with only two champions per role the ally/enemy
  split is deterministic but not varied match-to-match. A weighted or seeded rotation (and
  more champions per role) would add composition variety without breaking the non-mirror
  contract.
- The new champions reuse the shared procedural art/icon pipeline; bespoke silhouettes or
  signature ability VFX per champion would sharpen their visual identity.

---

## Working conventions

- `.tasks` and `.agents/tasks/` are gitignored (planning artifacts are never committed).
- Gameplay/rendering iterations are committed directly to `main` and auto-deployed; **only
  CI/workflow files** require a PR (never pushed directly to `main`).
