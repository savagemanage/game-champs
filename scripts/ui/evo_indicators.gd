extends Control
class_name EvoIndicators
## Three of the four evolution-screen indicators, drawn on a SINGLE CanvasItem
## via _draw (steering spec-4). The generation counter (indicator 1, the biggest
## number on screen) is a Label owned by the parent screen; this Control draws:
##
##   2. Fitness curve  - best (bright) + mean (dim) lines over the last
##      HISTORY_WINDOW generations, read from snapshot / EvoManager history.
##   3. Variance bars  - 6 per-gene normalised-variance bars; shrinking = the
##      population is converging (steering 3.9 / 3.11 variance[6]).
##   4. Radar chart    - the best genome on 6 axes, with the PREVIOUS generation
##      overlaid as a faint line.
##
## All inputs are plain data (history Array of {best,mean,variance[6]} and two
## gene arrays); this Control only draws. Pure math + draw calls, single-thread.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## How many recent generations the fitness curve + variance read (steering
## spec-4: last 40 generations).
const HISTORY_WINDOW: int = 40
## Fraction of the height each of the 3 stacked sub-panels gets.
const CURVE_FRAC: float = 0.42
const BARS_FRAC: float = 0.24
const RADAR_FRAC: float = 0.34
const PANEL_GAP: float = 10.0

const LABEL_COLOR: Color = Color(0.75, 0.8, 0.9, 1.0)
const CURVE_BEST_COLOR: Color = Color(0.4, 1.0, 0.55, 1.0)
const CURVE_MEAN_COLOR: Color = Color(0.5, 0.7, 1.0, 0.7)
const BAR_COLOR: Color = Color(0.9, 0.6, 0.25, 1.0)
const BAR_BG_COLOR: Color = Color(0.15, 0.16, 0.2, 1.0)
const RADAR_AXIS_COLOR: Color = Color(0.35, 0.4, 0.5, 0.8)
const RADAR_NOW_COLOR: Color = Color(1.0, 0.82, 0.3, 1.0)
const RADAR_PREV_COLOR: Color = Color(0.6, 0.65, 0.8, 0.4)
const LINE_WIDTH: float = 2.0
## Sub-panel layout: header band height (px), bar width fraction of its slot,
## radar radius fraction, and label font size.
const HEADER_H: float = 16.0
const BAR_WIDTH_FRAC: float = 0.6
const RADAR_RADIUS_FRAC: float = 0.38
const FONT_SIZE: int = 12
const LABEL_OFFSET: Vector2 = Vector2(2.0, 12.0)

# =====================================================================
# STATE (all plain data)
# =====================================================================

var _history: Array = []
var _best_genes: PackedFloat32Array = PackedFloat32Array()
var _prev_genes: PackedFloat32Array = PackedFloat32Array()
var _font: Font = null


func _ready() -> void:
	_font = ThemeDB.fallback_font


func set_data(history: Array, best_genes: PackedFloat32Array, prev_genes: PackedFloat32Array) -> void:
	_history = history
	_best_genes = best_genes
	_prev_genes = prev_genes
	queue_redraw()


func _draw() -> void:
	var h_curve: float = size.y * CURVE_FRAC
	var h_bars: float = size.y * BARS_FRAC
	var h_radar: float = size.y * RADAR_FRAC
	var y: float = 0.0
	_draw_curve(Rect2(0.0, y, size.x, h_curve - PANEL_GAP))
	y += h_curve
	_draw_bars(Rect2(0.0, y, size.x, h_bars - PANEL_GAP))
	y += h_bars
	_draw_radar(Rect2(0.0, y, size.x, h_radar - PANEL_GAP))


# =====================================================================
# INDICATOR 2 - FITNESS CURVE
# =====================================================================

func _draw_curve(r: Rect2) -> void:
	_label(r.position, "Fitness (best / mean, last %d gen)" % HISTORY_WINDOW)
	var recent: Array = _tail(_history, HISTORY_WINDOW)
	var plot: Rect2 = Rect2(r.position + Vector2(0.0, HEADER_H), Vector2(r.size.x, r.size.y - HEADER_H))
	draw_rect(plot, BAR_BG_COLOR, true)
	if recent.size() < 2:
		return
	var hi: float = 0.0001
	for e in recent:
		hi = maxf(hi, maxf(float(e.get("best", 0.0)), float(e.get("mean", 0.0))))
	_draw_series(recent, plot, hi, "mean", CURVE_MEAN_COLOR)
	_draw_series(recent, plot, hi, "best", CURVE_BEST_COLOR)


func _draw_series(recent: Array, plot: Rect2, hi: float, key: String, color: Color) -> void:
	var n: int = recent.size()
	var pts: PackedVector2Array = PackedVector2Array()
	for i in n:
		var x: float = plot.position.x + plot.size.x * float(i) / float(n - 1)
		var val: float = clampf(float(recent[i].get(key, 0.0)) / hi, 0.0, 1.0)
		var yv: float = plot.position.y + plot.size.y * (1.0 - val)
		pts.append(Vector2(x, yv))
	if pts.size() >= 2:
		draw_polyline(pts, color, LINE_WIDTH)


# =====================================================================
# INDICATOR 3 - PER-GENE VARIANCE BARS
# =====================================================================

func _draw_bars(r: Rect2) -> void:
	_label(r.position, "Gene variance (shrinking = converging)")
	var variance: Array = _latest_variance()
	var plot: Rect2 = Rect2(r.position + Vector2(0.0, HEADER_H), Vector2(r.size.x, r.size.y - HEADER_H))
	var count: int = Genome.GENE_COUNT
	var slot: float = plot.size.x / float(count)
	var bar_w: float = slot * BAR_WIDTH_FRAC
	# Normalise bars to the largest current variance so shrinkage is visible.
	var hi: float = 0.0001
	for v in variance:
		hi = maxf(hi, float(v))
	for i in count:
		var x: float = plot.position.x + slot * float(i) + (slot - bar_w) * 0.5
		var frac: float = clampf(float(variance[i]) / hi, 0.0, 1.0) if i < variance.size() else 0.0
		var bh: float = plot.size.y * frac
		draw_rect(Rect2(x, plot.position.y, bar_w, plot.size.y), BAR_BG_COLOR, true)
		draw_rect(Rect2(x, plot.position.y + plot.size.y - bh, bar_w, bh), BAR_COLOR, true)


# =====================================================================
# INDICATOR 4 - BEST-GENOME RADAR (previous gen overlaid faintly)
# =====================================================================

func _draw_radar(r: Rect2) -> void:
	_label(r.position, "Best genome (faint = previous gen)")
	var center: Vector2 = r.position + Vector2(r.size.x * 0.5, r.size.y * 0.5 + HEADER_H * 0.5)
	var radius: float = minf(r.size.x, r.size.y) * RADAR_RADIUS_FRAC
	var n: int = Genome.GENE_COUNT
	# Axis spokes.
	for i in n:
		var a: float = _axis_angle(i, n)
		draw_line(center, center + Vector2(cos(a), sin(a)) * radius, RADAR_AXIS_COLOR, 1.0)
	if not _prev_genes.is_empty():
		_draw_radar_poly(center, radius, _prev_genes, RADAR_PREV_COLOR)
	if not _best_genes.is_empty():
		_draw_radar_poly(center, radius, _best_genes, RADAR_NOW_COLOR)


func _draw_radar_poly(center: Vector2, radius: float, genes: PackedFloat32Array, color: Color) -> void:
	var n: int = Genome.GENE_COUNT
	var pts: PackedVector2Array = PackedVector2Array()
	for i in n:
		var rng: float = Genome.gene_range(i)
		var frac: float = clampf(genes[i] / rng, 0.0, 1.0) if rng > 0.0 else 0.0
		var a: float = _axis_angle(i, n)
		pts.append(center + Vector2(cos(a), sin(a)) * radius * frac)
	if pts.size() >= 3:
		pts.append(pts[0])
		draw_polyline(pts, color, LINE_WIDTH)


func _axis_angle(i: int, n: int) -> float:
	return -PI * 0.5 + TAU * float(i) / float(n)


# =====================================================================
# HELPERS
# =====================================================================

func _latest_variance() -> Array:
	if _history.is_empty():
		return [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
	return _history[_history.size() - 1].get("variance", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0])


func _tail(arr: Array, n: int) -> Array:
	if arr.size() <= n:
		return arr
	return arr.slice(arr.size() - n, arr.size())


func _label(pos: Vector2, text: String) -> void:
	if _font != null:
		draw_string(_font, pos + LABEL_OFFSET, text, HORIZONTAL_ALIGNMENT_LEFT, -1.0, FONT_SIZE, LABEL_COLOR)
