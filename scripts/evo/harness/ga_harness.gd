extends SceneTree
## Headless GA verification harness for the action-defense objective (see
## handoff.md: verification here is TELEMETRY NUMBERS, not unit tests). Run it:
##
##   godot --headless --path titan-game --script res://scripts/evo/harness/ga_harness.gd
##
## It evolves against three SCRIPTED defense scenarios and dumps CSVs to user://:
##   * passive   : the player sits far off / never attacks. Titans should learn
##                 to pour straight through a gate and eat everyone (high proxy).
##   * defender  : the player patrols near the +Z gate and attacks, killing
##                 titans that funnel into it. Titans should learn playerAvoid /
##                 spreadOut to reach citizens via the OTHER gate.
##   * two_gate  : the player guards one gate; two gates are open. Spreading /
##                 avoiding should let the titans breach the undefended gate.
##
## For each scenario it runs GENERATIONS generations and writes a per-gene
## trajectory CSV (one row per generation: gen + 6 gene values of the best
## genome + best/mean fitness). Every BASELINE_INTERVAL generations it also
## measures a proxy = mean CITIZENS EATEN for BOTH the current best genome AND
## the gen-1 baseline genome and appends them to a comparison CSV: if the two
## never separate, learning is NOT working.
##
## PURE-adjacent: it only uses the pure evo modules + FileAccess; no game scene.

# =====================================================================
# TUNING CONSTANTS
# =====================================================================

const GENERATIONS: int = 200
const BASELINE_INTERVAL: int = 10
## Synthetic scenario windows generated per generation (matches the EvoManager
## per-candidate sampling cap so none are wasted).
const WINDOWS_PER_GEN: int = 4
const TITANS_PER_WINDOW: int = 4
## Fixed RNG seeds so harness runs are reproducible across machines.
const SEED_PASSIVE: int = 1001
const SEED_DEFENDER: int = 2002
const SEED_TWO_GATE: int = 3003
## Scenario geometry (mirrors the Wall-Maria map: wall r34, plaza r14).
const WALL_RADIUS: float = 34.0
const CITIZEN_RADIUS: float = 14.0
const CITIZEN_COUNT: int = 8
const TITAN_SPAWN_RADIUS: float = 40.0
## Player-path samples per window (the sim steps over these; the titans need
## time to breach the ring AND cross the plaza to the citizens).
const WINDOW_STEPS: int = 420

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _initialize() -> void:
	print("[ga_harness] starting: %d generations x 3 defense scenarios" % GENERATIONS)
	_run_scenario("passive", SEED_PASSIVE)
	_run_scenario("defender", SEED_DEFENDER)
	_run_scenario("two_gate", SEED_TWO_GATE)
	print("[ga_harness] done. CSVs written under user:// (see paths above).")
	quit()


func _run_scenario(kind: String, seed_value: int) -> void:
	_rng.seed = seed_value
	var evo: EvoManager = EvoManager.new(seed_value)

	var gene_csv: String = "gen,wallAssault,citizenSeek,playerAvoid,spreadOut,separation,aggression,best,mean\n"
	var eaten_csv: String = "gen,evolved_citizens_eaten,baseline_citizens_eaten\n"

	for gen in range(GENERATIONS):
		var windows: Array = _make_windows(kind)
		evo.set_evaluation_data(windows, [], gen)
		evo.run_generation()

		var best: PackedFloat32Array = evo.best_genes()
		gene_csv += _gene_row(gen, best, evo)

		if gen % BASELINE_INTERVAL == 0:
			var evolved_eaten: float = _eaten_proxy(windows, best)
			var baseline_eaten: float = _eaten_proxy(windows, Genome.make_baseline())
			eaten_csv += "%d,%.5f,%.5f\n" % [gen, evolved_eaten, baseline_eaten]

	_write("user://ga_genes_%s.csv" % kind, gene_csv)
	_write("user://ga_eaten_%s.csv" % kind, eaten_csv)
	print("[ga_harness] %s: wrote ga_genes_%s.csv + ga_eaten_%s.csv" % [kind, kind, kind])


# =====================================================================
# SYNTHETIC SCENARIO WINDOW GENERATION
# =====================================================================

func _make_windows(kind: String) -> Array:
	var windows: Array = []
	for w in WINDOWS_PER_GEN:
		windows.append(_make_window(kind, w))
	return windows


## Build one scenario window in the BackgroundSim window shape.
func _make_window(kind: String, index: int) -> Dictionary:
	var gates: Array = _gates(kind)
	var citizens: Array = []
	for i in CITIZEN_COUNT:
		var a: float = TAU * float(i) / float(CITIZEN_COUNT)
		citizens.append([cos(a) * CITIZEN_RADIUS, 0.0, sin(a) * CITIZEN_RADIUS])

	var start_titans: Array = []
	for i in TITANS_PER_WINDOW:
		# Titans spawn OUTSIDE the wall, spread across the +Z side (toward gates).
		var a: float = PI * 0.5 + (float(i) - float(TITANS_PER_WINDOW - 1) * 0.5) * 0.5
		var tp: Vector3 = Vector3(cos(a) * TITAN_SPAWN_RADIUS, 0.0, sin(a) * TITAN_SPAWN_RADIUS)
		start_titans.append({"pos": [tp.x, tp.y, tp.z]})

	return {
		"wall_radius": WALL_RADIUS,
		"gates": gates,
		"citizens": citizens,
		"start_titans": start_titans,
		"trajectory": _player_trajectory(kind, index),
	}


## Gate gaps per scenario. passive/defender share the two +Z/-Z gates; two_gate
## keeps both explicit. All mirror the FEAT-003 omitted wall segments.
func _gates(kind: String) -> Array:
	match kind:
		"two_gate":
			return [[0.0, 0.0, WALL_RADIUS], [0.0, 0.0, -WALL_RADIUS]]
		_:
			return [[0.0, 0.0, WALL_RADIUS], [0.0, 0.0, -WALL_RADIUS]]


## Player path (the threat). passive = parked far off, not attacking; defender =
## camps just inside the +Z gate and attacks; two_gate = guards the +Z gate.
func _player_trajectory(kind: String, index: int) -> Array:
	var traj: Array = []
	var guard: Vector3 = Vector3(0.0, 0.0, WALL_RADIUS - 4.0)  # inside +Z gate
	for step in WINDOW_STEPS:
		match kind:
			"passive":
				traj.append({"pos": [0.0, 0.0, 1.0e6], "attacking": false})
			"defender":
				var jx: float = sin(float(step) * 0.05 + float(index)) * 4.0
				traj.append({"pos": [guard.x + jx, 0.0, guard.z], "attacking": true})
			"two_gate":
				traj.append({"pos": [guard.x, 0.0, guard.z], "attacking": true})
			_:
				traj.append({"pos": [0.0, 0.0, 1.0e6], "attacking": false})
	return traj


# =====================================================================
# METRICS
# =====================================================================

func _gene_row(gen: int, genes: PackedFloat32Array, evo: EvoManager) -> String:
	var best: float = 0.0
	var mean: float = 0.0
	if not evo.history.is_empty():
		var last: Dictionary = evo.history[evo.history.size() - 1]
		best = float(last.get("best", 0.0))
		mean = float(last.get("mean", 0.0))
	return "%d,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.5f,%.5f\n" % [
		gen, genes[0], genes[1], genes[2], genes[3], genes[4], genes[5], best, mean]


## Proxy = mean citizens eaten across the windows (higher = the titans reached
## and ate more of the plaza). The evolved column should climb above baseline.
func _eaten_proxy(windows: Array, genes: PackedFloat32Array) -> float:
	var sum: float = 0.0
	var n: int = windows.size()
	for i in n:
		var m: Dictionary = BackgroundSim.evaluate_window(windows[i], genes)
		sum += float(int(m.get("citizens_eaten", 0)))
	return (sum / float(n)) if n > 0 else 0.0


func _write(path: String, text: String) -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_warning("[ga_harness] could not write %s (err %d)" % [path, FileAccess.get_open_error()])
		return
	file.store_string(text)
	file.close()
	print("[ga_harness]   -> %s" % ProjectSettings.globalize_path(path))
