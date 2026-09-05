# systems/

Pure-logic game systems live here. Each system is a plain TypeScript
class/module with **no Phaser import**, so it can be unit-tested with vitest
(see `src/**/*.test.ts`).

Pure-logic systems:

- `ResourceStore` — resource stockpiles + per-second idle-production math.
- `BuildingSystem` — upgrade costs, build timers, and the Town-Center level gate.
- `TrainingQueue` — troop training queue and completion timing.
- `CombatSystem` — wave resolution between the army and raider waves.
- `SaveManager` — serialize/deserialize `GameState` to injectable storage
  (`localStorage` in the browser) with offline idle-gain reconciliation.

Phaser-aware coordinators (not pure logic, so not unit-tested):

- `GameState` — the single authoritative holder of one `ResourceStore` +
  `BuildingSystem` + `TrainingQueue` + army/waveCleared, loaded via
  `SaveManager` at boot and persisted on meaningful changes and on an interval.
  Every scene reads/writes this one instance so there are no divergent copies.
- `AudioManager` — a thin Phaser-side singleton for SFX/music + persisted
  volume/language settings.
