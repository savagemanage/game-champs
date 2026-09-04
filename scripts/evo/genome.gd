extends RefCounted
class_name Genome
## The exactly-SIX genes that parameterise a titan's action-defense steering
## (see handoff.md "Design"). PURE DATA: a fixed-order float array plus named
## index / range constants. No 7th gene, no dynamic gene set - the gene set is
## closed.
##
## Genes are WEIGHTS on directions the caller supplies (weights in genes,
## conditions in code); a gene never encodes an absolute learned direction.
## The measured directions (toward the breach, toward the nearest citizen, away
## from the player, spread across targets, neighbour separation) live in
## SteeringPolicy / the sim; the genome only says how strongly to use each.
##
## Nothing here references a game scene / node / physics. It exchanges plain
## PackedFloat32Array so the whole evo module can be lifted into another project
## unchanged (the pure-module invariant in handoff.md).

# =====================================================================
# GENE LAYOUT (FIXED ORDER - do not reorder; the snapshot schema and the
# steering-policy weighting both index by these constants)
# =====================================================================

const GENE_COUNT: int = 6

const WALL_ASSAULT: int = 0   ## drive toward the wall / nearest breach gap
const CITIZEN_SEEK: int = 1   ## path to the nearest citizen once breached
const PLAYER_AVOID: int = 2   ## steer away from the player's threat
const SPREAD_OUT: int = 3     ## disperse across breach points / target citizens
const SEPARATION: int = 4     ## neighbour separation (keep, avoids stacking)
const AGGRESSION: int = 5     ## commitment / speed of pushing straight in

## Human-readable names in gene order (written verbatim into the snapshot's
## gene_names array so the format can be reused / inspected).
const GENE_NAMES: Array = [
	"wallAssault", "citizenSeek", "playerAvoid", "spreadOut", "separation", "aggression",
]

## Per-gene inclusive ranges [min, max] in gene order. wallAssault + citizenSeek
## are the primary "get to the objective" drives (widest); playerAvoid/spreadOut
## are tactical modifiers; aggression scales the forward commitment.
const GENE_MIN: Array = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
const GENE_MAX: Array = [2.5, 2.5, 2.0, 2.0, 2.0, 2.0]

## Generation-1 baseline = a NON-random "straight at the wall then the citizens"
## infiltrator (analogous to the old pure-nav baseline): full wallAssault +
## citizenSeek, mid separation + aggression, no player-avoidance / spreading.
## Improvement is always measured against this committed-but-naive rush.
const BASELINE: Array = [2.5, 2.5, 0.0, 0.0, 1.0, 1.0]


## A fresh baseline gene array. Every gen-1 individual is a copy of this, so
## improvement is always measured against the straight-in infiltrator.
static func make_baseline() -> PackedFloat32Array:
	return _to_packed(BASELINE)


## Clamp a gene array in place to the per-gene ranges. Returns the same array
## for chaining. Mutation / crossover call this so no gene escapes its bounds.
static func clamp_genes(genes: PackedFloat32Array) -> PackedFloat32Array:
	for i in GENE_COUNT:
		genes[i] = clampf(genes[i], GENE_MIN[i], GENE_MAX[i])
	return genes


## Width (max - min) of a gene's range. Used to scale mutation so a gene with a
## wider range mutates proportionally (mutation width control in Population).
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
