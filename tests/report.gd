extends SceneTree
## STUB report dumper. For now it writes ONLY the CSV header to --out and quits
## 0. The GA harness (scripts/evo/harness/ga_harness.gd) is the real numeric
## verification; this stub keeps the tools/report.sh interface (args + columns)
## stable. The columns are the action-defense gene variances (FEAT-005).
##
## Usage (via tools/report.sh):
##   godot --headless -s res://tests/report.gd -- --seed=42 --generations=200 --out=reports/evo.csv

## EXACT CSV columns (action-defense gene set, FEAT-005). Do not reorder/rename.
const CSV_HEADER: String = "gen,best,mean,var_wallAssault,var_citizenSeek,var_playerAvoid,var_spreadOut,var_separation,var_aggression"

const DEFAULT_SEED: int = 42
const DEFAULT_GENERATIONS: int = 200
const DEFAULT_OUT: String = "reports/evo.csv"


func _initialize() -> void:
	var seed_value: int = DEFAULT_SEED
	var generations: int = DEFAULT_GENERATIONS
	var out_path: String = DEFAULT_OUT
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_value = int(arg.substr("--seed=".length()))
		elif arg.begins_with("--generations="):
			generations = int(arg.substr("--generations=".length()))
		elif arg.begins_with("--out="):
			out_path = arg.substr("--out=".length())

	# Ensure the parent directory exists (e.g. reports/).
	var dir_path: String = out_path.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))

	var file: FileAccess = FileAccess.open(out_path, FileAccess.WRITE)
	if file == null:
		# Fall back to an absolute path (out_path may be outside res://).
		file = FileAccess.open(ProjectSettings.globalize_path(out_path), FileAccess.WRITE)
	if file == null:
		printerr("[report] could not open %s for writing (err %d)"
			% [out_path, FileAccess.get_open_error()])
		quit(1)
		return

	file.store_line(CSV_HEADER)
	file.close()

	# seed_value / generations are accepted for interface stability.
	print("[report] wrote CSV header to %s (seed=%d generations=%d) - STUB; run the GA harness for the body."
		% [out_path, seed_value, generations])
	quit(0)
