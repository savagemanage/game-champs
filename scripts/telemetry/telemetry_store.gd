extends RefCounted
class_name TelemetryStore
## Persistence for the Telemetry autoload (steering section 2).
##
## user:// + FileAccess + JSON ONLY. A save failure MUST NOT crash: FileAccess
## null returns are guarded, we push_warning and continue. A missing file loads
## as clean state; a corrupt file warns and loads as clean state.
##
## Kept separate from telemetry.gd so the scene-facing recorder and the raw
## file I/O each stay small and independently reviewable.

## Where the telemetry snapshot is written. user:// survives per browser origin;
## may be wiped in private mode - saving must never be treated as fatal.
const SAVE_PATH: String = "user://wirework_telemetry.json"
## Schema version, so a future change can migrate instead of crashing.
const SCHEMA_VERSION: int = 1


## Serialise the full telemetry state to user://. Never raises on failure.
static func save(rounds_played: int, player_model: PlayerModel, ring: Array,
		last_summary: Dictionary) -> void:
	var data: Dictionary = {
		"version": SCHEMA_VERSION,
		"rounds_played": rounds_played,
		"player_model": {
			"bins": player_model.to_array(),
			"decay": PlayerModel.DECAY,
		},
		"ring": _ring_to_array(ring),
		"last_summary": _summary_to_serialisable(last_summary),
	}
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("Telemetry: could not open %s for writing (err %d); skipping save."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return
	file.store_string(JSON.stringify(data))
	file.close()


## Load persisted state into the given player_model, returning rounds_played.
## Missing or corrupt files start clean (return 0) without crashing.
static func load_into(player_model: PlayerModel) -> int:
	if not FileAccess.file_exists(SAVE_PATH):
		return 0  # First run: normal, start clean.
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		push_warning("Telemetry: could not open %s for reading; starting clean." % SAVE_PATH)
		return 0
	var text: String = file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Telemetry: %s is corrupt or not a JSON object; starting clean." % SAVE_PATH)
		return 0
	var data: Dictionary = parsed
	var pm: Dictionary = data.get("player_model", {})
	if pm.has("bins") and typeof(pm["bins"]) == TYPE_ARRAY:
		player_model.from_array(pm["bins"])
	return int(data.get("rounds_played", 0))


static func _ring_to_array(ring: Array) -> Array:
	var out: Array = []
	for round_windows in ring:
		var round_out: Array = []
		for w in (round_windows as Array):
			round_out.append((w as EngagementWindow).to_dict())
		out.append(round_out)
	return out


## Convert a summary dict into JSON-safe values (int-keyed dicts -> string keys).
static func _summary_to_serialisable(summary: Dictionary) -> Dictionary:
	if summary.is_empty():
		return {}
	var out: Dictionary = summary.duplicate(true)
	if out.has("exposure_per_titan"):
		var exposures: Dictionary = out["exposure_per_titan"]
		var string_keyed: Dictionary = {}
		for id in exposures:
			string_keyed[str(id)] = exposures[id]
		out["exposure_per_titan"] = string_keyed
	return out
