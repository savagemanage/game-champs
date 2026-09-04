extends Node
## Game-side bridge between the PURE evo core (scripts/evo/) and live gameplay.
## This node is the ONLY place that couples the two: it reads plain data out of
## the Telemetry autoload, feeds it to EvoManager (pure), runs the background
## evolution across frames (single-thread budget; see handoff.md), persists the
## snapshot, and exposes the latest best genome for the titans to consume.
##
## Evolution NEVER runs during live play (see handoff.md): _process only budgets
## generations while `_evolving` is true, turned on BETWEEN rounds (the evolution
## screen). During a round the titans just read best_genes() (fixed that round).
## Registered as autoload "TitanEvo". It keeps scripts/evo/ scene-free: all scene
## coupling is here; only plain Vector3 / arrays cross into the evo core.

# =====================================================================
# TUNING CONSTANTS
# =====================================================================

## Candidate-eval budget granted to the background evolution each idle frame
## (single-thread web export; see handoff.md). Small so frames stay smooth.
const FRAME_BUDGET: int = 3
## Generations advanced per between-rounds burst before the bridge auto-stops
## (the evolution screen restarts it). 12 makes the on-screen generation counter
## visibly climb several times per appearance while respecting FRAME_BUDGET.
const GENERATIONS_PER_BURST: int = 12
## Persist the snapshot at most this often (generations) to limit disk churn.
const SAVE_EVERY_GENERATIONS: int = 1

# --- FIXED map geometry the scenario windows carry (mirrors the Wall-Maria map
# in Arena.tscn / Titan.gd; duplicated here because scripts/evo stays scene-free
# and consumes plain data). ---
const WALL_RADIUS: float = 34.0
const GATE_POSITIONS: Array = [Vector3(0.0, 0.0, 34.0), Vector3(0.0, 0.0, -34.0)]
## Fallback citizen plaza ring (radius 14, 8 citizens) used when no live
## CitizenManager was injected (mirrors CitizenArea in Arena.tscn / FEAT-003).
const FALLBACK_CITIZEN_RADIUS: float = 14.0
const FALLBACK_CITIZEN_COUNT: int = 8

# =====================================================================
# STATE
# =====================================================================

var _evo: EvoManager = null
var _best_genes: PackedFloat32Array = PackedFloat32Array()
var _evolving: bool = false
var _generations_this_burst: int = 0
## Scene-side CitizenManager (plain-data reads only) injected by GameManager so
## the scenario windows carry the real live citizen positions. Optional.
var _citizen_manager: Node = null

signal generation_completed(generation: int, best_fitness: float)
signal evolution_burst_finished(generation: int)


func _ready() -> void:
	# The background evolution burst runs BETWEEN rounds while the game tree is
	# PAUSED (the evolution screen pauses it), so this autoload must ignore pause.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_evo = EvoManager.new()
	# Resume from any prior snapshot so the best genome survives restarts.
	var snapshot: Dictionary = EvoSnapshot.load_snapshot()
	_evo.load_from_snapshot(snapshot)
	_best_genes = EvoSnapshot.best_genes_from(snapshot)
	set_process(false)


## The fixed genome the live titans steer with THIS round (only the latest best
## genome is injected; evolution does not run during the round - see handoff.md).
func current_best_genes() -> PackedFloat32Array:
	return _best_genes


## GameManager injects the scene-side CitizenManager so scenario windows carry
## the real live citizen positions (plain Vector3 array only). Optional: without
## it the bridge falls back to the fixed plaza ring geometry.
func set_citizen_manager(manager: Node) -> void:
	_citizen_manager = manager


func current_generation() -> int:
	return _evo.generation() if _evo != null else 0


## True while a background evolution burst is running (the evolution screen shows
## itself while this is happening, between rounds).
func is_evolving() -> bool:
	return _evolving


# =====================================================================
# EVOLUTION-SCREEN READ API (spec 4). All plain data; the screen only draws.
# =====================================================================

## Every current candidate's genes (Array[PackedFloat32Array]) for the 1-vs-49
## grid of mini-sims.
func all_candidate_genes() -> Array:
	return _evo.all_genes() if _evo != null else []


## Candidate indices best-fitness-first (large-slot pick + top-5 highlight).
func ranked_candidate_indices() -> Array:
	return _evo.ranked_indices() if _evo != null else []


## A representative scenario window (plain Dictionary) the mini-sims + final
## comparison replay. Falls back to the telemetry ring, then an empty Dictionary.
func sample_window() -> Dictionary:
	if _evo != null:
		var w: Dictionary = _evo.sample_window()
		if not w.is_empty():
			return w
	var windows: Array = _collect_windows()
	return windows[0] if not windows.is_empty() else {}


## The generation history (Array of {gen,best,mean,variance:[6]}) for the fitness
## curve + variance bars indicators (history entry shape; see handoff.md).
func history() -> Array:
	return _evo.history if _evo != null else []


## Gen-1 baseline genes (the non-random infiltrator) - the LEFT side of the
## final comparison scene.
func baseline_genes() -> PackedFloat32Array:
	return Genome.make_baseline()


## Kick off a background evolution burst BETWEEN rounds. Builds scenario windows
## (wall geometry + citizen positions + player-threat trajectory) as PLAIN data
## from Telemetry + the fixed map geometry and hands them to the pure EvoManager,
## then budgets generations across frames until the burst finishes.
func start_evolution_burst() -> void:
	if _evo == null:
		return
	var windows: Array = _collect_windows()
	if windows.is_empty():
		# Nothing recorded yet - keep the current best, do not spin.
		evolution_burst_finished.emit(current_generation())
		return
	var bins: Array = _player_bins()
	var rounds: int = _rounds_played()
	_evo.set_evaluation_data(windows, bins, rounds)
	_generations_this_burst = 0
	_evolving = true
	set_process(true)


func _process(_delta: float) -> void:
	if not _evolving or _evo == null:
		return
	# Budget candidate evaluations this frame; a true return = generation done.
	if _evo.process_budget(FRAME_BUDGET):
		# A generation just completed: refresh best, persist, notify.
		_best_genes = _evo.best_genes()
		_generations_this_burst += 1
		if _generations_this_burst % SAVE_EVERY_GENERATIONS == 0:
			_save_snapshot()
		generation_completed.emit(_evo.generation(), 0.0)
		if _generations_this_burst >= GENERATIONS_PER_BURST:
			_stop_burst()


func _stop_burst() -> void:
	_evolving = false
	set_process(false)
	_save_snapshot()
	evolution_burst_finished.emit(current_generation())


# =====================================================================
# TELEMETRY READ (scene-coupled here so evo core stays pure)
# =====================================================================

## Build the scenario windows the pure BackgroundSim replays. Each telemetry
## engagement window supplies the recorded titan spawn snapshot + the player
## trajectory (the threat); the bridge attaches the FIXED wall geometry + the
## live citizen positions so the window carries everything the sim needs as
## plain data (Vector3 arrays / scalars). Returns an Array of plain Dictionaries.
func _collect_windows() -> Array:
	if not _has_telemetry():
		return []
	var citizens: Array = _citizen_positions()
	var out: Array = []
	if Telemetry.has_method("get_ring_windows"):
		for w in Telemetry.get_ring_windows():
			var base: Dictionary = w.to_dict() if w.has_method("to_dict") else w
			out.append(_to_scenario_window(base, citizens))
	return out


## Convert a telemetry engagement window into a BackgroundSim scenario window:
## keep the recorded titan spawns + player path, add wall/gate geometry + the
## citizen positions. The player trajectory doubles as the threat path.
func _to_scenario_window(base: Dictionary, citizens: Array) -> Dictionary:
	var traj: Array = []
	for s in base.get("trajectory", []):
		traj.append({"pos": (s as Dictionary).get("pos", [0.0, 0.0, 0.0]), "attacking": true})
	return {
		"wall_radius": WALL_RADIUS,
		"gates": _gates_as_arrays(),
		"citizens": citizens,
		"start_titans": base.get("start_titans", []),
		"trajectory": traj,
	}


func _gates_as_arrays() -> Array:
	var out: Array = []
	for g in GATE_POSITIONS:
		var v: Vector3 = g
		out.append([v.x, v.y, v.z])
	return out


## Live citizen world positions as plain [x,y,z] arrays from the injected
## CitizenManager, or the fixed plaza ring if none was injected.
func _citizen_positions() -> Array:
	var out: Array = []
	if _citizen_manager != null and is_instance_valid(_citizen_manager) \
			and _citizen_manager.has_method("get_citizen_positions"):
		for p in _citizen_manager.call("get_citizen_positions"):
			var v: Vector3 = p
			out.append([v.x, v.y, v.z])
		if not out.is_empty():
			return out
	for i in FALLBACK_CITIZEN_COUNT:
		var a: float = TAU * float(i) / float(FALLBACK_CITIZEN_COUNT)
		out.append([cos(a) * FALLBACK_CITIZEN_RADIUS, 0.0, sin(a) * FALLBACK_CITIZEN_RADIUS])
	return out


func _player_bins() -> Array:
	if not _has_telemetry() or Telemetry.player_model == null:
		return []
	return Telemetry.player_model.to_array()


func _rounds_played() -> int:
	if _has_telemetry() and "last_round_summary" in Telemetry:
		return int(Telemetry.last_round_summary.get("round", 0))
	return 0


func _save_snapshot() -> void:
	if _evo == null:
		return
	EvoSnapshot.save(_evo.build_snapshot())


func _has_telemetry() -> bool:
	return typeof(Telemetry) != TYPE_NIL and Telemetry != null
