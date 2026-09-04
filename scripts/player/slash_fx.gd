extends Node3D
## Procedural combat feedback for the slash, kept separate so slash.gd stays
## under the 250-line cap and its damage/sweep logic stays uncluttered.
##
## Responsibilities (presentation ONLY - no damage / telemetry / evolution
## logic here):
##   * play_swing(): a short blade-pivot tween so the visible weapon swings.
##   * play_hit(world_pos, killed): a one-shot particle burst at the nape, a
##     crosshair flash, and (kill only) a brief decaying camera shake.
##
## PARTICLES: CPUParticles3D (not GPUParticles3D) - the reliable choice on
## gl_compatibility (GLES3/WebGL2); GPU compute passes are flaky on web drivers
## and this is a tiny one-shot burst (steering: no premature optimization).
## Web-safe: no Thread/Mutex/Semaphore/WorkerThreadPool, no SubViewport.
##
## PARTICLE TEXTURE (FEAT-003): a CC0 spark sprite (Kenney, assets/particles/
## spark.png) becomes the burst quad's additive billboard albedo when imported;
## loaded defensively so an unimported run keeps the plain FEAT-001 procedural
## quad. See assets/CREDITS.md.

# --- TUNING CONSTANTS (no magic numbers below this block) ---

## CC0 spark particle sprite (Kenney Particle Pack, credited in CREDITS.md).
const SPARK_TEXTURE_PATH: String = "res://assets/particles/spark.png"

# --- Blade swing tween ---
## Duration of a single slash swing animation (seconds).
const SWING_DURATION: float = 0.15
## Blade pivot rotation (radians) swept across the swing, from start to end.
const SWING_START_DEG: Vector3 = Vector3(-10.0, 35.0, 55.0)
const SWING_END_DEG: Vector3 = Vector3(-10.0, -40.0, -40.0)
## Neutral resting rotation the blade returns to between swings (radians source).
const SWING_REST_DEG: Vector3 = Vector3(0.0, 0.0, 15.0)

# --- Hit particle burst (counts, burst speed m/s, lifetime s, quad size m) ---
const KILL_PARTICLES: int = 48
const SUB_PARTICLES: int = 18
const KILL_BURST_SPEED: float = 14.0
const SUB_BURST_SPEED: float = 7.0
const BURST_LIFETIME: float = 0.6
const KILL_PARTICLE_SIZE: float = 0.7
const SUB_PARTICLE_SIZE: float = 0.35
## Burst colours.
const KILL_COLOR: Color = Color(0.35, 1.0, 0.45, 1.0)
const SUB_COLOR: Color = Color(1.0, 0.75, 0.25, 1.0)
## Seconds a spawned burst node stays alive before freeing itself.
const BURST_FREE_DELAY: float = 1.4

# --- Camera shake (kill only) ---
## Total shake duration (seconds).
const SHAKE_DURATION: float = 0.25
## Peak positional shake magnitude (metres) at the start of the shake.
const SHAKE_MAGNITUDE: float = 0.18
## Shake oscillation frequency (Hz-ish; higher = more jittery).
const SHAKE_FREQUENCY: float = 38.0

# --- Crosshair flash ---
## Flash duration (seconds) for each tier.
const CROSSHAIR_FLASH_DURATION: float = 0.22
## Crosshair colours during a flash.
const CROSSHAIR_KILL_COLOR: Color = Color(0.3, 1.0, 0.4, 1.0)
const CROSSHAIR_SUB_COLOR: Color = Color(1.0, 0.7, 0.2, 1.0)
## Base crosshair colour restored after a flash.
const CROSSHAIR_BASE_COLOR: Color = Color(1.0, 1.0, 1.0, 0.85)
## Font-size the crosshair scales up to on a hit, per tier.
const CROSSHAIR_BASE_SIZE: int = 28
const CROSSHAIR_KILL_SIZE: int = 52
const CROSSHAIR_SUB_SIZE: int = 38

# --- STATE ---

## Node paths on the Player (set in Player.tscn) so this helper can find the
## blade pivot, the pitch pivot (for shake) and the crosshair label.
@export var blade_pivot_path: NodePath = NodePath("../YawPivot/PitchPivot/Camera3D/BladePivot")
@export var shake_pivot_path: NodePath = NodePath("../YawPivot/PitchPivot")
@export var crosshair_path: NodePath = NodePath("../Grapple/CrosshairLayer/Crosshair")

var _blade_pivot: Node3D
var _shake_pivot: Node3D
var _crosshair: Label

var _swing_tween: Tween
var _crosshair_tween: Tween

## Cached CC0 spark sprite (null if not imported yet; burst then stays plain).
var _spark_texture: Texture2D

# Camera shake bookkeeping. The shake offsets _shake_pivot.position around its
# neutral rest position and always restores it, so mouse-look (which only
# rotates the pivots) is never corrupted.
var _shake_rest: Vector3 = Vector3.ZERO
var _shake_time: float = 0.0
var _shaking: bool = false


func _ready() -> void:
	_blade_pivot = get_node_or_null(blade_pivot_path) as Node3D
	_shake_pivot = get_node_or_null(shake_pivot_path) as Node3D
	_crosshair = get_node_or_null(crosshair_path) as Label

	if _blade_pivot != null:
		_blade_pivot.rotation = _deg_to_rad_v(SWING_REST_DEG)
	if _shake_pivot != null:
		_shake_rest = _shake_pivot.position

	# Load the CC0 spark sprite defensively: unimported (no editor open) means
	# exists() is false and we keep the plain procedural quad, never erroring.
	if ResourceLoader.exists(SPARK_TEXTURE_PATH):
		_spark_texture = load(SPARK_TEXTURE_PATH) as Texture2D


func _process(delta: float) -> void:
	if not _shaking or _shake_pivot == null:
		return
	_shake_time -= delta
	if _shake_time <= 0.0:
		_shaking = false
		_shake_pivot.position = _shake_rest
		return
	# Decaying jitter: amplitude falls linearly to zero, direction oscillates.
	var falloff: float = _shake_time / SHAKE_DURATION
	var amp: float = SHAKE_MAGNITUDE * falloff
	var phase: float = (SHAKE_DURATION - _shake_time) * SHAKE_FREQUENCY
	var offset := Vector3(sin(phase * 1.7), cos(phase * 2.3), 0.0) * amp
	_shake_pivot.position = _shake_rest + offset


# --- PUBLIC API (called by slash.gd) ---

## Play a brief blade swing on the visible weapon.
func play_swing() -> void:
	# Audio (FEAT-002): the swing whoosh. Routed through this FX helper because
	# slash.gd is at the 250-line cap and must not grow. Guarded for headless.
	if Sfx != null:
		Sfx.play(SfxBank.SLASH_SWING)
	if _blade_pivot == null:
		return
	if _swing_tween != null and _swing_tween.is_valid():
		_swing_tween.kill()
	_blade_pivot.rotation = _deg_to_rad_v(SWING_START_DEG)
	_swing_tween = create_tween()
	_swing_tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_swing_tween.tween_property(
		_blade_pivot, "rotation", _deg_to_rad_v(SWING_END_DEG), SWING_DURATION
	)
	_swing_tween.tween_property(
		_blade_pivot, "rotation", _deg_to_rad_v(SWING_REST_DEG), SWING_DURATION * 1.5
	)


## Play the on-hit feedback: burst at world_pos, crosshair flash, and (kill
## only) a camera shake.
func play_hit(world_pos: Vector3, killed: bool) -> void:
	# Audio (FEAT-002): distinct sub-threshold vs kill hit sfx at the nape (3D).
	# Routed here so slash.gd stays under its line cap. The titan also plays its
	# own death boom (titan.gd); this is the blade-impact "ting"/chime.
	if Sfx != null:
		Sfx.play_at(SfxBank.SLASH_KILL if killed else SfxBank.SLASH_SUB, world_pos)
	_spawn_burst(world_pos, killed)
	_flash_crosshair(killed)
	if killed:
		_start_shake()


# --- INTERNAL ---

func _spawn_burst(world_pos: Vector3, killed: bool) -> void:
	var burst := CPUParticles3D.new()
	burst.emitting = false
	burst.one_shot = true
	burst.amount = KILL_PARTICLES if killed else SUB_PARTICLES
	burst.lifetime = BURST_LIFETIME
	burst.explosiveness = 1.0
	burst.direction = Vector3.UP
	burst.spread = 180.0
	var speed: float = KILL_BURST_SPEED if killed else SUB_BURST_SPEED
	burst.initial_velocity_min = speed * 0.4
	burst.initial_velocity_max = speed
	burst.gravity = Vector3(0.0, -9.8, 0.0)
	burst.scale_amount_min = KILL_PARTICLE_SIZE if killed else SUB_PARTICLE_SIZE
	burst.scale_amount_max = KILL_PARTICLE_SIZE if killed else SUB_PARTICLE_SIZE
	burst.color = KILL_COLOR if killed else SUB_COLOR

	# Procedural quad draw pass with an unshaded, additive, billboard material so
	# the burst renders reliably on gl_compatibility (no external texture).
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.vertex_color_use_as_albedo = true
	mat.albedo_color = KILL_COLOR if killed else SUB_COLOR
	# Wire the CC0 spark sprite when available; else stay a plain additive quad
	# (FEAT-001 look). Tint still comes from the per-particle vertex colour.
	if _spark_texture != null:
		mat.albedo_texture = _spark_texture
	quad.material = mat
	burst.mesh = quad

	# Parent to the scene root (top-level world space) at the hit position.
	var host: Node = get_tree().current_scene
	if host == null:
		host = self
	host.add_child(burst)
	burst.global_position = world_pos
	burst.emitting = true

	# Free the one-shot burst after it finishes emitting + fading.
	var t := burst.get_tree().create_timer(BURST_FREE_DELAY)
	t.timeout.connect(burst.queue_free)


func _flash_crosshair(killed: bool) -> void:
	if _crosshair == null:
		return
	if _crosshair_tween != null and _crosshair_tween.is_valid():
		_crosshair_tween.kill()
	var flash_color: Color = CROSSHAIR_KILL_COLOR if killed else CROSSHAIR_SUB_COLOR
	var flash_size: int = CROSSHAIR_KILL_SIZE if killed else CROSSHAIR_SUB_SIZE
	var settings: LabelSettings = _crosshair.label_settings
	if settings == null:
		return
	settings.font_color = flash_color
	settings.font_size = flash_size
	_crosshair_tween = create_tween()
	_crosshair_tween.tween_interval(CROSSHAIR_FLASH_DURATION)
	_crosshair_tween.tween_callback(_reset_crosshair)


func _reset_crosshair() -> void:
	if _crosshair == null or _crosshair.label_settings == null:
		return
	_crosshair.label_settings.font_color = CROSSHAIR_BASE_COLOR
	_crosshair.label_settings.font_size = CROSSHAIR_BASE_SIZE


func _start_shake() -> void:
	if _shake_pivot == null:
		return
	# Re-capture rest in case something moved the pivot; shake always restores.
	if not _shaking:
		_shake_rest = _shake_pivot.position
	_shake_time = SHAKE_DURATION
	_shaking = true


func _deg_to_rad_v(deg: Vector3) -> Vector3:
	return Vector3(deg_to_rad(deg.x), deg_to_rad(deg.y), deg_to_rad(deg.z))
