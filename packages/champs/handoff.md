# Handoff — Arena Champions

## Product state

Arena Champions is an original React + TypeScript + Phaser 3 three-lane arena battler deployed at <https://savagemanage.github.io/open-games/champs/>. It is bilingual (Korean/English), responsive, locally playable against AI, and designed around a compact 10–15 minute match.

Implemented systems:

- Three-Lane Conquest and Midline Skirmish modes.
- Ten original champions; deterministic team composition selects five distinct champions per side, one per role, without mirror matchups.
- Contextual local AI with difficulty-specific reaction and decision cadence.
- Structures, minion waves, jungle terrain markers, neutral objectives, leveling, gold, recipes, purchases, death/respawn, and deterministic hard-cap resolution.
- Procedural SVG champion/world art, finite combat poses, VFX, procedural music/ambience/SFX, and reduced-motion support.
- Learning Match, practice, difficulty selection, account progression, currency, champion unlocks, mastery, Continue, and versioned local saves.
- Privacy-first, opt-in local diagnostics with GPC/DNT handling, coarse crash/performance events, manual JSON export, and no remote endpoint.
- Versioned online protocol, local authority, transport, matchmaking descriptors, snapshots, and reconnect contracts. The shipped GitHub Pages game remains honest local play: `network: 'none'`, no internet opponents.

## Architectural boundaries

- `BattleScene` and pure game modules own authoritative combat state.
- React owns navigation, HUD, settings, shop, loading, and result presentation.
- `battleStore` is the one-way scene-to-HUD bridge and publishes at most 10 times per second.
- Pure rules stay Phaser-free and unit tested.
- Gameplay math remains on the flat top-down plane; dimetric projection is rendering-only.
- Team composition remains deterministic and disjoint across ally/enemy champion sets.
- The 900×640 logical arena preserves its aspect ratio on every viewport.
- Art and audio remain original procedural content; local fonts include license files.
- Do not imply online matchmaking until an authenticated authoritative backend exists.
- Do not add a remote telemetry endpoint without an explicit privacy/product decision and server design.

## Key paths

- `src/config/matchRules.ts` — mode rules and match timing.
- `src/game/scenes/BattleScene.ts` — simulation/render integration.
- `src/game/{combat,ai,championLifeState,matchResolution}.ts` — pure game rules.
- `src/game/rift/` — map, economy, waves, structures, objectives, loadout, projection, and team composition.
- `src/game/render/` — procedural art, sprites, icons, palettes, and impact tuning.
- `src/game/audio.ts` — procedural audio buses and champion cues.
- `src/data/champions.ts` — ten original champions with at least two candidates per role.
- `src/profile/` — local save, migration, unlocks, rewards, and mastery.
- `src/game/tutorial/` — match kind and difficulty configuration.
- `src/online/` — local-only network-readiness foundation.
- `src/telemetry/` — explicit consent, redaction, queues, sinks, capture, sampling, runtime composition.

## Verification expectations

Run from the repository root:

```bash
npm run typecheck
npm run test
npm run build
npm run docs:check
git diff --check
```

Browser QA should cover Korean and English; Learning Match, practice, and standard flows; Conquest and Midline modes; Continue; unlocks; same-pick and de-mirrored team composition; shop recommendations; settings/diagnostics; reduced motion; desktop; mobile portrait; and mobile landscape. Inspect the browser console and screenshots, not only assertions.

## Recently implemented

The three previously-listed non-blocking follow-ups are now done. All invariants in
"Architectural boundaries" above were preserved.

- **Bundle chunking / Vite size advisory (resolved).** `vite.config.ts` now defines
  `build.rollupOptions.output.manualChunks`, splitting Phaser into its own long-cacheable
  `phaser` vendor chunk (with `react-vendor` and `i18n-vendor` for the other big deps), and
  raises `build.chunkSizeWarningLimit` to `1700` (just above Phaser's ~1.48MB minified size).
  Phaser stays lazy-loaded behind the existing dynamic import of the battle view, so the title
  screen never eagerly pulls the engine. The production build no longer prints the
  "Some chunks are larger than 500 kB" advisory. Build-config-only change: no gameplay,
  rendering, or Vitest-config behavior changed; the `base` production/dev branch is unchanged.

- **Seeded role-selection rotation (resolved).** `src/game/rift/teams.ts` `composeTeams` now
  takes an optional `seed` (string or number). A new pure, Phaser-free RNG in
  `src/game/rift/rng.ts` (`xmur3` seed hash + `mulberry32`) drives a deterministic
  Fisher-Yates ordering of each role's eligible pool, so different matchups can field the
  second candidate in a role instead of always the first. Fill order, the
  ally-first-then-enemy-avoids-ally structure, the fallback chain, and forced-pick drop on
  collision are unchanged, so composition stays deterministic, disjoint, and free of mirror
  matchups (same-pick still de-mirrors). `BattleScene.spawnTeams()` passes a deterministic
  matchup seed `${player.id}:${enemy.id}:${mode}` (no `Math.random`/`Date.now`).

- **Champion silhouette + signature VFX differentiation (resolved).** `src/game/render/svgArt.ts`
  now layers a deterministic, palette-driven signature motif (headpiece / weapon detail /
  emblem) over each role body for all ten roster champions, so same-role siblings are no longer
  recolors of one another. `embermage` keeps its bespoke pose-aware art, and unknown /
  `generic-<role>` ids still render the plain role body (the sprite factory's fallback is
  intact). The same art path feeds both the battle renderer and the DOM `ChampionFigure`.
  Combat VFX stay tinted by each caster's unique accent (a per-champion `(kind, color)` texture
  family) and the cast flare carries a small color-seeded signature flourish; the
  `vfxArt(kind, color)` signature and cache key are unchanged.

Verification (from the repository root): `npm run typecheck` clean across all workspaces;
`npm run test` green (champs: 35 files / 422 tests, up from 398; new tests cover the seeded
RNG, seeded composition determinism/variety/invariants, and per-champion silhouette/VFX
determinism and differentiation); `npm run build` succeeds and champs emits a distinct
`phaser` vendor chunk (~1.48MB) with the entry chunk down to ~144kB and no size advisory;
`npm run docs:check` reports the generated README tables up to date; `git diff --check` clean.

## Remaining non-blocking follow-ups

- VFX signature depth is intentionally scoped to accent tint plus the cast-flare flourish to
  keep the `vfxArt(kind, color)` cache key and asset budget stable; deeper per-champion VFX
  shapes (bespoke projectile/beam/impact silhouettes) remain an option if the texture budget
  allows.
- Champion battle visuals changed materially, so the landing-page thumbnail may be stale. A
  maintainer should re-run `npm run thumbs` (needs Playwright) to refresh `champs/thumb.png`;
  thumbnail churn is intentionally not committed as part of this change.

## Delivery

The package is served from `/open-games/champs/`. Merges to `main` trigger the repository Pages workflow. Workflow changes must always go through review; this feature does not require a workflow edit.
