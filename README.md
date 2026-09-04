# Titan Prototype

An Attack-on-Titan-inspired 3D prototype built in **Godot 4.7.2** (GDScript only,
Compatibility renderer so it can export to the browser via WebGL 2.0).

> This is an early prototype. This stage delivers the project skeleton, a flat
> test map, and a third-person player you can walk and jump around with.
> The ODM-gear grapple, the titan AI, and the round loop arrive in later stages.

## Requirements

- [Godot 4.7.2](https://godotengine.org/download) — the **standard** build
  (NOT the .NET / C# build).

## How to run

1. Launch Godot 4.7.2.
2. Click **Import**, browse to this folder, and select `project.godot`, then **Open**.
   (Godot will import assets the first time; this can take a few seconds.)
3. Press **F5** (or the ▶ Play button, top-right) to run the main scene
   (`scenes/Main.tscn`).

## Controls

| Action        | Input                     |
|---------------|---------------------------|
| Move          | `W` `A` `S` `D`           |
| Jump          | `Space`                   |
| Look around   | Mouse (captured on start) |
| Release mouse | `Esc`                     |
| Grapple       | Left mouse button *(wired up in a later stage)* |
| Slash         | Right mouse button *(wired up in a later stage)* |

Click back in the window after pressing `Esc` to re-capture the mouse.

## Project layout

```
titan-game/
├── project.godot        # project config: renderer, input map, physics layers
├── scenes/
│   ├── Main.tscn        # main scene: instances the map + player
│   ├── TestMap.tscn     # flat ground, lights, grapple-anchor pillars, nav mesh
│   └── Player.tscn      # third-person CharacterBody3D + camera rig
└── scripts/
    └── player.gd        # movement, jump, gravity, mouse-look camera
```
