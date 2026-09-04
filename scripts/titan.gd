extends CharacterBody3D
## The titan - a large enemy that chases the player and exposes a nape (목덜미)
## kill zone at the back of its neck.
##
## Movement uses a NavigationAgent3D to path around obstacles when a baked
## navigation mesh is available. IMPORTANT: the TestMap's NavigationRegion3D is
## authored but NOT baked (baking needs the Godot editor). So this script is
## deliberately robust: if the nav map is not ready / has no usable path, it
## FALLS BACK to steering straight toward the player on the XZ plane. That way
## the prototype is playable whether or not the user has baked the nav mesh.
## (To get proper obstacle-avoiding pathing, open the project in Godot, select
## the NavigationRegion3D and click "Bake NavigationMesh".)
##
## "Gets smarter each round" hook: the decision logic is expressed as small
## weighted utility functions that read PlayerStats.behavior_weights. Each new
## titan is spawned after PlayerStats has folded the last round's habits into
## those weights, so its interception and nape-guarding shift over time.

# --- Emitted when the nape is struck and the titan dies. GameManager listens. ---
signal titan_killed

# =====================================================================
# TUNABLES
# =====================================================================

@export_group("Movement")
## Ground move speed (m/s). The titan is big and a bit ponderous by default.
@export var move_speed: float = 6.0
## How quickly the titan turns to face its travel/target direction (rad/s).
@export var turn_speed: float = 3.0
## Extra push toward the player added when "aggression" weight is high (m/s).
@export var aggression_speed_bonus: float = 4.0

@export_group("Behaviour")
## How far to the side (metres) the titan biases its intercept point when the
## player has a strong preferred approach side. Scaled by the anticipate_side
## weight from PlayerStats.
@export var intercept_offset: float = 6.0
## Distance (metres) at which the nav agent considers itself "arrived".
@export var arrival_distance: float = 2.5

# =====================================================================
# NODE REFERENCES  (names MUST match Titan.tscn)
# =====================================================================

@onready var _nav_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _nape: Area3D = $Nape

# Project default gravity so the titan stays glued to the ground / falls.
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# The player we chase. Resolved lazily so the titan works no matter the spawn
# order; GameManager may also set it explicitly via set_target().
var _player: Node3D = null

# Cached copy of the adaptive weights for this round (read once on spawn so all
# decisions in the round are consistent). Safe defaults if PlayerStats absent.
var _weights: Dictionary = {}

var _dead: bool = false


func _ready() -> void:
	_weights = _fetch_weights()
	# The nape Area3D is the kill zone. The slash hitbox (on the player) enters
	# it; we also watch here so a kill registers regardless of which side owns
	# the overlap signal.
	if _nape != null:
		_nape.area_entered.connect(_on_nape_area_entered)


## GameManager can hand us the player directly. Otherwise we look it up.
func set_target(player: Node3D) -> void:
	_player = player


## Re-read the adaptive weights (GameManager calls this if it wants the titan to
## pick up freshly recomputed weights mid-life; normally _ready() suffices).
func refresh_weights() -> void:
	_weights = _fetch_weights()


func _physics_process(delta: float) -> void:
	if _dead:
		# Keep falling / settling but stop chasing once dead.
		_apply_gravity(delta)
		move_and_slide()
		return

	if _player == null:
		_player = _find_player()
	if _player == null:
		_apply_gravity(delta)
		move_and_slide()
		return

	# Feed the player-distance sample into PlayerStats for next round's tuning.
	_report_distance()

	var target: Vector3 = _compute_target_position()
	var next_point: Vector3 = _next_path_point(target)

	# Steer horizontally toward the next path point.
	var to_next: Vector3 = next_point - global_position
	to_next.y = 0.0

	var speed: float = _current_speed()
	if to_next.length() > arrival_distance:
		var dir: Vector3 = to_next.normalized()
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed
		_face_direction(dir, delta)
	else:
		# Arrived near the target: ease horizontal motion to a stop.
		velocity.x = move_toward(velocity.x, 0.0, speed)
		velocity.z = move_toward(velocity.z, 0.0, speed)

	_apply_gravity(delta)
	move_and_slide()


# =====================================================================
# MOVEMENT HELPERS
# =====================================================================

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _gravity * delta
	elif velocity.y < 0.0:
		velocity.y = 0.0


## Turn smoothly to face a horizontal direction (so the nape stays behind it).
func _face_direction(dir: Vector3, delta: float) -> void:
	if dir.length() < 0.001:
		return
	var desired_yaw: float = atan2(dir.x, dir.z)
	rotation.y = rotate_toward(rotation.y, desired_yaw, turn_speed * delta)


## Speed for this frame, nudged up by the aggression weight so a titan facing a
## kiting player closes distance faster.
func _current_speed() -> float:
	var aggression: float = _weight("aggression", 0.5)
	return move_speed + aggression_speed_bonus * aggression


# =====================================================================
# NAVIGATION  (with graceful fallback when the nav mesh is not baked)
# =====================================================================

## Ask the nav agent for the next path point toward `target`. If the navigation
## map is not ready or gives us no usable path (which is the case when the nav
## mesh has not been baked), fall back to steering directly at the target.
func _next_path_point(target: Vector3) -> Vector3:
	if _nav_agent == null:
		return target

	_nav_agent.target_position = target

	# If the navigation map has not finished syncing (very common on the first
	# frames, and permanently so when the mesh is unbaked), don't trust it.
	if not _nav_agent.is_navigation_finished() and _nav_map_ready():
		var next: Vector3 = _nav_agent.get_next_path_position()
		# A degenerate path returns (near) our own position; that means "no real
		# path" - fall back to direct steering so we still move.
		if global_position.distance_to(next) > 0.01:
			return next

	# Fallback: head straight for the target on the XZ plane.
	return target


## Is the navigation map this agent uses actually usable? It must have synced at
## least once AND contain at least one region with baked polygons. When the nav
## mesh is unbaked the region exists but has no polygons, so pathing returns a
## degenerate path - in that case _next_path_point() falls back to direct
## steering anyway (via the distance check), and this guard skips the useless
## nav query entirely.
func _nav_map_ready() -> bool:
	var map: RID = _nav_agent.get_navigation_map()
	if not map.is_valid():
		return false
	if NavigationServer3D.map_get_iteration_id(map) <= 0:
		return false
	return NavigationServer3D.map_get_regions(map).size() > 0


# =====================================================================
# DECISION LOGIC  (weighted utility functions - the adaptive-AI hook)
# =====================================================================

## Where the titan actually wants to be. Base case: the player's position.
## Adaptive twist: bias the intercept point toward the side the player usually
## approaches from (anticipate_side weight), so the titan cuts them off instead
## of always chasing their current position.
func _compute_target_position() -> Vector3:
	var player_pos: Vector3 = _player.global_position

	# anticipate_side: 0 = player favours their left, 1 = their right, 0.5 = no
	# preference. Convert to a signed lean in [-1, 1].
	var side_bias: float = (_weight("anticipate_side", 0.5) - 0.5) * 2.0

	# Sideways axis is perpendicular to the titan->player vector on the XZ plane.
	var to_player: Vector3 = player_pos - global_position
	to_player.y = 0.0
	if to_player.length() < 0.001:
		return player_pos
	to_player = to_player.normalized()
	# Right-hand perpendicular on the XZ plane.
	var sideways: Vector3 = Vector3(to_player.z, 0.0, -to_player.x)

	var offset: Vector3 = sideways * side_bias * intercept_offset
	return player_pos + offset


# =====================================================================
# NAPE / DEATH
# =====================================================================

func _on_nape_area_entered(area: Area3D) -> void:
	# Any area on the slash layer that reaches the nape is a killing blow.
	if _dead:
		return
	die()


## Kill the titan: stop chasing, announce it, and let GameManager run the round
## transition. Kept idempotent so a double-hit in one frame is harmless.
func die() -> void:
	if _dead:
		return
	_dead = true
	# Stop the nape from registering further hits.
	if _nape != null:
		_nape.monitoring = false
		_nape.monitorable = false
	titan_killed.emit()


# =====================================================================
# UTILITIES
# =====================================================================

## Read a behaviour weight with a safe fallback. Uses the cached round weights
## if present, otherwise the live PlayerStats, otherwise the fallback - so the
## titan never crashes even if the singleton is missing entirely.
func _weight(key: String, fallback: float) -> float:
	if _weights.has(key):
		return float(_weights[key])
	return fallback


## Snapshot the weights from the PlayerStats autoload, or an empty dict if it is
## absent (in which case _weight() just uses its fallbacks).
func _fetch_weights() -> Dictionary:
	var stats := get_node_or_null("/root/PlayerStats")
	if stats == null:
		return {}
	if "behavior_weights" in stats and typeof(stats.behavior_weights) == TYPE_DICTIONARY:
		return (stats.behavior_weights as Dictionary).duplicate()
	return {}


## Sample the player distance into PlayerStats (drives next round's aggression).
func _report_distance() -> void:
	var stats := get_node_or_null("/root/PlayerStats")
	if stats == null or _player == null:
		return
	if stats.has_method("record_distance"):
		stats.record_distance(global_position.distance_to(_player.global_position))


## Find the player if GameManager did not hand us one. Prefers the "player"
## group (GameManager adds the player to it), falling back to a node named
## "Player" under the scene root.
func _find_player() -> Node3D:
	var group_players := get_tree().get_nodes_in_group("player")
	if group_players.size() > 0:
		return group_players[0] as Node3D
	var root := get_tree().current_scene
	if root != null and root.has_node("Player"):
		return root.get_node("Player") as Node3D
	return null
