extends RefCounted
class_name RoundRecorder
## Records one round of play and derives the metrics evolution will consume.
##
## PURE DATA: it receives plain Vector3 / float / int values pushed by the
## Telemetry autoload (which is the only thing that talks to game scenes). The
## recorder never reads the scene tree, so spec 3 can reuse its outputs.
##
## Records (steering spec 2 / FEAT-002):
##   * player trajectory: position, velocity, look dir - every SAMPLE_INTERVAL
##     physics ticks (NOT every tick).
##   * grapple events: fire time + anchor world pos, release time.
##   * slash attempts: time, position, blade travel dir, relative speed, result.
##   * per-titan per-tick: nape-in-view (bool) AND nape-in-range (bool).
## Derives at round end:
##   * nape exposure ratio per titan + averaged.
##   * engagement windows (grapple-fire -> slash -> disengage, ~2s each).
## Also feeds the shared 24-bin PlayerModel as each window closes.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Sample the player trajectory every N physics ticks (steering: 30).
const SAMPLE_INTERVAL: int = 30
## Half-angle (degrees) of the player view cone used to decide "nape in view".
## SYNC: must equal BackgroundSim.VIEW_HALF_ANGLE (deg_to_rad(40°)); duplicated
## not shared because scripts/evo/ stays pure and can't import telemetry.
const VIEW_ANGLE_THRESHOLD_DEG: float = 40.0
## Max distance (m) at which the nape counts as "in slash range".
## SYNC: must equal BackgroundSim.SLASH_RANGE (8.0). Same purity reason.
const RANGE_THRESHOLD: float = 8.0
## Seconds after a slash attempt before the engagement window is closed
## (the "post-slash disengage"). Total window ~= this + swing time (~2s).
const POST_SLASH_DISENGAGE: float = 1.0
## Hard cap (s) on window length so a grapple that never slashes still closes
## and the round yields many windows (aim 5+/round).
const MAX_WINDOW_DURATION: float = 2.5

# =====================================================================
# STATE
# =====================================================================

var _tick: int = 0
var _time: float = 0.0

# Trajectory samples: [{t, pos, vel, look}, ...].
var trajectory: Array = []
# Grapple events: [{fire_time, anchor, release_time}, ...].
var grapples: Array = []
# Slash attempts: [{time, pos, dir, rel_speed, result}, ...].
var slashes: Array = []

# Per-titan exposure tallies keyed by titan id:
#   {id: {ticks:int, exposed:int}} where "exposed" = nape in view AND in range.
var _titan_ticks: Dictionary = {}

# Completed engagement windows for THIS round.
var windows: Array = []
# The window currently being recorded (an EngagementWindow) or null.
var _open_window: EngagementWindow = null


# =====================================================================
# PER-TICK RECORDING (called from Telemetry autoload each physics tick)
# =====================================================================

## `player` is a small dict {pos, vel, look}. `titans` is an array of dicts
## {id, pos, vel, nape_normal, nape_pos}. All plain data - no nodes.
func record_tick(delta: float, player: Dictionary, titans: Array) -> void:
	_time += delta
	_tick += 1

	# Trajectory: sample only every SAMPLE_INTERVAL ticks.
	if _tick % SAMPLE_INTERVAL == 0:
		trajectory.append({
			"t": _time,
			"pos": player.get("pos", Vector3.ZERO),
			"vel": player.get("vel", Vector3.ZERO),
			"look": player.get("look", Vector3.ZERO),
		})

	_record_nape_state(player, titans)
	_advance_open_window(delta, player)


## Every tick, for every titan, record the two booleans: is the nape inside the
## player's view cone, and is it within slash range.
func _record_nape_state(player: Dictionary, titans: Array) -> void:
	var eye: Vector3 = player.get("pos", Vector3.ZERO)
	var look: Vector3 = player.get("look", Vector3.ZERO)
	for t in titans:
		var id: int = int(t.get("id", 0))
		if not _titan_ticks.has(id):
			_titan_ticks[id] = {"ticks": 0, "exposed": 0}
		var tally: Dictionary = _titan_ticks[id]
		tally["ticks"] = int(tally["ticks"]) + 1

		var nape_pos: Vector3 = t.get("nape_pos", t.get("pos", Vector3.ZERO))
		var to_nape: Vector3 = nape_pos - eye
		var dist: float = to_nape.length()
		var in_range: bool = dist <= RANGE_THRESHOLD

		var in_view: bool = false
		if look.length() > 0.001 and dist > 0.001:
			var cos_angle: float = look.normalized().dot(to_nape / dist)
			in_view = cos_angle >= cos(deg_to_rad(VIEW_ANGLE_THRESHOLD_DEG))

		if in_view and in_range:
			tally["exposed"] = int(tally["exposed"]) + 1


# =====================================================================
# EVENT RECORDING (grapple / slash), pushed by the autoload
# =====================================================================

func record_grapple_fire(anchor: Vector3, player: Dictionary, titans: Array) -> void:
	grapples.append({"fire_time": _time, "anchor": anchor, "release_time": -1.0})
	_open_engagement_window(anchor, player, titans)


func record_grapple_release() -> void:
	if grapples.size() > 0:
		grapples[grapples.size() - 1]["release_time"] = _time


## result is one of EngagementWindow.RESULT_WHIFF / RESULT_SUB / RESULT_KILL.
func record_slash(pos: Vector3, dir: Vector3, rel_speed: float, result: int) -> void:
	slashes.append({
		"time": _time,
		"pos": pos,
		"dir": dir,
		"rel_speed": rel_speed,
		"result": result,
	})
	if _open_window != null and not _open_window.slashed:
		_open_window.slashed = true
		_open_window.slash_result = result
		# Schedule the window to close POST_SLASH_DISENGAGE after the slash.
		_open_window.end_time = _time + POST_SLASH_DISENGAGE


# =====================================================================
# ENGAGEMENT WINDOWS
# =====================================================================

func _open_engagement_window(anchor: Vector3, player: Dictionary, titans: Array) -> void:
	# If a window is already open (double grapple), close it first so we never
	# lose data or nest windows.
	if _open_window != null:
		_close_open_window()

	var w := EngagementWindow.new()
	w.start_time = _time
	w.end_time = _time + MAX_WINDOW_DURATION
	w.anchor_pos = anchor
	w.start_player_pos = player.get("pos", Vector3.ZERO)
	w.start_player_vel = player.get("vel", Vector3.ZERO)
	w.entry_speed = w.start_player_vel.length()

	var nearest_dist: float = INF
	var nearest_dir: Vector3 = Vector3.ZERO
	for t in titans:
		var tpos: Vector3 = t.get("pos", Vector3.ZERO)
		w.start_titans.append({
			"pos": tpos,
			"vel": t.get("vel", Vector3.ZERO),
			"nape_normal": t.get("nape_normal", Vector3.ZERO),
		})
		var flat: Vector3 = w.start_player_pos - tpos
		flat.y = 0.0
		var d: float = flat.length()
		if d < nearest_dist:
			nearest_dist = d
			nearest_dir = flat

	w.engagement_distance = 0.0 if nearest_dist == INF else nearest_dist
	w.approach_dir_xz = nearest_dir.normalized() if nearest_dir.length() > 0.001 else Vector3.ZERO
	_open_window = w


func _advance_open_window(delta: float, player: Dictionary) -> void:
	if _open_window == null:
		return
	_open_window.add_trajectory_sample(
		_time,
		player.get("pos", Vector3.ZERO),
		player.get("vel", Vector3.ZERO),
		player.get("look", Vector3.ZERO)
	)
	if _time >= _open_window.end_time:
		_close_open_window()


func _close_open_window() -> void:
	if _open_window == null:
		return
	if _open_window.end_time <= _open_window.start_time:
		_open_window.end_time = _time
	windows.append(_open_window)
	_open_window = null


# =====================================================================
# DERIVED METRICS (computed at round end)
# =====================================================================

## Close any dangling window so its data is not lost when the round ends.
func finalize() -> void:
	_close_open_window()


# The actual maths lives in RoundMetrics (pure, stateless) so this recorder
# stays focused on capture. These thin wrappers expose it over the recorder's
# private tallies.

func exposure_ratio_per_titan() -> Dictionary:
	return RoundMetrics.exposure_ratio_per_titan(_titan_ticks)


func average_exposure_ratio() -> float:
	return RoundMetrics.average_exposure_ratio(_titan_ticks)


func average_engagement_distance() -> float:
	return RoundMetrics.average_engagement_distance(windows)


func average_entry_speed() -> float:
	return RoundMetrics.average_entry_speed(windows)


func left_approach_ratio() -> float:
	return RoundMetrics.left_approach_ratio(windows)


func slash_attempt_count() -> int:
	return slashes.size()


func slash_success_count() -> int:
	return RoundMetrics.slash_success_count(slashes)


func slash_success_rate() -> float:
	return RoundMetrics.slash_success_rate(slashes)


func window_count() -> int:
	return windows.size()
