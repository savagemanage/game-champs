extends CharacterBody3D
## wirework player controller (spec 1 - traversal-core).
##
## Camera-relative WASD, jump, gravity and mouse-look on a CharacterBody3D.
## The grapple (scripts/player/grapple.gd) and slash (scripts/player/slash.gd)
## are child nodes; this script forwards the physics tick to them AFTER normal
## movement is computed but BEFORE move_and_slide(), so a swing's momentum is
## preserved. All hit / movement logic lives in _physics_process.
##
## No adaptive-AI / PlayerStats coupling exists any more: titans in spec 1 just
## chase via NavigationAgent3D. Strategy (genes) arrives in spec 3.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

const MOVE_SPEED: float = 8.0
const JUMP_VELOCITY: float = 9.0
const MOUSE_SENSITIVITY: float = 0.0025
## Multiplier on project default gravity (1.0 = raw project gravity).
const GRAVITY_MULTIPLIER: float = 1.0
## Camera pitch clamp (degrees): looking down / looking up.
const MIN_PITCH_DEG: float = -80.0
const MAX_PITCH_DEG: float = 70.0
## Additive air-steer acceleration (m/s^2) applied while swinging so the player
## can nudge a swing without overwriting the momentum the grapple built.
const AIR_CONTROL_ACCEL: float = 22.0

# Project default gravity (from ProjectSettings, e.g. 9.8 m/s^2).
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

## Ground-contact state last physics frame, so a false->true transition (was
## airborne, now grounded) fires the land sfx exactly once per landing.
var _was_on_floor: bool = true

# --- Node references. These names MUST match Player.tscn. ---
@onready var yaw_pivot: Node3D = $YawPivot
@onready var pitch_pivot: Node3D = $YawPivot/PitchPivot
@onready var camera: Camera3D = $YawPivot/PitchPivot/Camera3D


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# The player is discoverable by titans via this group.
	add_to_group("player")
	# Telemetry (spec 2): register so the recorder can sample player trajectory.
	if Telemetry != null:
		Telemetry.register_player(self)


func _unhandled_input(event: InputEvent) -> void:
	# Mouse-look: yaw rotates the whole rig, pitch only the pitch pivot.
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var motion := event as InputEventMouseMotion
		yaw_pivot.rotate_y(-motion.relative.x * MOUSE_SENSITIVITY)
		pitch_pivot.rotate_x(-motion.relative.y * MOUSE_SENSITIVITY)
		pitch_pivot.rotation.x = clampf(
			pitch_pivot.rotation.x,
			deg_to_rad(MIN_PITCH_DEG),
			deg_to_rad(MAX_PITCH_DEG)
		)

	# Esc releases the mouse; clicking again re-captures it.
	if event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and (event as InputEventMouseButton).pressed \
			and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
	_apply_gravity(delta)
	_handle_jump()
	_handle_movement()

	# Grapple adjusts velocity after normal movement, before move_and_slide().
	if has_node("Grapple"):
		($Grapple as Node).call("apply", self, delta)

	# Slash sweeps between last and current physics frame (ShapeCast3D).
	if has_node("Slash"):
		($Slash as Node).call("tick", self, delta)

	move_and_slide()

	# Audio (FEAT-002): a landing is a was-airborne -> now-grounded transition.
	# Checked AFTER move_and_slide so is_on_floor() reflects this frame's contact.
	var grounded: bool = is_on_floor()
	if grounded and not _was_on_floor and Sfx != null:
		Sfx.play(SfxBank.PLAYER_LAND)
	_was_on_floor = grounded


func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _gravity * GRAVITY_MULTIPLIER * delta


func _handle_jump() -> void:
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY
		# Audio (FEAT-002): jump sfx. Guarded so headless / autoload-less runs.
		if Sfx != null:
			Sfx.play(SfxBank.PLAYER_JUMP)


func _handle_movement() -> void:
	var input_dir: Vector2 = Input.get_vector(
		"move_left", "move_right", "move_forward", "move_back"
	)

	# Movement direction relative to the yaw pivot (camera yaw only), keeping
	# the character upright regardless of camera pitch.
	var basis: Basis = yaw_pivot.global_transform.basis
	var forward: Vector3 = -basis.z
	var right: Vector3 = basis.x
	# Input.get_vector returns input_dir.y = -1 for "move_forward" (W) and +1 for
	# "move_back" (S). Negating the forward component makes W drive along -basis.z
	# (forward) and S along +basis.z (back). Strafe (right * input_dir.x) is left
	# untouched so A/D remain correct.
	var direction: Vector3 = (right * input_dir.x + forward * -input_dir.y)
	direction.y = 0.0
	direction = direction.normalized()

	if _is_swinging():
		# While swinging, DO NOT overwrite horizontal velocity: that destroys
		# the momentum the grapple built. Apply a gentle additive nudge instead.
		if direction != Vector3.ZERO:
			var dt: float = get_physics_process_delta_time()
			velocity.x += direction.x * AIR_CONTROL_ACCEL * dt
			velocity.z += direction.z * AIR_CONTROL_ACCEL * dt
	elif direction != Vector3.ZERO:
		velocity.x = direction.x * MOVE_SPEED
		velocity.z = direction.z * MOVE_SPEED
	else:
		velocity.x = move_toward(velocity.x, 0.0, MOVE_SPEED)
		velocity.z = move_toward(velocity.z, 0.0, MOVE_SPEED)


## True while the grapple wire is attached. Guarded so the player runs fine
## even if the Grapple node is absent.
func _is_swinging() -> bool:
	return has_node("Grapple") and bool($Grapple.get("grappling"))
