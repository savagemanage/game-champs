# Contributing to open-games

Thanks for your interest in this repo. **open-games** is a monorepo of original browser games
built with TypeScript + Vite + Phaser 3, deployed together to one GitHub Pages site.

This guide covers **repo-wide** rules: how to add a game, what checks a change has to pass, and
the naming policy every game here follows. A game may add its own guide for rules specific to
it - for example [`packages/wirework/CONTRIBUTING.md`](./packages/wirework/CONTRIBUTING.md),
which covers that game's asset pipeline and config layout. Where the two overlap, this file
wins on repo-wide matters (workspaces, metadata, deploy, naming) and the package guide wins on
that game's internals.

---

## Setup

Requires **Node 22** and **npm 11**. Install once, from the repo root:

```bash
npm install
```

Never run `npm install` inside a package - npm workspaces handle every game from the root
lockfile.

---

## Adding a new game

Adding a game means **adding one workspace under `packages/`**. No shared file has to be
edited: the landing page, the README tables, and the Pages workflow all discover the game from
its `game.json`.

### 1. Copy the template and substitute the slug

```bash
npm run new-game -- --slug foo --title "Foo Quest"
```

This copies [`packages/_template`](./packages/_template) to `packages/foo` and replaces the
`__slug__` and `__title__` placeholders everywhere. To do it by hand, copy the directory and
replace both tokens yourself.

Pick a slug that works as a directory name, a URL subpath, and an npm name suffix: lowercase
letters, digits and hyphens, 3-32 characters, starting with a letter.

### 2. Write `game.json`

`packages/<slug>/game.json` is the metadata every repo-level tool reads:

```json
{
  "slug": "foo",
  "title": "Foo Quest",
  "titleKo": "포오 퀘스트",
  "genre": "Action Roguelike",
  "summary": "One-line English summary.",
  "summaryKo": "한 줄 한국어 요약.",
  "stack": ["typescript", "phaser3"],
  "status": "wip",
  "thumbnail": "thumb.png"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `slug` | yes | Must equal the directory name |
| `title` | yes | English title |
| `titleKo` | no | Korean title; leave `""` if the game has none |
| `genre` | yes | Short genre label, e.g. `Strategy / Idle` |
| `summary` | yes | One line of English |
| `summaryKo` | no | One line of Korean |
| `stack` | yes | Tokens beyond the shared base, e.g. `["react", "typescript", "phaser3"]` |
| `status` | yes | `playable`, `wip`, or `archived` |
| `thumbnail` | no | Path inside the package, e.g. `thumb.png`. Omit it and the landing page draws a monogram placeholder instead |

Thumbnails are captured, not hand-made. Once the game runs:

```bash
npm run build          # assemble _site/ first
npm run thumbs         # writes packages/<slug>/thumb.png for every game
```

`npm run thumbs` opens each game in headless Chromium, waits for the title
screen to settle, and shoots the game canvas. It needs `playwright` installed
locally (`npm i -D playwright`) and is a maintainer tool, not part of the build:
the PNGs are committed so a normal `npm run build` stays fast and browser-free.
Re-run it when a game's look changes.

`status` drives the listings: `wip` games are listed with a badge, `archived` games are dropped
from the landing page and the README entirely. Start at `wip` and switch to `playable` when the
game is worth playing.

Anything you do not know yet, leave as an empty string rather than guessing - the build
validates types and required fields, not accuracy.

### 3. Check the Vite base

`packages/<slug>/vite.config.ts` must branch on the build command:

```ts
base: command === 'build' ? '/open-games/<slug>/' : '/',
```

Production assets resolve under the game's Pages subpath; the dev server serves from `/`. The
template already has this - just confirm the slug is right.

### 4. Run every check from the root

```bash
npm install          # link the new workspace
npm run typecheck    # tsc --noEmit across every game
npm run test         # every game's unit tests
npm run build        # build every game, then the landing page into _site/
npm run docs:readme  # refresh the generated README tables
```

All four must pass, and `npm run docs:readme` must leave no uncommitted README diff (check with
`npm run docs:check`). Open `_site/index.html` to confirm the new card renders.

---

## Naming and IP policy

Every game in this repo is an **original work**. This is not negotiable and it applies to code,
assets, docs, commit messages, and metadata alike.

- **Do not use real commercial game titles, character names, faction names, item names, or
  worldbuilding terms** from any existing property - not in `game.json`, not in the README, not
  in source identifiers, not in asset filenames, not in a comment explaining "what this is
  like".
- Describe a game by its **genre archetype** instead: "three-lane MOBA", "frozen-survival
  city-builder", "lane gate-runner". Genres are not owned by anyone; names are.
- Invent your own names for characters, abilities, items, and places. If a name reads as a
  near-miss of an existing one, it is too close - pick another.
- Assets must be original or clearly licensed. Record provenance in the package's
  `assets/CREDITS.md`.
- The repo-root README carries a **"not affiliated with any game studio"** statement. Keep it
  true.

---

## Code style

- **TypeScript strict.** No `any` escape hatches unless there is genuinely no alternative.
- **Config-driven tuning.** Keep balance numbers in `src/config/*.ts`, not inline in scenes.
- **Test the pure logic.** Economy formulas, wave composition, combat resolution and save
  serialization belong in Vitest specs. Rendering and feel stay play-test verified.
- **Match the surrounding file** in structure, naming, and comment density.

---

## Repo-level scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Every game, then the landing page into `_site/` |
| `npm run build:games` | Every game only |
| `npm run build:site` | Landing page only (`node site/build.mjs`, `--out` to redirect) |
| `npm run test` | Every game's tests |
| `npm run typecheck` | Every game's type check |
| `npm run docs:readme` | Regenerate the README tables from `game.json` |
| `npm run docs:check` | Fail if those tables are stale |
| `npm run new-game` | Scaffold `packages/<slug>` from the template |
| `npm run thumbs` | Re-capture every game's landing-page thumbnail (needs playwright) |

The pieces behind them:

- `scripts/lib/games.mjs` - loads and validates every `packages/*/game.json`; the only code
  that walks `packages/`.
- `site/index.template.html` + `site/build.mjs` - landing-page markup and its generator. Never
  add a game link to the template by hand.
- `.github/workflows/deploy.yml` - globs `packages/*/dist`, so it names no game and needs no
  edit when a workspace is added.

If you find yourself editing one of these to add a game, something is wrong - the metadata
should have been enough.

---

## Submitting a change

1. Branch from `main`.
2. Keep the change focused; one concern per pull request.
3. Make sure `npm run typecheck`, `npm run test`, `npm run build` and `npm run docs:check` all
   pass from the root.
4. Describe what changed and why in the pull request body.

---

## License

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](./LICENSE), the single license covering this whole repo.
