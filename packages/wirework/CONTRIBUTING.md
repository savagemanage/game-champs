# Contributing to Wirework

Thanks for your interest in improving **Wirework** — an original-world 2D
pixel-art top-down wall-defense ODM action game built with Phaser 3. This guide
covers how to set up the project, run the checks, and submit changes.

> **Repo-wide rules live in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md).** That guide
> covers the monorepo: adding a workspace, the `game.json` metadata, the deploy pipeline, and
> the original-naming policy. This file covers what is specific to Wirework - its asset
> pipeline, its config layout, and its own IP boundary.

## 1. Setup

- Requires **Node 22** and **npm 11**.
- Wirework is a workspace of the [open-games](../../README.md) monorepo, so install from the
  **repo root**, not from this directory:

  ```bash
  npm install          # from the repo root
  ```

## 2. Dev / test / build

```bash
npm run dev       # start the Vite dev server (hot reload)
npm test          # run the vitest suite once (vitest run)
npm run build     # type-check + production build into dist/
npm run typecheck # type-check only (tsc --noEmit)
```

## 3. Code style

- **TypeScript strict.** Keep the code fully typed; no `any` escape hatches
  unless there is no alternative.
- **Config-driven tuning.** All balance and gameplay numbers live in
  `src/config/*.ts` (`GameConfig`, `PlayerConfig`, `EnemyConfig`, `WaveConfig`,
  `Difficulty`). Tune values there instead of hard-coding constants in scenes,
  entities, or systems.
- **Keep files reasonably sized** and focused; match the existing structure and
  the JSDoc header block-comments that describe each file's design.
- **Assets are generated, not hand-edited.** The pixel-art sprites and audio in
  `public/assets/` are produced by the Python scripts in `tools/`
  (`gen_sprites.py` needs [Pillow](https://python-pillow.org/); `gen_audio.py`
  is stdlib-only). Edit the generators and regenerate — do **not** hand-edit the
  output PNG/WAV files.

## 4. How to contribute

1. Fork the repository.
2. Create a feature branch off `main`.
3. Make your change, keeping the build green:

   ```bash
   npm run typecheck && npm test && npm run build
   ```

   All three must pass before you submit.
4. Open a Pull Request against `main` describing what you changed and why.

## 5. IP boundary (firm)

Wirework is **original work**. Do **not** add "Attack on Titan" — or any other
third-party — names, lore, characters, canonical creature names, factions, story,
or art. Contributions may only include **original** or CC0-compatible /
redistribution-permitting assets, and **every asset must be recorded in**
[`assets/CREDITS.md`](assets/CREDITS.md) with its provenance and license.

## 6. Reporting / contact

Questions, bug reports, and feature ideas go through **GitHub Issues**:
<https://github.com/savagemanage/open-games/issues>.

By contributing, you agree that your contributions are licensed under the
project's [Apache-2.0](LICENSE) license.
