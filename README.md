# Titan Prototype

An Attack-on-Titan-inspired 3D prototype built in **Godot 4.7.2** (GDScript only,
Compatibility renderer so it can export to the browser via WebGL 2.0).

You play a lone soldier with ODM-style grappling gear against a single giant
titan. Swing in on your wire, get level with the glowing red **nape** (목덜미)
at the back of its neck, and slash it. Each time you kill the titan, the game
records how you fought and the next titan is tuned a little better against your
habits.

## Requirements

- [Godot 4.7.2](https://godotengine.org/download) - the **standard** build
  (NOT the .NET / C# build; this project is pure GDScript).

## How to run

1. Launch Godot 4.7.2.
2. Click **Import**, browse to this folder, and select `project.godot`, then **Open**.
   (Godot imports assets the first time; this can take a few seconds.)
3. Press **F5** (or the play button, top-right) to run the main scene
   (`scenes/Main.tscn`).

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

1. A titan spawns and walks toward you.
2. Grapple onto a pillar or the ground and swing up to the height of the titan's
   red nape at the back of its neck.
3. Right-click to **slash** while your swing carries you across the nape. A hit
   kills the titan and the round counter (top-left) advances.
4. A fresh titan spawns using updated behaviour weights (see below).

## Project layout

```
titan-game/
├── project.godot          # project config: renderer, input map, physics layers, PlayerStats autoload
├── scenes/
│   ├── Main.tscn          # main scene: map + player + GameManager + UI; spawns the titan
│   ├── TestMap.tscn       # flat ground, lights, grapple-anchor pillars, NavigationRegion3D, spawn markers
│   ├── Player.tscn        # third-person CharacterBody3D + camera rig + Grapple + SlashHitbox
│   └── Titan.tscn         # titan CharacterBody3D + NavigationAgent3D + Nape kill-zone Area3D
└── scripts/
    ├── player.gd          # movement, jump, gravity, mouse-look, and the slash attack
    ├── grapple.gd         # the ODM-gear wire: raycast anchor + pendulum swing physics
    ├── titan.gd           # chase AI (nav agent + fallback), nape hitbox, adaptive decisions
    ├── player_stats.gd    # AUTOLOAD singleton: collects/persists stats, computes titan weights
    └── game_manager.gd    # round lifecycle: spawn / detect kill / persist stats / respawn
```

## What each script does

- **`player.gd`** - Camera-relative WASD movement, jump and gravity on a
  `CharacterBody3D`, mouse-look, and the **slash**: on right-click a `SlashHitbox`
  `Area3D` in front of the player switches on for a few frames; if it overlaps a
  titan's nape, the titan dies.
- **`grapple.gd`** - The core traversal feel. Casts a ray from screen centre to
  find an anchor on the environment, then applies a capped pull plus a pendulum
  rope constraint so falls turn into swings. Momentum is preserved on release so
  swings chain into jumps.
- **`titan.gd`** - The enemy. Chases the player with a `NavigationAgent3D`, with
  a **direct-steering fallback** (see the nav-mesh note below). Its decisions are
  small weighted utility functions that read the adaptive weights, so it biases
  where it intercepts you and how aggressively it closes in. Exposes a `die()`
  method and a `titan_killed` signal.
- **`player_stats.gd`** - The adaptive-AI foundation, registered as an **autoload**
  singleton named `PlayerStats`. It collects per-round behaviour (which side you
  circle toward the titan, how far you keep from it, plus dodge/damage stubs for
  later), and turns it into a `behavior_weights` dictionary.
- **`game_manager.gd`** - Runs the round loop: spawn the titan at `TitanSpawn`,
  listen for `titan_killed`, end the round (persist + recompute weights), then
  respawn a fresh titan that reads the updated weights. Drives the on-screen
  round/status labels.

## Adaptive AI: where stats are saved and how they feed the titan

- On round end, `PlayerStats` writes to **`user://player_stats.json`** using
  `FileAccess` + `JSON`. `user://` is a per-user writable location (and IndexedDB
  in the browser export), so this is fully local - no network, no server.
- The file stores `rounds_played` and the smoothed `behavior_weights`:
  - `anticipate_side` - which side you tend to circle toward (measured in the
    titan's own frame); the titan biases its intercept point that way to cut you
    off next round.
  - `aggression` - higher the more you kite from a distance; the titan closes in
    faster.
  - `guard_nape` - higher the more one-sided your attacks are; the titan adds a
    small yaw so its nape (rear) turns away from your favoured attack side,
    making it harder to reach.
- Each new titan reads these weights in `_ready()`, so it visibly plays a little
  differently as you build up habits. To reset the "learning", delete
  `player_stats.json` from the `user://` folder (in Godot: **Project → Open User
  Data Folder**).

## Navigation mesh note (important for pathing)

`TestMap.tscn` contains a `NavigationRegion3D`, but its navigation mesh is **not
baked** (baking needs the Godot editor, which was unavailable when this prototype
was authored). Because of that, `titan.gd` is written to be robust: when the nav
map has no usable path it **falls back to steering straight toward the player**
on the ground plane. So the titan chases you whether or not the mesh is baked.

For proper obstacle-avoiding pathing:

1. Open the project in Godot and open `scenes/TestMap.tscn`.
2. Select the `NavigationRegion3D` node.
3. Click **Bake NavigationMesh** in the toolbar above the viewport.
4. Save. The titan will now path around the pillars instead of only steering
   directly.

## Browser / web-export target

This project is set up for a WebGL 2.0 browser export:

- **Compatibility** renderer (`gl_compatibility`) - Forward+ and Mobile are not
  supported on the web.
- **Single-threaded** export (the default since Godot 4.3), so no threading APIs.
- GDScript only (no C#), and no low-level networking - everything runs locally in
  the browser, and `user://` persistence is backed by IndexedDB.

To export: **Project → Export → Add… → Web**, install the Web export templates if
prompted, then **Export Project**. Serve the exported files over HTTP (browsers
will not run the `.wasm` from a `file://` URL).

## Roadmap (architecture is prepared for these)

- **Stage 2** - Split-screen **2-player** co-op and a fuller **adaptive AI**
  (richer behaviour weights, more stat inputs). The `PlayerStats` autoload and the
  weighted-utility structure in `titan.gd` are the hooks for this.
- **Stage 3** - Web export polish and performance optimization for the browser
  target.
