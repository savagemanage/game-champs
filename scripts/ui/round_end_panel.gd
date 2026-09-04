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

# --- Translation KEYS (user-facing text; BBCode wrapping stays in code) ---
const KEY_ROUND_COMPLETE: String = "RE_ROUND_COMPLETE"
const KEY_LEFT_APPROACH: String = "RE_LEFT_APPROACH"
const KEY_AVG_DISTANCE: String = "RE_AVG_DISTANCE"
const KEY_AVG_ENTRY_SPEED: String = "RE_AVG_ENTRY_SPEED"
const KEY_AVG_EXPOSURE: String = "RE_AVG_EXPOSURE"
const KEY_TITAN_EXPOSURE: String = "RE_TITAN_EXPOSURE"
const KEY_SLASH: String = "RE_SLASH"
const KEY_WINDOW_COUNT: String = "RE_WINDOW_COUNT"
const KEY_MODEL_TITLE: String = "RE_PLAYER_MODEL_TITLE"
const KEY_MODEL_AXES: String = "RE_PLAYER_MODEL_AXES"
const KEY_MODEL_EMPTY: String = "RE_PLAYER_MODEL_EMPTY"
const KEY_HINT_CONTINUE: String = "RE_HINT_CONTINUE"

# --- Node references (names MUST match Main.tscn) ---
@onready var _root: Control = $Root
@onready var _summary_label: RichTextLabel = $Root/Panel/Margin/VBox/Summary
@onready var _heatmap_label: RichTextLabel = $Root/Panel/Margin/VBox/Heatmap
@onready var _hint_label: Label = $Root/Panel/Margin/VBox/Hint

## Last summary shown, kept so the panel can re-render live on a locale switch.
var _last_summary: Dictionary = {}


func _ready() -> void:
	visible = false
	if Telemetry != null:
		Telemetry.round_summary_ready.connect(_on_summary_ready)
	if typeof(Settings) != TYPE_NIL and Settings != null and Settings.has_signal("locale_changed"):
		Settings.locale_changed.connect(_on_locale_changed)


## Re-render the currently-visible panel in the new locale (transient panel, so
## only refresh when it is on screen).
func _on_locale_changed(_locale: String) -> void:
	if not visible:
		return
	_summary_label.text = _format_summary(_last_summary)
	_heatmap_label.text = _format_heatmap(_last_summary.get("player_model_bins", []))
	if _hint_label != null:
		_hint_label.text = tr(KEY_HINT_CONTINUE)


func _on_summary_ready(summary: Dictionary) -> void:
	_summary_label.text = _format_summary(summary)
	_heatmap_label.text = _format_heatmap(summary.get("player_model_bins", []))
	if _hint_label != null:
		_hint_label.text = tr(KEY_HINT_CONTINUE)
	_last_summary = summary
	visible = true


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and (event as InputEventKey).pressed:
		_dismiss()
	elif event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		_dismiss()


## Hide the panel and play the UI click sfx (FEAT-002).
func _dismiss() -> void:
	visible = false
	if Sfx != null:
		Sfx.play(SfxBank.UI_CLICK)


# =====================================================================
# FORMATTING
# =====================================================================

func _format_summary(s: Dictionary) -> String:
	var lines: Array[String] = []
	lines.append("[b]%s[/b]" % (tr(KEY_ROUND_COMPLETE) % int(s.get("round", 0))))
	lines.append(tr(KEY_LEFT_APPROACH) % (float(s.get("left_approach_ratio", 0.0)) * 100.0))
	lines.append(tr(KEY_AVG_DISTANCE) % float(s.get("avg_engagement_distance", 0.0)))
	lines.append(tr(KEY_AVG_ENTRY_SPEED) % float(s.get("avg_entry_speed", 0.0)))
	lines.append(tr(KEY_AVG_EXPOSURE) % (float(s.get("avg_exposure_ratio", 0.0)) * 100.0))

	var per_titan: Dictionary = s.get("exposure_per_titan", {})
	if not per_titan.is_empty():
		var idx: int = 1
		for id in per_titan:
			lines.append(tr(KEY_TITAN_EXPOSURE) % [idx, float(per_titan[id]) * 100.0])
			idx += 1

	var attempts: int = int(s.get("slash_attempts", 0))
	var successes: int = int(s.get("slash_successes", 0))
	lines.append(tr(KEY_SLASH)
		% [attempts, successes, float(s.get("slash_success_rate", 0.0)) * 100.0])
	lines.append(tr(KEY_WINDOW_COUNT) % int(s.get("window_count", 0)))
	return "\n".join(lines)


## Render the 24-bin player model as a coloured text heatmap. Rows = approach
## quadrants; columns = distance-band x timing-band.
func _format_heatmap(bins: Array) -> String:
	if bins.is_empty():
		return "[i]%s[/i]" % tr(KEY_MODEL_EMPTY)

	var max_val: float = 0.0
	for v in bins:
		max_val = maxf(max_val, float(v))
	if max_val <= 0.0:
		max_val = 1.0

	var out: Array[String] = []
	out.append("[b]%s[/b]" % tr(KEY_MODEL_TITLE))
	out.append(tr(KEY_MODEL_AXES))
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
