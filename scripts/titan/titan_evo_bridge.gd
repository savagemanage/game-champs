extends Node
## Game-side bridge between the PURE evo core (scripts/evo/) and live gameplay.
## This node is the ONLY place that couples the two: it reads plain data out of
## the Telemetry autoload, feeds it to EvoManager (pure), runs the background
## evolution across frames (single-thread budget, steering 3.8), persists the
## snapshot, and exposes the latest best genome for the titans to consume.
##
## Evolution NEVER runs during live play (steering 3.8): _process only budgets
## generations while `_evolving` is true, which the game turns on BETWEEN rounds
## (e.g. from the evolution screen in spec 4). During a round the titans simply
## read best_genes(), which is a fixed genome for that round.
##
## Register this as an autoload (e.g. "TitanEvo") OR let game_manager own one.
## It keeps scripts/evo/ scene-free: all scene coupling (reading Telemetry) is
## here, and only plain Vector3 / arrays cross into the evo core.

# =====================================================================
# TUNING CONSTANTS
# =====================================================================

## Candidate-eval budget granted to the background evolution each idle frame
## (single-thread web export, steering section 2). Small so frames stay smooth.
const FRAME_BUDGET: int = 3
## How many generations to advance per between-rounds evolution burst before the
## bridge auto-stops (the evolution screen can restart it).
## Spec 4 wants the generation counter to VISIBLY climb during the observation
## screen (which stays up to EvolutionScreen.MAX_VISIBLE_TIME = 8s). Three was
## too slow to read as "learning is happening fast"; 12 makes the counter tick
## up several times per appearance while still respecting the per-frame
## FRAME_BUDGET (evolution is spread across idle frames, never blocking one).
const GENERATIONS_PER_BURST: int = 12
## Persist the snapshot at most this often (generations) to limit disk churn.
const SAVE_EVERY_GENERATIONS: int = 1

# =====================================================================
# STATE
# =====================================================================

var _evo: EvoManager = null
var _best_genes: PackedFloat32Array = PackedFloat32Array()
var _evolving: bool = false
var _generations_this_burst: int = 0

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


## The fixed genome the live titans steer with THIS round (steering 3.8: only the
## latest best genome is injected; evolution does not run during the round).
func current_best_genes() -> PackedFloat32Array:
	return _best_genes


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


## A representative engagement window (plain Dictionary) the mini-sims and the
## final comparison scene replay. Falls back to the telemetry ring if the burst
## has not fed the manager yet, then to an empty Dictionary.
func sample_window() -> Dictionary:
	if _evo != null:
		var w: Dictionary = _evo.sample_window()
		if not w.is_empty():
			return w
	var windows: Array = _collect_windows()
	return windows[0] if not windows.is_empty() else {}


## The generation history (Array of {gen,best,mean,variance:[6]}) for the fitness
## curve + variance bars indicators (steering 3.11 history shape).
func history() -> Array:
	return _evo.history if _evo != null else []


## Gen-1 baseline genes (pure navigation, steering 3.7) - the LEFT side of the
## final comparison scene.
func baseline_genes() -> PackedFloat32Array:
	return Genome.make_baseline()


## The measured player-preferred entry direction the live titans' flankBias gene
## scales the opposite of (read from the telemetry player model).
func preferred_entry_dir() -> Vector3:
	return _preferred_entry_dir()


## Kick off a background evolution burst BETWEEN rounds. Pulls the latest
## engagement windows + player-preferred direction out of Telemetry (plain data
## only) and hands them to the pure EvoManager, then budgets generations across
## frames until the burst finishes.
func start_evolution_burst() -> void:
	if _evo == null:
		return
	var windows: Array = _collect_windows()
	if windows.is_empty():
		# Nothing recorded yet - keep the current best, do not spin.
		evolution_burst_finished.emit(current_generation())
		return
	var preferred: Vector3 = _preferred_entry_dir()
	var bins: Array = _player_bins()
	var rounds: int = _rounds_played()
	_evo.set_evaluation_data(windows, preferred, bins, rounds)
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

func _collect_windows() -> Array:
	if not _has_telemetry():
		return []
	var out: Array = []
	# Telemetry keeps the 3-round ring; flatten to plain window Dictionaries.
	if Telemetry.has_method("get_ring_windows"):
		for w in Telemetry.get_ring_windows():
			out.append(w.to_dict() if w.has_method("to_dict") else w)
	return out


func _preferred_entry_dir() -> Vector3:
	if not _has_telemetry() or Telemetry.player_model == null:
		return Vector3.ZERO
	return _dir_from_dominant_bin(Telemetry.player_model)


func _player_bins() -> Array:
	if not _has_telemetry() or Telemetry.player_model == null:
		return []
	return Telemetry.player_model.to_array()


func _rounds_played() -> int:
	if _has_telemetry() and "last_round_summary" in Telemetry:
		return int(Telemetry.last_round_summary.get("round", 0))
	return 0


## Map the player model's dominant bin's quadrant back to an approach direction
## (which side the player prefers). This is the MEASUREMENT flankBias scales.
func _dir_from_dominant_bin(model) -> Vector3:
	var bin: int = model.dominant_bin()
	if bin < 0:
		return Vector3.ZERO
	# Recover the quadrant (slowest axis in the bin layout).
	var per_quadrant: int = PlayerModel.DISTANCE_BANDS * PlayerModel.TIMING_BANDS
	var quadrant: int = bin / per_quadrant
	var angle: float = TAU * float(quadrant) / float(PlayerModel.QUADRANTS)
	return Vector3(sin(angle), 0.0, cos(angle))


func _save_snapshot() -> void:
	if _evo == null:
		return
	EvoSnapshot.save(_evo.build_snapshot())


func _has_telemetry() -> bool:
	return typeof(Telemetry) != TYPE_NIL and Telemetry != null
