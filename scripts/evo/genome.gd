extends RefCounted
class_name Genome
## The exactly-SIX genes that parameterise a titan's hybrid steering policy
## (steering 3.2). PURE DATA: a fixed-order float array plus named index / range
## constants. No 7th gene, no dynamic gene set - the gene set is closed.
##
## Genes are WEIGHTS on directions the caller supplies (steering 3.1 / 3.3); a
## gene never encodes an absolute learned direction. Conditions (e.g. "which
## side does the player prefer") live in code as measurements; the genome only
## says how strongly to use each measured direction.
##
## Nothing here references a game scene / node / physics. It exchanges plain
## PackedFloat32Array so the whole evo module can be lifted into another
## project unchanged (steering file-layout invariant).

# =====================================================================
# GENE LAYOUT (FIXED ORDER - do not reorder; the snapshot schema and the
# steering-policy weighting both index by these constants)
# =====================================================================

const GENE_COUNT: int = 6

const NAV_FOLLOW: int = 0      ## strength of nav-path following
const INTERCEPT_LEAD: int = 1  ## lead-interception amount (player velocity)
const FLANK_BIAS: int = 2      ## how strongly to trust the player model
const NAPE_YAW: int = 3        ## upper-body turn-away amount (nape hiding)
const SEPARATION: int = 4      ## neighbour separation
const ENCIRCLE: int = 5        ## tangential encircle component

## Human-readable names in gene order (written verbatim into the snapshot's
## gene_names array, steering 3.11).
const GENE_NAMES: Array = [
	"navFollow", "interceptLead", "flankBias", "napeYaw", "separation", "encircle",
]

## Per-gene inclusive ranges [min, max] in gene order (steering 3.2 table).
const GENE_MIN: Array = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
const GENE_MAX: Array = [2.0, 2.0, 2.5, 1.0, 2.0, 2.0]

## Generation-1 baseline = pure-navigation chase (steering 3.7 / 3.11):
## navFollow max, separation mid, everything else zero. NOT random.
const BASELINE: Array = [2.0, 0.0, 0.0, 0.0, 1.0, 0.0]


## A fresh baseline gene array (steering 3.7). Every gen-1 individual is a copy
## of this, so improvement is always measured against pure navigation.
static func make_baseline() -> PackedFloat32Array:
	return _to_packed(BASELINE)


## Clamp a gene array in place to the per-gene ranges. Returns the same array
## for chaining. Mutation / crossover call this so no gene escapes its bounds.
static func clamp_genes(genes: PackedFloat32Array) -> PackedFloat32Array:
	for i in GENE_COUNT:
		genes[i] = clampf(genes[i], GENE_MIN[i], GENE_MAX[i])
	return genes


## Width (max - min) of a gene's range. Used to scale mutation so a gene with a
## wider range mutates proportionally (steering 3.9 mutation width control).
static func gene_range(index: int) -> float:
	return float(GENE_MAX[index]) - float(GENE_MIN[index])


## Copy helper (PackedFloat32Array is a value type but we keep intent explicit).
static func duplicate_genes(genes: PackedFloat32Array) -> PackedFloat32Array:
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(GENE_COUNT)
	for i in GENE_COUNT:
		out[i] = genes[i]
	return out


## Convert to a plain Array of floats (for JSON serialisation).
static func to_float_array(genes: PackedFloat32Array) -> Array:
	var out: Array = []
	for i in GENE_COUNT:
		out.append(float(genes[i]))
	return out


## Build gene array from a plain Array (JSON load). Missing entries fall back to
## the baseline value so a short/corrupt array never yields an invalid genome.
static func from_float_array(data: Array) -> PackedFloat32Array:
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(GENE_COUNT)
	for i in GENE_COUNT:
		if i < data.size():
			out[i] = float(data[i])
		else:
			out[i] = float(BASELINE[i])
	return clamp_genes(out)


static func _to_packed(arr: Array) -> PackedFloat32Array:
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(GENE_COUNT)
	for i in GENE_COUNT:
		out[i] = float(arr[i])
	return out
