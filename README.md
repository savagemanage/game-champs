# Arena Champions

A **League of Legends-inspired** web game built around a full **Summoner's Rift**: pick
your mode and champion, then battle across a **three-lane 5v5 map** complete with turrets,
inhibitors and Nexus, minion waves, a jungle with buff camps, and epic monsters (Dragon,
Rift Herald, Baron Nashor). Earn gold and experience, level up to 18, and shop for items,
all the way to cracking the enemy Nexus. Built as a React + TypeScript single-page app with
a **Phaser 3** game canvas, fully bilingual (**한국어 / English**, Korean is the default),
and deployed to **GitHub Pages**.

> **Not affiliated with Riot Games.** All champion names, titles, abilities, items, and lore
> in this project are **original** and inspired only by generic MOBA archetypes (marksman,
> assassin, bruiser, mage, enchanter). "League of Legends" is a trademark of Riot Games,
> Inc.; this is an independent, non-commercial fan-style project and is not endorsed by or
> associated with Riot Games.

---

## Tech stack

- **Vite 5** – dev server and production bundler
- **React 18** + **TypeScript** (strict mode) – UI shell, screens, and HUD overlay
- **Phaser 3** – the real-time battle scene, rendered as a **smooth vector-art 2.5D sprite view**: the top-down world is drawn with a dimetric ("2:1 isometric") projection as a diamond ground, and every entity (champions, minions, structures, epic monsters) is a depth-sorted **ground-shadow + raised billboard** sprite. Each sprite is authored as **real illustrated SVG art built from TEXT strings** (`src/game/render/svgArt.ts`, pure and unit-tested) using a small palette derived from the entity's accent + team rim, rasterized **once** to a cached GPU texture and drawn smoothly (Phaser `render: { antialias: true, roundPixels: false }`), so there are still **no binary image assets** (SVG is text). SVG decode is async, so each texture first registers a correctly-sized transparent placeholder and is refreshed in place when the vector art finishes decoding; a headless guard keeps jsdom tests/build green. Combat has deliberate **game feel / juice ('타격감')** — hit-flash, importance-scaled screen shake, cosmetic knockback/recoil, squash-and-stretch, impact spark particles, juicy damage-number popups, and a brief kill slow-mo — all driven off tweens/timers/camera so the deterministic simulation is never touched
- **react-i18next** (+ `i18next-browser-languagedetector`) – Korean and English locales with a persisted language toggle
- **Web Audio API** – 100% procedural sound effects (no binary audio files)
- **Vitest** + **@testing-library/react** – unit tests for pure game logic, i18n parity, and components

---

## Architecture: pure logic vs. rendering

The core design rule is a strict split between **pure, Phaser-free, unit-tested game logic**
and the **Phaser rendering layer**. Phaser only draws/bakes sprites and calls the pure
helpers; it never owns the math. This keeps every formula testable in plain node/jsdom
without a canvas. Even the 2.5D projection math is pure: the dimetric transform lives in
`src/game/rift/iso.ts` and is exhaustively unit-tested, while the Phaser-side sprite factory
(`src/game/render/sprites.ts`) only rasterizes the pure SVG strings from `svgArt.ts` into
cached textures.

Pure, unit-tested modules:

- `src/game/combat.ts` – armor mitigation, cooldowns, ability resolution, structure-gated targeting
- `src/game/ai.ts` – deterministic bot decision logic
- `src/game/rift/map.ts` – the 3000×3000 world: lanes, waypoints, structure/jungle/river/epic anchors, path math
- `src/game/rift/iso.ts` – the 2.5D dimetric projection: `worldToScreen` / `screenToWorld` (pointer input round-trips back to world space) and `depthFor` for painter's-order depth sorting
- `src/game/rift/structures.ts` – the turret → inhibitor → nexus-turret → nexus gating graph + inhibitor respawn
- `src/game/rift/minions.ts` – wave cadence/composition, super minions, per-type stats, lane navigation
- `src/game/rift/economy.ts` – gold, XP, the level-1..18 curve, and all bounty tables
- `src/game/rift/jungle.ts` – neutral camps, respawn timers, and Blue/Red buffs
- `src/game/rift/objectives.ts` – Dragon (stacking), Rift Herald (one-time push), Baron (timed buff) as team modifiers
- `src/game/rift/loadout.ts` – folds base stats + per-level growth + items + team modifiers into effective stats
- `src/data/items.ts` – the 12-item shop catalog

`src/game/scenes/BattleScene.ts` is the Phaser scene: it builds combat `Unit` records, routes
movement/damage/wave/economy math through the pure helpers above (e.g. `advanceMinion`,
`computeEffectiveStats`, `nextWaveNumberAt`, `isStructureTargetable`, `isInhibitorAlive`,
`heraldReward`), projects every world position through `iso.ts`, and mirrors positions onto
containers each frame as depth-sorted shadow + billboard sprites baked by
`src/game/render/sprites.ts`. The React HUD reads a shared external store
(`src/game/battleStore.ts`) via `useSyncExternalStore`.

---

## Modes

Choose a mode after the main menu:

- **Summoner's Rift** – the full three-lane 5v5 experience: **ten champions in play (five per
  team)** spread across three lanes by role, with the complete structure chain, minion waves,
  jungle camps and buffs, and epic monsters. You control your pick; the other nine champions
  (your four allies and all five opponents) are AI-driven and actively lane, fight, cast
  abilities, die and respawn, and push toward the enemy Nexus, so the map stays in motion.
- **ARAM** (All Random All Mid) – a single mid lane where both full teams pile into mid for
  constant skirmishing.

> The roster has five original archetypes, so both teams field the same five champions; they
> are told apart by the ally/enemy team rim and accent color on every sprite.

---

## How the game plays

1. **Main Menu** – start a match or open **Settings & Help**.
2. **Mode Select** – pick **Summoner's Rift** or **ARAM**.
3. **Champion Select** – browse the roster (each card shows the champion's **illustrated
   inline-SVG figure**, the same vector art used in battle), inspect stats, P/Q/W/E/R abilities,
   role and **lane role** (top / jungle / mid / bot / support), choose or randomize the
   opponent, and **Lock In**. The selected-champion detail panel and the post-match **Results**
   screen show the same character art.
4. **Battle** – push lanes, farm minions and jungle camps for gold and XP, level up to **18**,
   buy items from the **shop** while in base, contest Dragon / Herald / Baron for team-wide
   buffs, and destroy structures in order to break through to the enemy Nexus.
5. **Results** – a Victory/Defeat summary with match stats (duration, takedowns, minions
   slain, damage dealt, final level, gold). **Rematch** replays; **Main Menu** returns home.

### Structures and gating

Each side has, per lane, an **outer turret → inner turret → inhibitor turret → inhibitor**,
then two **nexus turrets** and the **Nexus**. A structure can only be attacked once the
structures shielding it have fallen; the nexus turrets unlock once any inhibitor is down,
and the Nexus unlocks once its nexus turrets fall. Destroying an inhibitor spawns a **super
minion** in that lane until the inhibitor respawns (5 minutes).

### Minions, jungle, and epic monsters

- **Minions**: melee + caster every wave, a siege minion every third wave, and super minions
  after an inhibitor is destroyed. First wave at 1:05, then every 30s.
- **Jungle**: Blue/Red buff camps plus Gromp/Wolves/Raptors/Krugs and Scuttle, with respawn
  timers and gold/XP bounties.
- **Dragon** (from 5:00): permanent stacking team bonus. **Rift Herald** (8:00–19:45): a
  one-time structure-damage push. **Baron Nashor** (from 20:00): a timed team combat buff.

### Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / click | Move your champion |
| `Q` `W` `E` `R` | Cast abilities aimed at the cursor (`R` is your ultimate) |
| `B` | Open the item **shop** (only while in base) |
| Mouse click | Move to the clicked point |

Basic attacks auto-fire at the nearest valid target in range. The same keybinds (including
`B` for the shop) are documented, localized, in the in-game **Settings & Help** panel, which
also exposes **mute**, **master volume**, an **ambient sound** toggle, and the **language** switch.

---

## Champion roster

Five original champions, one per archetype, each with a default lane role:

| Champion | Title | Role | Lane |
| --- | --- | --- | --- |
| **Ashborne** | the Ember Archer | Marksman | Bot |
| **Nightveil** | the Silent Blade | Assassin | Mid |
| **Ironhold** | the Bulwark | Bruiser | Top |
| **Embermage** | the Cinderweaver | Mage | Jungle |
| **Dawnsong** | the Radiant Muse | Enchanter | Support |

Each champion has a passive plus four abilities (Q/W/E/R) with tuned cooldowns, costs, ranges,
and damage, plus per-level **growth** used by the leveling math. Full definitions live in
`src/data/champions.ts`; the item catalog lives in `src/data/items.ts`. All display text is
stored as i18n keys so everything is fully localizable.

---

## Internationalization (i18n)

The game ships in **Korean (한국어)** and **English**, switchable at runtime via the toggle
in the header or the Settings panel. **Korean is the mandatory default** (`fallbackLng: 'ko'`):
a first-time visitor with no saved choice loads Korean.

- Locale bundles: `src/i18n/locales/ko.json` and `src/i18n/locales/en.json`.
- The two files **must** have an identical key set. The parity test in `src/i18n/i18n.test.ts`
  fails the build if a key is missing from either locale, and asserts the Korean `app.title`
  resolves to `아레나 챔피언스`.
- Every new UI / champion / ability / item / buff / objective / structure / HUD string is an
  i18n key present in **both** locales.

---

## Local development

Requires **Node 22** and npm.

```bash
npm install            # install dependencies
npm run dev            # start the Vite dev server (hot reload)
npm run build          # type-check (tsc -b) then produce dist/
npm run preview        # serve the production build locally
npm run test -- --run  # run unit tests once (CI mode)
npm run typecheck      # tsc --noEmit type-check only
```

---

## GitHub Pages deployment

This app is served from the **`/game-champs/`** subpath because it is a GitHub **project
page**. That subpath is configured in `vite.config.ts`:

```ts
export default defineConfig({
  base: '/game-champs/',
  // ...
});
```

Deployment is automated by `.github/workflows/deploy.yml`: on every push to `main`, it runs
`npm ci`, `npm run build`, and deploys `dist/` with `actions/deploy-pages`. Enable it once
under **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is then
available at:

```
https://savagemanage.github.io/game-champs/
```

---

## Project structure

```
src/
  App.tsx                       # app shell + router (menu | mode | select | battle | result)
  main.tsx                      # React entry: imports i18n + global styles
  components/
    AbilityCard.tsx             # ability tooltip card (inline SVG skill icon from abilityIcons.ts)
    ChampionCard.tsx            # roster tile (accent frame + inline-SVG champion figure)
    ChampionFigure.tsx          # decorative inline-SVG champion illustration (shared svgArt path)
    LanguageToggle.tsx          # ko/en segmented switch
    SettingsPanel.tsx           # localized settings + help modal (keybinds incl. B, audio, language)
    ShopPanel.tsx               # in-battle item shop (reads gold/owned items from the store)
  screens/
    MainMenu.tsx                # landing screen
    ModeSelect.tsx              # Summoner's Rift vs ARAM
    ChampionSelect.tsx          # roster browse + role/lane + lock-in
    BattleScreen.tsx            # hosts the Phaser canvas + HUD + shop
    ResultScreen.tsx            # win/lose summary + rematch / menu
  game/
    combat.ts                   # pure combat math (Phaser-free, unit-tested)
    ai.ts                       # pure bot decision logic (Phaser-free, unit-tested)
    audio.ts                    # procedural WebAudio SFX engine + persisted settings
    battleStore.ts              # external store bridging the scene and the React HUD
    BattleHud.tsx               # React overlay HUD (gold, level/XP, buffs, objectives, minimap)
    PhaserGame.tsx              # mounts a single Phaser.Game, StrictMode-safe
    scenes/BattleScene.ts       # the Rift scene: renders the 2.5D map + routes math through rift/
    render/
      svgArt.ts                 # pure, Phaser-free SVG-markup builders for entities + combat/skill VFX (accent-driven), unit-tested
      sprites.ts                # Phaser-side sprite factory: rasterizes svgArt strings ONCE into cached textures (placeholder->refresh, headless-guarded)
      abilityIcons.ts           # pure inline-DOM SVG skill-icon builders for the HUD ability bar + champion-select, unit-tested
      palette.ts                # pure limited-palette color math (accent -> 5-tone ramp), unit-tested
      juice.ts                  # pure combat-juice math (hit importance, shake, knockback, sparks, popups), unit-tested
    rift/                       # pure, unit-tested Summoner's Rift modules
      map.ts economy.ts minions.ts structures.ts jungle.ts objectives.ts loadout.ts
      iso.ts                    # pure 2.5D dimetric projection: worldToScreen/screenToWorld/depthFor
  data/
    champions.ts                # typed champion roster (i18n keys, stats, growth, lane roles)
    items.ts                    # 12-item shop catalog
  i18n/                         # react-i18next setup + ko/en locale JSON (ko default)
  styles/global.css             # dark/gold LoL-inspired theme + responsive layout
.github/workflows/deploy.yml    # GitHub Pages build + deploy
```

---

## Notes on assets and audio

There are **no binary art or audio assets** — none. Every visual is authored as **text**: the
in-canvas battle art is **SVG vector markup built from TypeScript strings**, HUD skill icons are
**inline DOM SVG**, champion portraits in the UI (select cards, detail panel, results) are the
same **inline-SVG champion figures** rendered from `svgArt.championArt` over an accent frame, and all sound effects are
synthesized at runtime with the Web Audio API. No PNGs, JPGs, atlases, or spritesheets are loaded
or committed — SVG is text, not a binary asset.

### SVG vector-art rendering

The battle renders as a **smooth, vector-illustrated 2.5D sprite scene** with no image files. The
top-down world is projected onto a dimetric ("2:1 isometric") plane so the square map reads as a
diamond ground, and each entity is drawn as a **ground-shadow ellipse plus a raised, upright
billboard** sprite, depth-sorted so whatever is nearer the viewer draws on top (see
`src/game/rift/iso.ts`).

Every entity is authored as **real illustrated SVG art, expressed as text**:

- The pure, Phaser-free builders in `src/game/render/svgArt.ts` produce an **SVG markup string**
  (with soft gradient shading) for each champion / minion / structure / epic monster, plus the
  combat/skill VFX. Because they are plain string/geometry helpers with no Phaser dependency, they
  are directly **unit-tested** (`svgArt.test.ts`).
- The factory in `src/game/render/sprites.ts` **rasterizes each SVG string ONCE** into a GPU
  texture and **caches** it by entity type / team / variant, so a texture is decoded a single time
  and reused by many lightweight billboard `Image`s. Because SVG decode is **async**, `ensure`
  first registers a correctly-sized transparent **placeholder** texture (so billboards are anchored
  and depth-sorted immediately) and **refreshes it in place** when the vector art finishes decoding.
  A **headless guard** (mirroring `audio.ts`) skips rasterization when a real `<canvas>`/`Image`
  SVG decode is unavailable (jsdom), so unit tests and the build stay green.
- Colors come from a **small, limited palette** derived from one accent color: the pure helper in
  `src/game/render/palette.ts` turns an accent + team-rim color into a fixed five-tone ramp
  (outline → shadow → base → light → team rim), emitted as `#rrggbb` SVG fills so every figure stays
  distinct by champion and keeps the ally/enemy rim tell.
- Phaser is configured for **smooth antialiased vector rendering** (`render: { antialias: true,
  roundPixels: false }` in `src/game/PhaserGame.tsx`) — the previous nearest-neighbor pixel-art
  config (`pixelArt: true`) is gone — so the baked vector textures scale up crisply under
  `Scale.FIT` instead of turning blocky.

### SVG skill icons

The **QWER ability bar** and **champion-select** ability cards render **inline DOM SVG** skill
icons (not bare `Q`/`W`/`E`/`R` letters) built by the pure, unit-tested
`src/game/render/abilityIcons.ts` (`abilitySvgFor`), consumed by `src/game/BattleHud.tsx` and
`src/components/AbilityCard.tsx`. The slot letter remains as a small label/fallback.

### SVG combat and skill effects

Combat and skill effects — projectiles, beams, AoE telegraph rings, cast flares, heals, dash
streaks, and death bursts — are also **SVG-baked VFX textures** (`vfxArt` in `svgArt.ts`, baked and
cached by kind + color via `SpriteFactory.ensureVfx` in `sprites.ts`), drawn as transient
billboards and animated with the existing tweens. Like the entity art, each VFX texture is
rasterized once and reused, and the VFX remain **cosmetic-only** — they never touch the
deterministic simulation.

### Combat juice ('타격감')

Hits carry deliberate **game feel**. `BattleScene.onDamage` is the single hit hook and fires,
scaled by an importance band (chip → normal → ability → ult → big/lethal, classified in the
pure `src/game/render/juice.ts`):

- **hit-flash** (a brief `setTintFill` on the struck sprite),
- **importance-scaled screen shake** (chip hits don't shake; a dedicated stronger shake on
  turret/Nexus destruction),
- cosmetic **knockback / recoil** (the struck billboard is nudged away from its attacker and
  tweened back),
- **squash-and-stretch** on the struck sprite,
- **impact spark particles** (a burst of small pixel blocks whose count scales with the hit),
- **juicy damage-number popups** (bigger, jitterier, heavier for larger hits), and
- a brief **kill slow-mo** on champion takedowns.

All of this juice is driven **only** off tweens, timers, camera, and transient VFX — it never
writes `unit.pos` or any simulation timer — so the deterministic, unit-tested `update()`
simulation is never perturbed. The numeric decisions behind the juice (how big a hit is, how
hard to shake, how far to nudge, spark counts, popup styling) live in the pure, Phaser-free,
unit-tested `src/game/render/juice.ts`.

The audio engine degrades to a no-op in headless/test environments where `AudioContext` is
unavailable, so builds and unit tests stay green.

---

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file
for the full text.

© 2026 Janghoon Lee
