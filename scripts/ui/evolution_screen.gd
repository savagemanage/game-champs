extends CanvasLayer
## The evolution "experiment observation" screen (spec 4). Shown BETWEEN rounds
## while the TitanEvo background burst runs - reads as an experiment, not a
## loading screen.
##
## TIMING: ONCE right after the FIRST kill, then EVERY APPEAR_EVERY_ROUNDS rounds
## (game_manager calls request_first_kill_show / request_round_show). Any key
## skips; a skip hint shows from the SECOND appearance onward.
##
## LAYOUT: left LEFT_FRAC = current best candidate's mini-sim LARGE; right = the
## other candidates in a grid (EvoSimView each). Best swaps into the large slot
## when it changes; on a generation transition the bottom-half are dimmed and the
## top TOP_HIGHLIGHT are border-highlighted. Four indicators: generation counter
## (biggest number) + EvoIndicators (fitness curve, variance bars, radar 2-4).
##
## All mini-sims are 2D top-down dots via _draw (EvoSimView) fed by the PURE
## SimReplay tracer - NOT 3D renders (steering spec-4). Before returning to play
## it launches the final 2.5s comparison scene, then emits `finished`.

# --- TUNING CONSTANTS (no magic numbers below this block) ---
## After the first-kill appearance, show again every this many rounds.
const APPEAR_EVERY_ROUNDS: int = 3
## Screen split: left 40% large best sim, right 60% grid (steering spec-4).
const LEFT_FRAC: float = 0.4
const RIGHT_FRAC: float = 0.6
## Grid dimensions for the "other 49" candidates (7x7 = 49 small cells).
const GRID_COLS: int = 7
const GRID_ROWS: int = 7
## Number of top candidates border-highlighted on a generation transition.
const TOP_HIGHLIGHT: int = 5
## Small-view scale factor for grid cells.
const GRID_SCALE: float = 0.5
const KEY_SKIP_HINT: String = "EVO_SKIP_HINT"  ## skip hint (from 2nd appearance)
const KEY_TITLE_GEN: String = "EVO_TITLE_GEN"  ## title "EVOLVING - Generation %d"
## Max seconds the screen stays up if evolution finishes fast / stalls.
const MAX_VISIBLE_TIME: float = 8.0
## Layout paddings (px) and the grid/indicators vertical split fraction.
const TOP_PAD: float = 70.0
const BOTTOM_PAD: float = 40.0
const EDGE_PAD: float = 16.0
const COL_GAP: float = 8.0
const CELL_GAP: float = 4.0
const GRID_HEIGHT_FRAC: float = 0.62

# --- Node references (must match the scene) ---
@onready var _root: Control = $Root
@onready var _gen_label: Label = $Root/GenCounter
@onready var _title_label: Label = $Root/Title
@onready var _hint_label: Label = $Root/Hint
@onready var _large_view: EvoSimView = $Root/LargeView
@onready var _grid: GridContainer = $Root/Grid
@onready var _indicators: EvoIndicators = $Root/Indicators
@onready var _comparison: Node = $Comparison

# --- STATE ---
var _appearances: int = 0
var _visible_time: float = 0.0
var _grid_views: Array = []
var _prev_best_genes: PackedFloat32Array = PackedFloat32Array()
signal finished


func _ready() -> void:
	# The screen (and the burst it observes) run while the game tree is PAUSED
	# between rounds, so it must ignore the pause.
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	set_process(false)
	_build_grid()
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null:
		TitanEvo.generation_completed.connect(_on_generation_completed)
	if _comparison != null and _comparison.has_signal("finished"):
		_comparison.finished.connect(_on_comparison_finished)


## First appearance (game_manager calls this right after the FIRST kill). Shows
## the screen once; returns true when it takes over the flow.
func request_first_kill_show() -> bool:
	if _appearances > 0:
		return false
	_appearances += 1
	_show()
	return true


## Subsequent appearances (game_manager calls this on round clear). Shows every
## APPEAR_EVERY_ROUNDS rounds AFTER the first-kill appearance; returns true when
## it takes over (game_manager waits for `finished`).
func request_round_show(round_number: int) -> bool:
	if _appearances == 0:
		return false  # first-kill appearance has not happened yet
	if round_number % APPEAR_EVERY_ROUNDS != 0:
		return false
	_appearances += 1
	_show()
	return true

func _show() -> void:
	visible = true
	_visible_time = 0.0
	set_process(true)
	_hint_label.text = tr(KEY_SKIP_HINT) if _appearances >= 2 else ""
	_hint_label.visible = _appearances >= 2
	_layout()
	_refresh()


func _process(delta: float) -> void:
	if not visible:
		return
	_visible_time += delta
	# Auto-advance if the burst finished or the screen has been up long enough.
	var evolving: bool = typeof(TitanEvo) != TYPE_NIL and TitanEvo != null and TitanEvo.is_evolving()
	if not evolving or _visible_time >= MAX_VISIBLE_TIME:
		_begin_comparison()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if (event is InputEventKey and (event as InputEventKey).pressed) \
			or (event is InputEventMouseButton and (event as InputEventMouseButton).pressed):
		get_viewport().set_input_as_handled()
		_begin_comparison()


# --- REFRESH (on each generation the burst completes) ---
func _on_generation_completed(_generation: int, _best_fitness: float) -> void:
	if visible:
		_refresh()


func _refresh() -> void:
	if typeof(TitanEvo) == TYPE_NIL or TitanEvo == null:
		return
	var gen: int = TitanEvo.current_generation()
	_gen_label.text = str(gen)
	_title_label.text = tr(KEY_TITLE_GEN) % gen
	var window: Dictionary = TitanEvo.sample_window()
	var preferred: Vector3 = TitanEvo.preferred_entry_dir()
	var genes_list: Array = TitanEvo.all_candidate_genes()
	var ranked: Array = TitanEvo.ranked_candidate_indices()
	# Large slot = current best candidate (swaps automatically as best changes).
	var best_genes: PackedFloat32Array = TitanEvo.current_best_genes()
	if not window.is_empty():
		_large_view.set_trace(SimReplay.trace_window(window, best_genes, preferred))
	_large_view.highlighted = true
	_refresh_grid(window, preferred, genes_list, ranked)
	# Indicators 2-4 from history; radar overlays the previous generation.
	_indicators.set_data(TitanEvo.history(), best_genes, _prev_best_genes)
	_prev_best_genes = Genome.duplicate_genes(best_genes)


## Fill the grid with the OTHER candidates (best excluded). Dim the bottom-half
## by fitness and border-highlight the top TOP_HIGHLIGHT (generation transition).
func _refresh_grid(window: Dictionary, preferred: Vector3, genes_list: Array, ranked: Array) -> void:
	var best_index: int = ranked[0] if not ranked.is_empty() else -1
	var others: Array = []
	for idx in ranked:
		if idx != best_index:
			others.append(idx)
	var half: int = others.size() / 2
	for cell in _grid_views.size():
		var view: EvoSimView = _grid_views[cell]
		if cell >= others.size() or genes_list.is_empty():
			view.visible = false
			continue
		view.visible = true
		var cand: int = int(others[cell])
		view.scale_ = GRID_SCALE
		# Top-5 (by rank, best excluded so ranks 1..4 here) get a border; the
		# bottom half are dimmed to read the population's spread at a glance.
		view.highlighted = cell < (TOP_HIGHLIGHT - 1)
		view.dimmed = cell >= (others.size() - half)
		if not window.is_empty() and cand < genes_list.size():
			view.set_trace(SimReplay.trace_window(window, genes_list[cand], preferred))


# --- LAYOUT ---
func _layout() -> void:
	var w: float = _root.size.x
	var h: float = _root.size.y
	var left_w: float = w * LEFT_FRAC
	var usable_h: float = h - TOP_PAD - BOTTOM_PAD
	# Large best-candidate sim fills the left column below the title.
	_large_view.position = Vector2(EDGE_PAD, TOP_PAD)
	_large_view.size = Vector2(left_w - EDGE_PAD * 1.5, usable_h)
	# Right column split: grid on top, indicators panel below it.
	var right_x: float = left_w + COL_GAP
	var right_w: float = w * RIGHT_FRAC - EDGE_PAD * 1.5
	var grid_h: float = usable_h * GRID_HEIGHT_FRAC
	_grid.position = Vector2(right_x, TOP_PAD)
	_grid.size = Vector2(right_w, grid_h)
	_grid.columns = GRID_COLS
	_indicators.position = Vector2(right_x, TOP_PAD + grid_h + COL_GAP)
	_indicators.size = Vector2(right_w, usable_h - grid_h - COL_GAP)
	_size_grid_cells(right_w, grid_h)


func _build_grid() -> void:
	_grid.columns = GRID_COLS
	_grid_views.clear()
	for i in GRID_COLS * GRID_ROWS:
		var view: EvoSimView = EvoSimView.new()
		view.scale_ = GRID_SCALE
		_grid.add_child(view)
		_grid_views.append(view)


func _size_grid_cells(grid_w: float, grid_h: float) -> void:
	var cw: float = (grid_w - CELL_GAP * float(GRID_COLS - 1)) / float(GRID_COLS)
	var ch: float = (grid_h - CELL_GAP * float(GRID_ROWS - 1)) / float(GRID_ROWS)
	_grid.add_theme_constant_override("h_separation", int(CELL_GAP))
	_grid.add_theme_constant_override("v_separation", int(CELL_GAP))
	for view in _grid_views:
		(view as EvoSimView).custom_minimum_size = Vector2(cw, ch)


# --- HAND-OFF TO THE FINAL COMPARISON SCENE ---
## _process watches TitanEvo.is_evolving(); when the burst ends (or the timeout
## / a key press) it triggers the final comparison scene, then returns to play.
func _begin_comparison() -> void:
	if not visible:
		return
	set_process(false)
	_large_view.highlighted = false
	_start_comparison()


func _start_comparison() -> void:
	if _comparison != null and _comparison.has_method("play"):
		var window: Dictionary = {}
		var preferred: Vector3 = Vector3.ZERO
		if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null:
			window = TitanEvo.sample_window()
			preferred = TitanEvo.preferred_entry_dir()
		_root.visible = false
		_comparison.call("play", window, preferred)
	else:
		_finish()


func _on_comparison_finished() -> void:
	_finish()

func _finish() -> void:
	visible = false
	_root.visible = true
	set_process(false)
	finished.emit()
