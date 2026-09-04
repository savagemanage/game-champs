extends RefCounted
class_name EngagementWindow
## One engagement window (steering 3.5): the ~2s slice
##   grapple-fire -> swing -> slash attempt -> post-slash disengage.
##
## PURE DATA. Holds plain Vector3 / float snapshots only, no scene references,
## so spec 3's pure evolution integrator can replay a window without touching
## the Godot scene tree. Each window stores:
##   * the STARTING world snapshot (player + every titan pos/vel), and
##   * the SUBSEQUENT player trajectory (position/velocity samples).
##
## The recorder opens a window on grapple fire, marks the slash attempt, and
## closes it a fixed time after the slash (the "disengage"). Windows that never
## reach a slash before the timeout are still closed so the round yields plenty
## of samples (steering aims for 5+ per round).

# =====================================================================
# CONSTANTS
# =====================================================================

## Result codes for the slash that (optionally) occurred inside the window.
const RESULT_NONE: int = 0     ## no slash happened in this window
const RESULT_WHIFF: int = 1    ## slashed but hit nothing
const RESULT_SUB: int = 2      ## hit but below kill threshold
const RESULT_KILL: int = 3

# =====================================================================
# STATE
# =====================================================================

var start_time: float = 0.0
var end_time: float = 0.0
var slashed: bool = false
var slash_result: int = RESULT_NONE

## Player state at window start.
var start_player_pos: Vector3 = Vector3.ZERO
var start_player_vel: Vector3 = Vector3.ZERO
## Grapple anchor that opened the window.
var anchor_pos: Vector3 = Vector3.ZERO

## Snapshot of every titan at window start: [{pos:Vector3, vel:Vector3,
## nape_normal:Vector3}, ...].
var start_titans: Array = []

## Subsequent player trajectory: [{t:float, pos:Vector3, vel:Vector3,
## look:Vector3}, ...] sampled by the recorder.
var trajectory: Array = []

## Engagement distance (m) at window start = nearest titan distance. Cached so
## the player model and round metrics can read it without re-scanning titans.
var engagement_distance: float = 0.0
## Player speed (m/s) entering the window.
var entry_speed: float = 0.0
## Horizontal unit-ish vector FROM nearest titan TO player at start (approach
## side, feeds the player model's quadrant classification).
var approach_dir_xz: Vector3 = Vector3.ZERO


func duration() -> float:
	return maxf(0.0, end_time - start_time)


func add_trajectory_sample(t: float, pos: Vector3, vel: Vector3, look: Vector3) -> void:
	trajectory.append({"t": t, "pos": pos, "vel": vel, "look": look})


func to_dict() -> Dictionary:
	return {
		"start_time": start_time,
		"end_time": end_time,
		"slashed": slashed,
		"slash_result": slash_result,
		"start_player_pos": _v(start_player_pos),
		"start_player_vel": _v(start_player_vel),
		"anchor_pos": _v(anchor_pos),
		"engagement_distance": engagement_distance,
		"entry_speed": entry_speed,
		"approach_dir_xz": _v(approach_dir_xz),
		"start_titans": _titans_to_array(),
		"trajectory": _trajectory_to_array(),
	}


static func _v(vec: Vector3) -> Array:
	return [vec.x, vec.y, vec.z]


func _titans_to_array() -> Array:
	var out: Array = []
	for t in start_titans:
		out.append({
			"pos": _v(t.get("pos", Vector3.ZERO)),
			"vel": _v(t.get("vel", Vector3.ZERO)),
			"nape_normal": _v(t.get("nape_normal", Vector3.ZERO)),
		})
	return out


func _trajectory_to_array() -> Array:
	var out: Array = []
	for s in trajectory:
		out.append({
			"t": s.get("t", 0.0),
			"pos": _v(s.get("pos", Vector3.ZERO)),
			"vel": _v(s.get("vel", Vector3.ZERO)),
			"look": _v(s.get("look", Vector3.ZERO)),
		})
	return out
