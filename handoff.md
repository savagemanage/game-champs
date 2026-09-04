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

_Filled in incrementally by FEAT-002..FEAT-006, overwrite-in-place. Remaining
placeholders below are updated by their owning feature:_

- **Aim fix (first-person crosshair/slash alignment) - DONE (FEAT-002).**
- **Wall-Maria concentric-wall map + citizen area - DONE (FEAT-003).**
- **Titan fixed HP + per-part damage + wall-assault/breach/eat behaviour - DONE (FEAT-004).**
- GA fitness / gene redefinition toward infiltration (citizens-eaten + breach).
- Character models (soldiers + giant humanoids) via the guarded GLB loader.

### First-person aim alignment (FEAT-002)

**Problem.** The old titan was a 12 m capsule centred at local y=6 (spanning
world y≈2..14 when spawned on the y=2 base), with the nape at local y=10.5. The
player eye sat at `YawPivot y=1.65`. A level-aimed centred crosshair therefore
raked the titan's feet/waist far below any hittable mass, and the nape sat far
overhead - aiming straight ahead hit ground or shins, not the titan.

**Fix (geometry + a modest eye lift, no round-scaling).** All values are FIXED
constants; nothing scales with the round number.

- `scenes/Titan.tscn` - titan shrunk to a compact-but-clearly-giant humanoid:
  - `CapsuleShape3D` / `CapsuleMesh` body: **height 5.0, radius 1.6** (was
    12.0 / 2.0).
  - Body `CollisionShape3D` + `MeshInstance3D` y-offset: **2.5** (was 6.0), so
    the capsule spans local y≈0..5 (world ≈2..7 on the base) and its torso sits
    near the player's sightline at engagement range.
  - `CharacterModel model_scale`: **3.4** (was 8.0), proportional to the smaller
    capsule so the GLB (when imported) still fills the body.
  - `NavigationAgent3D`: **radius 1.8, height 5.0** (was 2.5 / 12.0) to match the
    new footprint for avoidance/pathing.
  - `Nape` `Area3D` (weak point, **collision_layer 8** preserved): moved to local
    **(0, 4.3, -1.5)** (was (0, 10.5, -2.3)) - the back of the neck near the top
    of the resized body. Nape `BoxShape3D`/`BoxMesh` shrunk to **1.8 x 1.4 x 1.0**
    (was 3.0 x 2.5 x 1.5).
- `scenes/Player.tscn` - `YawPivot` eye height raised **1.65 -> 2.2** m (a
  soldier-plausible stance, kept near human height per the "don't move the eye
  far from ~1.65 m" rule). This lifts the level sightline onto the titan's upper
  torso / neck line so the centred crosshair overlaps the hittable body just
  below the nape.
- `scripts/player/slash.gd` - `BLADE_REACH` **unchanged at 2.8 m**. The blade
  tip still rides the camera centre ray (`_blade_tip_world` via
  `project_ray_origin`/`project_ray_normal` at screen centre), so the sweep
  endpoint lands under the crosshair, and 2.8 m still reaches the resized titan's
  nape when the player closes to melee (`ARRIVAL_DISTANCE 2.5`) and tilts up.

**Result.** In a freshly rendered `reports/shot.png` the centred crosshair (+)
overlaps the nearest titan's torso/neck region (just under the nape indicator),
not the ground or the titan's feet. `./tools/check.sh` and `./tools/test.sh`
both exit 0.

### Wall-Maria concentric map + eatable citizens (FEAT-003)

**Map layout (`scenes/Arena.tscn`).** A `140 x 140` flat ground `Base` (top at
world y=1) carries a single CONCENTRIC circular wall centred on the origin:

- **Wall ring:** 16 `BoxMesh`/`BoxShape3D` `StaticBody3D` segments (`Mat_ridge`,
  size `15 x 16 x 4`) on a radius-`34` circle, each yawed tangent so they overlap
  into a solid ring. Two segments are OMITTED (indices 0 at +Z and 8 at -Z),
  leaving two **gate/weak-point gaps** the titans can be funnelled toward once
  breaching lands (FEAT-004). Wall top sits ~world y=15.
- **Verticality kept:** two `GateTowerS/N` towers (`8 x 30 x 8`) flank the +Z / -Z
  gates and a low `Perch` walkway sits just inside the +Z gate, so the player can
  grapple up and fight titans at the wall (the swinging traversal spirit).
- **CitizenArea:** a plain `Node3D` holding `C1..C8` `Marker3D`s on a radius-`14`
  inner ring (well inside the wall) - the citizen plaza.
- **Spawns:** `PlayerSpawn` INSIDE at `(0, 2, 20)` (just behind the +Z gate, so the
  player defends). `TitanSpawn1..4` are OUTSIDE the wall at radius `50`
  (`+Z / -Z / +X / -X`). `TITAN_COUNT` stays **4**.
- All materials reuse the existing CC0 `Mat_ground` / `Mat_rock` / `Mat_ridge` -
  no new textures. Segment/poly count is web-light.

**Citizens.** FIXED count **8** (`CitizenManager.CITIZEN_COUNT`; never scales with
the round). `scenes/Citizen.tscn` is a visual-only `Node3D` (`scripts/citizens/
citizen.gd`) with a small primitive capsule and a `CharacterModel` child running
the guarded GLB loader (`character_visual.gd`, `model_path` `citizen_character.glb`)
so the FEAT-006 model swap is a drop-in. Citizens carry **NO collision shape**, so
they never seed the runtime navmesh. `eat()` is idempotent and emits `eaten`.

**CitizenManager (`scripts/citizens/citizen_manager.gd`, scene-side Node).** Spawns
the fixed set at the CitizenArea markers, tracks the live count, and exposes
PLAIN-DATA out for telemetry/fitness (FEAT-005): `get_citizen_positions()` ->
`Array[Vector3]`, `citizens_alive()` / `citizens_total()` -> `int`,
`report_citizen_eaten(citizen)` and `eat_nearest(pos, radius)` -> `bool` (the
FEAT-004 reach hook), and signals `citizen_eaten(alive)` + `all_eaten`. It is a
`Node` (NOT in `scripts/evo` or `scripts/telemetry`, which stay pure). Wired in
`Main.tscn` under `GameManager/CitizenManager` with `citizen_scene` set.

**Fail condition (`scripts/game_manager.gd`).** Threshold
`CITIZEN_LOSS_THRESHOLD = 0`: when the last citizen is eaten the manager emits
`all_eaten`, GameManager runs the **round-LOST** path (`_on_all_citizens_eaten`:
end telemetry, clear titans, show localized `STATUS_ROUND_LOST`, restart after
`RESPAWN_DELAY`). Round **WIN** is unchanged (all titans down). A `_round_over`
guard makes win/lose fire exactly once. `_start_round()` now also calls
`_spawn_citizens()` before spawning titans. Nothing scales with `_round_number`.

**Containment (navmesh + geometry).** The navmesh is still **runtime-baked**
(extracted into `scripts/nav_baker.gd`, a `class_name NavBaker` node, so
`game_manager.gd` stays <= 250 lines). `Arena.tscn`'s `NavigationMesh` now sets
`geometry_parsed_geometry_type = 1` (STATIC_COLLIDERS) so the bake parses the
`StaticBody3D` COLLISION shapes (not visual meshes - silences the old warning);
`agent_radius`/`agent_height` are `1.8`/`5.0` to match the FEAT-002 titan. The
solid wall ring is baked as an obstacle, so the walkable surface does NOT connect
the outer field to the inner plaza except through the two gate gaps - titans path
toward the wall/gates but cannot walk into the plaza through solid wall until a
breach opens (breach behaviour is FEAT-004).

**New localized strings (`locale/ui.csv`, resolved via `tr()`):** `STATUS_ROUND_LOST`
(EN/KO).

**Verify.** `./tools/check.sh` and `./tools/test.sh` both exit 0 (a deterministic
`tests/cases/citizen_count.gd` asserts the alive-count decrement + idempotent-eat
+ loss-threshold invariants). `xvfb-run -a ./tools/screenshot.sh` renders the
first-person view of the plaza: the concentric wall ring, the gate tower, and the
citizen capsules inside read clearly (titans spawn outside the wall, out of the
default frame).

### Titan fixed HP + per-part damage + wall-assault/breach/eat (FEAT-004)

**Fixed HP + nape-as-weak-point (retires the old one-shot kill-threshold).** The
titan now owns a FIXED HP pool and takes MULTIPLE hits; the nape is a WEAK POINT
(critical multiplier), NOT the sole kill gate. All values are FIXED consts at the
top of `scripts/titan/titan.gd`; NOTHING scales with the round number.

- `TITAN_MAX_HP = 100.0`.
- Slash `base_damage = f(relative speed, blade-vs-surface angle)` is unchanged
  (shared pure `scripts/player/damage_preview.gd`), riding in ~`[0..2]`.
- **BODY hit:** HP loss `= base_damage * BODY_DAMAGE_MULT (22.0)`. A clean body
  hit removes ~44 HP, so it takes ~3 solid body hits to fell (glancing hits far
  less).
- **NAPE crit:** HP loss `= base_damage * NAPE_DAMAGE_MULT (90.0)` (~4x the
  body). A clean nape crit removes ~180 HP and one-shots; a moderate nape hit
  still takes a big chunk. `receive_hit(base_damage, is_nape) -> bool` applies the
  per-part multiplier, subtracts HP, and returns whether the hit was lethal;
  `die()` stays idempotent and emits `titan_killed` once. Sub-lethal hits still
  set the stagger timer and the caller (`slash.gd`) bounces the player.

**Two hittable parts on distinct layers, one ShapeCast3D SWEEP (never a timed
Area3D).** `scenes/Titan.tscn` keeps the `Nape` `Area3D` on **collision_layer 8**
(weak point) and adds a **`BodyHit` `Area3D` on collision_layer 16** (a
`CapsuleShape3D` r1.7 h5.0 at local y=2.5 wrapping the torso). `scripts/player/
slash.gd` widens the sweep mask to `NAPE_LAYER_BIT (8) | BODY_LAYER_BIT (16) = 24`
so a hit ANYWHERE hittable registers; `_is_nape_collider()` reads the struck
collider's own `collision_layer` to decide the multiplier. The additive,
presentation-only `slash_resolved` signal was extended to
`(applied, hp_ratio, killed, is_nape, world_pos)` so the HUD can show HP removed
and the survivor's remaining HP.

**Nape indicator is now HP-based (`scripts/ui/nape_indicator.gd`).** The meter is
the titan's remaining HP fraction (`hp_ratio()`); the state word is GUARDED (nape
turned away) -> EXPOSED (facing, no live swing) -> LETHAL (the current aim, as a
NAPE crit via `titan.part_damage(base, true)`, would remove >= `remaining_hp()`)
-> WEAK. The floating popup reads `-%.0f HP (%.0f%% left)` or `KILL`. The overlay
enumerates ONLY `GameManager.get_titans()` (never citizens), so a citizen can
never receive a nape/GUARDED tag (a distant titan's nape may still screen-project
NEAR a citizen; the tag belongs to the titan, not the citizen).

**New/changed localized strings (`locale/ui.csv`, EN+KO, via `tr()`):**
`DMG_READOUT_KILL` (now just `KILL`), `DMG_READOUT_HP` (`-%.0f HP (%.0f%% left)`),
replacing the retired `DMG_READOUT_WEAK`. `NAPE_LETHAL/WEAK/GUARDED/EXPOSED` reused.

**Wall-assault -> breach -> seek-citizen -> eat state machine.** The nav TARGET is
no longer the player; the titan is an INFILTRATOR. Target selection lives in the
PURE `scripts/titan/titan_objective.gd` (`class_name TitanObjective`, RefCounted,
plain-data only, headless-verifiable), returning `STATE_APPROACH_WALL ->
STATE_SEEK_CITIZEN -> STATE_EAT`:
- **APPROACH_WALL:** outside `WALL_RADIUS (34)`, steer toward the nearest gate gap
  (`GATE_POSITIONS` = the two omitted wall segments at +Z / -Z, radius 34). The
  runtime-baked navmesh only connects through the gate gaps, so titans funnel to
  a gate to breach.
- **SEEK_CITIZEN:** once inside the ring, nav toward the nearest LIVE citizen.
- **EAT:** within `EAT_REACH (3.5 m)` horizontally, call
  `CitizenManager.eat_nearest(pos, EAT_REACH)` (throttled by `EAT_COOLDOWN 1.2 s`),
  which decrements the citizen count and drives the FEAT-003 round-LOST path.

`titan.gd` reads live citizen positions via the injected `CitizenManager`
(`set_citizen_manager()`, wired in `game_manager.gd::_spawn_titans`) - only
plain vectors / a bool cross that boundary, so `scripts/evo` stays pure. The
hybrid steering + genome flow is intact (`set_genes`/`preferred_entry` still feed
`SteeringPolicy` on top of the guaranteed nav path); gene MEANINGS are formally
redefined in FEAT-005. `MOVE_SPEED`, HP, breach geometry, `TITAN_COUNT` are ALL
fixed consts - **fixed stats, difficulty only from evolution** is reaffirmed.

**File-size note.** Adding HP + the objective states pushed `titan.gd`, `slash.gd`
and `nape_indicator.gd` over the 250-line cap, so comments were tightened and the
objective maths was extracted into `titan_objective.gd`; all `.gd` are back at
<= 250 lines.

**Verify.** `./tools/check.sh` and `./tools/test.sh` both exit 0. A deterministic
`tests/cases/titan_hp_damage.gd` asserts: a nape crit removes more HP than a body
hit for equal base damage (crit factor `NAPE/BODY`), a solid body hit is NOT a
one-shot but N body hits fell, a clean nape crit one-shots, `die()`/HP is
idempotent + clamps at 0, the base-damage formula still matches DamagePreview, and
the approach-wall -> seek-citizen -> eat objective transitions. `xvfb-run -a
./tools/screenshot.sh` renders the first-person plaza; the wall ring, gate towers
and capsule NPCs read clearly (titans spawn outside the wall, mostly out of the
default frame).

## Workflow

Work happens directly on `main` and is published immediately. Commit locally in
clean, coherent commits (one per feature). Keep this `handoff.md` current.
