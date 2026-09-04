extends Node3D
## The wire / grapple mechanic - the core traversal feel of wirework.
##
## Attached as a child node named "Grapple" under the Player (CharacterBody3D).
## The player's _physics_process forwards each physics tick via apply(player,
## delta) so swing forces are integrated with the rest of the physics step.
##
## Physics model (a rope-swing tuned to feel like grappling gear):
##   * Cast a ray from the camera through the screen centre to find an anchor on
##     the environment (collision layer 1). If it is in range, attach.
##   * While attached, apply a capped pull acceleration toward the anchor AND
##     enforce a maximum rope length: at the far end of the rope, the outward
##     (radially-away) part of the velocity is removed so the player swings
##     around the anchor like a pendulum. Gravity (applied by the player script)
##     keeps feeding energy in, which is what makes the swing feel alive.
##   * On release we do NOT touch velocity, so accumulated swing momentum
##     carries the player into a jump.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## How far the aim ray reaches when looking for an anchor (metres).
const MAX_GRAPPLE_DISTANCE: float = 60.0
## Only surfaces on these physics layers can be grappled. Layer 1 = environment.
const GRAPPLE_COLLISION_MASK: int = 1
## If the anchor ends up beyond this multiple of the max distance, drop it.
const RELEASE_DISTANCE_MULT: float = 1.25

## Constant pull acceleration toward the anchor while attached (m/s^2).
const PULL_ACCELERATION: float = 30.0
## Hard cap on how fast the pull can add speed toward the anchor (m/s).
const MAX_PULL_SPEED: float = 55.0
## How much outward velocity is cancelled at the rope's end. 1.0 = a stiff,
## inextensible rope (classic pendulum); lower = a stretchy, softer wire.
const ROPE_STIFFNESS: float = 1.0
## Small drag applied to swing velocity so a pendulum settles. Kept low so
## momentum is preserved.
const SWING_DAMPING: float = 0.05

## Speed at which the rope shortens while the reel-in key (jump) is held (m/s).
const REEL_IN_SPEED: float = 18.0
## The rope can never be reeled shorter than this (metres).
const MIN_ROPE_LENGTH: float = 3.0

## Colour of the wire.
const WIRE_COLOR: Color = Color(0.9, 0.9, 0.95)
## Local position on the player where the wire visually starts (the "hand").
const HAND_OFFSET: Vector3 = Vector3(0.0, 1.2, 0.0)

## Seconds between swing-whoosh one-shots while attached and moving fast enough.
const WHOOSH_INTERVAL: float = 0.45
## Minimum player speed (m/s) for the swing whoosh to play (a slow drift is silent).
const WHOOSH_MIN_SPEED: float = 9.0

# =====================================================================
# STATE
# =====================================================================

## True while a wire is attached to an anchor.
var grappling: bool = false
## World-space point the wire is attached to.
var anchor_point: Vector3 = Vector3.ZERO
## Current rope length (may shrink when reeling in).
var rope_length: float = 0.0

## Time until the next swing-whoosh one-shot may play (counts down while attached).
var _whoosh_cooldown: float = 0.0

var _player: CharacterBody3D
var _camera: Camera3D

@onready var _wire_mesh_instance: MeshInstance3D = $WireMesh

var _wire_mesh: ImmediateMesh
var _wire_material: StandardMaterial3D


func _ready() -> void:
	_player = get_parent() as CharacterBody3D
	if _player == null:
		push_warning("Grapple: parent is not a CharacterBody3D; grapple disabled.")

	if _player != null and _player.has_node("YawPivot/PitchPivot/Camera3D"):
		_camera = _player.get_node("YawPivot/PitchPivot/Camera3D") as Camera3D
	else:
		_camera = get_viewport().get_camera_3d()

	# Wire mesh + unshaded material so the line is always visible. Drawn in
	# world space (top_level) so its transform never distorts the line.
	_wire_mesh = ImmediateMesh.new()
	_wire_mesh_instance.mesh = _wire_mesh
	_wire_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_wire_mesh_instance.top_level = true
	_wire_mesh_instance.global_position = Vector3.ZERO

	_wire_material = StandardMaterial3D.new()
	_wire_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_wire_material.albedo_color = WIRE_COLOR
	_wire_material.vertex_color_use_as_albedo = true

	_wire_mesh_instance.visible = false


## Called by the player every physics frame. Handles input, attach/detach and
## the swing forces on player.velocity.
func apply(player: CharacterBody3D, delta: float) -> void:
	if _camera == null:
		return

	if Input.is_action_just_pressed("grapple"):
		_try_attach()
	elif Input.is_action_just_released("grapple"):
		_release()

	if not grappling:
		return

	# If the anchor drifted out of range, drop it.
	var to_anchor: Vector3 = anchor_point - _hand_world_position()
	if to_anchor.length() > MAX_GRAPPLE_DISTANCE * RELEASE_DISTANCE_MULT:
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
	var to: Vector3 = from + dir * MAX_GRAPPLE_DISTANCE

	var space_state := _player.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = GRAPPLE_COLLISION_MASK
	query.exclude = [_player.get_rid()]

	var hit: Dictionary = space_state.intersect_ray(query)
	if hit.is_empty():
		return

	anchor_point = hit.position
	rope_length = _hand_world_position().distance_to(anchor_point)
	grappling = true
	_whoosh_cooldown = WHOOSH_INTERVAL

	# Audio (FEAT-002): the wire fires (2D) and then clinks onto the anchor (3D
	# at the anchor point). Guarded so grapple runs fine without the Sfx autoload.
	if Sfx != null:
		Sfx.play(SfxBank.GRAPPLE_FIRE)
		Sfx.play_at(SfxBank.GRAPPLE_ATTACH, anchor_point)

	# Telemetry (spec 2): report the grapple fire + anchor world position. The
	# Telemetry autoload receives a plain Vector3 - no scene coupling leaks in.
	if Telemetry != null:
		Telemetry.report_grapple_fire(anchor_point)

	if Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _release() -> void:
	# IMPORTANT: do not touch velocity here. Preserving swing momentum on
	# release is what lets swings chain into big jumps.
	grappling = false
	# Telemetry (spec 2): report the release time.
	if Telemetry != null:
		Telemetry.report_grapple_release()


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

	# Reel-in: hold jump to shorten the rope and gain height.
	if Input.is_action_pressed("jump"):
		rope_length = maxf(MIN_ROPE_LENGTH, rope_length - REEL_IN_SPEED * delta)

	# Capped constant pull toward the anchor. Only add pull while not already
	# moving toward the anchor faster than the cap, so the player keeps agency.
	var speed_toward_anchor: float = player.velocity.dot(dir_to_anchor)
	if speed_toward_anchor < MAX_PULL_SPEED:
		player.velocity += dir_to_anchor * PULL_ACCELERATION * delta

	# Pendulum / rope constraint: at (or past) the rope length, cancel the part
	# of the velocity pointing outward from the anchor. That converts a fall
	# into a swing around the anchor.
	if distance >= rope_length:
		var outward_speed: float = player.velocity.dot(-dir_to_anchor)
		if outward_speed > 0.0:
			player.velocity -= (-dir_to_anchor) * outward_speed * ROPE_STIFFNESS

	# Gentle swing damping so it eventually settles.
	if SWING_DAMPING > 0.0:
		player.velocity -= player.velocity * SWING_DAMPING * delta

	# Audio (FEAT-002): a periodic swing whoosh while moving fast on the wire.
	_whoosh_cooldown -= delta
	if _whoosh_cooldown <= 0.0 and player.velocity.length() >= WHOOSH_MIN_SPEED:
		_whoosh_cooldown = WHOOSH_INTERVAL
		if Sfx != null:
			Sfx.play(SfxBank.SWING_WHOOSH)


# =====================================================================
# VISUALS (wire) - updated in _process for smoothness
# =====================================================================

func _process(_delta: float) -> void:
	_wire_mesh_instance.visible = grappling
	if not grappling:
		return
	_draw_wire(_hand_world_position(), anchor_point)


func _draw_wire(start: Vector3, end: Vector3) -> void:
	_wire_mesh.clear_surfaces()
	_wire_mesh.surface_begin(Mesh.PRIMITIVE_LINES, _wire_material)
	_wire_mesh.surface_set_color(WIRE_COLOR)
	_wire_mesh.surface_add_vertex(start)
	_wire_mesh.surface_set_color(WIRE_COLOR)
	_wire_mesh.surface_add_vertex(end)
	_wire_mesh.surface_end()


func _hand_world_position() -> Vector3:
	if _player == null:
		return global_position
	return _player.global_transform * HAND_OFFSET
