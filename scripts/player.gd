extends CharacterBody3D
## Third-person player controller for the Titan prototype.
##
## Handles camera-relative WASD movement, jump, gravity and a mouse-look
## camera rig. The grapple mechanic (FEAT-002) plugs into the marked hook
## region below without rewriting this file.

# --- Tunables (exposed for easy tweaking in the Inspector) ---
@export var move_speed: float = 8.0
@export var jump_velocity: float = 9.0
@export var mouse_sensitivity: float = 0.0025
## Extra downward acceleration on top of the project default gravity so the
## player feels responsive. Leave at 1.0 to use raw project gravity.
@export var gravity_multiplier: float = 1.0
## Min/max camera pitch in degrees (looking down / looking up).
@export var min_pitch_deg: float = -80.0
@export var max_pitch_deg: float = 70.0

# Project default gravity (from ProjectSettings, e.g. 9.8 m/s^2).
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# --- Camera rig node references ---
# These names MUST match the node tree in Player.tscn.
@onready var yaw_pivot: Node3D = $YawPivot
@onready var pitch_pivot: Node3D = $YawPivot/PitchPivot
@onready var camera: Camera3D = $YawPivot/PitchPivot/Camera3D


func _ready() -> void:
	# Capture the mouse for first/third-person style mouse-look.
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	# Mouse-look: yaw rotates the whole rig, pitch only the pitch pivot.
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw_pivot.rotate_y(-event.relative.x * mouse_sensitivity)
		pitch_pivot.rotate_x(-event.relative.y * mouse_sensitivity)
		# Clamp pitch so the camera cannot flip over.
		pitch_pivot.rotation.x = clampf(
			pitch_pivot.rotation.x,
			deg_to_rad(min_pitch_deg),
			deg_to_rad(max_pitch_deg)
		)

	# Esc releases the mouse; click again (grapple button) re-captures it.
	if event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed \
			and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
	_apply_gravity(delta)
	_handle_jump()
	_handle_movement()

	# ==========================================================
	# GRAPPLE HOOK (FEAT-002): the ODM-gear wire mechanic plugs
	# in here. It should read/adjust `velocity` AFTER normal
	# movement is computed but BEFORE move_and_slide() below.
	# Intended integration: attach a Grapple node/script as a
	# child and call something like `_grapple.apply(self, delta)`
	# guarded by `if has_node("Grapple"):`.
	# ==========================================================
	_process_grapple(delta)

	move_and_slide()


func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _gravity * gravity_multiplier * delta


func _handle_jump() -> void:
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = jump_velocity


func _handle_movement() -> void:
	# Read the 2D input vector (x = strafe, y = forward/back).
	var input_dir: Vector2 = Input.get_vector(
		"move_left", "move_right", "move_forward", "move_back"
	)

	# Build a movement direction relative to where the camera rig faces.
	# We use the yaw pivot's basis so movement follows the camera yaw only,
	# keeping the character upright regardless of camera pitch.
	var basis: Basis = yaw_pivot.global_transform.basis
	var forward: Vector3 = -basis.z
	var right: Vector3 = basis.x
	var direction: Vector3 = (right * input_dir.x + forward * input_dir.y)
	direction.y = 0.0
	direction = direction.normalized()

	if direction != Vector3.ZERO:
		velocity.x = direction.x * move_speed
		velocity.z = direction.z * move_speed
	else:
		# Smoothly stop horizontal motion when there is no input.
		velocity.x = move_toward(velocity.x, 0.0, move_speed)
		velocity.z = move_toward(velocity.z, 0.0, move_speed)


## Grapple extension point. Empty for FEAT-001; FEAT-002 fills this in
## (or replaces it with a dedicated Grapple child node). Kept as a real
## method so the call site in _physics_process stays stable.
func _process_grapple(_delta: float) -> void:
	pass
