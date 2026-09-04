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
## Maximum extra yaw (radians) the titan adds to turn its nape AWAY from the
## side the player usually attacks from. Scaled by the guard_nape weight, so a
## player who reliably hits from one side makes the titan angle its back away
## from that side, keeping the nape harder to reach. ~0.7 rad ≈ 40°.
@export var guard_nape_max_yaw: float = 0.7

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

	# Feed the per-round samples into PlayerStats for next round's tuning.
	_report_distance()
	_report_approach_side()

	var target: Vector3 = _compute_target_position()
	var next_point: Vector3 = _next_path_point(target)

	# Steer horizontally toward the next path point.
	var to_next: Vector3 = next_point - global_position
	to_next.y = 0.0

	# Nape-guarding yaw: rotate the body a little so the nape (which sits at the
	# titan's rear) turns AWAY from the side the player usually attacks from.
	var guard_yaw: float = _guard_nape_yaw_offset()

	var speed: float = _current_speed()
	if to_next.length() > arrival_distance:
		var dir: Vector3 = to_next.normalized()
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed
		_face_direction(dir, delta, guard_yaw)
	else:
		# Arrived near the target: ease horizontal motion to a stop, but keep
		# angling the nape away from the player's favoured attack side.
		velocity.x = move_toward(velocity.x, 0.0, speed)
		velocity.z = move_toward(velocity.z, 0.0, speed)
		var facing: Vector3 = _facing_toward_player()
		if facing != Vector3.ZERO:
			_face_direction(facing, delta, guard_yaw)

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
## `extra_yaw` is an additional rotation (radians) layered on top of the facing
## direction - used by the nape-guarding logic to angle the back away from the
## player's favoured attack side.
func _face_direction(dir: Vector3, delta: float, extra_yaw: float = 0.0) -> void:
	if dir.length() < 0.001:
		return
	var desired_yaw: float = atan2(dir.x, dir.z) + extra_yaw
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

	# anticipate_side: 0 = player circles to the titan's left, 1 = to its right,
	# 0.5 = no preference. Convert to a signed lean in [-1, 1]. This is the SAME
	# titan-relative axis that _report_approach_side() samples into PlayerStats,
	# so the bias below actually leans toward the player's real approach side.
	var side_bias: float = (_weight("anticipate_side", 0.5) - 0.5) * 2.0

	# Sideways axis is perpendicular to the titan->player vector on the XZ plane.
	var to_player: Vector3 = player_pos - global_position
	to_player.y = 0.0
	if to_player.length() < 0.001:
		return player_pos
	to_player = to_player.normalized()
	# Right-hand perpendicular on the XZ plane == the titan's local +X (right).
	var sideways: Vector3 = Vector3(to_player.z, 0.0, -to_player.x)

	var offset: Vector3 = sideways * side_bias * intercept_offset
	return player_pos + offset


## Horizontal direction from the titan toward the player (XZ plane), or zero if
## they are stacked. Used to keep facing the player when not moving.
func _facing_toward_player() -> Vector3:
	if _player == null:
		return Vector3.ZERO
	var to_player: Vector3 = _player.global_position - global_position
	to_player.y = 0.0
	if to_player.length() < 0.001:
		return Vector3.ZERO
	return to_player.normalized()


## Extra yaw (radians) that turns the nape away from the player's favoured
## attack side. Uses two weights together:
##   * guard_nape  - HOW MUCH to guard (0 = don't bother, 1 = guard hard).
##   * anticipate_side - WHICH side the player favours (<0.5 left, >0.5 right).
## When the player attacks from their preferred side, we rotate the body so the
## rear (where the nape lives) swings the opposite way, making the nape harder
## to reach from that side.
func _guard_nape_yaw_offset() -> float:
	var guard: float = _weight("guard_nape", 0.0)
	if guard <= 0.0:
		return 0.0
	# side_bias: -1 = player favours the titan's left, +1 = its right.
	var side_bias: float = (_weight("anticipate_side", 0.5) - 0.5) * 2.0
	# Rotating the titan by +yaw about Y turns its local -Z (the nape) toward
	# its own left. If the player attacks from the right (side_bias > 0), a
	# positive yaw swings the nape left, i.e. away from the attack side. So the
	# guard yaw follows the sign of side_bias directly.
	return side_bias * guard * guard_nape_max_yaw


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


## Sample which side of the titan the player is circling toward, measured in
## the SAME titan-relative frame the intercept bias uses (the titan's local
## +X / right axis). We use the player's horizontal velocity projected onto
## that axis: a player who keeps peeling to the titan's right builds up a
## "right" bucket, and next round the titan biases its intercept that way to
## cut them off. Sampling motion (not just position) is what makes the learned
## side meaningful - the titan usually faces the player, so raw position would
## almost always read "dead ahead".
func _report_approach_side() -> void:
	var stats := get_node_or_null("/root/PlayerStats")
	if stats == null or _player == null:
		return
	if not stats.has_method("record_approach_side"):
		return

	var to_player: Vector3 = _player.global_position - global_position
	to_player.y = 0.0
	if to_player.length() < 0.001:
		return
	to_player = to_player.normalized()
	# Right-hand perpendicular on the XZ plane == the titan's local +X (right),
	# identical to the axis used in _compute_target_position().
	var sideways: Vector3 = Vector3(to_player.z, 0.0, -to_player.x)

	# The player's horizontal velocity. _player is typed Node3D here, so we read
	# `velocity` dynamically via get() (the real node is a CharacterBody3D that
	# exposes it) - this avoids a static "unknown property" error and is null-
	# safe: get() returns null if the property is absent.
	var vel_variant: Variant = _player.get("velocity")
	if typeof(vel_variant) != TYPE_VECTOR3:
		return
	var player_vel: Vector3 = vel_variant
	player_vel.y = 0.0
	if player_vel.length() < 0.001:
		# Standing still tells us nothing about an approach side this frame.
		return

	# Signed lateral speed: >0 = moving to the titan's right, <0 = its left.
	var lateral: float = player_vel.dot(sideways)
	# strength: how sideways the motion is (0 = purely toward/away, 1 = purely
	# lateral), so a player running straight in doesn't get bucketed as a side.
	var strength: float = clampf(absf(lateral) / maxf(player_vel.length(), 0.001), 0.0, 1.0)
	stats.record_approach_side(lateral, strength)


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
