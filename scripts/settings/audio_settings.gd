extends RefCounted
class_name AudioSettings
## Audio-settings state + AudioServer application, extracted from the Settings
## autoload so settings.gd stays under the 250-line cap and the audio maths
## lives in one reviewable place.
##
## Holds master volume, SFX volume (both linear 0..1) and a global mute, applies
## them to the AudioServer (Master + the dedicated "SFX" bus), and serialises
## to / from the persisted settings dict. All values are clamped on the way in
## so a corrupt persisted file can never push an out-of-range volume.
##
## Web-safe: pure state + AudioServer calls, no threads.

# =====================================================================
# CONSTANTS (no magic numbers below this block)
# =====================================================================
## Bus names. "SFX" is created at runtime (routed to Master) if the project's
## bus layout does not already define it.
const MASTER_BUS: String = "Master"
const SFX_BUS: String = "SFX"
## Defaults used on first run / corrupt file (full volume, unmuted).
const DEFAULT_MASTER: float = 1.0
const DEFAULT_SFX: float = 1.0
const DEFAULT_MUTE: bool = false
## Volume floor below which a bus is muted outright: linear_to_db(0) is -inf,
## which some drivers dislike, so treat anything <= this as silence.
const SILENCE_EPSILON: float = 0.0001

var master_volume: float = DEFAULT_MASTER
var sfx_volume: float = DEFAULT_SFX
var muted: bool = DEFAULT_MUTE


## Ensure a "SFX" bus exists (routed to Master) so volume/mute has a target.
## Idempotent - safe to call every _ready.
func ensure_sfx_bus() -> void:
	if AudioServer.get_bus_index(SFX_BUS) != -1:
		return
	var idx: int = AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, SFX_BUS)
	AudioServer.set_bus_send(idx, MASTER_BUS)


## Push the current state to the AudioServer. Applies the master volume + global
## mute to the Master bus and the SFX volume to the SFX bus.
func apply() -> void:
	ensure_sfx_bus()
	_apply_bus(MASTER_BUS, master_volume)
	_apply_bus(SFX_BUS, sfx_volume)
	# Global mute rides on the Master bus so it silences everything at once.
	var master_idx: int = AudioServer.get_bus_index(MASTER_BUS)
	if master_idx != -1:
		AudioServer.set_bus_mute(master_idx, muted)


func _apply_bus(bus_name: String, linear: float) -> void:
	var idx: int = AudioServer.get_bus_index(bus_name)
	if idx == -1:
		return
	if linear <= SILENCE_EPSILON:
		AudioServer.set_bus_mute(idx, true)
		return
	# A non-Master bus should not carry a stale mute from a previous 0 volume.
	if bus_name != MASTER_BUS:
		AudioServer.set_bus_mute(idx, false)
	AudioServer.set_bus_volume_db(idx, linear_to_db(clampf(linear, 0.0, 1.0)))


# =====================================================================
# SETTERS (clamp + store; the autoload re-applies + persists + emits)
# =====================================================================
func set_master(v: float) -> void:
	master_volume = clampf(v, 0.0, 1.0)


func set_sfx(v: float) -> void:
	sfx_volume = clampf(v, 0.0, 1.0)


func set_muted(m: bool) -> void:
	muted = m


# =====================================================================
# PERSISTENCE (plain dict fields merged into the settings JSON)
# =====================================================================
## Read audio fields out of a persisted settings dict, clamping to valid ranges.
## Missing keys keep the current (default) values, so an old locale-only file
## migrates without crashing.
func load_from(data: Dictionary) -> void:
	master_volume = clampf(float(data.get("master_volume", DEFAULT_MASTER)), 0.0, 1.0)
	sfx_volume = clampf(float(data.get("sfx_volume", DEFAULT_SFX)), 0.0, 1.0)
	muted = bool(data.get("muted", DEFAULT_MUTE))


## Write audio fields into the dict the autoload serialises to user://.
func store_into(data: Dictionary) -> void:
	data["master_volume"] = master_volume
	data["sfx_volume"] = sfx_volume
	data["muted"] = muted
