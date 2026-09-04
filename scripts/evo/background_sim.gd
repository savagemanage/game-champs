extends RefCounted
class_name BackgroundSim
## SEPARATE FIXED-STEP numeric integrator (steering 3.5 / spec-3 seed). This is
## NOT Godot physics: there is no _physics_process, no PhysicsServer, no
## CharacterBody3D, no scene tree. It is pure math on arrays so the whole evo
## module can be lifted into another project.
##
## It replays one telemetry engagement window (~2s): the PLAYER follows the
## recorded trajectory OPEN-LOOP (drift bounded over ~2s, 3.5) while the TITANS
## move by SteeringPolicy each fixed step. Every tick it measures each titan's
## nape NON-exposure and accumulates aborted slashes + damage; Fitness scores it.
##
## PLAYER DEATH (3.6 KILL_BONUS): the player dies the first tick a nape-hidden
## titan closes to KILL_RANGE; remaining_time_ratio then rewards a FASTER kill -
## gated on death, a later kill earns LESS, so it is never a survival-time term.
##
## OVERFIT CEILING (steering 3.10): when a titan hid its nape but guessed the
## approach side wrong (player hits the exposed side) the slash lands, deals
## damage AND briefly rigidifies the titan, so a perfect always-counter is not
## learnable; a correct guard instead forces an aborted slash. Mirrors spec-1's
## sub-threshold stagger/bounce. Windows are plain Dicts, keeping the sim
## scene-free (EngagementWindow.to_dict() shape or the harness's synthetic one).

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Fixed integration step (s). ~60 Hz (not Godot physics); a ~2s window ~= 120 steps.
const FIXED_STEP: float = 1.0 / 60.0
## Hard cap on steps per window so a malformed window can never loop forever.
const MAX_STEPS: int = 150
## Titan move speed (m/s). FIXED - mirrors the game titan, never scales (sec 1).
const TITAN_SPEED: float = 6.0
## Slash range (m): the nape must be within this of the player for a slash.
## SYNC: must equal RoundRecorder.RANGE_THRESHOLD; duplicated not shared because
## scripts/evo/ stays pure and can't import telemetry (steering: evo is liftable).
const SLASH_RANGE: float = 8.0
## View half-angle (rad) within which the nape counts as EXPOSED to the player.
## SYNC: must equal RoundRecorder.VIEW_ANGLE_THRESHOLD_DEG (40°). Same reason.
const VIEW_HALF_ANGLE: float = deg_to_rad(40.0)
## Unit of damage a well-guarded titan reflects onto the player (magnitude is
## out of the sim's scope, so a fixed unit).
const HIT_DAMAGE: float = 1.0
## Fraction of the window's remaining steps a titan is "rigid" after being
## wrong-footed (overfit ceiling, steering 3.10). Prevents a perfect counter.
const WRONG_FOOT_RIGID_FRAC: float = 0.15
## Slash result code for a lethal slash (mirrors EngagementWindow.RESULT_KILL).
## Duplicated locally so the pure evo module stays self-contained / liftable.
const SLASH_RESULT_KILL: int = 3
## Close-in range (m) at which a titan whose OWN nape is hidden reaches the
## player and kills them (steering 3.6 KILL_BONUS). Tighter than SLASH_RANGE.
## NOT a survival-time term: gated on the player DYING, rewards a FASTER kill.
const KILL_RANGE: float = 3.0


## Evaluate ONE window with the candidate genome. `window` is a plain Dictionary
## (EngagementWindow.to_dict() layout). `preferred_entry_dir` is the measured
## player-preferred approach (from the telemetry player model) as [x,y,z] or a
## Vector3; flankBias uses its opposite. Returns the measurement Dictionary that
## Fitness.score_window() consumes.
static func evaluate_window(window: Dictionary, genes: PackedFloat32Array, preferred_entry_dir: Vector3) -> Dictionary:
	var traj: Array = window.get("trajectory", [])
	var start_titans: Array = window.get("start_titans", [])
	var titan_count: int = start_titans.size()

	var result: Dictionary = {
		"titan_count": titan_count,
		"nape_non_exposure_sum": 0.0,
		"aborted_slashes": 0,
		"damage_to_player": 0.0,
		"player_died": false,
		"remaining_time_ratio": 0.0,
	}
	if titan_count == 0 or traj.size() < 2:
		return result

	# Mutable titan state (positions/forward), integrated each step.
	var t_pos: Array = []
	var t_fwd: Array = []
	var t_rigid: Array = []
	for st in start_titans:
		t_pos.append(_vec(st.get("pos", Vector3.ZERO)))
		var nrm: Vector3 = _vec(st.get("nape_normal", Vector3.FORWARD))
		# Titan forward = opposite of nape normal (nape faces backward).
		t_fwd.append(_flat(-nrm).normalized() if _flat(nrm).length() > 0.001 else Vector3.FORWARD)
		t_rigid.append(0)

	var exposure_ticks: Array = []
	var counted_ticks: Array = []
	for i in titan_count:
		exposure_ticks.append(0)
		counted_ticks.append(0)

	var slashed: bool = bool(window.get("slashed", false))
	var slash_result: int = int(window.get("slash_result", 0))
	var steps: int = mini(traj.size(), MAX_STEPS)

	# Player-death bookkeeping (steering 3.6 KILL_BONUS): record the first tick a
	# titan closes to KILL_RANGE with its nape hidden. Earlier step -> larger
	# remaining-time ratio (faster kill = bigger bonus), never rewards survival.
	var player_died: bool = false
	var death_step: int = -1

	for step in steps:
		var sample: Dictionary = traj[step]
		var p_pos: Vector3 = _vec(sample.get("pos", Vector3.ZERO))
		var p_vel: Vector3 = _vec(sample.get("vel", Vector3.ZERO))
		var p_look: Vector3 = _flat(_vec(sample.get("look", Vector3.FORWARD)))

		var neighbours_by_titan: Array = _neighbour_lists(t_pos)

		for i in titan_count:
			# --- integrate titan i ---
			if int(t_rigid[i]) > 0:
				t_rigid[i] = int(t_rigid[i]) - 1
			else:
				var nav_dir: Vector3 = _flat(p_pos - t_pos[i])
				var move_dir: Vector3 = SteeringPolicy.compute_move_dir(
					genes, t_pos[i], nav_dir, p_pos, p_vel,
					preferred_entry_dir, neighbours_by_titan[i], p_pos)
				t_pos[i] = t_pos[i] + move_dir * TITAN_SPEED * FIXED_STEP
				# Turn the titan's body, then apply napeYaw turn-away.
				var face: Vector3 = _flat(p_pos - t_pos[i])
				if face.length() > 0.001:
					t_fwd[i] = face.normalized()
				var approach: Vector3 = _flat(p_pos - t_pos[i])
				var yaw: float = SteeringPolicy.nape_yaw_amount(genes, t_fwd[i], approach)
				t_fwd[i] = _rotate_y(t_fwd[i], yaw)

			# --- measure nape exposure this tick ---
			var exposed: bool = _nape_exposed(t_pos[i], t_fwd[i], p_pos, p_look)
			counted_ticks[i] = int(counted_ticks[i]) + 1
			if exposed:
				exposure_ticks[i] = int(exposure_ticks[i]) + 1

			# player-death check (KILL_BONUS 3.6): a nape-hidden titan that closes
			# to KILL_RANGE kills the player; record the FIRST such tick.
			if not player_died and not exposed \
					and _flat(t_pos[i] - p_pos).length() <= KILL_RANGE:
				player_died = true
				death_step = step

		# --- slash resolution at the recorded slash tick (last tick) ---
		if slashed and step == steps - 1:
			_resolve_slash(result, t_pos, t_fwd, t_rigid, p_pos, p_look, slash_result, steps - step)

	# Accumulate per-titan NON-exposure ratio (1 - exposed/counted).
	var non_exposure_sum: float = 0.0
	for i in titan_count:
		var c: int = int(counted_ticks[i])
		var exposed_ratio: float = (float(exposure_ticks[i]) / float(c)) if c > 0 else 0.0
		non_exposure_sum += (1.0 - exposed_ratio)
	result["nape_non_exposure_sum"] = non_exposure_sum

	# Fast-kill bonus (3.6): remaining-time ratio = fraction of the window left at
	# the kill (earlier death_step -> bigger bonus); 0 if the player never died.
	result["player_died"] = player_died
	if player_died and steps > 0:
		result["remaining_time_ratio"] = float(steps - death_step) / float(steps)
	return result


# =====================================================================
# SLASH / OVERFIT-CEILING RESOLUTION
# =====================================================================

## Resolve the player's slash against the nearest titan: an exposed+in-range nape
## makes the slash LAND (wrong-footed titan goes rigid - overfit ceiling); a
## guarded nape ABORTS it (reward via MISS_W). A wrong prediction thus has a cost
## so a perfect counter is not learnable (steering 3.10).
static func _resolve_slash(result: Dictionary, t_pos: Array, t_fwd: Array, t_rigid: Array,
		p_pos: Vector3, p_look: Vector3, slash_result: int, remaining_steps: int) -> void:
	var nearest: int = _nearest_titan(t_pos, p_pos)
	if nearest < 0:
		return
	var in_range: bool = _flat(t_pos[nearest] - p_pos).length() <= SLASH_RANGE
	if in_range and _nape_exposed(t_pos[nearest], t_fwd[nearest], p_pos, p_look):
		# Nape exposed -> the recorded slash lands; the titans did badly. Model
		# the wrong-footed cost as rigidity, and do NOT count an aborted slash.
		t_rigid[nearest] = int(round(float(remaining_steps) * WRONG_FOOT_RIGID_FRAC))
	else:
		# Nape hidden / out of range -> slash aborted (titans win). Reward it; a
		# reflected sub/whiff also deals a unit of damage to the player.
		result["aborted_slashes"] = int(result.get("aborted_slashes", 0)) + 1
		if slash_result != SLASH_RESULT_KILL:
			result["damage_to_player"] = float(result.get("damage_to_player", 0.0)) + HIT_DAMAGE

# =====================================================================
# GEOMETRY HELPERS (pure math)
# =====================================================================

static func _nape_exposed(titan_pos: Vector3, titan_fwd: Vector3, player_pos: Vector3, player_look: Vector3) -> bool:
	# Nape sits behind the titan (opposite forward). It is exposed when the
	# player is looking roughly along the nape's outward normal AND behind it.
	var nape_normal: Vector3 = -_flat(titan_fwd).normalized()
	var to_player: Vector3 = _flat(player_pos - titan_pos)
	if to_player.length() < 0.001:
		return false
	to_player = to_player.normalized()
	# Player must be on the nape side (dot > 0) and looking toward the nape.
	if nape_normal.dot(to_player) <= 0.0:
		return false
	var look: Vector3 = _flat(player_look)
	if look.length() < 0.001:
		return true
	look = look.normalized()
	# Player look vs direction from player to titan.
	var to_titan: Vector3 = -to_player
	return look.dot(to_titan) >= cos(VIEW_HALF_ANGLE)


static func _nearest_titan(t_pos: Array, p_pos: Vector3) -> int:
	var best: int = -1
	var best_d: float = INF
	for i in t_pos.size():
		var d: float = _flat((t_pos[i] as Vector3) - p_pos).length_squared()
		if d < best_d:
			best_d = d
			best = i
	return best


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


static func _flat(v: Vector3) -> Vector3:
	return Vector3(v.x, 0.0, v.z)


## Accept either a Vector3 or an [x,y,z] Array (JSON) and return a Vector3.
static func _vec(v) -> Vector3:
	if v is Vector3:
		return v
	if v is Array and (v as Array).size() >= 3:
		return Vector3(float(v[0]), float(v[1]), float(v[2]))
	return Vector3.ZERO
