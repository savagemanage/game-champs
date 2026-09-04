extends Node3D
## Slash attack via a ShapeCast3D SWEEP between the previous and current physics
## frame. Attached as child node "Slash" under the Player; the player's
## _physics_process forwards each physics tick via tick(player, delta).
##
## WHY A SWEEP, NOT A TIMED Area3D: enabling an Area3D for a few frames misses
## fast swings (the blade tunnels across the nape between physics frames). We
## track the blade tip's world position each frame and, on a slash, cast a shape
## from LAST frame's tip toward THIS frame's tip, covering the whole gap.
##
## DAMAGE IS CONTINUOUS (steering section 2, spec 1):
##   damage = f(relative speed, angle between blade travel dir and nape normal)
## At/above KILL_THRESHOLD the titan dies; below it it is staggered and the
## player is bounced off. See titan.gd for how the titan consumes this.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Physics layer the slash sweep collides with. Layer 4 = nape_hitbox.
const NAPE_COLLISION_MASK: int = 8
## Cooldown between slashes (seconds) so it reads as a deliberate swing.
const SLASH_COOLDOWN: float = 0.3
## Melee reach (metres) along the aim ray: the tip rides the camera's
## centre-screen ray so the sweep endpoint lands under the crosshair.
const BLADE_REACH: float = 2.8

## Damage model. damage = speed_term + angle_term, both normalised roughly to
## [0..1]-ish scales, then compared to KILL_THRESHOLD.
## Relative speed (m/s) that on its own maps to a "full" speed term.
const SPEED_REFERENCE: float = 30.0
## Weight of the speed term in the damage sum.
const SPEED_WEIGHT: float = 1.0
## Weight of the angle term (blade travel aligned against the nape normal).
const ANGLE_WEIGHT: float = 1.0
## Combined damage at/above which the titan dies.
const KILL_THRESHOLD: float = 1.2

## Bounce impulse (m/s) applied to the player away from the nape on a
## sub-threshold hit, so a weak slash throws the player off.
const BOUNCE_IMPULSE: float = 18.0

## Slash result codes reported to telemetry. These MUST match
## EngagementWindow.RESULT_* so the recorder classifies windows consistently.
const RESULT_WHIFF: int = 1
const RESULT_SUB: int = 2
const RESULT_KILL: int = 3

# =====================================================================
# STATE
# =====================================================================

var _player: CharacterBody3D
@onready var _sweep: ShapeCast3D = $Sweep

# Aim source: the mouse-look camera. The blade tip is derived from this so the
# sweep travels toward the crosshair (grapple.gd raycasts from the same camera).
var _camera: Camera3D

# Optional presentation helper (particles / camera shake / crosshair / blade
# swing). Wired as a sibling "SlashFX" node in Player.tscn; guarded so slash
# logic runs fine without it.
var _fx: Node

# Blade tip world position on the previous physics frame, used as the sweep
# origin so the cast covers the full inter-frame gap.
var _last_tip: Vector3 = Vector3.ZERO
var _have_last: bool = false

# Blade travel velocity (m/s) across the last physics step, for the damage calc.
var _blade_velocity: Vector3 = Vector3.ZERO

var _cooldown: float = 0.0


func _ready() -> void:
	_player = get_parent() as CharacterBody3D
	if _sweep != null:
		# We drive the cast manually each slash; keep it off between frames.
		_sweep.enabled = false
		_sweep.collision_mask = NAPE_COLLISION_MASK
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
	# force_shapecast_update runs the sweep immediately this frame.
	_sweep.force_shapecast_update()

	# Result classification for telemetry: whiff (no hit) / sub-threshold / kill.
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


## Resolve a sweep hit against a nape collider: compute continuous damage and
## either kill or stagger+bounce. Returns the telemetry result code.
func _resolve_hit(collider: Object, surface_normal: Vector3, hit_point: Vector3) -> int:
	if collider == null:
		return RESULT_WHIFF
	var titan := _find_titan(collider as Node)
	if titan == null:
		return RESULT_WHIFF

	# Nape normal: prefer the titan's reported nape normal, else the sweep's
	# surface normal.
	var nape_normal: Vector3 = surface_normal
	if titan.has_method("get_nape_normal"):
		nape_normal = titan.call("get_nape_normal")

	var damage: float = _compute_damage(nape_normal)

	if titan.has_method("receive_slash"):
		# receive_slash returns true if the hit was lethal.
		var killed: bool = bool(titan.call("receive_slash", damage, KILL_THRESHOLD))
		if not killed:
			_bounce_player(nape_normal)
			if _fx != null and _fx.has_method("play_hit"):
				_fx.call("play_hit", hit_point, false)
			return RESULT_SUB
		if _fx != null and _fx.has_method("play_hit"):
			_fx.call("play_hit", hit_point, true)
		return RESULT_KILL
	return RESULT_WHIFF


## damage = f(relative speed, angle between blade travel dir and nape normal).
## Speed term rewards a fast blade; angle term rewards slicing ALONG the nape
## surface (travel perpendicular to the normal), not stabbing into it.
func _compute_damage(nape_normal: Vector3) -> float:
	var speed: float = _blade_velocity.length()
	var speed_term: float = clampf(speed / SPEED_REFERENCE, 0.0, 1.0) * SPEED_WEIGHT

	var angle_term: float = 0.0
	if speed > 0.001 and nape_normal.length() > 0.001:
		var travel_dir: Vector3 = _blade_velocity / speed
		var n: Vector3 = nape_normal.normalized()
		# alignment: 1 when travel is parallel to the normal, 0 when tangent.
		# A clean slice runs tangent to the surface, so the angle term is
		# strongest when travel is perpendicular to the normal (1 - |dot|).
		var alignment: float = absf(travel_dir.dot(n))
		angle_term = (1.0 - alignment) * ANGLE_WEIGHT
	return speed_term + angle_term


## Throw the player off after a weak (sub-threshold) slash: reflect velocity and
## add an impulse along the nape normal.
func _bounce_player(nape_normal: Vector3) -> void:
	if _player == null:
		return
	var n: Vector3 = nape_normal
	if n.length() < 0.001:
		n = Vector3.UP
	n = n.normalized()
	# Cancel inward velocity and add an outward impulse.
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


## Walk up from the struck collider to the titan node (has receive_slash).
func _find_titan(node: Node) -> Node:
	var cur: Node = node
	while cur != null:
		if cur.has_method("receive_slash"):
			return cur
		cur = cur.get_parent()
	return null
