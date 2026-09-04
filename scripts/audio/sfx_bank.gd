extends RefCounted
class_name SfxBank
## Central registry of the game's sound-effect streams, kept as a pure data
## helper so playback nodes (2D UI + 3D world) can look a clip up by a stable
## string key without hard-coding res:// paths at each call site.
##
## Every clip is a committed resource under res://assets/audio/. Ten are
## procedurally-generated 16-bit PCM AudioStreamWAV *.tres (need NO editor
## .import); the UI click is a real CC0 Kenney OGG (see assets/CREDITS.md).
##
## No threads / no runtime synthesis here: streams are static resources loaded
## once, matching the single-thread / web-safe constraint.

# =====================================================================
# CLIP KEYS (stable identifiers used by every trigger site)
# =====================================================================
const GRAPPLE_FIRE: String = "grapple_fire"
const GRAPPLE_ATTACH: String = "grapple_attach"
const SWING_WHOOSH: String = "swing_whoosh"
const SLASH_SWING: String = "slash_swing"
const SLASH_SUB: String = "slash_sub"
const SLASH_KILL: String = "slash_kill"
const TITAN_FOOTSTEP: String = "titan_footstep"
const TITAN_AGGRO: String = "titan_aggro"
const TITAN_DEATH: String = "titan_death"
const PLAYER_JUMP: String = "player_jump"
const PLAYER_LAND: String = "player_land"
const UI_CLICK: String = "ui_click"

## Key -> resource path. The UI click is the license-verified CC0 OGG download;
## the rest are the committed procedural WAV .tres resources.
const PATHS: Dictionary = {
	GRAPPLE_FIRE: "res://assets/audio/sfx_grapple_fire.tres",
	GRAPPLE_ATTACH: "res://assets/audio/sfx_grapple_attach.tres",
	SWING_WHOOSH: "res://assets/audio/sfx_swing_whoosh.tres",
	SLASH_SWING: "res://assets/audio/sfx_slash_swing.tres",
	SLASH_SUB: "res://assets/audio/sfx_slash_sub.tres",
	SLASH_KILL: "res://assets/audio/sfx_slash_kill.tres",
	TITAN_FOOTSTEP: "res://assets/audio/sfx_titan_footstep.tres",
	TITAN_AGGRO: "res://assets/audio/sfx_titan_aggro.tres",
	TITAN_DEATH: "res://assets/audio/sfx_titan_death.tres",
	PLAYER_JUMP: "res://assets/audio/sfx_player_jump.tres",
	PLAYER_LAND: "res://assets/audio/sfx_player_land.tres",
	UI_CLICK: "res://assets/audio/ui_click.ogg",
}

# Cache so a clip is loaded from disk at most once.
static var _cache: Dictionary = {}


## Return the AudioStream for a key, loading + caching on first use. Missing or
## unloadable clips return null (callers guard, so a bad clip is never fatal).
static func get_stream(key: String) -> AudioStream:
	if _cache.has(key):
		return _cache[key]
	if not PATHS.has(key):
		push_warning("SfxBank: unknown clip key '%s'." % key)
		return null
	var path: String = PATHS[key]
	if not ResourceLoader.exists(path):
		push_warning("SfxBank: clip '%s' missing at %s." % [key, path])
		_cache[key] = null
		return null
	var stream: AudioStream = load(path) as AudioStream
	_cache[key] = stream
	return stream
