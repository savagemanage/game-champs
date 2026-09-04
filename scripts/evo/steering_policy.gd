extends RefCounted
class_name SteeringPolicy
## PURE hybrid steering policy (steering 3.1). Given a genome (6 weights) and a
## set of direction inputs the CALLER measures, it returns the titan's desired
## move direction and the nape turn-away amount.
##
##   moveDir = normalize(
##       navFollow     * navPathDir
##     + interceptLead * interceptDir
##     + flankBias     * antiPreferredEntryDir
##     + separation    * neighbourSeparation
##     + encircle      * tangentialEncircleDir )
##
## The policy NEVER outputs an absolute learned direction: every term is a
## caller-supplied direction scaled by a gene weight. Path finding stays the
## caller's responsibility (nav agent supplies navPathDir), so titans are never
## dumber than pure navigation even at generation 1 (steering 3.1 rationale).
##
## CONDITIONS live here in code (steering 3.3): the interception lead point, the
## anti-preferred-entry direction, the encircle tangent - these are derived from
## measured state (player velocity, the player model's preferred entry, neighbour
## layout). Only the WEIGHTS come from the genome. The player's preferred entry
## direction is a MEASUREMENT passed in; flankBias is only how strongly to use it.
##
## No scene / node / physics references. Inputs and outputs are plain
## Vector3 / float. Vectors are treated as horizontal (XZ); callers pass Y=0.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Seconds ahead to project the player's velocity for lead interception. The
## actual lead strength is the interceptLead gene; this is just the horizon over
## which a unit of that gene reads as "one second of lead".
const LEAD_TIME: float = 1.0
## Below this squared length a candidate direction term is treated as zero so a
## degenerate near-zero vector does not produce a NaN when normalised.
const MIN_DIR_SQ: float = 1.0e-6
## Distance (m) under which neighbour separation ramps to full strength; beyond
## it neighbours stop contributing. Keeps 4 titans from stacking.
const SEPARATION_RADIUS: float = 6.0


## Compute the desired (horizontal, unit-length) move direction for one titan.
##   genes            : PackedFloat32Array of GENE_COUNT weights (Genome layout)
##   titan_pos        : this titan's position (Vector3, XZ used)
##   nav_path_dir     : unit direction along the nav path toward the player
##                      (the caller's NavigationAgent3D supplies this)
##   player_pos       : player position
##   player_vel       : player velocity (for lead interception)
##   preferred_entry_dir : measured unit dir the player PREFERS to enter from,
##                      pointing FROM titan TO the player's favourite side (from
##                      the telemetry player model). flankBias uses its OPPOSITE.
##   neighbour_positions : Array[Vector3] of the other titans' positions
##   encircle_center  : point to orbit (usually the player) for the encircle tangent
## Returns a unit Vector3 (Y=0), or nav_path_dir if all terms cancel.
static func compute_move_dir(
		genes: PackedFloat32Array,
		titan_pos: Vector3,
		nav_path_dir: Vector3,
		player_pos: Vector3,
		player_vel: Vector3,
		preferred_entry_dir: Vector3,
		neighbour_positions: Array,
		encircle_center: Vector3) -> Vector3:
	var accum: Vector3 = Vector3.ZERO

	# navFollow * nav path direction (the algorithmic guarantee).
	accum += _flat(nav_path_dir).normalized() * genes[Genome.NAV_FOLLOW]

	# interceptLead * lead-interception direction (aim where the player WILL be).
	var lead_point: Vector3 = player_pos + player_vel * LEAD_TIME
	var intercept_dir: Vector3 = _safe_dir(_flat(lead_point - titan_pos))
	accum += intercept_dir * genes[Genome.INTERCEPT_LEAD]

	# flankBias * ANTI-preferred-entry direction. preferred_entry_dir is the
	# side the player likes; we bias to the OPPOSITE so the titan denies it.
	var anti: Vector3 = _safe_dir(-_flat(preferred_entry_dir))
	accum += anti * genes[Genome.FLANK_BIAS]

	# separation * neighbour separation (push away from crowded neighbours).
	var sep: Vector3 = _separation_dir(titan_pos, neighbour_positions)
	accum += sep * genes[Genome.SEPARATION]

	# encircle * tangential component around the encircle center.
	var tangent: Vector3 = _encircle_tangent(titan_pos, encircle_center, neighbour_positions)
	accum += tangent * genes[Genome.ENCIRCLE]

	if accum.length_squared() < MIN_DIR_SQ:
		return _safe_dir(_flat(nav_path_dir))
	return accum.normalized()


## Upper-body turn-away amount (steering 3.2 napeYaw): how far the titan twists
## its torso AWAY from the incoming approach to hide the nape. Returns a signed
## yaw offset in radians, scaled by the napeYaw gene. `approach_dir` points FROM
## the titan TO the attacker.
static func nape_yaw_amount(genes: PackedFloat32Array, forward: Vector3, approach_dir: Vector3) -> float:
	var f: Vector3 = _safe_dir(_flat(forward))
	var a: Vector3 = _safe_dir(_flat(approach_dir))
	if f == Vector3.ZERO or a == Vector3.ZERO:
		return 0.0
	# Signed angle from forward to the approach, then turn AWAY (negate) so the
	# nape (behind the titan) rotates out of the attacker's line.
	var signed: float = atan2(f.x * a.z - f.z * a.x, f.x * a.x + f.z * a.z)
	return -signed * genes[Genome.NAPE_YAW]


# =====================================================================
# CONDITION HELPERS (measurements in code, weights in genes)
# =====================================================================

static func _separation_dir(titan_pos: Vector3, neighbours: Array) -> Vector3:
	var push: Vector3 = Vector3.ZERO
	for n in neighbours:
		var offset: Vector3 = _flat(titan_pos - (n as Vector3))
		var dist: float = offset.length()
		if dist > MIN_DIR_SQ and dist < SEPARATION_RADIUS:
			# Closer neighbours push harder (inverse ramp to the radius edge).
			push += offset.normalized() * (1.0 - dist / SEPARATION_RADIUS)
	return _safe_dir(push)


static func _encircle_tangent(titan_pos: Vector3, center: Vector3, neighbours: Array) -> Vector3:
	var radial: Vector3 = _flat(titan_pos - center)
	if radial.length_squared() < MIN_DIR_SQ:
		return Vector3.ZERO
	# Tangent = radial rotated 90 degrees about +Y (orbit the center).
	var tangent: Vector3 = Vector3(-radial.z, 0.0, radial.x).normalized()
	# Bias the orbit direction away from the mean neighbour side so titans spread
	# around the ring instead of clumping on one arc.
	if not neighbours.is_empty():
		var mean: Vector3 = Vector3.ZERO
		for n in neighbours:
			mean += _flat(n as Vector3)
		mean /= float(neighbours.size())
		if (mean - center).dot(tangent) > 0.0:
			tangent = -tangent
	return tangent


static func _safe_dir(v: Vector3) -> Vector3:
	if v.length_squared() < MIN_DIR_SQ:
		return Vector3.ZERO
	return v.normalized()


static func _flat(v: Vector3) -> Vector3:
	return Vector3(v.x, 0.0, v.z)
