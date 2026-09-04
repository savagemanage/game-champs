extends SceneTree
## Headless GA verification harness (steering spec-3 / section 1: verification is
## TELEMETRY NUMBERS, not unit tests). Run it OUTSIDE this sandbox (there is no
## Godot binary here):
##
##   godot --headless --path titan-game --script res://scripts/evo/harness/ga_harness.gd
##
## It evolves against three SCRIPTED players and dumps results to user://:
##   * always-left : player always enters from the same side (should let the
##                   titans converge to a stable flank/guard weighting).
##   * random      : player enters from a uniformly random side each window.
##   * mixed       : player alternates / mixes sides (the hard case). If the
##                   per-gene weights DIVERGE or OSCILLATE against the mixed
##                   player, the mutation width / learning rate is wrong.
##
## For each player it runs GENERATIONS generations and writes a per-gene
## trajectory CSV (one row per generation: gen + 6 gene values of the best
## genome + best/mean fitness). Every BASELINE_INTERVAL generations it also
## measures a proxy "kill time" for BOTH the current best genome AND the
## weights-off baseline genome and appends them to a comparison CSV: if the two
## distributions never separate, learning is NOT working.
##
## This file is PURE-adjacent: it only uses the pure evo modules + FileAccess. It
## touches no game scene.

# =====================================================================
# TUNING CONSTANTS
# =====================================================================

const GENERATIONS: int = 200
const BASELINE_INTERVAL: int = 10
## Synthetic windows generated per generation (the sim averages over a subset).
const WINDOWS_PER_GEN: int = 8
const TITANS_PER_WINDOW: int = 4
## Fixed RNG seed so harness runs are reproducible across machines.
const SEED_ALWAYS_LEFT: int = 1001
const SEED_RANDOM: int = 2002
const SEED_MIXED: int = 3003
## Synthetic window geometry.
const WINDOW_STEPS: int = 120
const WINDOW_DT: float = 1.0 / 60.0
const ARENA_RADIUS: float = 25.0
const PLAYER_SPEED: float = 18.0

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _initialize() -> void:
	print("[ga_harness] starting: %d generations x 3 scripted players" % GENERATIONS)
	_run_player("always_left", SEED_ALWAYS_LEFT)
	_run_player("random", SEED_RANDOM)
	_run_player("mixed", SEED_MIXED)
	print("[ga_harness] done. CSVs written under user:// (see paths above).")
	quit()


func _run_player(player_kind: String, seed_value: int) -> void:
	_rng.seed = seed_value
	var evo: EvoManager = EvoManager.new(seed_value)

	var gene_csv: String = "gen,navFollow,interceptLead,flankBias,napeYaw,separation,encircle,best,mean\n"
	var kill_csv: String = "gen,evolved_kill_proxy,baseline_kill_proxy\n"

	for gen in range(GENERATIONS):
		var windows: Array = _make_windows(player_kind)
		var preferred: Vector3 = _preferred_dir(player_kind, gen)
		evo.set_evaluation_data(windows, preferred, [], gen)
		evo.run_generation()

		var best: PackedFloat32Array = evo.best_genes()
		gene_csv += _gene_row(gen, best, evo)

		if gen % BASELINE_INTERVAL == 0:
			var evolved_kt: float = _kill_proxy(windows, best, preferred)
			var baseline_kt: float = _kill_proxy(windows, Genome.make_baseline(), preferred)
			kill_csv += "%d,%.5f,%.5f\n" % [gen, evolved_kt, baseline_kt]

	_write("user://ga_genes_%s.csv" % player_kind, gene_csv)
	_write("user://ga_killtime_%s.csv" % player_kind, kill_csv)
	print("[ga_harness] %s: wrote ga_genes_%s.csv + ga_killtime_%s.csv"
		% [player_kind, player_kind, player_kind])


# =====================================================================
# SYNTHETIC WINDOW GENERATION (scripted players)
# =====================================================================

func _make_windows(player_kind: String) -> Array:
	var windows: Array = []
	for w in WINDOWS_PER_GEN:
		windows.append(_make_window(player_kind, w))
	return windows


## Build one synthetic engagement-window Dictionary in the EngagementWindow
## to_dict() shape the sim consumes.
func _make_window(player_kind: String, index: int) -> Dictionary:
	var side: float = _approach_side(player_kind, index)
	var entry_x: float = side * ARENA_RADIUS
	var start_pos: Vector3 = Vector3(entry_x, 0.0, -ARENA_RADIUS)
	var target: Vector3 = Vector3.ZERO
	var dir: Vector3 = (target - start_pos).normalized()

	var trajectory: Array = []
	var pos: Vector3 = start_pos
	for step in WINDOW_STEPS:
		var vel: Vector3 = dir * PLAYER_SPEED
		trajectory.append({
			"t": float(step) * WINDOW_DT,
			"pos": [pos.x, pos.y, pos.z],
			"vel": [vel.x, vel.y, vel.z],
			"look": [dir.x, dir.y, dir.z],
		})
		pos += vel * WINDOW_DT

	var start_titans: Array = []
	for i in TITANS_PER_WINDOW:
		var angle: float = TAU * float(i) / float(TITANS_PER_WINDOW)
		var tp: Vector3 = Vector3(cos(angle) * 8.0, 0.0, sin(angle) * 8.0)
		# Nape normal points outward from the titan's back (toward arena edge).
		start_titans.append({
			"pos": [tp.x, tp.y, tp.z],
			"vel": [0.0, 0.0, 0.0],
			"nape_normal": [-cos(angle), 0.0, -sin(angle)],
		})

	return {
		"slashed": true,
		"slash_result": EngagementWindow.RESULT_SUB,
		"start_player_pos": [start_pos.x, start_pos.y, start_pos.z],
		"start_player_vel": [dir.x * PLAYER_SPEED, 0.0, dir.z * PLAYER_SPEED],
		"anchor_pos": [target.x, target.y, target.z],
		"engagement_distance": start_pos.length(),
		"entry_speed": PLAYER_SPEED,
		"approach_dir_xz": [-dir.x, 0.0, -dir.z],
		"start_titans": start_titans,
		"trajectory": trajectory,
	}


## Which side (+1 right / -1 left) the scripted player enters from.
func _approach_side(player_kind: String, index: int) -> float:
	match player_kind:
		"always_left":
			return -1.0
		"random":
			return -1.0 if _rng.randf() < 0.5 else 1.0
		"mixed":
			return -1.0 if index % 2 == 0 else 1.0
		_:
			return -1.0


## The preferred-entry direction the "player model" would report for this kind.
func _preferred_dir(player_kind: String, gen: int) -> Vector3:
	match player_kind:
		"always_left":
			return Vector3(-1.0, 0.0, 0.0)
		"mixed":
			return Vector3(-1.0 if gen % 2 == 0 else 1.0, 0.0, 0.0)
		_:
			return Vector3(-1.0 if _rng.randf() < 0.5 else 1.0, 0.0, 0.0)


# =====================================================================
# METRICS
# =====================================================================

func _gene_row(gen: int, genes: PackedFloat32Array, evo: EvoManager) -> String:
	# Read the just-completed generation's history tail for best/mean.
	var best: float = 0.0
	var mean: float = 0.0
	if not evo.history.is_empty():
		var last: Dictionary = evo.history[evo.history.size() - 1]
		best = float(last.get("best", 0.0))
		mean = float(last.get("mean", 0.0))
	return "%d,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.5f,%.5f\n" % [
		gen, genes[0], genes[1], genes[2], genes[3], genes[4], genes[5], best, mean]


## A proxy "kill time": lower = the player broke through faster (nape exposed).
## We reuse the sim's nape-non-exposure as an inverse proxy - higher
## non-exposure => the titans held longer => a longer effective kill time.
func _kill_proxy(windows: Array, genes: PackedFloat32Array, preferred: Vector3) -> float:
	var sum: float = 0.0
	var n: int = mini(windows.size(), WINDOWS_PER_GEN)
	for i in n:
		var m: Dictionary = BackgroundSim.evaluate_window(windows[i], genes, preferred)
		var tc: int = int(m.get("titan_count", 1))
		sum += float(m.get("nape_non_exposure_sum", 0.0)) / float(maxi(tc, 1))
	return (sum / float(n)) if n > 0 else 0.0


func _write(path: String, text: String) -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_warning("[ga_harness] could not write %s (err %d)" % [path, FileAccess.get_open_error()])
		return
	file.store_string(text)
	file.close()
	print("[ga_harness]   -> %s" % ProjectSettings.globalize_path(path))
