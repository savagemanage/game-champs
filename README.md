# Arena Champions

A **League of Legends-inspired** web game: pick a champion in a stylized champion-select
screen, then fight a bot opponent in a fast single-lane **arena battle** where you push
minion waves, dodge skillshots, and race to destroy the enemy Nexus. Built as a
React + TypeScript single-page app with a **Phaser 3** game canvas, fully bilingual
(**한국어 / English**), and deployed to **GitHub Pages**.

> **Not affiliated with Riot Games.** All champion names, titles, abilities, and lore in
> this project are **original** and inspired only by generic MOBA archetypes (marksman,
> assassin, bruiser, mage, enchanter). "League of Legends" is a trademark of Riot Games,
> Inc.; this is an independent, non-commercial fan-style project and is not endorsed by or
> associated with Riot Games.

---

## Tech stack

- **Vite 5** – dev server and production bundler
- **React 18** + **TypeScript** (strict mode) – UI shell, screens, and HUD overlay
- **Phaser 3** – the real-time battle scene (rendered with pure shapes and tweens, no image assets)
- **react-i18next** (+ `i18next-browser-languagedetector`) – Korean and English locales with a persisted language toggle
- **Web Audio API** – 100% procedural sound effects (no binary audio files)
- **Vitest** + **@testing-library/react** – unit tests for pure game logic, i18n parity, and components

The pure game logic (`src/game/combat.ts`, `src/game/ai.ts`) is deliberately **Phaser-free**
so damage formulas, cooldowns, and bot decisions can be unit-tested without a canvas.

---

## How the game plays

1. **Main Menu** – start a match or open **Settings & Help**.
2. **Champion Select** – browse the roster, inspect a champion's stats and P/Q/W/E/R
   abilities, choose (or randomize) your opponent, and **Lock In**.
3. **Arena Battle** – a single lane with a Nexus and turret per side. Minion waves spawn
   periodically. Defeat the enemy champion, push with your minions, and destroy the enemy
   Nexus to win. Your bot rival is driven by the AI in `src/game/ai.ts`.
4. **Results** – a Victory/Defeat summary with match stats (duration, takedowns, minions
   slain, damage dealt). **Rematch** replays the same matchup; **Main Menu** returns home.

### Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move your champion |
| `Q` | Cast the Q ability toward the cursor |
| `W` | Cast the W ability toward the cursor |
| `E` | Cast the E ability toward the cursor |
| `R` | Cast the R (ultimate) toward the cursor |
| Mouse click | Move to the clicked point |

Basic attacks auto-fire at the nearest enemy in range. The same keybinds are documented,
localized, in the in-game **Settings & Help** panel (reachable from the header on every
screen), which also exposes **mute**, **master volume**, an **ambient sound** toggle, and
the **language** switch.

---

## Champion roster

Five original champions, one per archetype:

| Champion | Title | Role |
| --- | --- | --- |
| **Ashborne** | the Ember Archer | Marksman |
| **Nightveil** | the Silent Blade | Assassin |
| **Ironhold** | the Bulwark | Bruiser |
| **Embermage** | the Cinderweaver | Mage |
| **Dawnsong** | the Radiant Muse | Enchanter |

Each champion has a passive plus four abilities (Q/W/E/R) with tuned cooldowns, costs,
ranges, and damage. Full definitions live in `src/data/champions.ts`; all display text is
stored as i18n keys, not literal strings, so the roster is fully localizable.

---

## Internationalization (i18n)

The game ships in **Korean (한국어)** and **English**, switchable at runtime via the toggle
in the header or the Settings panel.

- Locale bundles: `src/i18n/locales/ko.json` and `src/i18n/locales/en.json`.
- The two files **must** have an identical key structure. The parity test in
  `src/i18n/i18n.test.ts` fails the build if a key is missing from either locale.
- The active language is detected from `localStorage` (key `lol-lang`) then the browser,
  and cached back to `localStorage` so the choice persists across reloads.

### Adding a new locale

1. Copy `src/i18n/locales/en.json` to `src/i18n/locales/<lang>.json` and translate every value.
2. Register it in `src/i18n/index.ts`: add `<lang>` to `SUPPORTED_LANGUAGES` and add
   `<lang>: { translation: <lang>Json }` to the `resources` map.
3. Add a display label under the `language.<lang>` key in **every** locale file.
4. Run `npm run test -- --run` to confirm key parity (note: the current parity test compares
   `ko` and `en`; extend it if you add more locales).

---

## Local development

Requires **Node 22** and npm.

```bash
npm install          # install dependencies
npm run dev          # start the Vite dev server (hot reload)
npm run build        # type-check (tsc -b) then produce dist/
npm run preview      # serve the production build locally
npm run test         # run unit tests in watch mode
npm run test -- --run  # run unit tests once (CI mode)
npm run typecheck    # tsc --noEmit type-check only
```

---

## GitHub Pages deployment

This app is served from the **`/game-champs/`** subpath because it is a GitHub **project
page** (not a user/organization root page). That subpath is configured in `vite.config.ts`:

```ts
export default defineConfig({
  base: '/game-champs/',
  // ...
});
```

Deployment is automated by `.github/workflows/deploy.yml`:

- On every push to `main` (or a manual `workflow_dispatch`), the workflow installs
  dependencies with `npm ci`, runs `npm run build`, and uploads the `dist/` folder as a
  Pages artifact, then deploys it with `actions/deploy-pages`.
- Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Once deployed, the site is available at:

```
https://savagemanage.github.io/game-champs/
```

(Replace `savagemanage` with your GitHub username/org if you fork the project. If you rename
the repository, update `base` in `vite.config.ts` to match the new subpath.)

---

## Project structure

```
src/
  App.tsx                     # app shell + screen router (menu | select | battle | result)
  main.tsx                    # React entry: imports i18n + global styles
  components/
    AbilityCard.tsx           # ability tooltip card
    ChampionCard.tsx          # roster tile (CSS-art portrait)
    LanguageToggle.tsx        # ko/en segmented switch
    SettingsPanel.tsx         # localized settings + help modal (keybinds, audio, language)
  screens/
    MainMenu.tsx              # landing screen
    ChampionSelect.tsx        # roster browse + lock-in
    BattleScreen.tsx          # hosts the Phaser canvas + React HUD
    ResultScreen.tsx          # win/lose summary + rematch / menu
  game/
    combat.ts                 # pure combat math (Phaser-free, unit-tested)
    ai.ts                     # pure bot decision logic (Phaser-free, unit-tested)
    audio.ts                  # procedural WebAudio SFX engine + persisted settings
    battleStore.ts            # external store bridging the scene and the React HUD
    BattleHud.tsx             # React overlay HUD (useSyncExternalStore)
    PhaserGame.tsx            # mounts a single Phaser.Game, StrictMode-safe
    scenes/BattleScene.ts     # the arena scene: units, waves, VFX, camera juice
  data/champions.ts           # typed champion roster (i18n keys, stats, abilities)
  i18n/                       # react-i18next setup + ko/en locale JSON
  styles/global.css           # dark/gold LoL-inspired theme + responsive layout
.github/workflows/deploy.yml  # GitHub Pages build + deploy
```

---

## Notes on assets and audio

There are **no binary art or audio assets**. Champion portraits are CSS gradients with
initials, the battle is drawn entirely with Phaser shapes/tweens, and all sound effects
(ability cast, hit, death, victory/defeat stings, and an optional ambient drone) are
synthesized at runtime with the Web Audio API. The audio engine degrades to a no-op in
headless/test environments where `AudioContext` is unavailable, so builds and unit tests
stay green.
