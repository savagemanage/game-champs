extends Node3D
## ODM-gear grapple / wire mechanic - the core traversal feel of the game.
##
## This is a self-contained component. Attach it as a child node named
## "Grapple" under the Player (CharacterBody3D). The player's
## `_process_grapple(delta)` hook (from FEAT-001) calls `apply(player, delta)`
## every physics frame, guarded by `has_node("Grapple")`.
##
## Physics model (a rope-swing tuned to feel like ODM gear):
##   * Cast a ray from the camera through the screen centre to find an anchor
##     on the environment (collision layer 1). If it is in range, attach.
##   * While attached, apply a gentle pull acceleration toward the anchor AND
##     enforce a maximum rope length: when the player reaches the far end of
##     the rope, the outward (radially-away) part of the velocity is removed so
##     the player swings around the anchor like a pendulum. Gravity (applied by
##     the player script) stays on the whole time, which is what makes the
##     swing feel alive.
##   * On release we do NOT touch velocity, so accumulated swing momentum
##     carries the player into a jump - the signature ODM feel.
##
## Everything that affects feel is an @export below so it can be tuned live
## from the Inspector without editing code.

# =====================================================================
# FEEL TUNABLES  (grouped so a beginner can find them in the Inspector)
# =====================================================================

@export_group("Grapple - Range & Aim")
## How far the aim ray reaches when looking for an anchor (metres).
@export var max_grapple_distance: float = 60.0
## Only surfaces on these physics layers can be grappled. Layer 1 =
## "environment" in project.godot (ground + pillars).
@export_flags_3d_physics var grapple_collision_mask: int = 1

@export_group("Grapple - Swing Feel")
## Constant pull acceleration toward the anchor while attached (m/s^2).
## Higher = the player is yanked toward the anchor faster. This is on top of
## the pendulum constraint, so it mostly controls how "eager" the swing feels.
@export var pull_acceleration: float = 30.0
## Hard cap on how fast the pull can add speed toward the anchor (m/s).
## Prevents the player from being flung uncontrollably.
@export var max_pull_speed: float = 55.0
## When the player is at the far end of the rope, how much of the outward
## velocity is cancelled. 1.0 = a stiff, inextensible rope (classic pendulum);
## lower values give a stretchy, softer wire.
@export_range(0.0, 1.0) var rope_stiffness: float = 1.0
## Small drag applied to swing velocity so pendulum motion settles instead of
## oscillating forever. 0 = frictionless. Kept low so momentum is preserved.
@export_range(0.0, 5.0) var swing_damping: float = 0.05

@export_group("Grapple - Reel In")
## Speed at which the rope shortens while the reel-in key (jump) is held (m/s).
@export var reel_in_speed: float = 18.0
## The rope can never be reeled shorter than this (metres) - stops the player
## from being sucked into the anchor point.
@export var min_rope_length: float = 3.0

@export_group("Grapple - Visuals")
## Colour of the wire.
@export var wire_color: Color = Color(0.9, 0.9, 0.95)
## Local position on the player where the wire visually starts (the "hand").
## Roughly hip/hand height in front of the capsule.
@export var hand_offset: Vector3 = Vector3(0.0, 1.2, 0.0)

# =====================================================================
# STATE
# =====================================================================

## True while a wire is attached to an anchor.
var grappling: bool = false
## World-space point the wire is attached to.
var anchor_point: Vector3 = Vector3.ZERO
## Current rope length (may shrink when reeling in).
var rope_length: float = 0.0

# Cached references. `camera` is used both for aiming and screen-centre rays.
var _player: CharacterBody3D
var _camera: Camera3D

# Wire visual: an ImmediateMesh rebuilt each frame between hand and anchor.
# The crosshair (CrosshairLayer/Crosshair) is a static Label in the scene and
# needs no code reference - it is simply always visible for aiming.
@onready var _wire_mesh_instance: MeshInstance3D = $WireMesh

var _wire_mesh: ImmediateMesh
var _wire_material: StandardMaterial3D


func _ready() -> void:
	# The parent is the player CharacterBody3D.
	_player = get_parent() as CharacterBody3D
	if _player == null:
		push_warning("Grapple: parent is not a CharacterBody3D; grapple disabled.")

	# Find the camera through the known Player.tscn rig path. Falls back to the
	# viewport camera so the ray still works if the rig ever changes.
	if _player != null and _player.has_node("YawPivot/PitchPivot/Camera3D"):
		_camera = _player.get_node("YawPivot/PitchPivot/Camera3D") as Camera3D
	else:
		_camera = get_viewport().get_camera_3d()

	# Build the wire mesh + an unshaded material so the line is always visible.
	_wire_mesh = ImmediateMesh.new()
	_wire_mesh_instance.mesh = _wire_mesh
	_wire_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# WireMesh draws in world space (top_level) so its transform never distorts
	# the line when the player moves or rotates.
	_wire_mesh_instance.top_level = true
	_wire_mesh_instance.global_position = Vector3.ZERO

	_wire_material = StandardMaterial3D.new()
	_wire_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_wire_material.albedo_color = wire_color
	_wire_material.vertex_color_use_as_albedo = true

	_wire_mesh_instance.visible = false


## Called by the player every physics frame from `_process_grapple(delta)`.
## Handles input, attach/detach and the swing forces on `player.velocity`.
func apply(player: CharacterBody3D, delta: float) -> void:
	if _camera == null:
		return

	# --- Attach / detach on the grapple button ---
	if Input.is_action_just_pressed("grapple"):
		_try_attach()
	elif Input.is_action_just_released("grapple"):
		_release()

	if not grappling:
		return

	# If the anchor moved out of range (e.g. player was launched away), drop it.
	var to_anchor: Vector3 = anchor_point - _hand_world_position()
	if to_anchor.length() > max_grapple_distance * 1.25:
		_release()
		return

	_apply_swing_forces(player, delta)


# =====================================================================
# ATTACH / DETACH
# =====================================================================

func _try_attach() -> void:
	# Cast from the camera through the exact centre of the screen so the wire
	# fires where the crosshair points.
	var viewport := get_viewport()
	var screen_centre: Vector2 = viewport.get_visible_rect().size * 0.5
	var from: Vector3 = _camera.project_ray_origin(screen_centre)
	var dir: Vector3 = _camera.project_ray_normal(screen_centre)
	var to: Vector3 = from + dir * max_grapple_distance

	var space_state := _player.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = grapple_collision_mask
	# Never grapple ourselves.
	query.exclude = [_player.get_rid()]

	var hit: Dictionary = space_state.intersect_ray(query)
	if hit.is_empty():
		return

	anchor_point = hit.position
	rope_length = _hand_world_position().distance_to(anchor_point)
	grappling = true

	# Re-capture the mouse if it was released (so clicking to grapple also
	# resumes mouse-look), matching the player's own re-capture behaviour.
	if Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

	_record_grapple_use(dir)


func _release() -> void:
	# IMPORTANT: do not touch velocity here. Preserving swing momentum on
	# release is what lets swings chain into big jumps (the ODM-gear feel).
	grappling = false


# =====================================================================
# SWING PHYSICS
# =====================================================================

func _apply_swing_forces(player: CharacterBody3D, delta: float) -> void:
	var hand: Vector3 = _hand_world_position()
	var to_anchor: Vector3 = anchor_point - hand
	var distance: float = to_anchor.length()
	if distance < 0.001:
		return
	var dir_to_anchor: Vector3 = to_anchor / distance

	# --- Optional reel-in: hold jump to shorten the rope and gain height ---
	if Input.is_action_pressed("jump"):
		rope_length = maxf(min_rope_length, rope_length - reel_in_speed * delta)

	# --- Constant pull toward the anchor (capped) ---
	# Only add pull while we are not already moving toward the anchor faster
	# than the cap, so the player keeps agency over the swing.
	var speed_toward_anchor: float = player.velocity.dot(dir_to_anchor)
	if speed_toward_anchor < max_pull_speed:
		player.velocity += dir_to_anchor * pull_acceleration * delta

	# --- Pendulum / rope constraint ---
	# When the player is at (or past) the current rope length, cancel the part
	# of the velocity pointing outward from the anchor. That converts a fall
	# into a swing around the anchor instead of a straight drop. Gravity keeps
	# feeding energy in, which is what makes it swing.
	if distance >= rope_length:
		var outward_speed: float = player.velocity.dot(-dir_to_anchor)
		if outward_speed > 0.0:
			# Remove the outward component scaled by stiffness.
			player.velocity -= (-dir_to_anchor) * outward_speed * rope_stiffness

	# --- Gentle swing damping so it eventually settles ---
	if swing_damping > 0.0:
		player.velocity -= player.velocity * swing_damping * delta


# =====================================================================
# VISUALS  (wire + crosshair) - updated in _process for smoothness
# =====================================================================

func _process(_delta: float) -> void:
	_wire_mesh_instance.visible = grappling
	if not grappling:
		return
	_draw_wire(_hand_world_position(), anchor_point)


func _draw_wire(start: Vector3, end: Vector3) -> void:
	_wire_mesh.clear_surfaces()
	_wire_mesh.surface_begin(Mesh.PRIMITIVE_LINES, _wire_material)
	_wire_mesh.surface_set_color(wire_color)
	_wire_mesh.surface_add_vertex(start)
	_wire_mesh.surface_set_color(wire_color)
	_wire_mesh.surface_add_vertex(end)
	_wire_mesh.surface_end()


func _hand_world_position() -> Vector3:
	if _player == null:
		return global_position
	# The hand offset is in the player's local space.
	return _player.global_transform * hand_offset


# =====================================================================
# ADAPTIVE-AI HOOK (optional; created in FEAT-003)
# =====================================================================

## Log the grapple aim direction into the PlayerStats autoload so the titan AI
## can adapt over rounds. Guarded so FEAT-002 never crashes when the singleton
## does not exist yet.
func _record_grapple_use(aim_dir: Vector3) -> void:
	var stats := get_node_or_null("/root/PlayerStats")
	if stats == null:
		return
	if stats.has_method("record_grapple"):
		stats.record_grapple(aim_dir)
