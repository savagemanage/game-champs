extends CharacterBody3D
## The titan: a large enemy that chases the player and exposes a nape kill-zone.
## Movement is NavigationAgent3D pathfinding with the hybrid gene steering policy
## on top (spec-3 point 3.1): the nav agent guarantees the path, the injected
## genome (spec 3) only re-weights direction terms; no genome = pure navigation
## (gen-1). The
## navmesh bakes at RUNTIME behind the loading screen. Damage is CONTINUOUS:
## receive_slash(damage, threshold) kills at/above threshold (emits
## titan_killed), else staggers the titan + bounces the player.

signal titan_killed

# =====================================================================
# TUNING CONSTANTS. INVARIANT: every value is FIXED and NEVER scales with the
# round number - difficulty rises only via evolved genes (spec 3).
# =====================================================================
const MOVE_SPEED: float = 6.0  ## ground move speed (m/s), fixed for all rounds
const TURN_SPEED: float = 3.0  ## turn-to-face rate (rad/s)
const ARRIVAL_DISTANCE: float = 2.5  ## nav "arrived" distance (m)
const STAGGER_DURATION: float = 0.9  ## freeze after a sub-threshold slash (s)
const FOOTSTEP_INTERVAL: float = 0.55  ## seconds between footstep sfx (FEAT-002)

# Project default gravity so the titan stays glued to the ground / falls.
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# --- Node references (names MUST match Titan.tscn) ---
@onready var _nav_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _nape: Node3D = $Nape

var _player: Node3D = null
var _dead: bool = false
var _stagger_timer: float = 0.0
var _footstep_timer: float = 0.0  # footstep cadence (presentation only)
var _aggroed: bool = false  # one-shot aggro cue guard
# Injected evolved genome (spec 3). Empty = pure navigation (gen-1 baseline); the
# 6 weights parameterise SteeringPolicy on top of the guaranteed nav path.
var _genes: PackedFloat32Array = PackedFloat32Array()
# Measured player-preferred entry dir (telemetry); flankBias scales its opposite.
var _preferred_entry_dir: Vector3 = Vector3.ZERO
var _neighbours: Array = []  # sibling titans for separation / encircle terms
# Safe horizontal velocity from avoidance so 4 titans don't jam in a corridor.
var _safe_velocity: Vector3 = Vector3.ZERO


func _ready() -> void:
	# Avoidance feeds a "safe velocity" back via velocity_computed (corridors).
	if _nav_agent != null and _nav_agent.avoidance_enabled:
		_nav_agent.velocity_computed.connect(_on_safe_velocity)
	if Telemetry != null:  # spec 2: recorder samples this titan each tick
		Telemetry.register_titan(self)


func _exit_tree() -> void:
	if Telemetry != null:
		Telemetry.unregister_titan(self)


func _on_safe_velocity(safe: Vector3) -> void: _safe_velocity = safe


## GameManager hands us the player directly. Otherwise we look it up.
func set_target(player: Node3D) -> void: _player = player


## Inject the evolved strategy for THIS round (spec-3 point 3.8): FIXED
## weights only, no evolution here. Empty = pure nav (gen-1); preferred_entry_dir
## is measured and flankBias scales its opposite.
func set_genes(genes: PackedFloat32Array, preferred_entry_dir: Vector3) -> void:
	_genes = genes
	_preferred_entry_dir = preferred_entry_dir


## Sibling titans, for the separation / encircle steering terms.
func set_neighbours(neighbours: Array) -> void: _neighbours = neighbours


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

	# Audio (FEAT-002): aggro cue the first time this titan has a target.
	if not _aggroed:
		_aggroed = true
		TitanSfx.aggro(global_position)

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
		_footstep_timer -= delta  # footstep cadence while chasing (FEAT-002)
		if _footstep_timer <= 0.0:
			_footstep_timer = FOOTSTEP_INTERVAL
			TitanSfx.footstep(global_position)
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


## Apply desired horizontal velocity via avoidance (titans steer around each
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
	return Vector3.ZERO if to_player.length() < 0.001 else to_player.normalized()


# =====================================================================
# NAPE / DAMAGE (continuous)
# =====================================================================

## World-space outward nape normal (back of the neck = local -Z), with the
## evolved napeYaw upper-body turn-away applied (spec-3 point 3.2).
func get_nape_normal() -> Vector3:
	var base: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, -1.0)).normalized()
	if _genes.size() < Genome.GENE_COUNT or _player == null:
		return base
	var forward: Vector3 = (global_transform.basis * Vector3(0.0, 0.0, 1.0)).normalized()
	var approach: Vector3 = _player.global_position - global_position
	approach.y = 0.0
	var yaw: float = SteeringPolicy.nape_yaw_amount(_genes, forward, approach)
	return base.rotated(Vector3.UP, yaw).normalized()  # turn-away yaw about +Y


## Read-only (FEAT-002): Nape node world position, for the nape indicator to
## screen-project; head-height fallback. is_alive() gates dead titans out.
func get_nape_world_position() -> Vector3:
	return _nape.global_position if _nape != null else global_position + Vector3.UP * 10.0
func is_alive() -> bool: return not _dead


## Called by the player's slash sweep. `damage` (continuous, from relative speed
## and blade-vs-nape angle) kills at/above `threshold`. Returns true if lethal.
func receive_slash(damage: float, threshold: float) -> bool:
	if _dead:
		return true
	if damage >= threshold:
		die()
		return true
	_stagger_timer = STAGGER_DURATION  # sub-threshold: stagger; caller bounces
	return false


## Kill the titan. Idempotent so a double-hit in one frame is harmless.
func die() -> void:
	if _dead:
		return
	_dead = true
	TitanSfx.death(global_position)  # death boom (FEAT-002)
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
