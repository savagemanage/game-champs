extends RefCounted
class_name EvoSnapshot
## Read / write the evolution snapshot user://wirework_evo.json (see handoff.md
## "Design"). SCHEMA v2 (action-defense genes):
##
##   {
##     "version": 2,
##     "generation": 0,
##     "gene_names": ["wallAssault","citizenSeek","playerAvoid","spreadOut","separation","aggression"],
##     "baseline": [2.5, 2.5, 0.0, 0.0, 1.0, 1.0],
##     "best": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
##     "history": [{ "gen": 0, "best": 0.0, "mean": 0.0, "variance": [0,0,0,0,0,0] }],
##     "player_model": { "bins": [], "decay": 0.9 },
##     "rounds_played": 0
##   }
##
## v1 was the retired grapple-era schema with the six nape genes
## [navFollow, interceptLead, flankBias, napeYaw, separation, encircle] and
## baseline [2.0,0,0,0,1.0,0]. _migrate() upgrades a v1 file to v2 WITHOUT
## crashing (the gene meanings changed, so the old best genome is discarded and
## the best resets to the v2 baseline; history + player_model + rounds are kept).
##
## PURE persistence: this class references no game scene / node beyond FileAccess
## + JSON. A SAVE FAILURE MUST NOT CRASH - FileAccess.open null returns are
## guarded (push_warning + continue). A missing / corrupt file loads as a clean
## default. gene_names is written so the format can be reused / inspected.

# =====================================================================
# CONSTANTS
# =====================================================================

const SAVE_PATH: String = "user://wirework_evo.json"
## Current schema version. Bump this AND extend _migrate() when the shape changes.
## v1 = grapple-era nape genes; v2 = action-defense infiltration genes (FEAT-005).
const SCHEMA_VERSION: int = 2
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


## Append one generation record to a history array (history entry shape).
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
# MIGRATION (bump version + migrate on schema change; never crashes)
# =====================================================================

## Migrate an older snapshot up to SCHEMA_VERSION. A v1 (grapple-era) file has an
## incompatible gene set, so v1->v2 DISCARDS the old best genome and resets it to
## the v2 baseline (mapping the old 6 floats forward would be meaningless: the
## gene MEANINGS changed). History / player_model / rounds are preserved. Any
## missing keys are filled from the default. Never raises on an old file.
static func _migrate(snapshot: Dictionary) -> Dictionary:
	var version: int = int(snapshot.get("version", 0))
	if version > SCHEMA_VERSION:
		# Newer-than-known file: keep it but do not pretend to understand it.
		push_warning("EvoSnapshot: file version %d newer than %d; using as-is."
			% [version, SCHEMA_VERSION])
		return snapshot

	if version < 2:
		snapshot = _v1_to_v2(snapshot)

	var base: Dictionary = default_snapshot()
	for key in base.keys():
		if not snapshot.has(key):
			snapshot[key] = base[key]
	snapshot["version"] = SCHEMA_VERSION
	# gene_names + baseline are always canonical (they define the current schema).
	snapshot["gene_names"] = Genome.GENE_NAMES.duplicate()
	snapshot["baseline"] = Genome.BASELINE.duplicate()
	return snapshot


## v1 (grapple-era nape genes) -> v2 (action-defense genes). The gene set is
## incompatible, so drop the old best (reset to the v2 baseline) and reset the
## generation to 0 - the old fitness curve measured a different objective. Keep
## the player_model + rounds_played so telemetry continuity survives.
static func _v1_to_v2(snapshot: Dictionary) -> Dictionary:
	snapshot["best"] = Genome.BASELINE.duplicate()
	snapshot["generation"] = 0
	# The old history recorded nape-era fitness/variance for a 6-gene set that no
	# longer means the same thing; clear it so the new objective starts clean.
	snapshot["history"] = []
	return snapshot
