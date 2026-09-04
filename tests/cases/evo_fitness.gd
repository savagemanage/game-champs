extends TestCase
## FEAT-005: deterministic checks on the action-defense evolution core.
##
## PURE checks only (no Node / SceneTree): the evo module is RefCounted and
## consumes plain data, so we can drive Genome / Fitness / BackgroundSim /
## Population directly. Everything here is fully deterministic (no global RNG;
## Population takes a fixed seed).

const WALL_RADIUS: float = 34.0


# =====================================================================
# GENOME - 6 fixed infiltration genes + a non-random baseline
# =====================================================================

func test_gene_set_is_six_fixed_infiltration_genes() -> void:
	check(Genome.GENE_COUNT == 6, "GENE_COUNT must stay 6")
	check(Genome.GENE_NAMES.size() == 6, "6 gene names")
	check(Genome.GENE_NAMES[Genome.WALL_ASSAULT] == "wallAssault", "gene 0 = wallAssault")
	check(Genome.GENE_NAMES[Genome.CITIZEN_SEEK] == "citizenSeek", "gene 1 = citizenSeek")
	check(Genome.GENE_NAMES[Genome.PLAYER_AVOID] == "playerAvoid", "gene 2 = playerAvoid")
	check(Genome.GENE_NAMES[Genome.SPREAD_OUT] == "spreadOut", "gene 3 = spreadOut")
	check(Genome.GENE_NAMES[Genome.SEPARATION] == "separation", "gene 4 = separation")
	check(Genome.GENE_NAMES[Genome.AGGRESSION] == "aggression", "gene 5 = aggression")


func test_baseline_is_non_random_straight_in_rush() -> void:
	var b: PackedFloat32Array = Genome.make_baseline()
	check(b.size() == 6, "baseline has 6 genes")
	# The straight-at-the-wall infiltrator: wallAssault + citizenSeek drive it,
	# no player-avoidance / spreading (that is what evolution must discover).
	check(b[Genome.WALL_ASSAULT] > 0.0, "baseline drives the wall")
	check(b[Genome.CITIZEN_SEEK] > 0.0, "baseline seeks citizens")
	check(b[Genome.PLAYER_AVOID] == 0.0, "baseline does not avoid the player")
	check(b[Genome.SPREAD_OUT] == 0.0, "baseline does not spread out")


# =====================================================================
# FITNESS - citizens-eaten is the dominant primary term
# =====================================================================

func test_citizens_eaten_dominates_fitness() -> void:
	# One extra citizen eaten must outweigh maxed-out shaping terms.
	var ate_two: float = Fitness.score_window({
		"titan_count": 4, "citizens_eaten": 2,
		"breach_progress": 0.0, "wall_contact_ratio": 0.0, "titans_killed": 0})
	var ate_one_perfect_shape: float = Fitness.score_window({
		"titan_count": 4, "citizens_eaten": 1,
		"breach_progress": 1.0, "wall_contact_ratio": 1.0, "titans_killed": 0})
	check(ate_two > ate_one_perfect_shape,
		"eating one more citizen beats maxed breach+contact with one fewer eaten")


func test_breach_and_kill_terms_are_secondary() -> void:
	var base: Dictionary = {"titan_count": 4, "citizens_eaten": 1,
		"breach_progress": 0.0, "wall_contact_ratio": 0.0, "titans_killed": 0}
	var with_breach: Dictionary = base.duplicate()
	with_breach["breach_progress"] = 1.0
	check(Fitness.score_window(with_breach) > Fitness.score_window(base),
		"breach progress adds fitness")
	var with_kill: Dictionary = base.duplicate()
	with_kill["titans_killed"] = 2
	check(Fitness.score_window(with_kill) < Fitness.score_window(base),
		"being killed by the player costs fitness")


# =====================================================================
# BACKGROUND SIM - titans breach the wall and eat citizens (pure integrator)
# =====================================================================

func test_baseline_titans_eat_citizens_with_no_threat() -> void:
	var m: Dictionary = BackgroundSim.evaluate_window(_window(false), Genome.make_baseline())
	check(int(m.get("citizens_eaten", 0)) > 0, "baseline titans eat at least one citizen")
	check(float(m.get("breach_progress", 0.0)) > 0.0, "baseline titans breach the wall")


func test_player_avoider_outperforms_baseline_against_a_defender() -> void:
	# With a defender camped in the gate, a genome that AVOIDS the player should
	# lose fewer titans (and so eat at least as many citizens) as the straight
	# rush that feeds into the defender. This is the selection pressure.
	var window: Dictionary = _window(true)
	var baseline: Dictionary = BackgroundSim.evaluate_window(window, Genome.make_baseline())
	var avoider: PackedFloat32Array = Genome.make_baseline()
	avoider[Genome.PLAYER_AVOID] = Genome.GENE_MAX[Genome.PLAYER_AVOID]
	avoider[Genome.SPREAD_OUT] = Genome.GENE_MAX[Genome.SPREAD_OUT]
	var evolved: Dictionary = BackgroundSim.evaluate_window(window, avoider)
	check(int(evolved.get("titans_killed", 0)) <= int(baseline.get("titans_killed", 99)),
		"a player-avoider loses no more titans than the straight rush")
	check(Fitness.score_window(evolved) >= Fitness.score_window(baseline),
		"the player-avoider scores at least as well against a defender")


func test_sim_is_deterministic() -> void:
	var w: Dictionary = _window(true)
	var a: Dictionary = BackgroundSim.evaluate_window(w, Genome.make_baseline())
	var b: Dictionary = BackgroundSim.evaluate_window(w, Genome.make_baseline())
	check(int(a["citizens_eaten"]) == int(b["citizens_eaten"]), "sim is deterministic")


# =====================================================================
# POPULATION - keeps 50 / elitism / mean-normalised baseline seed
# =====================================================================

func test_population_seeds_the_baseline() -> void:
	var pop: Population = Population.new(12345)
	check(pop.size() == Population.POP_SIZE, "pop size is 50")
	check(Population.POP_SIZE == 50 and Population.ELITISM == 1, "50 / elitism 1 kept")
	var g0: PackedFloat32Array = pop.get_genes(0)
	var b: PackedFloat32Array = Genome.make_baseline()
	for i in Genome.GENE_COUNT:
		check(g0[i] == b[i], "gen-1 individual %d is the baseline" % i)


# =====================================================================
# HELPERS - build a scenario window (wall + gates + citizens + player path)
# =====================================================================

func _window(with_defender: bool) -> Dictionary:
	var citizens: Array = []
	for i in 8:
		var a: float = TAU * float(i) / 8.0
		citizens.append([cos(a) * 14.0, 0.0, sin(a) * 14.0])
	var start_titans: Array = []
	for i in 4:
		var a: float = PI * 0.5 + (float(i) - 1.5) * 0.4
		start_titans.append({"pos": [cos(a) * 40.0, 0.0, sin(a) * 40.0]})
	var traj: Array = []
	for step in 420:
		if with_defender:
			traj.append({"pos": [0.0, 0.0, WALL_RADIUS - 4.0], "attacking": true})
		else:
			traj.append({"pos": [0.0, 0.0, 1.0e6], "attacking": false})
	return {
		"wall_radius": WALL_RADIUS,
		"gates": [[0.0, 0.0, WALL_RADIUS], [0.0, 0.0, -WALL_RADIUS]],
		"citizens": citizens,
		"start_titans": start_titans,
		"trajectory": traj,
	}
