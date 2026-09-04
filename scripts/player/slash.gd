extends Node3D
## Slash attack via a ShapeCast3D SWEEP between the previous and current physics
## frame. Child node "Slash" under the Player; player.gd forwards each physics
## tick via tick(player, delta). WHY A SWEEP not a timed Area3D: a briefly-enabled
## Area3D misses fast swings (the blade tunnels across the nape); we track the
## blade tip each frame and cast the shape from LAST tip to THIS tip over the gap.
##
## DAMAGE IS CONTINUOUS: base damage = f(relative speed, blade-vs-surface angle).
## The titan owns a FIXED HP pool (FEAT-004): the sweep can strike the NAPE (weak
## point, big crit multiplier) or the BODY (a fraction), so it takes MULTIPLE hits
## unless a clean nape crit lands. receive_hit(base_damage, is_nape) subtracts HP
## and returns whether the titan died; sub-lethal hits still stagger + bounce.

## Presentation-only, ADDITIVE signal emitted AFTER receive_hit resolves so a HUD
## readout can show HP removed / remaining. Alters nothing above. `applied` is the
## per-part HP subtracted; `hp_ratio` is the survivor's HP fraction (0 on kill).
signal slash_resolved(applied: float, hp_ratio: float, killed: bool, is_nape: bool, world_pos: Vector3)

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Physics layers the sweep collides with. Bit 8 = titan NAPE (weak point), bit
## 16 = titan BODY; the mask (24) registers both so a hit anywhere hittable deals
## damage and the nape only adds a crit multiplier (titan-side), not a kill gate.
const NAPE_LAYER_BIT: int = 8
const BODY_LAYER_BIT: int = 16
const HITTABLE_COLLISION_MASK: int = NAPE_LAYER_BIT | BODY_LAYER_BIT
## Cooldown between slashes (seconds) so it reads as a deliberate swing.
const SLASH_COOLDOWN: float = 0.3
## Melee reach (metres) along the aim ray: the tip rides the camera's
## centre-screen ray so the sweep endpoint lands under the crosshair.
const BLADE_REACH: float = 2.8

## Damage model: base_damage = speed_term + angle_term, each ~[0..1] (so base
## rides in ~[0..2]); the titan converts it to HP loss with a per-part multiplier.
const SPEED_REFERENCE: float = 30.0  ## rel speed (m/s) mapping to a full term
const SPEED_WEIGHT: float = 1.0
const ANGLE_WEIGHT: float = 1.0

## Bounce impulse (m/s) pushing the player away from the nape on a sub-lethal hit.
const BOUNCE_IMPULSE: float = 18.0

## Slash result codes reported to telemetry (MUST match EngagementWindow.RESULT_*).
const RESULT_WHIFF: int = 1
const RESULT_SUB: int = 2
const RESULT_KILL: int = 3

# =====================================================================
# STATE
# =====================================================================

var _player: CharacterBody3D
@onready var _sweep: ShapeCast3D = $Sweep
# Aim source: mouse-look camera; the blade tip rides its centre ray toward the
# crosshair (grapple.gd raycasts from the same camera).
var _camera: Camera3D
# Optional sibling "SlashFX" helper (particles / shake); guarded so slash runs
# without it.
var _fx: Node
var _last_tip: Vector3 = Vector3.ZERO  # blade tip last physics frame (sweep origin)
var _have_last: bool = false
var _blade_velocity: Vector3 = Vector3.ZERO  # blade travel (m/s) last step, for damage
var _cooldown: float = 0.0


func _ready() -> void:
	_player = get_parent() as CharacterBody3D
	if _sweep != null:
		# We drive the cast manually each slash; keep it off between frames.
		_sweep.enabled = false
		_sweep.collision_mask = HITTABLE_COLLISION_MASK
		_sweep.collide_with_areas = true
		_sweep.collide_with_bodies = true

	# Cache the mouse-look camera as the aim source (same camera grapple.gd uses).
	if _player != null and _player.has_node("YawPivot/PitchPivot/Camera3D"):
		_camera = _player.get_node("YawPivot/PitchPivot/Camera3D") as Camera3D
	else:
		_camera = get_viewport().get_camera_3d()

	# Optional feedback helper (sibling node).
	if _player != null and _player.has_node("SlashFX"):
		_fx = _player.get_node("SlashFX")


## Called by the player every physics frame.
func tick(player: CharacterBody3D, delta: float) -> void:
	_player = player
	if _cooldown > 0.0:
		_cooldown -= delta

	var tip: Vector3 = _blade_tip_world()
	if _have_last and delta > 0.0:
		_blade_velocity = (tip - _last_tip) / delta

	if Input.is_action_just_pressed("slash") and _cooldown <= 0.0:
		_cooldown = SLASH_COOLDOWN
		if _fx != null and _fx.has_method("play_swing"):
			_fx.call("play_swing")
		_do_sweep(tip)

	_last_tip = tip
	_have_last = true


# =====================================================================
# SWEEP
# =====================================================================

## Sweep the blade shape from last frame's tip to this frame's tip. Using the
## previous position as the origin and (current - previous) as target_position
## covers the whole inter-frame gap, preventing tunneling at high swing speed.
func _do_sweep(current_tip: Vector3) -> void:
	if _sweep == null:
		return
	var origin: Vector3 = _last_tip if _have_last else current_tip
	# Position the cast at last frame's tip with an IDENTITY basis, then sweep
	# toward the current tip. Forcing identity avoids inheriting the player's
	# transform, so target_position (a local vector) equals the raw world delta
	# and the sweep spans the true inter-frame segment regardless of facing.
	_sweep.global_transform = Transform3D(Basis.IDENTITY, origin)
	_sweep.target_position = current_tip - origin
	_sweep.enabled = true
	_sweep.force_shapecast_update()  # run the sweep immediately this frame

	# Result classification for telemetry: whiff (no hit) / sub-lethal / kill.
	var result: int = RESULT_WHIFF
	var rel_speed: float = _blade_velocity.length()
	if _sweep.is_colliding():
		var count: int = _sweep.get_collision_count()
		for i in count:
			var collider: Object = _sweep.get_collider(i)
			var hit_point: Vector3 = _sweep.get_collision_point(i)
			result = _resolve_hit(collider, _sweep.get_collision_normal(i), hit_point)
			if result != RESULT_WHIFF:
				break
	_sweep.enabled = false

	# Telemetry (spec 2): report every slash attempt (including whiffs) with its
	# position, blade travel direction, relative speed and result. Plain data
	# only - no scene types cross into scripts/telemetry/.
	if Telemetry != null:
		var travel_dir: Vector3 = Vector3.ZERO
		if rel_speed > 0.001:
			travel_dir = _blade_velocity / rel_speed
		Telemetry.report_slash(current_tip, travel_dir, rel_speed, result)


## Resolve a sweep hit against a titan hitbox: compute base damage, flag NAPE
## (weak point) vs BODY, and let the titan subtract HP with the right multiplier.
## A sub-lethal hit still staggers + bounces. Returns the telemetry result code.
func _resolve_hit(collider: Object, surface_normal: Vector3, hit_point: Vector3) -> int:
	if collider == null:
		return RESULT_WHIFF
	var titan := _find_titan(collider as Node)
	if titan == null:
		return RESULT_WHIFF

	var is_nape: bool = _is_nape_collider(collider as Node)
	# Nape hit uses the titan's reported nape normal (weak point); a body hit
	# uses the sweep's surface normal, for the damage angle term and the bounce.
	var normal: Vector3 = surface_normal
	if is_nape and titan.has_method("get_nape_normal"):
		normal = titan.call("get_nape_normal")

	var base_damage: float = _compute_damage(normal)

	if titan.has_method("receive_hit"):
		var killed: bool = bool(titan.call("receive_hit", base_damage, is_nape))
		var hp_ratio: float = 0.0
		if not killed and titan.has_method("hp_ratio"):
			hp_ratio = float(titan.call("hp_ratio"))
		# Presentation-only readout; additive, changes nothing above.
		var applied: float = base_damage
		if titan.has_method("last_applied_damage"):
			applied = float(titan.call("last_applied_damage"))
		slash_resolved.emit(applied, hp_ratio, killed, is_nape, hit_point)
		if not killed:
			_bounce_player(normal)
			if _fx != null and _fx.has_method("play_hit"):
				_fx.call("play_hit", hit_point, false)
			return RESULT_SUB
		if _fx != null and _fx.has_method("play_hit"):
			_fx.call("play_hit", hit_point, true)
		return RESULT_KILL
	return RESULT_WHIFF


## True when the struck collider is the NAPE weak point (layer bit 8), false for
## the body (bit 16). Reads the collider's own layer so a rename still classifies.
func _is_nape_collider(node: Node) -> bool:
	var cur: Node = node
	while cur != null and not (cur is CollisionObject3D):
		cur = cur.get_parent()
	if cur is CollisionObject3D:
		return ((cur as CollisionObject3D).collision_layer & NAPE_LAYER_BIT) != 0
	return false


## base_damage = f(rel speed, blade-vs-surface angle) via shared pure DamagePreview.
func _compute_damage(surface_normal: Vector3) -> float:
	return DamagePreview.compute(_blade_velocity, surface_normal, SPEED_REFERENCE, SPEED_WEIGHT, ANGLE_WEIGHT)


# Read-only accessors (presentation only) for the indicator preview.
func projected_damage(surface_normal: Vector3) -> float: return _compute_damage(surface_normal)
func blade_speed() -> float: return _blade_velocity.length()

## Throw the player off after a sub-lethal slash: cancel inward velocity and add
## an outward impulse along the nape normal.
func _bounce_player(nape_normal: Vector3) -> void:
	if _player == null:
		return
	var n: Vector3 = nape_normal
	if n.length() < 0.001:
		n = Vector3.UP
	n = n.normalized()
	var into: float = _player.velocity.dot(-n)
	if into > 0.0:
		_player.velocity += n * into
	_player.velocity += n * BOUNCE_IMPULSE


# =====================================================================
# HELPERS
# =====================================================================

func _blade_tip_world() -> Vector3:
	# Ride the camera's centre-screen ray at BLADE_REACH so the sweep endpoint
	# sits under the crosshair for any FOV/projection (mirrors grapple.gd).
	if _camera == null:
		_camera = get_viewport().get_camera_3d()
	if _camera != null:
		var centre: Vector2 = get_viewport().get_visible_rect().size * 0.5
		return _camera.project_ray_origin(centre) + _camera.project_ray_normal(centre) * BLADE_REACH
	if _player != null:
		return _player.global_transform * Vector3(0.0, 0.0, -BLADE_REACH)
	return global_position


## Walk up from the struck collider to the titan node (has receive_hit).
func _find_titan(node: Node) -> Node:
	var cur: Node = node
	while cur != null:
		if cur.has_method("receive_hit"):
			return cur
		cur = cur.get_parent()
	return null
