extends RefCounted
class_name EvoManager
## Drives evolution generations in the BACKGROUND only (see handoff.md). PURE: it
## holds a Population, evaluates candidates against plain scenario-window
## Dictionaries (wall geometry + citizen positions + player-threat trajectory),
## and produces snapshot data. It references NO game scene / node / physics - the
## game-side bridge (scripts/titan/) feeds it plain windows and reads best_genes()
## back out to inject into the live titans. Evolution NEVER runs during live play;
## the game injects only the latest generation's best genome.
##
## SINGLE-THREAD BUDGET (see handoff.md): a generation's POP_SIZE evaluations are
## split across frames. The bridge calls process_budget(...) each idle frame with
## a per-frame candidate budget; when the whole population has been evaluated the
## manager advances a generation and appends a history entry. No Thread / Mutex /
## Semaphore / WorkerThreadPool.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Candidates evaluated per budgeted frame (keeps a frame cheap on single-thread
## web export). The bridge may pass a smaller budget for very slow frames.
const CANDIDATES_PER_FRAME: int = 4
## Max scenario windows sampled per candidate (average over MULTIPLE windows).
## More windows = steadier fitness, higher per-candidate cost. Kept modest so a
## 200-generation harness run and the between-rounds burst stay cheap.
const WINDOWS_PER_CANDIDATE: int = 4
## History ring length kept in memory / snapshot (older gens still on disk if
## desired; the evolution screen only needs the recent tail).
const HISTORY_LIMIT: int = 400

# =====================================================================
# STATE
# =====================================================================

var population: Population = null
## Plain scenario-window Dictionaries the sim replays (BackgroundSim shape:
## wall_radius + gates + citizens + start_titans + player trajectory).
var _windows: Array = []
## The 24 player-model bins to persist in the snapshot (read from telemetry).
var _player_bins: Array = []
var _rounds_played: int = 0

## Cursor into the current generation's population (0..POP_SIZE) as we evaluate
## across frames.
var _eval_cursor: int = 0
## Snapshot history: Array of {gen, best, mean, variance:[6]} (see handoff.md).
var history: Array = []

## Emitted (as a plain Callable list) is avoided to stay signal-free & pure; the
## bridge polls generation() / best_genes() instead.


func _init(seed_value: int = 0) -> void:
	population = Population.new(seed_value)


## Seed from a previously saved snapshot so evolution resumes where it left off.
## Only the best genome + history + rounds are restored; the population itself
## restarts from baseline (keeps the gen-1 baseline comparison intact),
## with the loaded best carried as the elite via the first generation's eval.
func load_from_snapshot(snapshot: Dictionary) -> void:
	history = (snapshot.get("history", []) as Array).duplicate(true)
	_rounds_played = int(snapshot.get("rounds_played", 0))
	var pm: Dictionary = snapshot.get("player_model", {})
	_player_bins = (pm.get("bins", []) as Array).duplicate()


## Feed the latest scenario data the background sim will replay. Called by the
## bridge between rounds (evolution is background-only). `windows` is an Array of
## plain scenario-window Dictionaries; `player_bins` is the 24-bin array kept for
## the snapshot's player-model record.
func set_evaluation_data(windows: Array, player_bins: Array, rounds_played: int) -> void:
	_windows = windows
	_player_bins = player_bins
	_rounds_played = rounds_played


## Evaluate up to `budget` candidates this frame. When the whole population has
## been scored, advance one generation and record history. Returns true when a
## generation completed this call (the bridge can then save a snapshot / refresh
## the evolution screen). Safe to call with no windows (does nothing).
func process_budget(budget: int) -> bool:
	if _windows.is_empty():
		return false
	var limit: int = mini(maxi(budget, 1), CANDIDATES_PER_FRAME)
	var done: int = 0
	while _eval_cursor < population.size() and done < limit:
		var genes: PackedFloat32Array = population.get_genes(_eval_cursor)
		population.set_fitness(_eval_cursor, _evaluate_candidate(genes))
		_eval_cursor += 1
		done += 1

	if _eval_cursor >= population.size():
		_complete_generation()
		return true
	return false


## Run one FULL generation synchronously (used by the headless harness, where a
## per-frame budget is irrelevant). Returns the completed generation number.
func run_generation() -> int:
	_eval_cursor = 0
	for i in population.size():
		population.set_fitness(i, _evaluate_candidate(population.get_genes(i)))
	_complete_generation()
	return population.generation - 1


func generation() -> int:
	return population.generation


## The latest generation's best genome - the ONLY thing injected into live play.
func best_genes() -> PackedFloat32Array:
	return population.best_genes()


## Every candidate's genes (Array[PackedFloat32Array]) for the evolution screen's
## 1-vs-49 grid. Copies, so the UI can hold them while evolution advances.
func all_genes() -> Array:
	return population.all_genes() if population != null else []


## Candidate indices ordered best-first (for the large-slot pick + top-5 borders).
func ranked_indices() -> Array:
	return population.indices_by_fitness() if population != null else []


## A representative window to replay in the mini-sims / comparison scene, or an
## empty Dictionary when none was fed yet.
func sample_window() -> Dictionary:
	return _windows[0] if not _windows.is_empty() else {}


## Build the current snapshot Dictionary for persistence.
func build_snapshot() -> Dictionary:
	return EvoSnapshot.build(population.generation, population.best_genes(),
		history, _player_bins, _rounds_played)


# =====================================================================
# INTERNAL
# =====================================================================

## Average a candidate's fitness over up to WINDOWS_PER_CANDIDATE windows
## (guard against single-scenario overfit; see handoff.md).
func _evaluate_candidate(genes: PackedFloat32Array) -> float:
	var scores: Array = []
	var n: int = mini(_windows.size(), WINDOWS_PER_CANDIDATE)
	for i in n:
		var measurement: Dictionary = BackgroundSim.evaluate_window(_windows[i], genes)
		scores.append(Fitness.score_window(measurement))
	return Fitness.average(scores)


func _complete_generation() -> void:
	var gen: int = population.generation
	var entry: Dictionary = EvoSnapshot.make_history_entry(
		gen, population.best_fitness(), population.mean_fitness(), population.current_variance())
	history.append(entry)
	while history.size() > HISTORY_LIMIT:
		history.pop_front()
	population.advance()
	_eval_cursor = 0
