extends Node
## Settings autoload (global `Settings`). Owns the current UI locale for the
## Korean/English localization (FEAT-001) AND the audio settings (FEAT-002:
## master volume, SFX volume, mute), persisting both to user:// as one JSON dict.
##
## Persistence mirrors scripts/telemetry/telemetry_store.gd EXACTLY: every
## FileAccess.open is null-checked, a failure pushes a warning and continues, and
## a missing or corrupt file loads clean defaults. Saving is NEVER fatal - in a
## web export user:// can be wiped (incognito), so a save failure must not crash.
##
## On startup (_ready) it loads the persisted locale + audio, applies the locale
## via TranslationServer.set_locale (so all tr(KEY) text renders in the right
## language from the first frame) and applies the audio to the AudioServer.
## set_locale() re-applies + persists + emits locale_changed; the audio setters
## mirror it (apply + save + emit audio_changed) so visible controls stay live.
##
## The audio maths / AudioServer wiring lives in AudioSettings (a sibling helper)
## so this file stays under the 250-line cap. SCHEMA_VERSION was bumped to 2 when
## the audio fields were added; a v1 (locale-only) file migrates without crashing
## because the audio loader keeps its defaults for any missing key.

# =====================================================================
# TUNING / KEY CONSTANTS (no magic strings below this block)
# =====================================================================

## Where the settings snapshot is written. user:// survives per browser origin;
## may be wiped in private mode - saving must never be treated as fatal.
const SAVE_PATH: String = "user://wirework_settings.json"
## Schema version. Bumped to 2 when audio settings were added (v1 = locale only).
const SCHEMA_VERSION: int = 2
## Locale used when nothing is persisted or the file is missing/corrupt.
const DEFAULT_LOCALE: String = "en"
## The locales this build ships translations for (locale/ui.csv columns).
const SUPPORTED_LOCALES: Array[String] = ["en", "ko"]

## Emitted whenever the locale actually changes so UI can re-apply tr() text.
signal locale_changed(locale: String)
## Emitted whenever an audio setting changes so UI controls can re-sync.
signal audio_changed

# --- STATE ---
var _locale: String = DEFAULT_LOCALE
## Audio state + AudioServer application, kept in a helper so this file stays
## small. Values persist alongside the locale in the same JSON dict.
var _audio: AudioSettings = AudioSettings.new()


func _ready() -> void:
	load_state()
	# Apply the persisted locale so text is localized from the first frame.
	TranslationServer.set_locale(_locale)
	# Apply the persisted audio to the AudioServer buses at startup.
	_audio.apply()


## Current UI locale (one of SUPPORTED_LOCALES).
func get_locale() -> String:
	return _locale


## Switch the UI locale. Ignores unsupported locales. Applies it to the
## TranslationServer, persists it, and emits locale_changed so visible labels
## can re-render live. A no-op change still applies but skips re-emitting.
func set_locale(locale: String) -> void:
	if not SUPPORTED_LOCALES.has(locale):
		push_warning("Settings: unsupported locale '%s'; ignoring." % locale)
		return
	if locale == _locale:
		TranslationServer.set_locale(_locale)
		return
	_locale = locale
	TranslationServer.set_locale(_locale)
	save_state()
	locale_changed.emit(_locale)


# =====================================================================
# AUDIO (getters/setters mirror set_locale: apply + persist + emit)
# =====================================================================

## Current master volume (linear 0..1).
func get_master_volume() -> float:
	return _audio.master_volume


## Current SFX volume (linear 0..1).
func get_sfx_volume() -> float:
	return _audio.sfx_volume


## Whether all audio is muted.
func is_muted() -> bool:
	return _audio.muted


## Set the master volume (linear 0..1), apply to the AudioServer, persist and
## emit audio_changed so visible controls re-sync.
func set_master_volume(v: float) -> void:
	_audio.set_master(v)
	_apply_and_persist_audio()


## Set the SFX volume (linear 0..1); apply + persist + emit.
func set_sfx_volume(v: float) -> void:
	_audio.set_sfx(v)
	_apply_and_persist_audio()


## Set the global mute; apply + persist + emit.
func set_muted(m: bool) -> void:
	_audio.set_muted(m)
	_apply_and_persist_audio()


func _apply_and_persist_audio() -> void:
	_audio.apply()
	save_state()
	audio_changed.emit()


# =====================================================================
# PERSISTENCE (mirrors telemetry_store.gd guards; never fatal)
# =====================================================================

## Read the persisted locale from user://. Missing/corrupt/failed = default,
## never crashes.
func load_state() -> void:
	_locale = DEFAULT_LOCALE
	if not FileAccess.file_exists(SAVE_PATH):
		return  # First run: normal, start with the defaults.
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		push_warning("Settings: could not open %s for reading; using defaults." % SAVE_PATH)
		return
	var text: String = file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Settings: %s is corrupt or not a JSON object; using defaults." % SAVE_PATH)
		return
	var data: Dictionary = parsed
	var loaded: String = str(data.get("locale", DEFAULT_LOCALE))
	if SUPPORTED_LOCALES.has(loaded):
		_locale = loaded
	else:
		push_warning("Settings: persisted locale '%s' unsupported; using default." % loaded)
	# Audio fields (added in SCHEMA_VERSION 2). A v1 locale-only file has none of
	# these keys, so the loader keeps the audio defaults - migration, no crash.
	_audio.load_from(data)


## Serialise the settings state to user://. Never raises on failure.
func save_state() -> void:
	var data: Dictionary = {
		"version": SCHEMA_VERSION,
		"locale": _locale,
	}
	_audio.store_into(data)  # merge master_volume / sfx_volume / muted
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("Settings: could not open %s for writing (err %d); skipping save."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return
	file.store_string(JSON.stringify(data))
	file.close()
