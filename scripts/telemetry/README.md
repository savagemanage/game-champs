# scripts/telemetry/

Telemetry / instrumentation layer (**spec 2 - telemetry**). Records player
behaviour + titan state during a round, derives the metrics evolution will
consume, and persists to `user://` as JSON. No evolution logic lives here.

## Modules

- **`telemetry.gd`** - autoload named `Telemetry`. The ONLY telemetry piece that
  touches game scenes. Each physics tick it snapshots the registered player +
  titans into plain data and forwards it to the recorder. Owns the shared
  `PlayerModel` and the 3-round engagement-window ring buffer. Public API:
  `register_player/register_titan/unregister_titan`, `start_round/end_round`,
  `sample_tick(delta)`, `report_grapple_fire(anchor)/report_grapple_release()`,
  `report_slash(pos, dir, rel_speed, result)`. Emits `round_summary_ready`.
- **`round_recorder.gd`** - PURE per-round capture: player trajectory every 30
  physics ticks, grapple events (fire time + anchor + release time), slash
  attempts (time/pos/dir/rel-speed/result), per-titan per-tick nape-in-view AND
  nape-in-range booleans, and engagement-window cutting.
- **`round_metrics.gd`** - PURE, STATELESS derived-metric extractors over a
  finished recorder's data (exposure ratio per-titan + averaged, avg engagement
  distance, avg entry speed, left-approach ratio, slash success rate).
- **`engagement_window.gd`** - one ~2s window (grapple-fire -> slash ->
  disengage): start world snapshot (player + all titans) + subsequent player
  trajectory + classification fields (`approach_dir_xz`, `engagement_distance`,
  `entry_speed`, `slash_result`). Plain data, replayable by spec-3 evo.
- **`player_model.gd`** - 24-bin opponent model (4 approach quadrants x 3
  distance bands x 2 timing bands) with exponential-decay counts (decay 0.9),
  (spec-3 design point 3.4). SEPARATE from evolution: spec 3 reads `bins` /
  `to_array()`,
  never mutates it.
- **`telemetry_store.gd`** - `user://` + `FileAccess` + `JSON` persistence.
  Save failures `push_warning` and continue; missing/corrupt files load clean.

Persisted file: `user://wirework_telemetry.json` (schema version 1).

## How it is wired into gameplay

- `game_manager.gd`: `_start_round` -> `Telemetry.start_round()`;
  `_physics_process` -> `Telemetry.sample_tick(delta)` (owns the sampling loop
  so telemetry never reads the scene tree itself); round clear ->
  `Telemetry.end_round()`.
- `player/player.gd` `_ready` -> `Telemetry.register_player(self)`.
- `titan/titan.gd` `_ready` -> `register_titan`; `_exit_tree` -> `unregister_titan`.
- `player/grapple.gd` `_try_attach`/`_release` -> `report_grapple_fire`/`report_grapple_release`.
- `player/slash.gd` `_do_sweep` -> `report_slash(pos, dir, rel_speed, result)`
  for every attempt including whiffs.

The round-end panel (`scripts/ui/round_end_panel.gd`) only DISPLAYS the derived
summary; it consumes data produced by the recorder, never the reverse.
