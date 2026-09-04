# wirework

A 3D grapple-action prototype built in **Godot 4.7.2** (GDScript only,
Compatibility renderer so it can export to the browser via WebGL 2.0).

You fight a group of giants with grappling gear. Swing in on your wire, get
level with the glowing red **nape** at the back of a giant's neck, and slash it
while your swing carries you across. The premise the project sets out to prove:
the giants' count and stats never change round to round - difficulty rises only
through evolved strategy (added in a later spec). This spec (traversal-core) is
the moment-to-moment loop: swinging, slashing, and four fixed giants that chase.

## Requirements

- [Godot 4.7.2](https://godotengine.org/download) - the **standard** build
  (NOT the .NET / C# build; this project is pure GDScript).

## How to run

1. Launch Godot 4.7.2.
2. Click **Import**, browse to this folder, select `project.godot`, then **Open**.
3. Press **F5** (or the play button, top-right) to run the main scene
   (`scenes/Main.tscn`).

On launch a brief "Baking navigation..." screen appears while the navigation
mesh is built at runtime, then the round begins. No editor baking is required.

## Controls

| Action        | Input                     |
|---------------|---------------------------|
| Move          | `W` `A` `S` `D`           |
| Jump          | `Space`                   |
| Look around   | Mouse (captured on start) |
| Grapple / wire| Left mouse button (hold to swing, hold `Space` to reel in) |
| Slash         | Right mouse button        |
| Release mouse | `Esc`                     |

Click back in the window after pressing `Esc` to re-capture the mouse.

### How a round plays

1. Four giants spawn and path toward you. Their count and stats are FIXED and
   never scale with the round number.
2. Grapple onto a tower, plateau or cliff and swing up toward a giant's red nape.
3. Right-click to **slash** while your swing carries the blade across the nape.
   Damage is continuous: a fast blade slicing along the nape kills; a weak or
   badly-angled hit only staggers the giant and bounces you off.
4. When all four are down, the round counter advances and four identical giants
   respawn.

## Project layout

```
titan-game/
├── project.godot          # project config: renderer, input map, physics layers
├── scenes/
│   ├── Main.tscn          # arena + player + GameManager + loading screen + UI
│   ├── Arena.tscn         # single high-verticality terrain chunk + NavigationRegion3D + spawn markers
│   ├── Player.tscn        # CharacterBody3D + camera rig + Grapple + Slash (ShapeCast3D)
│   └── Titan.tscn         # giant CharacterBody3D + NavigationAgent3D + Nape kill-zone
└── scripts/
    ├── player/
    │   ├── player.gd      # camera-relative WASD, jump, gravity, mouse-look
    │   ├── grapple.gd     # the wire: raycast anchor + capped pull + pendulum swing
    │   └── slash.gd       # slash via ShapeCast3D sweep + continuous damage
    ├── titan/
    │   └── titan.gd       # NavigationAgent3D chase, nape, continuous damage receiver
    ├── evo/               # (empty) evolution core - added in spec 3
    ├── telemetry/         # (empty) instrumentation - added in spec 2
    ├── ui/
    │   └── loading_screen.gd   # overlay shown during the runtime navmesh bake
    └── game_manager.gd    # round lifecycle: runtime bake, spawn 4, respawn 4
```

## What each script does

- **`player/player.gd`** - Camera-relative WASD movement, jump and gravity on a
  `CharacterBody3D`, mouse-look. Forwards each physics tick to the Grapple and
  Slash child nodes after normal movement but before `move_and_slide()`.
- **`player/grapple.gd`** - The core traversal feel. Casts a ray from screen
  centre to find an anchor on the environment, then applies a capped pull plus a
  pendulum rope constraint so falls turn into swings. Momentum is preserved on
  release so swings chain into jumps.
- **`player/slash.gd`** - The slash. It tracks the blade tip's world position
  every physics frame and, on a slash, sweeps a `ShapeCast3D` from LAST frame's
  tip to THIS frame's tip. Sweeping the whole inter-frame gap prevents tunneling
  through the nape at high swing speed (an Area3D toggled on for a few frames
  would miss fast swings). Damage is continuous:
  `damage = f(relative speed, angle between blade travel and nape normal)`.
  At/above a kill threshold the giant dies; below it the giant staggers and the
  player is bounced off.
- **`titan/titan.gd`** - The giant. Chases the player purely with a
  `NavigationAgent3D` (avoidance on, so four giants steer around each other in
  tight spaces). No genes, no adaptive weights - strategy is added in spec 3.
  Exposes `receive_slash(damage, threshold)`, `get_nape_normal()`, `die()` and a
  `titan_killed` signal. Every tuning value is FIXED and never reads the round.
- **`game_manager.gd`** - Runs the round loop: shows the loading screen, bakes
  the arena `NavigationRegion3D` at runtime, then spawns exactly four giants at
  the four spawn markers. Listens for `titan_killed`; when all four are dead it
  advances the round and respawns four identical giants.
- **`ui/loading_screen.gd`** - The overlay shown while the navmesh bakes.

## Navigation mesh (baked at runtime)

The arena's `NavigationRegion3D` mesh is baked **at runtime** by
`game_manager.gd` calling `NavigationRegion3D.bake_navigation_mesh()` at load,
behind the loading screen. Because the web export is single-threaded the bake
stalls one frame, which is why it runs behind the overlay. There is no editor
baking step - do not bake in the editor.

## Browser / web-export target

This project targets a WebGL 2.0 browser export:

- **Compatibility** renderer (`gl_compatibility`) - Forward+ and Mobile do not
  run on the web.
- **Single-threaded** export: no threading APIs (`Thread`/`Mutex`/`Semaphore`/
  `WorkerThreadPool`); heavy work is split across frames.
- GDScript only (no C#), no low-level networking - everything runs locally, and
  `user://` persistence (added by later specs) is backed by IndexedDB. Save
  failures are treated as non-fatal.

To export: **Project → Export → Add… → Web**, install the Web export templates
if prompted, then **Export Project**. Serve the exported files over HTTP
(browsers will not run the `.wasm` from a `file://` URL).

## Roadmap (later specs)

- **Spec 2 - telemetry:** record player behaviour and giant nape-exposure into
  `scripts/telemetry/`; a round-end panel with a 24-bin player model.
- **Spec 3 - evolution-core:** a pure, scene-free evolution core in
  `scripts/evo/` that evolves six strategy genes on a background fixed-step
  simulation.
- **Spec 4 - evolution-screen:** visualise learning, ending in a split-screen
  comparison of the first-generation baseline against the latest generation.
```
