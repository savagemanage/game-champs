extends RefCounted
class_name SimReplay
## PURE render-facing tracer for the evolution screen (spec 4). It replays one
## telemetry engagement window with a candidate genome and returns the per-step
## POSITIONS (titan dots, player dot, per-titan nape direction) so the UI can
## draw 2D top-down dots. It is the same fixed-step open-loop integration
## BackgroundSim uses for scoring (steering 3.5), but it outputs a trace for
## drawing instead of a fitness measurement.
##
## It lives in scripts/evo/ (not ui/) so all simulation stays in the pure evo
## module and the UI only draws the returned plain arrays. No scene / node /
## physics: pure math on arrays, single-thread safe (steering section 2).
##
## Trace shape (all plain data, XZ world coords):
##   {
##     "titan_count": int,
##     "bounds_min": Vector2, "bounds_max": Vector2,   # XZ extent for scaling
##     "frames": [
##       { "player": Vector2,
##         "titans": [Vector2, ...],
##         "napes": [Vector2, ...] }   # unit nape direction per titan (XZ)
##     ]
##   }

# =====================================================================
# TUNING CONSTANTS (mirror BackgroundSim so the trace matches the score)
# =====================================================================

const FIXED_STEP: float = 1.0 / 60.0
const MAX_STEPS: int = 150
const TITAN_SPEED: float = 6.0
## Sample every Nth integration step into the trace so a ~2.5s window is a cheap
## handful of frames to draw on single-thread web export (not 150 draws).
const FRAME_STRIDE: int = 3
## Minimum world half-extent (m) so a tiny window still maps to a sane view box.
const MIN_HALF_EXTENT: float = 6.0


## Replay `window` with `genes` and return a drawable trace (see header). The
## `preferred_entry_dir` is the measured player-preferred approach (flankBias
## scales its opposite), same as BackgroundSim.evaluate_window().
static func trace_window(window: Dictionary, genes: PackedFloat32Array, preferred_entry_dir: Vector3) -> Dictionary:
	var traj: Array = window.get("trajectory", [])
	var start_titans: Array = window.get("start_titans", [])
	var titan_count: int = start_titans.size()

	var trace: Dictionary = {
		"titan_count": titan_count,
		"bounds_min": Vector2.ZERO,
		"bounds_max": Vector2.ZERO,
		"frames": [],
	}
	if titan_count == 0 or traj.size() < 2:
		return trace

	var t_pos: Array = []
	var t_fwd: Array = []
	for st in start_titans:
		t_pos.append(_vec(st.get("pos", Vector3.ZERO)))
		var nrm: Vector3 = _vec(st.get("nape_normal", Vector3.FORWARD))
		t_fwd.append((_flat(-nrm)).normalized() if _flat(nrm).length() > 0.001 else Vector3.FORWARD)

	var steps: int = mini(traj.size(), MAX_STEPS)
	var frames: Array = []
	var lo: Vector2 = Vector2(INF, INF)
	var hi: Vector2 = Vector2(-INF, -INF)

	for step in steps:
		var sample: Dictionary = traj[step]
		var p_pos: Vector3 = _vec(sample.get("pos", Vector3.ZERO))
		var p_vel: Vector3 = _vec(sample.get("vel", Vector3.ZERO))

		var neighbours: Array = _neighbour_lists(t_pos)
		for i in titan_count:
			var nav_dir: Vector3 = _flat(p_pos - t_pos[i])
			var move_dir: Vector3 = SteeringPolicy.compute_move_dir(
				genes, t_pos[i], nav_dir, p_pos, p_vel,
				preferred_entry_dir, neighbours[i], p_pos)
			t_pos[i] = t_pos[i] + move_dir * TITAN_SPEED * FIXED_STEP
			var face: Vector3 = _flat(p_pos - t_pos[i])
			if face.length() > 0.001:
				t_fwd[i] = face.normalized()
			var approach: Vector3 = _flat(p_pos - t_pos[i])
			var yaw: float = SteeringPolicy.nape_yaw_amount(genes, t_fwd[i], approach)
			t_fwd[i] = _rotate_y(t_fwd[i], yaw)

		if step % FRAME_STRIDE == 0 or step == steps - 1:
			var titan_pts: Array = []
			var nape_pts: Array = []
			for i in titan_count:
				var tp: Vector2 = _xz(t_pos[i])
				titan_pts.append(tp)
				# Nape points opposite the titan's forward (the vulnerable back).
				nape_pts.append(_xz(-_flat(t_fwd[i]).normalized()))
				lo = _min2(lo, tp)
				hi = _max2(hi, tp)
			var pp: Vector2 = _xz(p_pos)
			lo = _min2(lo, pp)
			hi = _max2(hi, pp)
			frames.append({"player": pp, "titans": titan_pts, "napes": nape_pts})

	var bounds: Array = _pad_bounds(lo, hi)
	trace["bounds_min"] = bounds[0]
	trace["bounds_max"] = bounds[1]
	trace["frames"] = frames
	return trace


# =====================================================================
# HELPERS (pure math)
# =====================================================================

static func _pad_bounds(lo: Vector2, hi: Vector2) -> Array:
	if lo.x == INF:
		return [Vector2(-MIN_HALF_EXTENT, -MIN_HALF_EXTENT), Vector2(MIN_HALF_EXTENT, MIN_HALF_EXTENT)]
	var center: Vector2 = (lo + hi) * 0.5
	var half: Vector2 = (hi - lo) * 0.5
	var h: float = maxf(maxf(half.x, half.y), MIN_HALF_EXTENT)
	return [center - Vector2(h, h), center + Vector2(h, h)]


static func _neighbour_lists(t_pos: Array) -> Array:
	var out: Array = []
	for i in t_pos.size():
		var others: Array = []
		for j in t_pos.size():
			if j != i:
				others.append(t_pos[j])
		out.append(others)
	return out


static func _rotate_y(v: Vector3, angle: float) -> Vector3:
	var c: float = cos(angle)
	var s: float = sin(angle)
	return Vector3(v.x * c + v.z * s, 0.0, -v.x * s + v.z * c)


static func _xz(v: Vector3) -> Vector2:
	return Vector2(v.x, v.z)


static func _flat(v: Vector3) -> Vector3:
	return Vector3(v.x, 0.0, v.z)


static func _min2(a: Vector2, b: Vector2) -> Vector2:
	return Vector2(minf(a.x, b.x), minf(a.y, b.y))


static func _max2(a: Vector2, b: Vector2) -> Vector2:
	return Vector2(maxf(a.x, b.x), maxf(a.y, b.y))


static func _vec(v) -> Vector3:
	if v is Vector3:
		return v
	if v is Array and (v as Array).size() >= 3:
		return Vector3(float(v[0]), float(v[1]), float(v[2]))
	return Vector3.ZERO
