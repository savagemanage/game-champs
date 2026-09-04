extends CharacterBody3D
## The titan (FEAT-004): an INFILTRATOR that assaults the Wall-Maria ring, breaches
## a gate gap, then hunts and EATS the plaza citizens. NavigationAgent3D pathing +
## hybrid gene steering on top (3.1): nav guarantees the path, genes only re-weight
## direction (no genome = pure nav). The nav TARGET is now the wall/breach then a
## citizen (NOT the player); selection lives in the pure TitanObjective helper.
## The titan owns a FIXED HP pool. receive_hit(base_damage, is_nape) turns the
## slash base damage into HP loss with a PER-PART multiplier - the nape is a WEAK
## POINT (big crit), the body a fraction, so it survives several body hits but a
## clean nape crit can fell it. die() emits titan_killed once. NO round-scaling.

signal titan_killed

# --- TUNING CONSTANTS. INVARIANT: every value FIXED, NEVER round-scaled (spec 3). ---
const MOVE_SPEED: float = 6.0  ## ground move speed (m/s)
const TURN_SPEED: float = 3.0  ## turn-to-face rate (rad/s)
const ARRIVAL_DISTANCE: float = 2.5  ## nav "arrived" distance (m)
const STAGGER_DURATION: float = 0.9  ## freeze after a sub-lethal slash (s)
const FOOTSTEP_INTERVAL: float = 0.55  ## seconds between footstep sfx

# HP + part damage (base rides ~[0..2]): clean BODY hit ~2.0*22=44 HP (~3 to fell);
# clean NAPE crit ~2.0*90=180 one-shots (weak point, ~4x body). All round-fixed.
const TITAN_MAX_HP: float = 100.0
const BODY_DAMAGE_MULT: float = 22.0
const NAPE_DAMAGE_MULT: float = 90.0
const WALL_RADIUS: float = 34.0  ## wall ring radius; inside it = breached
## Gate-gap positions (the two omitted wall segments at +Z / -Z) to breach toward.
const GATE_POSITIONS: Array = [Vector3(0.0, 0.0, 34.0), Vector3(0.0, 0.0, -34.0)]
const EAT_REACH: float = 3.5  ## horizontal reach (m) to eat a citizen
const EAT_COOLDOWN: float = 1.2  ## chew cadence (s) between eats

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# --- Node references (names MUST match Titan.tscn) ---
@onready var _nav_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _nape: Node3D = $Nape

var _player: Node3D = null
var _dead: bool = false
var _stagger_timer: float = 0.0
var _footstep_timer: float = 0.0
var _aggroed: bool = false  # one-shot aggro cue guard
var _hp: float = TITAN_MAX_HP  # fixed pool; chipped by receive_hit
var _last_applied: float = 0.0  # HP removed by the most recent hit (HUD readout)
var _state: int = TitanObjective.STATE_APPROACH_WALL  # approach -> seek -> eat
var _eat_timer: float = 0.0  # chew cadence between eats
# Scene-side CitizenManager (plain-data hooks: get_citizen_positions/eat_nearest).
# Injected by GameManager; titan.gd reads it, scripts/evo never does.
var _citizen_manager: Node = null
# Injected evolved genome (spec 3). Empty = pure nav (gen-1); the 6 weights
# parameterise SteeringPolicy on top of the guaranteed nav path.
var _genes: PackedFloat32Array = PackedFloat32Array()
var _preferred_entry_dir: Vector3 = Vector3.ZERO  # measured; flankBias uses opposite
var _neighbours: Array = []  # sibling titans for separation / encircle terms
var _safe_velocity: Vector3 = Vector3.ZERO  # avoidance-safe horizontal velocity


func _ready() -> void:
	if _nav_agent != null and _nav_agent.avoidance_enabled:
		_nav_agent.velocity_computed.connect(_on_safe_velocity)  # avoidance safe velocity
	if Telemetry != null:
		Telemetry.register_titan(self)


func _exit_tree() -> void:
	if Telemetry != null:
		Telemetry.unregister_titan(self)

func _on_safe_velocity(safe: Vector3) -> void: _safe_velocity = safe
# Player is NOT the nav target now (wall then citizen); kept for steering/nape-yaw.
func set_target(player: Node3D) -> void: _player = player
# CitizenManager injected by GameManager: plain-data reads + eat_nearest() only.
func set_citizen_manager(manager: Node) -> void: _citizen_manager = manager
func set_neighbours(neighbours: Array) -> void: _neighbours = neighbours  # sep/encircle

## Inject the FIXED evolved weights for THIS round (spec-3 3.8). Empty = pure nav.
func set_genes(genes: PackedFloat32Array, preferred_entry_dir: Vector3) -> void:
	_genes = genes
	_preferred_entry_dir = preferred_entry_dir

func _physics_process(delta: float) -> void:
	if _dead:
		_apply_gravity(delta)
		move_and_slide()
		return

	if _eat_timer > 0.0:
		_eat_timer -= delta

	if _stagger_timer > 0.0:
		_stagger_timer -= delta  # frozen horizontally; gravity still settles it
		velocity.x = move_toward(velocity.x, 0.0, MOVE_SPEED)
		velocity.z = move_toward(velocity.z, 0.0, MOVE_SPEED)
		_apply_gravity(delta)
		move_and_slide()
		return

	if _player == null:
		_player = _find_player()
	if not _aggroed:  # aggro cue the first time this titan starts its assault
		_aggroed = true
		TitanSfx.aggro(global_position)

	_advance(delta)
	_apply_gravity(delta)
	move_and_slide()

# --- OBJECTIVE (assault wall -> breach -> seek citizen -> eat) via nav + steer ---
## Resolve this tick's objective (wall/breach then a citizen), drive the nav
## agent toward it, and consume the nearest citizen when in reach.
func _advance(delta: float) -> void:
	if _nav_agent == null:
		return
	var citizens: Array = _live_citizen_positions()
	var plan: Dictionary = TitanObjective.resolve(
		_state, global_position, GATE_POSITIONS, citizens, WALL_RADIUS, EAT_REACH)
	_state = int(plan["state"])
	if bool(plan["eat"]) and _eat_timer <= 0.0 and _try_eat():
		_eat_timer = EAT_COOLDOWN
	_nav_agent.target_position = plan["target"]
	var to_next: Vector3 = _nav_agent.get_next_path_position() - global_position
	to_next.y = 0.0
	if to_next.length() > ARRIVAL_DISTANCE:
		var move_dir: Vector3 = _steer(to_next.normalized())  # nav path + gene re-weight
		_drive_horizontal(move_dir * MOVE_SPEED)
		_face_direction(move_dir, delta)
		_footstep_timer -= delta
		if _footstep_timer <= 0.0:
			_footstep_timer = FOOTSTEP_INTERVAL
			TitanSfx.footstep(global_position)
	else:
		_drive_horizontal(Vector3.ZERO)
		var t: Vector3 = plan["target"]  # idle-face the current target (citizen / gate)
		var facing := Vector3(t.x - global_position.x, 0.0, t.z - global_position.z)
		if facing.length() > 0.001:
			_face_direction(facing.normalized(), delta)


# Live citizen world positions from the injected manager (plain Vector3 array).
func _live_citizen_positions() -> Array:
	if _citizen_manager != null and is_instance_valid(_citizen_manager) \
			and _citizen_manager.has_method("get_citizen_positions"):
		return _citizen_manager.call("get_citizen_positions")
	return []

# Consume the nearest live citizen within EAT_REACH via the manager hook.
func _try_eat() -> bool:
	if _citizen_manager == null or not is_instance_valid(_citizen_manager) \
			or not _citizen_manager.has_method("eat_nearest"):
		return false
	return bool(_citizen_manager.call("eat_nearest", global_position, EAT_REACH))


## Hybrid steering direction; falls back to raw nav dir when no genome injected.
func _steer(nav_dir: Vector3) -> Vector3:
	if _genes.size() < Genome.GENE_COUNT or _player == null:
		return nav_dir
	var p_pos: Vector3 = _player.global_position
	var p_vel: Vector3 = (_player as CharacterBody3D).velocity if _player is CharacterBody3D else Vector3.ZERO
	return SteeringPolicy.compute_move_dir(
		_genes, global_position, nav_dir, p_pos, p_vel,
		_preferred_entry_dir, _neighbour_positions(), p_pos)


func _neighbour_positions() -> Array:
	var out: Array = []
	for n in _neighbours:
		if n != null and is_instance_valid(n) and n != self:
			out.append((n as Node3D).global_position)
	return out

# Desired horizontal velocity via avoidance, or directly when it is off.
func _drive_horizontal(desired: Vector3) -> void:
	if _nav_agent != null and _nav_agent.avoidance_enabled:
		_nav_agent.set_velocity(desired)
		velocity.x = _safe_velocity.x
		velocity.z = _safe_velocity.z
	else:
		velocity.x = desired.x
		velocity.z = desired.z

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _gravity * delta
	elif velocity.y < 0.0:
		velocity.y = 0.0

func _face_direction(dir: Vector3, delta: float) -> void:
	if dir.length() < 0.001:
		return
	rotation.y = rotate_toward(rotation.y, atan2(dir.x, dir.z), TURN_SPEED * delta)


# --- NAPE / DAMAGE (continuous, HP + per-part multiplier) ---

## World-space outward nape normal (back of neck = local -Z) with the evolved
## napeYaw upper-body turn-away applied (spec-3 3.2).
func get_nape_normal() -> Vector3:
	var base: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, -1.0)).normalized()
	if _genes.size() < Genome.GENE_COUNT or _player == null:
		return base
	var forward: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, 1.0)).normalized()
	var approach: Vector3 = _player.global_position - global_position
	approach.y = 0.0
	var yaw: float = SteeringPolicy.nape_yaw_amount(_genes, forward, approach)
	return base.rotated(Vector3.UP, yaw).normalized()


# Nape world position (for the indicator to screen-project) + read-only HP
# accessors for the HUD (presentation only). is_alive() gates dead titans out.
func get_nape_world_position() -> Vector3:
	return _nape.global_position if _nape != null else global_position + Vector3.UP * 10.0
func is_alive() -> bool: return not _dead
func hp_ratio() -> float: return clampf(_hp / TITAN_MAX_HP, 0.0, 1.0)
func remaining_hp() -> float: return maxf(_hp, 0.0)
func last_applied_damage() -> float: return _last_applied
# HP a base_damage swing WOULD remove for a nape vs body hit (indicator preview).
func part_damage(base_damage: float, is_nape: bool) -> float:
	return base_damage * (NAPE_DAMAGE_MULT if is_nape else BODY_DAMAGE_MULT)

## Player slash hook: base_damage * the struck part's weight (nape crit / body
## fraction) is subtracted from HP. True if it felled the titan; else stagger.
func receive_hit(base_damage: float, is_nape: bool) -> bool:
	if _dead:
		return true
	_last_applied = part_damage(base_damage, is_nape)
	_hp -= _last_applied
	if _hp <= 0.0:
		_hp = 0.0
		die()
		return true
	_stagger_timer = STAGGER_DURATION
	return false

## Kill the titan. Idempotent so a double-hit in one frame is harmless.
func die() -> void:
	if _dead:
		return
	_dead = true
	TitanSfx.death(global_position)
	titan_killed.emit()

func _find_player() -> Node3D:
	var group_players := get_tree().get_nodes_in_group("player")
	if group_players.size() > 0:
		return group_players[0] as Node3D
	var root := get_tree().current_scene
	if root != null and root.has_node("Player"):
		return root.get_node("Player") as Node3D
	return null
