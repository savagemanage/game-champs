# scripts/evo/

Evolution core (spec 3 - evolution-core). Implements the fixed evolution design
(the "3.x" tags below are the spec-3 design points). Project-wide invariants
live in the repo-root `handoff.md`.

**Invariant: everything here is PURE.** It exchanges only plain data (gene
arrays, trajectory / window arrays, Vector3s, floats) and references NO game
scene, node, physics, `_physics_process`, `get_tree()`, Thread/Mutex, etc. The
background sim runs on its own fixed-step numeric integrator (not Godot
physics), so the whole directory can be lifted into another project unchanged.
The game-side coupling (reading Telemetry, injecting the best genome into live
titans) lives in `scripts/titan/titan_evo_bridge.gd`, not here.

## Modules

| File | Role |
|---|---|
| `genome.gd` | The 6 fixed genes `[navFollow, interceptLead, flankBias, napeYaw, separation, encircle]`, ranges, and the gen-1 baseline `[2.0,0,0,0,1.0,0]`. |
| `steering_policy.gd` | Hybrid steering (3.1): `moveDir = normalize(Σ gene * callerDir)`. Genes are WEIGHTS on caller-supplied directions; conditions live in code. `nape_yaw_amount()` = upper-body turn-away. |
| `fitness.gd` | Group fitness (3.6). Primary = per-titan nape NON-exposure ratio; plus aborted-slash + damage + kill bonus. NO survival-time term, NO distance penalty (binary touch only). Consts `MISS_W / DMG_W / KILL_BONUS`. |
| `background_sim.gd` | Fixed-step numeric integrator that replays one engagement window: player open-loop, titans by the policy; measures nape-non-exposure/tick + aborted slashes + damage. Overfit-ceiling rigidity on a wrong prediction (3.10). |
| `population.gd` | Pop 50, elitism 1, gen-1 baseline seed, tournament + uniform crossover + mutation, generation-mean fitness normalisation, variance-based mutation-width control (3.9). |
| `evo_manager.gd` | Background driver: split POP_SIZE evals across frames (`process_budget`) or `run_generation()` for the harness. Builds snapshot data. |
| `snapshot.gd` | `user://wirework_evo.json` per schema 3.11 (version, gene_names, baseline, best, history[{gen,best,mean,variance[6]}], player_model, rounds_played) + migration hook. Save failure never crashes. |
| `harness/ga_harness.gd` | Headless verification (NOT unit tests). 200 gens vs always-left / random / mixed scripted players -> per-gene CSV + baseline-vs-evolved kill-time CSV. |

## Verification (numbers, not unit tests)

There is no Godot binary in the build sandbox, so run this yourself:

```
godot --headless --path titan-game --script res://scripts/evo/harness/ga_harness.gd
```

Then inspect the CSVs under `user://`:
- `ga_genes_<kind>.csv` - per-gene trajectory. Against the **mixed** player the
  weights should CONVERGE, not diverge / oscillate (oscillation => learning rate
  wrong).
- `ga_killtime_<kind>.csv` - evolved vs weights-off baseline kill-time proxy. The
  two columns should SEPARATE over generations (no separation => not learning).
