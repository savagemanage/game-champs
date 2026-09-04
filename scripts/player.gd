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
## How strongly WASD steers the player while airborne / grappling. This is an
## additive nudge (m/s^2) rather than an overwrite, so it can be used to steer a
## swing without killing the momentum the grapple built up.
@export var air_control_accel: float = 22.0

## How long (seconds) the slash hitbox stays active after a slash input. The
## hitbox is an Area3D in front of the player; while it overlaps a titan's nape
## the titan dies. Kept short so it reads as a quick swipe.
@export var slash_active_time: float = 0.15

# Project default gravity (from ProjectSettings, e.g. 9.8 m/s^2).
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# --- Camera rig node references ---
# These names MUST match the node tree in Player.tscn.
@onready var yaw_pivot: Node3D = $YawPivot
@onready var pitch_pivot: Node3D = $YawPivot/PitchPivot
@onready var camera: Camera3D = $YawPivot/PitchPivot/Camera3D
## Slash kill zone - an Area3D in front of the player, disabled except during a
## slash. Its collision mask includes the nape layer so it can strike a titan.
@onready var slash_hitbox: Area3D = $YawPivot/SlashHitbox

# Countdown while the slash hitbox is active; <= 0 means the slash is off.
var _slash_timer: float = 0.0


func _ready() -> void:
	# Capture the mouse for first/third-person style mouse-look.
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# The player is discoverable by the titan via this group.
	add_to_group("player")
	# Slash starts disabled; enabled in short bursts by _handle_slash().
	if slash_hitbox != null:
		slash_hitbox.monitoring = false
		slash_hitbox.visible = false
		slash_hitbox.area_entered.connect(_on_slash_area_entered)


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

	_handle_slash(delta)

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

	if _is_swinging():
		# While grappling, DO NOT overwrite horizontal velocity - that would
		# destroy the swing momentum the grapple built up. Instead apply a
		# gentle additive nudge so the player can still steer the swing.
		if direction != Vector3.ZERO:
			velocity.x += direction.x * air_control_accel * get_physics_process_delta_time()
			velocity.z += direction.z * air_control_accel * get_physics_process_delta_time()
	elif direction != Vector3.ZERO:
		velocity.x = direction.x * move_speed
		velocity.z = direction.z * move_speed
	else:
		# Smoothly stop horizontal motion when there is no input.
		velocity.x = move_toward(velocity.x, 0.0, move_speed)
		velocity.z = move_toward(velocity.z, 0.0, move_speed)


## True while the grapple wire is attached. Guarded so the player runs fine
## even if the Grapple node is absent.
func _is_swinging() -> bool:
	return has_node("Grapple") and $Grapple.grappling


## Slash attack. On the `slash` input the front hitbox is switched on for a
## brief window; while it overlaps a titan's nape the titan dies. The hitbox is
## an Area3D on the slash layer (5) masking the nape layer (4). We also record
## the swing direction into PlayerStats so the titan can learn which side the
## player attacks from.
func _handle_slash(delta: float) -> void:
	if slash_hitbox == null:
		return

	if Input.is_action_just_pressed("slash") and _slash_timer <= 0.0:
		_slash_timer = slash_active_time
		slash_hitbox.monitoring = true
		slash_hitbox.visible = true
		_record_slash_side()

	if _slash_timer > 0.0:
		_slash_timer -= delta
		if _slash_timer <= 0.0:
			slash_hitbox.monitoring = false
			slash_hitbox.visible = false


## When the slash hitbox overlaps a titan's nape Area3D, kill the titan. The
## nape's own script also watches for this, but calling die() here makes the
## kill immediate and order-independent.
func _on_slash_area_entered(area: Area3D) -> void:
	var titan := area.get_parent()
	if titan != null and titan.has_method("die"):
		titan.die()


## Log which way the player was swinging (relative to camera yaw) so PlayerStats
## can bias the next titan toward guarding that side. Uses current strafe input
## as a cheap proxy for the attack side.
func _record_slash_side() -> void:
	var stats := get_node_or_null("/root/PlayerStats")
	if stats == null or not stats.has_method("record_dodge"):
		return
	var strafe: float = Input.get_axis("move_left", "move_right")
	if not is_zero_approx(strafe):
		stats.record_dodge(strafe)


## Grapple extension point. FEAT-002 attaches a dedicated `Grapple` child
## node (scripts/grapple.gd) that owns the whole wire mechanic. We simply
## forward the physics tick to it, guarded so the player still runs fine if
## the node is ever removed.
func _process_grapple(delta: float) -> void:
	if has_node("Grapple"):
		$Grapple.apply(self, delta)
