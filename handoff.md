# wirework - Living Handoff

This is the SINGLE living handoff document for the wirework project. It is
maintained **overwrite-in-place**: keep exactly one always-current `handoff.md`
at the repo root. Do NOT start an accumulating series of dated handoff files.
Update this file in place as the project evolves.

프로젝트의 단일 인수인계 문서입니다. 항상 최신 상태 하나만 유지하고, 날짜별로
쌓지 말고 이 파일을 덮어써서 갱신하세요. (English body below is authoritative.)

There is no separate steering document. The former `.kiro/steering/wirework.md`
has been deleted; the technical constraints it carried are recorded here (see
"Hard technical constraints") and must still be obeyed because they are physical
web-export requirements, not style preferences.

---

## Project summary

Godot 4.7.2 3D game, GDScript only, Compatibility (`gl_compatibility`) renderer,
targeting a WebGL2 web export. Originally an evolution-research grapple game,
now being pivoted into an action tower-defense that still evolves its enemies.

## Architecture and module layout

Repo root is `titan-game/` (github.com/savagemanage/wirework).

### Scenes (`scenes/`)
- `Main.tscn` - top-level wiring: Arena + Player + GameManager + UI +
  EvolutionScreen.
- `Arena.tscn` - the play space (flat base + plateaus/towers + a
  `NavigationRegion3D` + `PlayerSpawn`/`TitanSpawn` markers).
- `Player.tscn` - true first-person rig: own `MeshInstance3D` +
  `CharacterModel` (`visible=false`), camera under `YawPivot(y=1.65)`/
  `PitchPivot`, blade viewmodel under the camera. Runs `player.gd` + `slash.gd`.
- `Titan.tscn` - `CharacterBody3D` (collision_layer=4), `Nape` `Area3D`
  (collision_layer=8), `CapsuleShape3D` height 12 radius 2, `CharacterModel`
  running `character_visual.gd` at model_scale 8.
- `StartScreen.tscn` - the entry/start screen.

### Scripts (`scripts/`)
- `game_manager.gd` - round lifecycle, spawns titans, injects genes, drives the
  evo screen, owns the telemetry sampling loop, runtime-bakes the navmesh.
- `player/` - `player.gd` (first-person movement), `slash.gd` (ShapeCast3D
  continuous-damage sweep + kill threshold), `slash_fx.gd`, `grapple.gd`,
  `damage_preview.gd` (shared PURE damage `f(rel_speed, angle)`),
  `character_visual.gd` (guarded GLB loader with a primitive fallback).
- `titan/` - `titan.gd` (chase + receive_slash), `titan_sfx.gd`,
  `titan_evo_bridge.gd` (the ONLY coupling between the pure evo core and live
  scenes: reads Telemetry, drives background evolution, exposes best genome).
- `evo/` - PURE evolution core (RefCounted only, scene-free): `genome.gd`
  (6 fixed genes), `steering_policy.gd` (hybrid weighted-direction policy),
  `fitness.gd`, `background_sim.gd` + `sim_replay.gd` (own fixed-step numeric
  integrator, NOT Godot physics), `population.gd` (pop 50, elitism 1),
  `evo_manager.gd` (splits evaluation across frames), `snapshot.gd`
  (`user://wirework_evo.json` persistence + migration), and
  `harness/ga_harness.gd` (headless CSV verification harness). See
  `scripts/evo/README.md`.
- `telemetry/` - PURE recording/derived-metrics layer (RefCounted only, except
  the `Telemetry` autoload which is the only scene-touching piece):
  `telemetry.gd`, `round_recorder.gd`, `round_metrics.gd`,
  `engagement_window.gd`, `player_model.gd`, `telemetry_store.gd`
  (`user://wirework_telemetry.json`). See `scripts/telemetry/README.md`.
- `ui/` - `start_screen.gd`, `round_end_panel.gd`, `nape_indicator.gd`,
  `evolution_screen.gd`, `evo_sim_view.gd`, `evo_indicators.gd`,
  `comparison_scene.gd`, `loading_screen.gd`.
- `audio/` - `sfx.gd`, `sfx_bank.gd`.
- `settings/` - `settings.gd` (owns `locale_changed`), `audio_settings.gd`.

### Localization
- `locale/ui.csv` (columns `keys,en,ko`) resolved via `tr(KEY)`. The HUD
  re-localizes on `Settings.locale_changed`. `ui.*.translation` are regenerated
  from the CSV by the editor/headless import (gitignored where applicable).

### Assets (`assets/`)
- `models/`, `textures/`, `sky/`, `particles/`, `audio/`, and an append-only
  license ledger `CREDITS.md`. Every downloaded asset must record source URL +
  verified license there. No IP-encumbered (Attack-on-Titan) assets or proper
  nouns: generic soldiers and generic giant humanoids only.

### Tools harness (`tools/`) and tests (`tests/`)
- `tools/setup-godot.sh` - idempotent download of the standard (non-mono) Godot
  4.7.2 linux x86_64 into `.godot-bin/godot` (gitignored). No sudo.
- `tools/check.sh` - import + parse gate. Imports the project (registers
  `class_name`) then headless-quits; fails on `SCRIPT ERROR`/`Parse Error`/
  `Failed to load`.
- `tools/test.sh` - headless SceneTree test runner.
- `tools/screenshot.sh` - renders one frame of `scenes/Main.tscn` to
  `reports/shot.png` (run under `xvfb-run`).
- `tools/report.sh` - reporting helper.
- `tests/cli.gd` - from-scratch SceneTree test runner (NO addons; GUT/gdUnit4
  are forbidden) over `tests/cases/*.gd`. `tests/case.gd` is the `TestCase` base
  (a plain `RefCounted` with `test_*` methods; the runner injects a freshly
  seeded RNG per method). `tests/shot.gd` and `tests/report.gd` back the
  screenshot/report tools.

## Hard technical constraints (carried forward, must never be violated)

These are physical web-export requirements. Obey them in every change.

- Godot **4.7.2 standard build** (NOT .NET/mono).
- **GDScript only** - no C#, no GDExtension, no native code, no new addons.
- **`gl_compatibility` renderer**.
- **Single-thread web-safe**: NO `Thread`/`Mutex`/`Semaphore`/
  `WorkerThreadPool`, and NO `SubViewport`. Long work is split across frames.
- Every `.gd` file is **<= 250 lines**.
- **Tuning constants gathered at file tops** as named `const`s - no magic
  numbers buried in the body.
- Persistence via **`user://` + `FileAccess` + `JSON`** only, and
  **save-failure-non-fatal**: a failed save `push_warning`s and continues;
  missing/corrupt files load clean.
- **Navmesh is runtime-baked** (never "bake in editor").
- `scripts/evo/` and `scripts/telemetry/` are **RefCounted-only, scene-free,
  plain-data in/out**: no `Node`, no `get_tree()`/`get_node()`/autoload access,
  no scene/node arguments - only plain vectors/dicts/arrays cross the boundary,
  so the modules stay headless-verifiable and liftable.
- **All randomness via an injected `RandomNumberGenerator`** - never global
  `randf()`/`randi()` - so runs are deterministic.

## How to run the harness

From the repo root (`titan-game/`):

```
./tools/check.sh                      # import + parse gate; exit 0 on success
./tools/test.sh                       # headless SceneTree tests; exit 0 on pass
xvfb-run -a ./tools/screenshot.sh     # renders scenes/Main.tscn -> reports/shot.png
```

GA verification harness (numbers, not unit tests) - dumps CSVs under `user://`:

```
godot --headless --path . --script res://scripts/evo/harness/ga_harness.gd
```

(`godot` above is the installed `.godot-bin/godot`.)

## Design (action tower-defense)

_Placeholder. This section is intentionally empty at the housekeeping baseline
and will be filled in by the following features (FEAT-002..FEAT-006). Expect it
to be updated in place by those features:_

- Aim fix (first-person crosshair/slash alignment).
- Wall-Maria concentric-wall map + citizen area.
- Titan HP + per-part damage + citizen-eating + wall-breach behaviour.
- GA fitness / gene redefinition toward infiltration (citizens-eaten + breach).
- Character models (soldiers + giant humanoids) via the guarded GLB loader.

## Workflow

Work happens directly on `main` and is published immediately. Commit locally in
clean, coherent commits (one per feature). Keep this `handoff.md` current.
