extends SceneTree
## From-scratch SceneTree test runner (spec 0 harness - NO addons). Recursively
## collects res://tests/cases/*.gd, instantiates each, runs every `test_*`
## method with a fresh seeded RNG, and quits 1 on any failure else 0.
##
## Usage (via tools/test.sh):
##   godot --headless -s res://tests/cli.gd -- --seed=42 [--filter=<substr>]
##
## Determinism (steering 8.2/8.3): files and methods are sorted so ordering is
## stable, and each method gets its own RNG seeded with the same seed. Two runs
## with the same --seed produce byte-identical output.

const CASES_DIR: String = "res://tests/cases"
const DEFAULT_SEED: int = 42


func _initialize() -> void:
	var seed_value: int = DEFAULT_SEED
	var filter: String = ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_value = int(arg.substr("--seed=".length()))
		elif arg.begins_with("--filter="):
			filter = arg.substr("--filter=".length())

	var files: Array = _collect_scripts(CASES_DIR)
	files.sort()  # stable ordering for determinism

	var passed: int = 0
	var failed: int = 0

	for path in files:
		var script: Script = load(path)
		if script == null:
			print("FAIL %s (could not load script)" % path)
			failed += 1
			continue
		var instance: Object = script.new()
		if not (instance is TestCase):
			# Skip non-TestCase scripts silently (base class etc.).
			continue

		var methods: Array = []
		for m in instance.get_method_list():
			var name: String = m.get("name", "")
			if name.begins_with("test_"):
				methods.append(name)
		methods.sort()  # stable ordering for determinism

		for method in methods:
			var label: String = "%s::%s" % [path, method]
			if filter != "" and not label.contains(filter):
				continue

			# Fresh seeded RNG per method (steering 8.2).
			var rng: RandomNumberGenerator = RandomNumberGenerator.new()
			rng.seed = seed_value
			instance.rng = rng
			instance.errors = []

			instance.call(method)

			if instance.errors.is_empty():
				print("ok %s" % label)
				passed += 1
			else:
				print("FAIL %s" % label)
				for err in instance.errors:
					print("    - %s" % err)
				failed += 1

	print("----- summary: %d passed, %d failed (%d total) -----"
		% [passed, failed, passed + failed])

	if failed > 0:
		quit(1)
	else:
		quit(0)


## Recursively collect *.gd paths under `dir` (skips the TestCase base and the
## runner itself, which live in tests/ not tests/cases/).
func _collect_scripts(dir: String) -> Array:
	var out: Array = []
	var da: DirAccess = DirAccess.open(dir)
	if da == null:
		return out
	da.list_dir_begin()
	var entry: String = da.get_next()
	while entry != "":
		if entry == "." or entry == "..":
			entry = da.get_next()
			continue
		var full: String = dir.path_join(entry)
		if da.current_is_dir():
			out.append_array(_collect_scripts(full))
		elif entry.ends_with(".gd"):
			out.append(full)
		entry = da.get_next()
	da.list_dir_end()
	return out
