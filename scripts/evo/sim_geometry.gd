extends RefCounted
class_name SimGeometry
## Shared PURE geometry helpers for the action-defense integrator, used by BOTH
## BackgroundSim (scoring) and SimReplay (drawing) so the two stay in lock-step
## and neither file duplicates the maths (and both stay <= 250 lines). No scene /
## node / physics: plain Vector3 / Array in and out, XZ-horizontal throughout.

## Constrain a move across the wall ring: an outside titan crossing inside NOT
## through a gate gap is bounced back to the ring surface; gate crossings and
## moves that stay on one side pass. `gate_half_width` sets the gate-gap width.
static func apply_wall(prev: Vector3, next: Vector3, inside: bool,
		wall_radius: float, gates: Array, gate_half_width: float) -> Vector3:
	if inside or flat(next).length() > wall_radius:
		return next  # already breached (free inside) or still outside (no crossing)
	if near_gate(next, gates, gate_half_width):
		return next  # crossing at a gate gap = a breach
	var dir: Vector3 = flat(next)  # blocked by solid wall: clamp just outside
	return prev if dir.length() < 0.001 else dir.normalized() * (wall_radius + 0.01)


static func near_gate(pos: Vector3, gates: Array, gate_half_width: float) -> bool:
	for g in gates:
		if flat(pos - (g as Vector3)).length() <= gate_half_width:
			return true
	return false


## Tangential dispersal: the offset from the group centroid rotated 90 degrees so
## titans fan out around the target instead of stacking on it.
static func spread_dir(index: int, t_pos: Array, target: Vector3) -> Vector3:
	var centroid: Vector3 = Vector3.ZERO
	for p in t_pos:
		centroid += flat(p as Vector3)
	if t_pos.size() > 0:
		centroid /= float(t_pos.size())
	var radial: Vector3 = flat((t_pos[index] as Vector3) - centroid)
	if radial.length_squared() < 0.001:
		radial = flat((t_pos[index] as Vector3) - target)
	if radial.length_squared() < 0.001:
		return Vector3.ZERO
	return Vector3(-radial.z, 0.0, radial.x).normalized()


static func nearest(pos: Vector3, points: Array) -> Vector3:
	var best: Vector3 = pos
	var best_d: float = INF
	for p in points:
		var d: float = flat((p as Vector3) - pos).length_squared()
		if d < best_d:
			best_d = d; best = p
	return best


## Position of the nearest LIVE citizen (or `pos` if none live).
static func nearest_alive(pos: Vector3, citizens: Array, alive: Array) -> Vector3:
	var i: int = nearest_alive_index(pos, citizens, alive, INF)
	return citizens[i] if i >= 0 else pos


## Index of the nearest LIVE citizen within `reach` (-1 if none), or the nearest
## live citizen at all when `reach` is INF.
static func nearest_alive_index(pos: Vector3, citizens: Array, alive: Array, reach: float) -> int:
	var best: int = -1
	var best_d: float = reach * reach
	for i in citizens.size():
		if not bool(alive[i]):
			continue
		var d: float = flat((citizens[i] as Vector3) - pos).length_squared()
		if d <= best_d:
			best_d = d; best = i
	return best


## Neighbour positions of titan `i` (all the others). Cheap for ~4 titans.
static func neighbours(t_pos: Array, i: int) -> Array:
	var out: Array = []
	for j in t_pos.size():
		if j != i:
			out.append(t_pos[j])
	return out


## Trajectory samples to step over (at least 2 so a titan can move); a caller
## passes the fallback cap for a too-short trajectory.
static func traj_steps(traj: Array, fallback: int) -> int:
	return traj.size() if traj.size() >= 2 else fallback


## Player position at `step` (far away = no threat for an empty trajectory).
static func player_pos(traj: Array, step: int) -> Vector3:
	if traj.is_empty():
		return Vector3(0.0, 0.0, 1.0e6)
	return vec((traj[clampi(step, 0, traj.size() - 1)] as Dictionary).get("pos", Vector3.ZERO))


## Whether the player is attacking at `step` (gates the kill radius).
static func player_attacking(traj: Array, step: int) -> bool:
	if traj.is_empty():
		return false
	return bool((traj[clampi(step, 0, traj.size() - 1)] as Dictionary).get("attacking", true))


static func vec_list(arr: Array) -> Array:
	var out: Array = []
	for v in arr:
		out.append(vec(v))
	return out


static func flat(v: Vector3) -> Vector3:
	return Vector3(v.x, 0.0, v.z)


## Accept a Vector3 or an [x,y,z] Array (JSON) -> Vector3.
static func vec(v) -> Vector3:
	if v is Vector3:
		return v
	if v is Array and (v as Array).size() >= 3:
		return Vector3(float(v[0]), float(v[1]), float(v[2]))
	return Vector3.ZERO
