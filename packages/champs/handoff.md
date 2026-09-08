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

## Known non-blocking follow-ups

- Resolved: Phaser is now split into its own vendor chunk and the chunk-size advisory is tuned so the app chunks no longer trip it.
- Resolved: role selection now uses a deterministic seeded rotation of eligible champions, preserving the disjoint/no-mirror contract.
- Resolved: every roster champion now has a distinct silhouette. Each of the ten champions layers a deterministic, palette-driven signature motif (headpiece / weapon detail / emblem) over its role body in `src/game/render/svgArt.ts`, so same-role siblings are no longer recolors of each other; embermage keeps its bespoke pose-aware art, and unknown / `generic-<role>` ids still render the plain role body. Combat VFX stay tinted by each caster's unique accent (per-champion texture family via the `(kind, color)` cache) and the cast flare carries a small color-seeded signature flourish.
- VFX signature depth is intentionally scoped to accent tint plus the cast-flare flourish to keep the `vfxArt(kind, color)` cache key and asset budget stable; deeper per-champion VFX shapes remain an option if the texture budget allows.
- If champion battle visuals need to be reflected in the landing-page thumbnails, a maintainer should re-run `npm run thumbs` (needs Playwright); thumbnail churn is intentionally not committed here.

## Delivery

The package is served from `/open-games/champs/`. Merges to `main` trigger the repository Pages workflow. Workflow changes must always go through review; this feature does not require a workflow edit.
