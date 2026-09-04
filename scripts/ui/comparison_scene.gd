extends CanvasLayer
## THE FINAL COMPARISON SCENE - the project's COMPLETION CRITERION (steering
## section 7 and spec-4 seed: "이 한 장면이 프로젝트가 증명하려는 것 전부다").
##
## Right before returning to gameplay, for DURATION seconds, the screen is split
## left/right and the SAME telemetry engagement window is replayed SIMULTANEOUSLY
## on both sides via the PURE evo tracer (SimReplay, the same fixed-step
## integrator BackgroundSim scores with):
##   * LEFT  = generation-1 genes  = pure-navigation baseline [2.0,0,0,0,1.0,0]
##             (Genome.make_baseline()).
##   * RIGHT = the latest generation's best genome (TitanEvo.current_best_genes()).
## Each side is labeled ("Gen 1 (pure nav)" vs "Gen N (best)"). After DURATION it
## emits `finished` and gameplay resumes.
##
## Both halves are 2D top-down dots drawn via _draw (EvoSimView) - NOT 3D
## renders (steering spec-4). Both are fed from the SAME window Dictionary so the
## comparison is apples-to-apples.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Seconds the comparison is shown before returning to gameplay (steering spec-4).
const DURATION: float = 2.5
## Left/right split fraction (each half gets 50%).
const HALF_FRAC: float = 0.5
## Inset (px) around each half so the two sims read as separate panels.
const PANEL_INSET: float = 12.0
## Side-label band (px): top offset and height.
const LABEL_TOP: float = 10.0
const LABEL_HEIGHT: float = 28.0
## Label text for each side (Gen N is filled in at play() time).
const LEFT_LABEL: String = "Gen 1 (pure nav)"
const RIGHT_LABEL_FMT: String = "Gen %d (best)"
## Shown on BOTH sides when no evolution has happened yet (generation <= 1), so
## the identical halves are not mislabeled as an evolved-vs-baseline contrast.
const UNEVOLVED_LABEL: String = "Gen 1 (pure nav) - no evolution yet"

const BACKDROP_COLOR: Color = Color(0.02, 0.02, 0.04, 1.0)

# --- Node references (must match the scene) ---
@onready var _root: Control = $Root
@onready var _backdrop: ColorRect = $Root/Backdrop
@onready var _left_view: EvoSimView = $Root/LeftView
@onready var _right_view: EvoSimView = $Root/RightView
@onready var _left_label: Label = $Root/LeftLabel
@onready var _right_label: Label = $Root/RightLabel
@onready var _timer: Timer = $Timer

signal finished


func _ready() -> void:
	# Runs while the game tree is PAUSED (between rounds), so ignore the pause.
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_backdrop.color = BACKDROP_COLOR
	_timer.one_shot = true
	_timer.wait_time = DURATION
	_timer.timeout.connect(_on_timeout)


## Play the comparison. `window` is the SAME engagement window both sides replay;
## `preferred_entry_dir` is the measured player-preferred approach used by the
## flankBias steering term. If no window is available it finishes immediately so
## gameplay is never blocked.
func play(window: Dictionary, preferred_entry_dir: Vector3) -> void:
	if window.is_empty():
		finished.emit()
		return

	var baseline: PackedFloat32Array = Genome.make_baseline()
	var best: PackedFloat32Array = baseline
	var gen: int = 1
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null:
		best = TitanEvo.current_best_genes()
		gen = TitanEvo.current_generation()

	_layout()
	# SAME window, two genomes: left = gen-1 baseline, right = latest best.
	_left_view.set_trace(SimReplay.trace_window(window, baseline, preferred_entry_dir))
	_right_view.set_trace(SimReplay.trace_window(window, best, preferred_entry_dir))

	# Guard the degenerate case: before any evolution (generation <= 1) the best
	# genome IS the baseline, so both halves are identical. Rather than imply a
	# false "Gen 1 vs Gen N" contrast, label both sides as unevolved and drop the
	# highlight. The scene still plays (it stays the completion criterion), it
	# just tells the truth until real evolution has produced a distinct best.
	var evolved: bool = gen > 1
	_left_view.highlighted = false
	_right_view.highlighted = evolved
	if evolved:
		_left_label.text = LEFT_LABEL
		_right_label.text = RIGHT_LABEL_FMT % gen
	else:
		_left_label.text = UNEVOLVED_LABEL
		_right_label.text = UNEVOLVED_LABEL

	visible = true
	_timer.start()


func _layout() -> void:
	var w: float = _root.size.x
	var h: float = _root.size.y
	var half_w: float = w * HALF_FRAC
	var top: float = LABEL_TOP + LABEL_HEIGHT + PANEL_INSET
	var view_h: float = h - top - PANEL_INSET
	_left_view.position = Vector2(PANEL_INSET, top)
	_left_view.size = Vector2(half_w - PANEL_INSET * 2.0, view_h - PANEL_INSET)
	_right_view.position = Vector2(half_w + PANEL_INSET, top)
	_right_view.size = Vector2(half_w - PANEL_INSET * 2.0, view_h - PANEL_INSET)
	_left_label.position = Vector2(PANEL_INSET, LABEL_TOP)
	_left_label.size = Vector2(half_w - PANEL_INSET * 2.0, LABEL_HEIGHT)
	_right_label.position = Vector2(half_w + PANEL_INSET, LABEL_TOP)
	_right_label.size = Vector2(half_w - PANEL_INSET * 2.0, LABEL_HEIGHT)


func _on_timeout() -> void:
	visible = false
	finished.emit()
