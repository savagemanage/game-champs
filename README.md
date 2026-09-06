# game-champs

A **monorepo of five browser games**, built with TypeScript + Vite and deployed together to a
single GitHub Pages site. The repo uses **npm workspaces**: one root `npm install`, one root
lockfile, and shared hoisted dependencies across every game.

> **Not affiliated with any game studio.** All names, characters, abilities, items, and lore in
> these projects are **original** works inspired only by generic genre archetypes.

---

## The games

Each game lives in its own workspace under `packages/`:

| Package | Game | Stack | Summary |
| --- | --- | --- | --- |
| [`packages/champs`](./packages/champs) | **Arena Champions** | React 18 + TypeScript + Phaser 3 | A League-of-Legends-style MOBA on a full three-lane 5v5 Summoner's Rift, with a Hextech-style champion select, turrets/inhibitors/Nexus, minion waves, jungle and epic monsters, and a 2.5D SVG vector-art battle view. Bilingual 한국어 / English (Korean default). |
| [`packages/whiteout`](./packages/whiteout) | **Frosthold: Last Ember** (서리성채) | Vite + TypeScript + Phaser 3.80 | A frozen-survival strategy game. |
| [`packages/lastwar`](./packages/lastwar) | **LAST SQUAD** (라스트 스쿼드) | Vite + TypeScript + Phaser 3.80 | A squad survival / last-stand action game. |
| [`packages/kingshot`](./packages/kingshot) | **Kingdom Rise** | Vite + TypeScript + Phaser 3.80 | A kingdom-building / defense game. |
| [`packages/wirework`](./packages/wirework) | **Wirework** | Vite + TypeScript + Phaser 3.80 | An original-world 2D pixel-art wall-defense ODM action game. See [`packages/wirework/CONTRIBUTING.md`](./packages/wirework/CONTRIBUTING.md). |

`packages/champs` is React + Phaser; the other four are plain Vite + TypeScript + Phaser 3.80
(no React). Every game ships with its own `README.md`, tests, and (where applicable) asset
generators under `tools/`.

> The original single-game Arena Champions README now lives at
> [`packages/champs/README.md`](./packages/champs/README.md).

---

## Repository layout

```
game-champs/
├── package.json              # root: npm workspaces + fan-out scripts
├── package-lock.json         # single lockfile for all workspaces
├── LICENSE                   # single Apache-2.0 license for the whole repo
├── .gitignore                # consolidated ignore rules
├── site/
│   └── index.html            # root landing page linking to each game
├── packages/
│   ├── champs/               # Arena Champions (React + Phaser)
│   ├── whiteout/             # Frosthold: Last Ember
│   ├── lastwar/              # LAST SQUAD
│   ├── kingshot/             # Kingdom Rise
│   └── wirework/             # Wirework
└── .github/workflows/deploy.yml   # builds all five games + landing page, deploys to Pages
```

---

## Getting started

Requires **Node 22** and **npm 11**.

Install everything with a **single root install** — npm workspaces hoist and share
dependencies across all five games, and produce one root `package-lock.json`:

```bash
npm install            # from the repo root; installs all workspaces
```

Do **not** run `npm install` inside individual packages — the workspaces setup handles them.

---

## Working on one game

Use npm's `-w` (workspace) flag to target a single package. Examples:

```bash
npm run dev -w packages/whiteout        # start the Vite dev server for one game
npm run build -w packages/champs        # type-check + production build for one game
npm run test -w packages/lastwar        # run one game's unit tests
npm run typecheck -w packages/kingshot  # type-check only, no emit
```

Replace `packages/<g>` with any of `champs`, `whiteout`, `lastwar`, `kingshot`, or `wirework`.
Each game builds with Vite and emits to `packages/<g>/dist`.

---

## Root fan-out scripts

The root `package.json` provides scripts that run across **all** workspaces via
`--workspaces --if-present`:

```bash
npm run build        # build every game
npm run test         # run every game's tests
npm run typecheck    # type-check every game
```

There are also `dev:<game>` shortcuts at the root (e.g. `npm run dev:whiteout`) that map to
`npm run dev -w packages/<game>`.

---

## Deployment & subpath scheme

All five games deploy to a **single GitHub Pages site** at:

```
https://savagemanage.github.io/game-champs/
```

The Pages workflow at `.github/workflows/deploy.yml` builds each game and a root landing page,
then publishes them together. Each game is served under its own subpath, matching the
`base` configured in that game's `vite.config.ts` (production base `/game-champs/<g>/`, dev base
`/`):

| URL | Source |
| --- | --- |
| `https://savagemanage.github.io/game-champs/` | root landing page (`site/index.html`) |
| `https://savagemanage.github.io/game-champs/champs/` | `packages/champs` |
| `https://savagemanage.github.io/game-champs/whiteout/` | `packages/whiteout` |
| `https://savagemanage.github.io/game-champs/lastwar/` | `packages/lastwar` |
| `https://savagemanage.github.io/game-champs/kingshot/` | `packages/kingshot` |
| `https://savagemanage.github.io/game-champs/wirework/` | `packages/wirework` |

Enable Pages once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

---

## License

This project is licensed under the **Apache License 2.0**. A single [LICENSE](./LICENSE) file at
the repo root applies to every workspace; each package's `package.json` also declares
`"license": "Apache-2.0"`.

© 2026 Janghoon Lee
