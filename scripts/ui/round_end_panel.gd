extends CanvasLayer
## Round-end telemetry panel (spec 2). Text is sufficient (steering).
##
## Reads the derived metrics from the Telemetry autoload (which produced them
## FIRST - this panel only DISPLAYS data that already exists) and shows:
##   * left approach ratio, average engagement distance, average entry speed,
##   * per-titan + averaged nape-exposure ratio,
##   * slash attempts vs success rate,
##   * the 24-bin player model as a simple coloured text heatmap.
##
## It listens for Telemetry.round_summary_ready and pops up at round end; any
## key / click dismisses it.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Heatmap is laid out as QUADRANTS rows x (DISTANCE_BANDS*TIMING_BANDS) columns.
const HEATMAP_COLS: int = PlayerModel.DISTANCE_BANDS * PlayerModel.TIMING_BANDS
## Glyph ramp from empty to hot for the text heatmap.
const RAMP: String = " .:-=+*#%@"
## Colour for the coldest and hottest heatmap cells (lerped by normalised count).
const COLD_COLOR: Color = Color(0.2, 0.3, 0.5)
const HOT_COLOR: Color = Color(1.0, 0.4, 0.15)

# --- Node references (names MUST match Main.tscn) ---
@onready var _root: Control = $Root
@onready var _summary_label: RichTextLabel = $Root/Panel/Margin/VBox/Summary
@onready var _heatmap_label: RichTextLabel = $Root/Panel/Margin/VBox/Heatmap
@onready var _hint_label: Label = $Root/Panel/Margin/VBox/Hint


func _ready() -> void:
	visible = false
	if Telemetry != null:
		Telemetry.round_summary_ready.connect(_on_summary_ready)


func _on_summary_ready(summary: Dictionary) -> void:
	_summary_label.text = _format_summary(summary)
	_heatmap_label.text = _format_heatmap(summary.get("player_model_bins", []))
	if _hint_label != null:
		_hint_label.text = "Press any key to continue"
	visible = true


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and (event as InputEventKey).pressed:
		visible = false
	elif event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		visible = false


# =====================================================================
# FORMATTING
# =====================================================================

func _format_summary(s: Dictionary) -> String:
	var lines: Array[String] = []
	lines.append("[b]Round %d complete[/b]" % int(s.get("round", 0)))
	lines.append("Left approach ratio: %.0f%%" % (float(s.get("left_approach_ratio", 0.0)) * 100.0))
	lines.append("Avg engagement distance: %.1f m" % float(s.get("avg_engagement_distance", 0.0)))
	lines.append("Avg entry speed: %.1f m/s" % float(s.get("avg_entry_speed", 0.0)))
	lines.append("Avg nape exposure: %.0f%%" % (float(s.get("avg_exposure_ratio", 0.0)) * 100.0))

	var per_titan: Dictionary = s.get("exposure_per_titan", {})
	if not per_titan.is_empty():
		var idx: int = 1
		for id in per_titan:
			lines.append("  titan %d exposure: %.0f%%" % [idx, float(per_titan[id]) * 100.0])
			idx += 1

	var attempts: int = int(s.get("slash_attempts", 0))
	var successes: int = int(s.get("slash_successes", 0))
	lines.append("Slash: %d attempts, %d kills (%.0f%%)"
		% [attempts, successes, float(s.get("slash_success_rate", 0.0)) * 100.0])
	lines.append("Engagement windows this round: %d" % int(s.get("window_count", 0)))
	return "\n".join(lines)


## Render the 24-bin player model as a coloured text heatmap. Rows = approach
## quadrants; columns = distance-band x timing-band.
func _format_heatmap(bins: Array) -> String:
	if bins.is_empty():
		return "[i]player model: (no data yet)[/i]"

	var max_val: float = 0.0
	for v in bins:
		max_val = maxf(max_val, float(v))
	if max_val <= 0.0:
		max_val = 1.0

	var out: Array[String] = []
	out.append("[b]Player model (24 bins)[/b]")
	out.append("rows=approach quadrant, cols=distance x timing")
	var quadrant_names: Array[String] = ["N", "E", "S", "W"]
	for q in PlayerModel.QUADRANTS:
		var row: String = "%s " % quadrant_names[q]
		for c in HEATMAP_COLS:
			var d: int = c / PlayerModel.TIMING_BANDS
			var t: int = c % PlayerModel.TIMING_BANDS
			var index: int = (q * PlayerModel.DISTANCE_BANDS + d) * PlayerModel.TIMING_BANDS + t
			var value: float = float(bins[index]) if index < bins.size() else 0.0
			row += _cell(value / max_val)
		out.append(row)
	return "\n".join(out)


func _cell(normalised: float) -> String:
	var n: float = clampf(normalised, 0.0, 1.0)
	var glyph_index: int = int(round(n * float(RAMP.length() - 1)))
	var glyph: String = RAMP.substr(glyph_index, 1)
	var color: Color = COLD_COLOR.lerp(HOT_COLOR, n)
	return "[color=#%s]%s%s[/color]" % [color.to_html(false), glyph, glyph]
