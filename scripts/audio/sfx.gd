extends Node
## `Sfx` autoload: the single entry point every trigger site uses to play a
## sound effect. Keeps the call sites one-liners (e.g. Sfx.play("player_jump"))
## and owns a tiny pool of non-positional players plus spawns short-lived 3D
## players for world sounds.
##
## All sound routes to the dedicated "SFX" audio bus (created by the Settings
## autoload / this node) so the master + SFX volume + mute controls apply
## uniformly. Web-safe: no threads, one-shot players free themselves on finish.

# =====================================================================
# CONSTANTS (no magic numbers below this block)
# =====================================================================
## Name of the dedicated SFX bus every player routes to.
const SFX_BUS: String = "SFX"
## Size of the round-robin pool of non-positional (UI / 2D) one-shot players.
const POOL_SIZE: int = 8
## 3D one-shot spatialisation: audible radius and rolloff distance (metres).
const WORLD_UNIT_SIZE: float = 8.0
const WORLD_MAX_DISTANCE: float = 120.0
## Seconds after which a spawned 3D one-shot frees itself as a safety net (in
## case `finished` never fires, e.g. if the tree is torn down mid-play).
const ONESHOT_MAX_LIFETIME: float = 4.0

var _pool: Array[AudioStreamPlayer] = []
var _next: int = 0


func _ready() -> void:
	# Ensure the SFX bus exists before any player references it. Settings also
	# guarantees this on startup; doing it here too makes Sfx self-sufficient.
	_ensure_sfx_bus()
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = SFX_BUS
		add_child(p)
		_pool.append(p)


## Create a "SFX" bus routed to Master if the project's bus layout lacks one.
## Idempotent: does nothing when the bus already exists.
func _ensure_sfx_bus() -> void:
	if AudioServer.get_bus_index(SFX_BUS) != -1:
		return
	var idx: int = AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, SFX_BUS)
	AudioServer.set_bus_send(idx, "Master")


## Play a non-positional (UI / 2D) one-shot from the pool. Safe to call before
## _ready populates the pool (falls back to a temporary player).
func play(key: String) -> void:
	var stream: AudioStream = SfxBank.get_stream(key)
	if stream == null:
		return
	if _pool.is_empty():
		_play_temp(stream)
		return
	var p: AudioStreamPlayer = _pool[_next]
	_next = (_next + 1) % _pool.size()
	p.stream = stream
	p.play()


## Play a positional one-shot at a world position (titan footsteps/death, slash
## hit at the nape). Spawns a short-lived AudioStreamPlayer3D on the SFX bus.
func play_at(key: String, world_pos: Vector3) -> void:
	var stream: AudioStream = SfxBank.get_stream(key)
	if stream == null:
		return
	var host: Node = get_tree().current_scene
	if host == null:
		play(key)  # no world to place it in; fall back to a 2D one-shot
		return
	var p := AudioStreamPlayer3D.new()
	p.bus = SFX_BUS
	p.stream = stream
	p.unit_size = WORLD_UNIT_SIZE
	p.max_distance = WORLD_MAX_DISTANCE
	host.add_child(p)
	p.global_position = world_pos
	p.finished.connect(p.queue_free)
	p.play()
	# Safety net so a torn-down tree cannot leak the node.
	get_tree().create_timer(ONESHOT_MAX_LIFETIME).timeout.connect(
		func() -> void:
			if is_instance_valid(p):
				p.queue_free()
	)


func _play_temp(stream: AudioStream) -> void:
	var p := AudioStreamPlayer.new()
	p.bus = SFX_BUS
	p.stream = stream
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()
