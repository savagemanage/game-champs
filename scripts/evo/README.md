# scripts/evo/

Evolution core for the action-defense pivot (FEAT-005). Project-wide invariants
and the full design live in the repo-root `handoff.md` (there is no separate
steering document; the former `.kiro/steering/wirework.md` was deleted).

**Invariant: everything here is PURE.** It exchanges only plain data (gene
arrays, scenario / window Dictionaries, Vector3s, floats) and references NO game
scene, node, physics, `_physics_process`, `get_tree()`, Thread/Mutex, etc. The
background sim runs on its own fixed-step numeric integrator (not Godot
physics), so the whole directory can be lifted into another project unchanged.
All randomness goes through an injected `RandomNumberGenerator` (never global
`randf()`/`randi()`). The game-side coupling (reading Telemetry, building the
scenario windows, injecting the best genome into live titans) lives in
`scripts/titan/titan_evo_bridge.gd`, not here.

## The objective

Titans are INFILTRATORS. Each candidate genome is scored by how many plaza
CITIZENS its titans manage to EAT after breaching a circular wall through a gate
gap - plus a wall-breach term and a small early gradient for reaching the wall.
The player is a THREAT the titans may learn to avoid. This replaced the retired
grapple-era "hide the nape" objective.

## The 6 genes (fixed set)

`[wallAssault, citizenSeek, playerAvoid, spreadOut, separation, aggression]`

They are WEIGHTS on directions the caller measures (weights in genes, conditions
in code): drive toward the nearest breach gap, toward the nearest live citizen,
away from the player, a dispersal tangent, neighbour separation, and (aggression)
a forward speed/commitment scalar. The gen-1 baseline is the NON-random
straight-at-the-wall infiltrator `[2.5, 2.5, 0, 0, 1.0, 1.0]`; improvement is
always measured against it.

## Modules

| File | Role |
|---|---|
| `genome.gd` | The 6 fixed genes above, per-gene ranges, and the gen-1 baseline. Pure data. |
| `steering_policy.gd` | Hybrid steering: `moveDir = normalize(Σ gene * measuredDir)`. Genes are WEIGHTS on caller-supplied directions; conditions live in code. `speed_scale()` maps the aggression gene to a forward-speed multiplier. |
| `fitness.gd` | Group fitness. PRIMARY = `citizens_eaten` (dominant); plus breach-progress + a continuous wall-contact gradient, minus a small player-kill penalty. Consts `EATEN_W / BREACH_W / CONTACT_W / KILLED_PEN`. |
| `background_sim.gd` | Fixed-step numeric integrator: titans steer for a wall breach then the citizens and eat them; player follows an open-loop threat path. Returns `citizens_eaten / breach_progress / wall_contact_ratio / titans_killed`. `MAX_STEPS` guard; no scene/node/physics. |
| `sim_replay.gd` | Same integration, but outputs a drawable trace (titan dots, player dot, citizen dots, per-titan heading) for the evolution screen. |
| `population.gd` | Pop 50, elitism 1, gen-1 baseline seed, tournament + uniform crossover + mutation, generation-mean fitness normalisation, variance-based mutation-width control. Gene-agnostic. |
| `evo_manager.gd` | Background driver: split POP_SIZE evals across frames (`process_budget`) or `run_generation()` for the harness. Builds snapshot data. |
| `snapshot.gd` | `user://wirework_evo.json` schema v2 (version, gene_names, baseline, best, history[{gen,best,mean,variance[6]}], player_model, rounds_played) + a real v1->v2 migration that does not crash on an old nape-era snapshot. Save failure never crashes. |
| `harness/ga_harness.gd` | Headless verification (NOT unit tests). 200 gens vs passive / defender / two-gate scenarios -> per-gene CSV + baseline-vs-evolved citizens-eaten proxy CSV. |

## Verification (numbers, not unit tests)

```
.godot-bin/godot --headless --path . --script res://scripts/evo/harness/ga_harness.gd
```

Then inspect the CSVs under `user://` (the harness prints the globalized paths):
- `ga_genes_<kind>.csv` - per-gene trajectory (header is the 6 new gene names).
  Against the **defender** scenario the weights should shift toward playerAvoid /
  spreadOut, not diverge / oscillate.
- `ga_eaten_<kind>.csv` - evolved vs gen-1-baseline mean citizens eaten. The
  evolved column should SEPARATE above baseline over generations (no separation
  => not learning).
