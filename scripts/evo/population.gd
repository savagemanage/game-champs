extends RefCounted
class_name Population
## The evolving population (see handoff.md "Design"). PURE: holds gene arrays +
## per-candidate fitness floats and produces the next generation; never touches a
## scene / node / physics (EvoManager feeds it evaluated fitnesses). Gene-agnostic
## (indexes only Genome.GENE_COUNT / ranges), so the FEAT-005 gene redefinition
## needed no change here beyond the baseline seed. Invariants:
##   * POP_SIZE = 50, ELITISM = 1 (more elites kills diversity).
##   * Generation 1 is NOT random - all 50 are the non-random Genome.BASELINE
##     (the straight-at-the-wall infiltrator).
##   * Fitness is normalised by the GENERATION MEAN before selection (cancels
##     scenario difficulty variance).
##   * VARIANCE-BASED mutation width control: if the mean normalised variance
##     drops below VARIANCE_THRESHOLD the width DOUBLES and restores on recovery.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

const POP_SIZE: int = 50
const ELITISM: int = 1  ## carry the single best genome forward unchanged

## Base mutation width as a FRACTION of each gene's range (per-gene scaled).
const MUTATION_WIDTH: float = 0.12
## Probability a given gene is mutated when producing a child.
const MUTATION_RATE: float = 0.3
## Tournament size for parent selection.
const TOURNAMENT_SIZE: int = 3
## Per-gene uniform-crossover probability of taking the gene from parent A.
const CROSSOVER_BIAS: float = 0.5

## Mean-normalised-variance floor. Below this the mutation width doubles.
const VARIANCE_THRESHOLD: float = 0.05
## Multiplier applied to the mutation width while variance is collapsed.
const WIDTH_BOOST: float = 2.0

# =====================================================================
# STATE
# =====================================================================

## Array[PackedFloat32Array] of POP_SIZE gene arrays.
var individuals: Array = []
## Parallel Array[float] of raw (un-normalised) fitness for each individual.
var fitness_raw: Array = []

var generation: int = 0
## Per-gene normalised variance from the LAST evaluated generation (length 6).
var last_variance: Array = []
var width_boosted: bool = false  ## anti-convergence width boost active

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _init(seed_value: int = 0) -> void:
	if seed_value != 0:
		_rng.seed = seed_value
	else:
		_rng.randomize()
	seed_baseline()


## Generation 1: every individual is the non-random Genome.BASELINE infiltrator.
func seed_baseline() -> void:
	individuals.clear()
	fitness_raw.clear()
	for i in POP_SIZE:
		individuals.append(Genome.make_baseline())
		fitness_raw.append(0.0)
	generation = 1
	last_variance = _zero_variance()
	width_boosted = false


func size() -> int:
	return individuals.size()


func get_genes(index: int) -> PackedFloat32Array:
	return individuals[index]


## Record one candidate's raw fitness (EvoManager fills all POP_SIZE across
## frames before calling advance()).
func set_fitness(index: int, value: float) -> void:
	fitness_raw[index] = value


func mean_fitness() -> float:
	if fitness_raw.is_empty():
		return 0.0
	var sum: float = 0.0
	for f in fitness_raw:
		sum += float(f)
	return sum / float(fitness_raw.size())


func best_index() -> int:
	var best: int = 0
	for i in fitness_raw.size():
		if float(fitness_raw[i]) > float(fitness_raw[best]):
			best = i
	return best


func best_fitness() -> float:
	return float(fitness_raw[best_index()])


func best_genes() -> PackedFloat32Array:
	return Genome.duplicate_genes(individuals[best_index()])


## Every candidate's genes as Array[PackedFloat32Array] copies (evolution-screen
## 1-vs-49 grid). Read-only view; never mutated here.
func all_genes() -> Array:
	var out: Array = []
	for ind in individuals:
		out.append(Genome.duplicate_genes(ind))
	return out


## Candidate indices best-fitness-first (top-5 highlight + large/grid split).
func indices_by_fitness() -> Array:
	var order: Array = []
	for i in fitness_raw.size():
		order.append(i)
	order.sort_custom(func(a, b): return float(fitness_raw[a]) > float(fitness_raw[b]))
	return order


# =====================================================================
# GENERATION ADVANCE
# =====================================================================

## Build the next generation from the current fitnesses. Selection uses
## GENERATION-MEAN-normalised fitness. Returns the new generation number. Also
## updates last_variance / width_boosted (variance-based width control).
func advance() -> int:
	last_variance = current_variance()
	var mean_var: float = _mean(last_variance)
	width_boosted = mean_var < VARIANCE_THRESHOLD
	var width: float = MUTATION_WIDTH * (WIDTH_BOOST if width_boosted else 1.0)

	var normalised: Array = _normalise_fitness()

	var next_gen: Array = []
	# Elitism: carry the single best genome forward unchanged.
	next_gen.append(Genome.duplicate_genes(best_genes()))

	while next_gen.size() < POP_SIZE:
		var pa: PackedFloat32Array = _tournament(normalised)
		var pb: PackedFloat32Array = _tournament(normalised)
		var child: PackedFloat32Array = _crossover(pa, pb)
		_mutate(child, width)
		next_gen.append(Genome.clamp_genes(child))

	individuals = next_gen
	fitness_raw.clear()
	for i in POP_SIZE:
		fitness_raw.append(0.0)
	generation += 1
	return generation


# =====================================================================
# SELECTION / CROSSOVER / MUTATION
# =====================================================================

func _normalise_fitness() -> Array:
	# Divide each candidate's fitness by the generation mean.
	var mean: float = mean_fitness()
	var out: Array = []
	if mean <= 0.0:
		for f in fitness_raw:
			out.append(1.0)
		return out
	for f in fitness_raw:
		out.append(float(f) / mean)
	return out


func _tournament(normalised: Array) -> PackedFloat32Array:
	var best: int = _rng.randi_range(0, individuals.size() - 1)
	for _i in range(TOURNAMENT_SIZE - 1):
		var challenger: int = _rng.randi_range(0, individuals.size() - 1)
		if float(normalised[challenger]) > float(normalised[best]):
			best = challenger
	return individuals[best]


func _crossover(a: PackedFloat32Array, b: PackedFloat32Array) -> PackedFloat32Array:
	var child: PackedFloat32Array = PackedFloat32Array()
	child.resize(Genome.GENE_COUNT)
	for i in Genome.GENE_COUNT:
		child[i] = a[i] if _rng.randf() < CROSSOVER_BIAS else b[i]
	return child


func _mutate(genes: PackedFloat32Array, width: float) -> void:
	for i in Genome.GENE_COUNT:
		if _rng.randf() < MUTATION_RATE:
			# Gaussian nudge scaled by the gene's own range (mutation width).
			var delta: float = _rng.randfn(0.0, width * Genome.gene_range(i))
			genes[i] = genes[i] + delta


# =====================================================================
# VARIANCE (normalised so per-gene ranges are comparable)
# =====================================================================

## Per-gene normalised variance of the CURRENT individuals (length 6). Exposed
## so the snapshot history can record the variance of the generation that was
## just evaluated (recorded in the snapshot history).
func current_variance() -> Array:
	return _compute_gene_variance()


func _compute_gene_variance() -> Array:
	var out: Array = _zero_variance()
	var n: int = individuals.size()
	if n == 0:
		return out
	for g in Genome.GENE_COUNT:
		var mean: float = 0.0
		for ind in individuals:
			mean += float(ind[g])
		mean /= float(n)
		var var_sum: float = 0.0
		for ind in individuals:
			var d: float = float(ind[g]) - mean
			var_sum += d * d
		var raw_var: float = var_sum / float(n)
		# Normalise by the square of the gene range so all 6 are comparable.
		var rng: float = Genome.gene_range(g)
		out[g] = (raw_var / (rng * rng)) if rng > 0.0 else 0.0
	return out


func _zero_variance() -> Array:
	return [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]


static func _mean(arr: Array) -> float:
	if arr.is_empty():
		return 0.0
	var sum: float = 0.0
	for v in arr:
		sum += float(v)
	return sum / float(arr.size())
