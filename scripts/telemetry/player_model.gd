extends RefCounted
class_name PlayerModel
## 24-bin opponent model with exponential-decay counts (spec-3 point 3.4).
##
## PURE DATA. This module holds NO reference to any game scene / node type; it
## receives plain floats and Vector3s and exposes plain arrays. Spec 3 evolution
## CONSUMES this model (reads bins/decay) but does NOT own it - keeping the two
## separate lets each be validated independently (spec-3 point 3.4).
##
## The 24 bins are the cross product:
##   approach angle    -> 4 quadrants  (which side the player entered from)
##   engagement distance -> 3 bands    (how far the grapple-fire was from titan)
##   entry timing      -> 2 bands      (how fast the player entered the window)
## => 4 * 3 * 2 = 24 bins.
##
## Every engagement window classifies into exactly one bin. On each update all
## bins decay by DECAY and the chosen bin gains 1.0, so recent behaviour
## dominates ("always entering from the left" concentrates counts in the left
## quadrant's bins).

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Number of approach-angle quadrants (N / E / S / W around the titan).
const QUADRANTS: int = 4
## Number of engagement-distance bands (near / mid / far).
const DISTANCE_BANDS: int = 3
## Number of entry-timing bands (slow / fast entry).
const TIMING_BANDS: int = 2
## Total bins = 4 * 3 * 2.
const BIN_COUNT: int = QUADRANTS * DISTANCE_BANDS * TIMING_BANDS

## Exponential decay applied to every bin on each update (spec-3 points 3.4 / 3.11).
const DECAY: float = 0.9

## Distance band edges (metres). d < NEAR -> band 0; NEAR..FAR -> band 1;
## >= FAR -> band 2.
const DISTANCE_NEAR_EDGE: float = 12.0
const DISTANCE_FAR_EDGE: float = 28.0

## Entry-speed edge (m/s). Below -> timing band 0 (slow); at/above -> band 1.
const ENTRY_SPEED_EDGE: float = 14.0

# =====================================================================
# STATE
# =====================================================================

var bins: PackedFloat32Array = PackedFloat32Array()


func _init() -> void:
	reset()


func reset() -> void:
	bins = PackedFloat32Array()
	bins.resize(BIN_COUNT)
	for i in BIN_COUNT:
		bins[i] = 0.0


## Classify an engagement into one of the 24 bins and add a decayed count.
##   approach_dir_xz : horizontal unit-ish vector FROM the titan TO the player
##                     at window start (which side the player attacked from).
##   distance        : engagement distance (m) at window start.
##   entry_speed     : player speed (m/s) entering the window.
func observe(approach_dir_xz: Vector3, distance: float, entry_speed: float) -> void:
	var q: int = _quadrant_of(approach_dir_xz)
	var d: int = _distance_band(distance)
	var t: int = _timing_band(entry_speed)
	var index: int = bin_index(q, d, t)
	_decay_all()
	if index >= 0 and index < BIN_COUNT:
		bins[index] += 1.0


## Flat bin index from the three sub-indices. Layout: quadrant is the slowest
## axis, then distance, then timing (the fastest axis).
func bin_index(quadrant: int, distance_band: int, timing_band: int) -> int:
	return (quadrant * DISTANCE_BANDS + distance_band) * TIMING_BANDS + timing_band


## Highest-count bin (the player's most-used approach). -1 if the model is empty.
func dominant_bin() -> int:
	var best: int = -1
	var best_val: float = 0.0
	for i in BIN_COUNT:
		if bins[i] > best_val:
			best_val = bins[i]
			best = i
	return best


func total_weight() -> float:
	var sum: float = 0.0
	for i in BIN_COUNT:
		sum += bins[i]
	return sum


# =====================================================================
# CLASSIFICATION
# =====================================================================

func _quadrant_of(dir_xz: Vector3) -> int:
	# atan2(x, z) gives a yaw angle; fold into 4 quadrants offset by an eighth
	# turn so N/E/S/W straddle the axes cleanly.
	var angle: float = atan2(dir_xz.x, dir_xz.z)
	var normalised: float = fposmod(angle + PI / float(QUADRANTS), TAU)
	var q: int = int(normalised / (TAU / float(QUADRANTS)))
	return clampi(q, 0, QUADRANTS - 1)


func _distance_band(distance: float) -> int:
	if distance < DISTANCE_NEAR_EDGE:
		return 0
	if distance < DISTANCE_FAR_EDGE:
		return 1
	return 2


func _timing_band(entry_speed: float) -> int:
	return 1 if entry_speed >= ENTRY_SPEED_EDGE else 0


func _decay_all() -> void:
	for i in BIN_COUNT:
		bins[i] *= DECAY


# =====================================================================
# SERIALISATION (plain arrays for user:// JSON + spec-3 consumption)
# =====================================================================

func to_array() -> Array:
	var out: Array = []
	for i in BIN_COUNT:
		out.append(bins[i])
	return out


func from_array(data: Array) -> void:
	reset()
	var n: int = mini(data.size(), BIN_COUNT)
	for i in n:
		bins[i] = float(data[i])
