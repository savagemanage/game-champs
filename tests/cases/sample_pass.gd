extends TestCase
## Sample PASSING case (spec 0). Exercises check() and near(), and demonstrates
## that the INJECTED seeded RNG (see handoff.md) is deterministic: two RNGs made
## from the same seed produce bit-identical draws.


func test_check_and_near_pass() -> void:
	check(1 + 1 == 2, "integer addition should hold")
	near(0.1 + 0.2, 0.3, 1e-6, "float sum should be within eps")


func test_seeded_rng_is_deterministic() -> void:
	# The runner injects `rng` seeded with the run's --seed before this method.
	# A second RNG built from that same seed must reproduce the exact draw.
	var run_seed: int = rng.seed
	var first: float = rng.randf()

	var twin: RandomNumberGenerator = RandomNumberGenerator.new()
	twin.seed = run_seed
	near(first, twin.randf(), 0.0, "same seed must give byte-identical draw")
