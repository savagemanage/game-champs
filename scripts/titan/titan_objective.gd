class_name TitanObjective
extends RefCounted
## PURE objective/target helper for the titan action-defense behaviour (FEAT-004).
## The titan is an infiltrator: it must reach the wall, breach it (funnel through
## a gate gap), then hunt and EAT the plaza citizens. This module holds ONLY the
## plain-data target-selection maths so scripts/titan/titan.gd stays under the
## 250-line cap; it takes plain Vector3s / floats and returns plain data, touching
## no Node / scene / physics types (mirrors the scripts/evo purity rule so it is
## headless-verifiable).
##
## State machine (returned as STATE_* ints, driven by titan.gd each physics tick):
##   STATE_APPROACH_WALL -> head for the nearest breach point (gate gap). Once the
##       titan is INSIDE the wall ring (breached), advance.
##   STATE_SEEK_CITIZEN  -> path to the nearest live citizen.
##   STATE_EAT           -> within EAT reach of a citizen: consume it (titan.gd
##       calls CitizenManager.eat_nearest), then fall back to seeking.
## Everything here is FIXED geometry-driven; nothing scales with the round number.

# =====================================================================
# STATE CODES
# =====================================================================
const STATE_APPROACH_WALL: int = 0
const STATE_SEEK_CITIZEN: int = 1
const STATE_EAT: int = 2


## True once the titan is inside the wall ring (radius `wall_radius`), i.e. it has
## breached / passed through a gate. Uses horizontal distance from the origin.
static func is_inside_wall(titan_pos: Vector3, wall_radius: float) -> bool:
	var flat := Vector2(titan_pos.x, titan_pos.z)
	return flat.length() <= wall_radius


## Choose the nearest breach point (gate gap) to steer toward while OUTSIDE the
## wall. `gates` is an Array[Vector3] of gate-gap world positions. Falls back to
## the origin (pull inward) when no gates are supplied.
static func nearest_gate(titan_pos: Vector3, gates: Array) -> Vector3:
	var best := Vector3.ZERO
	var best_d: float = INF
	var found: bool = false
	for g in gates:
		var gate: Vector3 = g
		var d: float = _flat_dist_sq(titan_pos, gate)
		if d < best_d:
			best_d = d
			best = gate
			found = true
	return best if found else Vector3.ZERO


## Nearest live citizen position to the titan (Array[Vector3] of live positions).
## Returns {"found": bool, "pos": Vector3, "dist": float} (horizontal distance).
static func nearest_citizen(titan_pos: Vector3, citizens: Array) -> Dictionary:
	var best := Vector3.ZERO
	var best_d: float = INF
	var found: bool = false
	for c in citizens:
		var pos: Vector3 = c
		var d: float = _flat_dist_sq(titan_pos, pos)
		if d < best_d:
			best_d = d
			best = pos
			found = true
	return {"found": found, "pos": best, "dist": sqrt(best_d) if found else INF}


## Resolve the next objective state + the world-space nav target for this tick.
##   state             : current STATE_* code
##   titan_pos         : titan world position
##   gates             : Array[Vector3] gate-gap positions (breach points)
##   citizens          : Array[Vector3] LIVE citizen positions
##   wall_radius       : ring radius; inside it = breached
##   eat_reach         : horizontal distance under which a citizen is eaten
## Returns {"state": int, "target": Vector3, "eat": bool} where `eat` is true
## when the titan is close enough to consume the nearest citizen this tick.
static func resolve(
		state: int,
		titan_pos: Vector3,
		gates: Array,
		citizens: Array,
		wall_radius: float,
		eat_reach: float) -> Dictionary:
	var inside: bool = is_inside_wall(titan_pos, wall_radius)

	# Not yet breached: keep pushing for the nearest gate gap.
	if not inside and not citizens.is_empty():
		return {"state": STATE_APPROACH_WALL, "target": nearest_gate(titan_pos, gates), "eat": false}

	# Breached (or no gates matter): hunt the nearest citizen.
	var near: Dictionary = nearest_citizen(titan_pos, citizens)
	if not near["found"]:
		# No citizens left to eat: hold toward the plaza centre.
		return {"state": STATE_SEEK_CITIZEN, "target": Vector3.ZERO, "eat": false}
	if float(near["dist"]) <= eat_reach:
		return {"state": STATE_EAT, "target": near["pos"], "eat": true}
	return {"state": STATE_SEEK_CITIZEN, "target": near["pos"], "eat": false}


static func _flat_dist_sq(a: Vector3, b: Vector3) -> float:
	var dx: float = a.x - b.x
	var dz: float = a.z - b.z
	return dx * dx + dz * dz
