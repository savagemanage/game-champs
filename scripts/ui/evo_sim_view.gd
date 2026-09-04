extends Control
class_name EvoSimView
## ONE 2D top-down mini-sim drawn on a SINGLE CanvasItem via _draw (NOT a 3D
## render - a reduced 3D render is too heavy for single-thread web export). It
## renders titan dots, one player dot, the (static) citizen dots, and ONE heading
## line segment per titan, driven by a SimReplay trace of a scenario window (the
## titans assault the wall then hunt the citizens).
##
## The trace comes from the PURE evo module (SimReplay.trace_window / the same
## fixed-step integration BackgroundSim scores with); this Control only maps the
## returned XZ world points into the rect and draws. Playback advances one trace
## frame per PLAYBACK_INTERVAL and loops, so a running evolution reads as an
## experiment observation, not a still image.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Seconds per trace frame during playback (loops the ~2s window).
const PLAYBACK_INTERVAL: float = 0.05
## Inner padding (px) inside the view rect so dots never touch the border.
const PADDING: float = 6.0
## Dot radii (px) in the LARGE view; scaled down for the small grid via `scale_`.
const PLAYER_RADIUS: float = 7.0
const TITAN_RADIUS: float = 5.0
## Heading segment length (px) at scale 1.0.
const NAPE_LEN: float = 16.0
const NAPE_WIDTH: float = 2.0
## Citizen dot radius (px) at scale 1.0.
const CITIZEN_RADIUS: float = 3.5

const BG_COLOR: Color = Color(0.07, 0.08, 0.12, 1.0)
const BG_DIM_COLOR: Color = Color(0.04, 0.04, 0.06, 1.0)
const BORDER_COLOR: Color = Color(0.28, 0.34, 0.5, 0.9)
const TOP_BORDER_COLOR: Color = Color(1.0, 0.82, 0.25, 1.0)
const PLAYER_COLOR: Color = Color(0.35, 0.85, 1.0, 1.0)
const TITAN_COLOR: Color = Color(0.95, 0.45, 0.3, 1.0)
const NAPE_COLOR: Color = Color(1.0, 0.9, 0.4, 0.9)  ## titan heading segment
const CITIZEN_COLOR: Color = Color(0.5, 1.0, 0.6, 0.95)

# =====================================================================
# STATE
# =====================================================================

var _trace: Dictionary = {}
var _frames: Array = []
var _frame_index: int = 0
var _accum: float = 0.0
## Visual scale (1.0 = large panel; the grid passes a smaller factor).
var scale_: float = 1.0
## Dim the panel (bottom-50% candidates on a generation transition).
var dimmed: bool = false
## Draw a highlight border (top-5 candidates on a generation transition).
var highlighted: bool = false


func _ready() -> void:
	set_process(true)


## Feed a SimReplay trace Dictionary (from the pure evo module) to display.
func set_trace(trace: Dictionary) -> void:
	_trace = trace
	_frames = trace.get("frames", [])
	_frame_index = 0
	_accum = 0.0
	queue_redraw()


func _process(delta: float) -> void:
	if _frames.size() <= 1:
		return
	_accum += delta
	if _accum >= PLAYBACK_INTERVAL:
		_accum = 0.0
		_frame_index = (_frame_index + 1) % _frames.size()
		queue_redraw()


func _draw() -> void:
	var rect: Rect2 = Rect2(Vector2.ZERO, size)
	draw_rect(rect, BG_DIM_COLOR if dimmed else BG_COLOR, true)
	var border: Color = TOP_BORDER_COLOR if highlighted else BORDER_COLOR
	draw_rect(rect, border, false, (2.0 if highlighted else 1.0) * scale_)

	if _frames.is_empty():
		return
	var frame: Dictionary = _frames[_frame_index]
	var lo: Vector2 = _trace.get("bounds_min", Vector2(-1, -1))
	var hi: Vector2 = _trace.get("bounds_max", Vector2(1, 1))

	# Static citizen dots (the objective) drawn under the moving actors.
	for cz in _trace.get("citizens", []):
		draw_circle(_to_view(cz, lo, hi), CITIZEN_RADIUS * scale_, CITIZEN_COLOR)

	# Titan dots + heading direction segments.
	var titans: Array = frame.get("titans", [])
	var napes: Array = frame.get("napes", [])
	for i in titans.size():
		var c: Vector2 = _to_view(titans[i], lo, hi)
		draw_circle(c, TITAN_RADIUS * scale_, TITAN_COLOR)
		if i < napes.size():
			var dir: Vector2 = (napes[i] as Vector2)
			if dir.length() > 0.001:
				# napes[] carries the titan HEADING now (drawn as a short line).
				draw_line(c, c + dir.normalized() * NAPE_LEN * scale_, NAPE_COLOR, NAPE_WIDTH * scale_)

	# One player dot on top.
	var p: Vector2 = _to_view(frame.get("player", Vector2.ZERO), lo, hi)
	draw_circle(p, PLAYER_RADIUS * scale_, PLAYER_COLOR)


# =====================================================================
# MAPPING
# =====================================================================

## Map an XZ world point into the padded view rect, preserving the square trace
## bounds so dots keep their relative layout.
func _to_view(world: Vector2, lo: Vector2, hi: Vector2) -> Vector2:
	var span: Vector2 = hi - lo
	var sx: float = span.x if span.x > 0.001 else 1.0
	var sy: float = span.y if span.y > 0.001 else 1.0
	var inner: Vector2 = size - Vector2(PADDING, PADDING) * 2.0
	var u: float = (world.x - lo.x) / sx
	var v: float = (world.y - lo.y) / sy
	return Vector2(PADDING, PADDING) + Vector2(u * inner.x, v * inner.y)
