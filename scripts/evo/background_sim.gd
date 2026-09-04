extends RefCounted
class_name BackgroundSim
## SEPARATE FIXED-STEP numeric integrator for the action-defense objective (see
## handoff.md "Design"). NOT Godot physics - pure math on arrays, so the whole
## evo module is liftable; deterministic given genes + geometry (no global RNG).
## It replays one scenario window: titans spawn outside a circular wall, steer by
## SteeringPolicy (candidate genes) to a breach gap, cross INSIDE, then reach the
## plaza CITIZENS and EAT them. The PLAYER follows an open-loop threat path; a
## titan lingering in the kill radius while the player attacks is felled (this
## selects for playerAvoid). All plain data in/out; the measurement Dict returns
## citizens_eaten + breach_progress + wall_contact_ratio + titans_killed. Shared
## geometry helpers live in SimGeometry (also used by SimReplay).

# --- TUNING CONSTANTS (no magic numbers below this block) ---
const FIXED_STEP: float = 1.0 / 60.0  ## fixed integration step (s), ~60 Hz
## Hard cap on steps/window (no infinite loop). Sized so a titan just outside the
## ring can breach a gate AND cross the plaza to a citizen in one window (~7s).
const MAX_STEPS: int = 420
## Settled-window early-out: once every live titan has breached, break after this
## many consecutive no-eat steps. Must exceed the plaza-cross time (~110 steps)
## so a genome still progressing toward its first citizen is never cut short.
const STALL_STEPS: int = 180
## Base titan move speed (m/s), FIXED. The aggression gene scales it via
## SteeringPolicy.speed_scale().
const TITAN_SPEED: float = 6.0
## Horizontal reach (m) to eat a citizen (mirrors Titan.EAT_REACH).
const EAT_REACH: float = 3.5
## Gate-gap half-width (m): crossing the ring within this of a gate breaches.
const GATE_HALF_WIDTH: float = 8.0
## Player kill radius (m): a titan inside this while the player attacks is felled.
const PLAYER_KILL_RANGE: float = 3.0
## Default wall radius if a window omits it (the FEAT-003 ring radius).
const DEFAULT_WALL_RADIUS: float = 34.0


## Evaluate ONE window with the candidate genome. `window` (plain Dictionary):
## wall_radius:float, gates:[[x,y,z]..], citizens:[[x,y,z]..], start_titans:
## [{pos:[x,y,z]}..], trajectory:[{pos:[x,y,z],attacking:bool}..]. Returns the
## measurement Dictionary that Fitness.score_window() consumes.
static func evaluate_window(window: Dictionary, genes: PackedFloat32Array) -> Dictionary:
	var start_titans: Array = window.get("start_titans", [])
	var titan_count: int = start_titans.size()
	var result: Dictionary = {
		"titan_count": titan_count,
		"citizens_eaten": 0,
		"breach_progress": 0.0,
		"wall_contact_ratio": 0.0,
		"titans_killed": 0,
	}
	if titan_count == 0:
		return result

	var wall_radius: float = float(window.get("wall_radius", DEFAULT_WALL_RADIUS))
	var gates: Array = SimGeometry.vec_list(window.get("gates", []))
	var citizens: Array = SimGeometry.vec_list(window.get("citizens", []))
	var citizen_alive: Array = []
	var t_pos: Array = []
	var t_inside: Array = []   # has this titan breached the wall?
	var t_dead: Array = []
	var contact_ticks: Array = []
	for _c in citizens:
		citizen_alive.append(true)
	for st in start_titans:
		var sp: Vector3 = SimGeometry.vec(st.get("pos", Vector3.ZERO))
		t_pos.append(sp)
		t_inside.append(SimGeometry.flat(sp).length() <= wall_radius)
		t_dead.append(false)
		contact_ticks.append(0)

	var traj: Array = window.get("trajectory", [])
	var eaten: int = 0
	var killed: int = 0
	var breached_count: int = 0
	var counted_ticks: int = 0
	var speed: float = TITAN_SPEED * SteeringPolicy.speed_scale(genes)
	var steps: int = maxi(2, mini(SimGeometry.traj_steps(traj, MAX_STEPS), MAX_STEPS))
	var contact_r: float = wall_radius + GATE_HALF_WIDTH
	var citizen_n: int = citizens.size()
	var stall: int = 0  # steps since the last eat while fully breached
	for step in steps:
		counted_ticks += 1
		var p_pos: Vector3 = SimGeometry.player_pos(traj, step)
		var attacking: bool = SimGeometry.player_attacking(traj, step)
		var ate_this_step: bool = false

		for i in titan_count:
			if bool(t_dead[i]):
				continue
			var pos: Vector3 = t_pos[i]
			# Measured directions the genes weight (conditions in code). wallAssault
			# drives the breach only while OUTSIDE; citizenSeek only once INSIDE, so
			# a gene never pulls a titan back toward the wall it already breached.
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
			t_pos[i] = next_pos

			var next_r: float = SimGeometry.flat(next_pos).length()
			if not inside and next_r <= wall_radius:  # breached this tick
				t_inside[i] = true; breached_count += 1
			if next_r <= contact_r:  # wall-contact gradient (at/inside the ring)
				contact_ticks[i] = int(contact_ticks[i]) + 1
			var ci: int = SimGeometry.nearest_alive_index(next_pos, citizens, citizen_alive, EAT_REACH)
			if ci >= 0:  # eat the nearest live citizen in reach
				citizen_alive[ci] = false; eaten += 1; ate_this_step = true
			# A titan lingering in the kill radius while the player attacks is
			# felled (this is what selects FOR playerAvoid).
			if attacking and SimGeometry.flat(next_pos - p_pos).length() <= PLAYER_KILL_RANGE:
				t_dead[i] = true; killed += 1

		if eaten >= citizen_n and citizen_n > 0:
			break  # all citizens eaten - the titans won this window
		# Settled-window early-out: the stall counter advances only once every
		# live titan has breached (so a titan still crossing the plaza is never
		# cut short) and resets on every eat.
		if ate_this_step:
			stall = 0
		elif _all_live_inside(t_dead, t_inside):
			stall += 1
		if stall >= STALL_STEPS:
			break

	result["citizens_eaten"] = eaten
	result["titans_killed"] = killed
	result["breach_progress"] = float(breached_count) / float(titan_count)
	var contact_sum: float = 0.0
	for c in contact_ticks:
		contact_sum += float(int(c))
	if counted_ticks > 0:
		result["wall_contact_ratio"] = contact_sum / float(counted_ticks * titan_count)
	return result


## True when every still-alive titan has breached the ring (settled early-out).
static func _all_live_inside(t_dead: Array, t_inside: Array) -> bool:
	for i in t_dead.size():
		if not bool(t_dead[i]) and not bool(t_inside[i]):
			return false
	return true
