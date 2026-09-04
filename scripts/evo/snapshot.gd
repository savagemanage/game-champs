extends RefCounted
class_name EvoSnapshot
## Read / write the evolution snapshot user://wirework_evo.json, EXACTLY per the
## schema in steering 3.11:
##
##   {
##     "version": 1,
##     "generation": 0,
##     "gene_names": ["navFollow","interceptLead","flankBias","napeYaw","separation","encircle"],
##     "baseline": [2.0, 0.0, 0.0, 0.0, 1.0, 0.0],
##     "best": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
##     "history": [{ "gen": 0, "best": 0.0, "mean": 0.0, "variance": [0,0,0,0,0,0] }],
##     "player_model": { "bins": [], "decay": 0.9 },
##     "rounds_played": 0
##   }
##
## PURE persistence: this class references no game scene / node beyond FileAccess
## + JSON (steering section 2). A SAVE FAILURE MUST NOT CRASH - FileAccess.open
## null returns are guarded (push_warning + continue). A missing / corrupt file
## loads as a clean default. gene_names is written so the format can be reused in
## another project; a version bump routes through _migrate() (hook stub below).

# =====================================================================
# CONSTANTS
# =====================================================================

const SAVE_PATH: String = "user://wirework_evo.json"
## Current schema version. Bump this AND extend _migrate() when the shape changes.
const SCHEMA_VERSION: int = 1
## Player-model decay recorded in the snapshot (mirrors PlayerModel.DECAY).
const PLAYER_MODEL_DECAY: float = 0.9


## Build the snapshot Dictionary from live evo state.
##   generation    : current generation number
##   best_genes    : PackedFloat32Array of the best genome
##   history       : Array of {gen, best, mean, variance:[6]} entries
##   player_bins   : Array of the 24 player-model bin counts (read from telemetry)
##   rounds_played : total rounds played
static func build(generation: int, best_genes: PackedFloat32Array, history: Array,
		player_bins: Array, rounds_played: int) -> Dictionary:
	return {
		"version": SCHEMA_VERSION,
		"generation": generation,
		"gene_names": Genome.GENE_NAMES.duplicate(),
		"baseline": Genome.BASELINE.duplicate(),
		"best": Genome.to_float_array(best_genes),
		"history": history.duplicate(true),
		"player_model": {"bins": player_bins.duplicate(), "decay": PLAYER_MODEL_DECAY},
		"rounds_played": rounds_played,
	}


## Append one generation record to a history array (steering 3.11 history shape).
static func make_history_entry(gen: int, best: float, mean: float, variance: Array) -> Dictionary:
	return {"gen": gen, "best": best, "mean": mean, "variance": variance.duplicate()}


## Save the snapshot to user://. Returns true on success. NEVER crashes: a null
## FileAccess (locked / read-only / cleared user://) is warned and swallowed.
static func save(snapshot: Dictionary) -> bool:
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("EvoSnapshot: could not open %s for write (err %d); skipping save."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return false
	file.store_string(JSON.stringify(snapshot, "\t"))
	file.close()
	return true


## Load the snapshot. A missing / corrupt / wrong-shape file returns a clean
## default (never crashes). Runs the migration hook for older versions.
static func load_snapshot() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return default_snapshot()
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		push_warning("EvoSnapshot: could not open %s for read (err %d); starting clean."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return default_snapshot()
	var text: String = file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("EvoSnapshot: %s is not a JSON object; starting clean." % SAVE_PATH)
		return default_snapshot()
	return _migrate(parsed as Dictionary)


## A clean starting snapshot (generation 0, best = baseline, empty history).
static func default_snapshot() -> Dictionary:
	return {
		"version": SCHEMA_VERSION,
		"generation": 0,
		"gene_names": Genome.GENE_NAMES.duplicate(),
		"baseline": Genome.BASELINE.duplicate(),
		"best": Genome.BASELINE.duplicate(),
		"history": [],
		"player_model": {"bins": [], "decay": PLAYER_MODEL_DECAY},
		"rounds_played": 0,
	}


## Extract the best genome from a loaded snapshot as a clamped gene array. Falls
## back to the baseline if the field is missing / malformed.
static func best_genes_from(snapshot: Dictionary) -> PackedFloat32Array:
	var best: Variant = snapshot.get("best", Genome.BASELINE)
	if best is Array:
		return Genome.from_float_array(best as Array)
	return Genome.make_baseline()


# =====================================================================
# MIGRATION HOOK (steering 3.11: bump version + migrate on schema change)
# =====================================================================

## Migrate an older snapshot up to SCHEMA_VERSION. Currently version 1 is the
## only shape, so this fills any missing keys from the default and stamps the
## current version. Extend with per-version steps when the schema evolves.
static func _migrate(snapshot: Dictionary) -> Dictionary:
	var version: int = int(snapshot.get("version", 0))
	if version > SCHEMA_VERSION:
		# Newer-than-known file: keep it but do not pretend to understand it.
		push_warning("EvoSnapshot: file version %d newer than %d; using as-is."
			% [version, SCHEMA_VERSION])
		return snapshot

	# --- future per-version migration steps go here ---
	# if version < 2: snapshot = _v1_to_v2(snapshot)

	var base: Dictionary = default_snapshot()
	for key in base.keys():
		if not snapshot.has(key):
			snapshot[key] = base[key]
	snapshot["version"] = SCHEMA_VERSION
	# gene_names are always canonical (format-reuse contract).
	snapshot["gene_names"] = Genome.GENE_NAMES.duplicate()
	return snapshot
