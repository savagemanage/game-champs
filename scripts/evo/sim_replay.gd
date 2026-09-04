extends RefCounted
class_name SimReplay
## PURE render-facing tracer for the evolution screen (see handoff.md "Design").
## It replays one scenario window with a candidate genome and returns the
## per-step POSITIONS (titan dots, player dot, per-titan heading) so the UI can
## draw 2D top-down dots. Same fixed-step integration BackgroundSim scores with
## (shared helpers in SimGeometry), but it outputs a trace instead of a score.
##
## Lives in scripts/evo/ (not ui/) so all simulation stays in the pure evo
## module and the UI only draws the returned plain arrays. No scene / node /
## physics: pure math on arrays, single-thread safe.
##
## Trace shape (all plain data, XZ world coords):
##   { "titan_count": int, "bounds_min": Vector2, "bounds_max": Vector2,
##     "citizens": [Vector2, ...],                     # static citizen dots
##     "frames": [ { "player": Vector2, "titans": [Vector2, ...],
##                   "napes": [Vector2, ...] } ] }      # napes = titan HEADING

# --- TUNING CONSTANTS (mirror BackgroundSim so the trace matches the score) ---
const FIXED_STEP: float = 1.0 / 60.0
const MAX_STEPS: int = 420
const TITAN_SPEED: float = 6.0
const EAT_REACH: float = 3.5
const GATE_HALF_WIDTH: float = 8.0
const DEFAULT_WALL_RADIUS: float = 34.0
## Sample every Nth integration step into the trace so a long window is a cheap
## handful of frames to draw on single-thread web export (not 420 draws).
const FRAME_STRIDE: int = 5
## Minimum world half-extent (m) so a tiny window still maps to a sane view box.
const MIN_HALF_EXTENT: float = 6.0


## Replay `window` with `genes` and return a drawable trace (see header).
static func trace_window(window: Dictionary, genes: PackedFloat32Array) -> Dictionary:
	var start_titans: Array = window.get("start_titans", [])
	var titan_count: int = start_titans.size()
	var trace: Dictionary = {
		"titan_count": titan_count,
		"bounds_min": Vector2.ZERO,
		"bounds_max": Vector2.ZERO,
		"citizens": [],
		"frames": [],
	}
	if titan_count == 0:
		return trace

	var wall_radius: float = float(window.get("wall_radius", DEFAULT_WALL_RADIUS))
	var gates: Array = SimGeometry.vec_list(window.get("gates", []))
	var citizens: Array = SimGeometry.vec_list(window.get("citizens", []))
	var citizen_alive: Array = []
	var t_pos: Array = []
	var t_inside: Array = []
	var t_head: Array = []
	for _c in citizens:
		citizen_alive.append(true)
	for st in start_titans:
		var p: Vector3 = SimGeometry.vec(st.get("pos", Vector3.ZERO))
		t_pos.append(p)
		t_inside.append(SimGeometry.flat(p).length() <= wall_radius)
		t_head.append(Vector3.FORWARD)

	var traj: Array = window.get("trajectory", [])
	var speed: float = TITAN_SPEED * SteeringPolicy.speed_scale(genes)
	var steps: int = maxi(2, mini(SimGeometry.traj_steps(traj, MAX_STEPS), MAX_STEPS))
	var frames: Array = []
	var lo: Vector2 = Vector2(INF, INF)
	var hi: Vector2 = Vector2(-INF, -INF)
	for c in citizens:
		var cv: Vector2 = _xz(c)
		trace["citizens"].append(cv)
		lo = _min2(lo, cv); hi = _max2(hi, cv)

	for step in steps:
		var p_pos: Vector3 = SimGeometry.player_pos(traj, step)
		for i in titan_count:
			var pos: Vector3 = t_pos[i]
			var gate: Vector3 = SimGeometry.nearest(pos, gates)
			var citizen: Vector3 = SimGeometry.nearest_alive(pos, citizens, citizen_alive)
			var inside: bool = bool(t_inside[i])
			var target: Vector3 = citizen if inside else gate
			var breach_dir: Vector3 = SimGeometry.flat(gate - pos) if not inside else Vector3.ZERO
			var citizen_dir: Vector3 = SimGeometry.flat(citizen - pos) if inside else Vector3.ZERO
			var move: Vector3 = SteeringPolicy.compute_move_dir(
				genes, pos, SimGeometry.flat(target - pos), breach_dir, citizen_dir, p_pos,
				SimGeometry.spread_dir(i, t_pos, target), SimGeometry.neighbours(t_pos, i))
			var next_pos: Vector3 = SimGeometry.apply_wall(
				pos, pos + move * speed * FIXED_STEP, inside, wall_radius, gates, GATE_HALF_WIDTH)
			if move.length() > 0.001:
				t_head[i] = SimGeometry.flat(move).normalized()
			t_pos[i] = next_pos
			if not inside and SimGeometry.flat(next_pos).length() <= wall_radius:
				t_inside[i] = true
			var ci: int = SimGeometry.nearest_alive_index(next_pos, citizens, citizen_alive, EAT_REACH)
			if ci >= 0:
				citizen_alive[ci] = false

		if step % FRAME_STRIDE == 0 or step == steps - 1:
			var titan_pts: Array = []
			var head_pts: Array = []
			for i in titan_count:
				var tp: Vector2 = _xz(t_pos[i])
				titan_pts.append(tp)
				head_pts.append(_xz(SimGeometry.flat(t_head[i]).normalized()))
				lo = _min2(lo, tp); hi = _max2(hi, tp)
			var pp: Vector2 = _xz(p_pos)
			lo = _min2(lo, pp); hi = _max2(hi, pp)
			frames.append({"player": pp, "titans": titan_pts, "napes": head_pts})

	var bounds: Array = _pad_bounds(lo, hi)
	trace["bounds_min"] = bounds[0]
	trace["bounds_max"] = bounds[1]
	trace["frames"] = frames
	return trace


# --- Draw-space helpers (Vector2 view mapping; the sim maths is in SimGeometry) ---

static func _pad_bounds(lo: Vector2, hi: Vector2) -> Array:
	if lo.x == INF:
		return [Vector2(-MIN_HALF_EXTENT, -MIN_HALF_EXTENT), Vector2(MIN_HALF_EXTENT, MIN_HALF_EXTENT)]
	var center: Vector2 = (lo + hi) * 0.5
	var half: Vector2 = (hi - lo) * 0.5
	var h: float = maxf(maxf(half.x, half.y), MIN_HALF_EXTENT)
	return [center - Vector2(h, h), center + Vector2(h, h)]


static func _xz(v) -> Vector2:
	var vv: Vector3 = SimGeometry.vec(v) if not (v is Vector2) else Vector3((v as Vector2).x, 0.0, (v as Vector2).y)
	return Vector2(vv.x, vv.z)


static func _min2(a: Vector2, b: Vector2) -> Vector2:
	return Vector2(minf(a.x, b.x), minf(a.y, b.y))


static func _max2(a: Vector2, b: Vector2) -> Vector2:
	return Vector2(maxf(a.x, b.x), maxf(a.y, b.y))
