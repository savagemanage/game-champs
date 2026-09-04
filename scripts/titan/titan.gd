extends CharacterBody3D
## The titan: a large enemy that chases the player and exposes a nape kill-zone.
##
## Movement is NavigationAgent3D pathfinding with hybrid gene steering layered on
## top (steering 3.1): the nav agent guarantees the path, the injected genome
## (spec 3) only re-weights direction terms. With no genome it is pure navigation
## (gen-1 baseline). Navmesh is baked at RUNTIME behind the loading screen.
##
## Damage is CONTINUOUS: receive_slash(damage, threshold) kills at/above the
## threshold (emits titan_killed), else staggers the titan + bounces the player.

signal titan_killed

# =====================================================================
# TUNING CONSTANTS. INVARIANT: every value is FIXED and NEVER scales with the
# round number - difficulty rises only via evolved genes (spec 3).
# =====================================================================

## Ground move speed (m/s). Fixed for all rounds.
const MOVE_SPEED: float = 6.0
## How quickly the titan turns to face its travel direction (rad/s).
const TURN_SPEED: float = 3.0
## Distance (m) at which the nav agent considers itself "arrived".
const ARRIVAL_DISTANCE: float = 2.5
## Duration (seconds) the titan is frozen after a sub-threshold slash.
const STAGGER_DURATION: float = 0.9

# Project default gravity so the titan stays glued to the ground / falls.
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# --- Node references (names MUST match Titan.tscn) ---
@onready var _nav_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _nape: Node3D = $Nape

var _player: Node3D = null
var _dead: bool = false
var _stagger_timer: float = 0.0
# Injected evolved genome (spec 3). Empty = pure navigation (gen-1 baseline
# behaviour). The 6 weights parameterise SteeringPolicy; the nav agent still
# supplies the base path direction so the titan is never dumber than A*.
var _genes: PackedFloat32Array = PackedFloat32Array()
# Measured player-preferred entry dir (telemetry); flankBias scales its opposite.
var _preferred_entry_dir: Vector3 = Vector3.ZERO
# Sibling titans for separation / encircle terms.
var _neighbours: Array = []
# Horizontal velocity the agent's avoidance says is safe this frame. Kept so 4
# titans in a narrow corridor steer around each other instead of jamming.
var _safe_velocity: Vector3 = Vector3.ZERO


func _ready() -> void:
	# Avoidance feeds a "safe velocity" back via velocity_computed; we submit a
	# desired velocity and move along the safe result.
	if _nav_agent != null and _nav_agent.avoidance_enabled:
		_nav_agent.velocity_computed.connect(_on_safe_velocity)
	# Telemetry (spec 2): register so the recorder samples this titan each tick.
	if Telemetry != null:
		Telemetry.register_titan(self)


func _exit_tree() -> void:
	if Telemetry != null:
		Telemetry.unregister_titan(self)


func _on_safe_velocity(safe: Vector3) -> void:
	_safe_velocity = safe


## GameManager hands us the player directly. Otherwise we look it up.
func set_target(player: Node3D) -> void:
	_player = player


## Inject the evolved strategy for THIS round (spec 3, steering 3.8): the titan
## steers with these FIXED weights, it does NOT run evolution. Empty genome =
## pure navigation (gen-1 baseline). preferred_entry_dir is measured; flankBias
## scales its opposite.
func set_genes(genes: PackedFloat32Array, preferred_entry_dir: Vector3) -> void:
	_genes = genes
	_preferred_entry_dir = preferred_entry_dir


## Sibling titans, for the separation / encircle steering terms.
func set_neighbours(neighbours: Array) -> void:
	_neighbours = neighbours


func _physics_process(delta: float) -> void:
	if _dead:
		_apply_gravity(delta)
		move_and_slide()
		return

	if _stagger_timer > 0.0:
		_stagger_timer -= delta
		# Frozen horizontally while staggered, but keep gravity so it settles.
		velocity.x = move_toward(velocity.x, 0.0, MOVE_SPEED)
		velocity.z = move_toward(velocity.z, 0.0, MOVE_SPEED)
		_apply_gravity(delta)
		move_and_slide()
		return

	if _player == null:
		_player = _find_player()
	if _player == null:
		_apply_gravity(delta)
		move_and_slide()
		return

	_chase(delta)
	_apply_gravity(delta)
	move_and_slide()


# =====================================================================
# CHASE (NavigationAgent3D pathing + hybrid gene steering on top)
# =====================================================================

func _chase(delta: float) -> void:
	if _nav_agent == null:
		return
	_nav_agent.target_position = _player.global_position

	var next_point: Vector3 = _nav_agent.get_next_path_position()
	var to_next: Vector3 = next_point - global_position
	to_next.y = 0.0

	if to_next.length() > ARRIVAL_DISTANCE:
		var nav_dir: Vector3 = to_next.normalized()
		# Hybrid steering (3.1): nav guarantees the path, genes re-weight on top.
		var move_dir: Vector3 = _steer(nav_dir)
		_drive_horizontal(move_dir * MOVE_SPEED)
		_face_direction(move_dir, delta)
	else:
		_drive_horizontal(Vector3.ZERO)
		var facing: Vector3 = _facing_toward_player()
		if facing != Vector3.ZERO:
			_face_direction(facing, delta)


## Hybrid steering direction; falls back to raw nav dir when no genome injected.
func _steer(nav_dir: Vector3) -> Vector3:
	if _genes.size() < Genome.GENE_COUNT or _player == null:
		return nav_dir
	var p_pos: Vector3 = _player.global_position
	var p_vel: Vector3 = Vector3.ZERO
	if _player is CharacterBody3D:
		p_vel = (_player as CharacterBody3D).velocity
	return SteeringPolicy.compute_move_dir(
		_genes, global_position, nav_dir, p_pos, p_vel,
		_preferred_entry_dir, _neighbour_positions(), p_pos)


func _neighbour_positions() -> Array:
	var out: Array = []
	for n in _neighbours:
		if n != null and is_instance_valid(n) and n != self:
			out.append((n as Node3D).global_position)
	return out


## Apply a desired horizontal velocity via avoidance (4 titans steer around each
## other) or directly when avoidance is off.
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
	var desired_yaw: float = atan2(dir.x, dir.z)
	rotation.y = rotate_toward(rotation.y, desired_yaw, TURN_SPEED * delta)


func _facing_toward_player() -> Vector3:
	if _player == null:
		return Vector3.ZERO
	var to_player: Vector3 = _player.global_position - global_position
	to_player.y = 0.0
	if to_player.length() < 0.001:
		return Vector3.ZERO
	return to_player.normalized()


# =====================================================================
# NAPE / DAMAGE (continuous)
# =====================================================================

## World-space outward nape normal (back of the neck = local -Z), with the
## evolved napeYaw upper-body turn-away applied (steering 3.2).
func get_nape_normal() -> Vector3:
	var base: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, -1.0)).normalized()
	if _genes.size() < Genome.GENE_COUNT or _player == null:
		return base
	var forward: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, 1.0)).normalized()
	var approach: Vector3 = _player.global_position - global_position
	approach.y = 0.0
	var yaw: float = SteeringPolicy.nape_yaw_amount(_genes, forward, approach)
	# Rotate the nape normal by the turn-away yaw about +Y.
	return base.rotated(Vector3.UP, yaw).normalized()


## Called by the player's slash sweep. `damage` is the continuous value computed
## from relative speed and blade-vs-nape-normal angle; `threshold` is the kill
## cutoff. Returns true if the hit was lethal.
func receive_slash(damage: float, threshold: float) -> bool:
	if _dead:
		return true
	if damage >= threshold:
		die()
		return true
	# Sub-threshold: brief stagger (the caller bounces the player off).
	_stagger_timer = STAGGER_DURATION
	return false


## Kill the titan. Idempotent so a double-hit in one frame is harmless.
func die() -> void:
	if _dead:
		return
	_dead = true
	titan_killed.emit()


# =====================================================================
# UTILITIES
# =====================================================================

func _find_player() -> Node3D:
	var group_players := get_tree().get_nodes_in_group("player")
	if group_players.size() > 0:
		return group_players[0] as Node3D
	var root := get_tree().current_scene
	if root != null and root.has_node("Player"):
		return root.get_node("Player") as Node3D
	return null
