extends Node
## Settings autoload (global `Settings`). Owns the current UI locale for the
## Korean/English localization (FEAT-001) and persists it to user:// as JSON.
##
## Persistence mirrors scripts/telemetry/telemetry_store.gd EXACTLY: every
## FileAccess.open is null-checked, a failure pushes a warning and continues, and
## a missing or corrupt file loads clean defaults. Saving is NEVER fatal - in a
## web export user:// can be wiped (incognito), so a save failure must not crash.
##
## On startup (_ready) it loads the persisted locale and applies it via
## TranslationServer.set_locale so all tr(KEY) text renders in the right language
## from the first frame. set_locale() re-applies + persists + emits
## locale_changed so already-visible labels can re-render live.

# =====================================================================
# TUNING / KEY CONSTANTS (no magic strings below this block)
# =====================================================================

## Where the settings snapshot is written. user:// survives per browser origin;
## may be wiped in private mode - saving must never be treated as fatal.
const SAVE_PATH: String = "user://wirework_settings.json"
## Schema version, so a future change can migrate instead of crashing.
const SCHEMA_VERSION: int = 1
## Locale used when nothing is persisted or the file is missing/corrupt.
const DEFAULT_LOCALE: String = "en"
## The locales this build ships translations for (locale/ui.csv columns).
const SUPPORTED_LOCALES: Array[String] = ["en", "ko"]

## Emitted whenever the locale actually changes so UI can re-apply tr() text.
signal locale_changed(locale: String)

# --- STATE ---
var _locale: String = DEFAULT_LOCALE


func _ready() -> void:
	load_state()
	# Apply the persisted locale so text is localized from the first frame.
	TranslationServer.set_locale(_locale)


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
# PERSISTENCE (mirrors telemetry_store.gd guards; never fatal)
# =====================================================================

## Read the persisted locale from user://. Missing/corrupt/failed = default,
## never crashes.
func load_state() -> void:
	_locale = DEFAULT_LOCALE
	if not FileAccess.file_exists(SAVE_PATH):
		return  # First run: normal, start with the default locale.
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		push_warning("Settings: could not open %s for reading; using default locale." % SAVE_PATH)
		return
	var text: String = file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Settings: %s is corrupt or not a JSON object; using default locale." % SAVE_PATH)
		return
	var data: Dictionary = parsed
	var loaded: String = str(data.get("locale", DEFAULT_LOCALE))
	if SUPPORTED_LOCALES.has(loaded):
		_locale = loaded
	else:
		push_warning("Settings: persisted locale '%s' unsupported; using default." % loaded)


## Serialise the settings state to user://. Never raises on failure.
func save_state() -> void:
	var data: Dictionary = {
		"version": SCHEMA_VERSION,
		"locale": _locale,
	}
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("Settings: could not open %s for writing (err %d); skipping save."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return
	file.store_string(JSON.stringify(data))
	file.close()
