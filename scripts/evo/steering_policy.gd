extends RefCounted
class_name SteeringPolicy
## PURE hybrid steering policy for the action-defense objective (see handoff.md
## "Design"). Given a genome (6 weights) and a set of direction inputs the
## CALLER measures, it returns the titan's desired horizontal move direction.
##
##   moveDir = normalize(
##       wallAssault * breachDir            # toward the wall / nearest breach gap
##     + citizenSeek * citizenDir           # toward the nearest live citizen
##     + playerAvoid * antiPlayerDir        # away from the player threat
##     + spreadOut   * spreadDir            # disperse across targets / breach pts
##     + separation  * neighbourSeparation )# push off crowded neighbours
##
## The policy NEVER outputs an absolute learned direction: every term is a
## caller-supplied direction scaled by a gene weight. Path finding stays the
## caller's responsibility (nav agent supplies the guaranteed path direction),
## so titans are never dumber than pure navigation even at generation 1. The
## `aggression` gene does NOT rotate the move dir; it is a speed/commitment
## scalar exposed via speed_scale() so the caller can push harder straight in.
##
## CONDITIONS live here in code: the breach direction, the anti-player direction,
## the spread tangent, neighbour separation - all derived from measured state
## (breach point, player position, neighbour layout). Only the WEIGHTS come from
## the genome.
##
## No scene / node / physics references. Inputs and outputs are plain
## Vector3 / float. Vectors are treated as horizontal (XZ); callers pass Y=0.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Below this squared length a candidate direction term is treated as zero so a
## degenerate near-zero vector does not produce a NaN when normalised.
const MIN_DIR_SQ: float = 1.0e-6
## Distance (m) under which neighbour separation ramps to full strength; beyond
## it neighbours stop contributing. Keeps titans from stacking.
const SEPARATION_RADIUS: float = 6.0
## Distance (m) under which the player threat repels at full strength; beyond it
## the player is not avoided. Anti-player is a proximity term (conditions here).
const PLAYER_THREAT_RADIUS: float = 12.0
## Aggression speed scale bounds: speed_scale() maps the aggression gene onto
## [SPEED_MIN, SPEED_MAX] as a multiplier on the caller's base move speed.
const SPEED_MIN: float = 1.0
const SPEED_MAX: float = 1.5


## Compute the desired (horizontal, unit-length) move direction for one titan.
##   genes            : PackedFloat32Array of GENE_COUNT weights (Genome layout)
##   titan_pos        : this titan's position (Vector3, XZ used)
##   nav_path_dir     : unit direction along the nav path toward the objective
##                      (the caller's NavigationAgent3D supplies this; wallAssault
##                      + citizenSeek both ride it since the nav target IS the
##                      wall then the nearest citizen)
##   breach_dir       : unit dir from the titan toward the nearest breach gap
##   citizen_dir      : unit dir from the titan toward the nearest live citizen
##   player_pos       : player position (threat to avoid)
##   spread_dir       : measured dispersal direction (tangent that spreads titans
##                      across the wall / off the crowd centroid)
##   neighbour_positions : Array[Vector3] of the other titans' positions
## Returns a unit Vector3 (Y=0), or nav_path_dir if all terms cancel.
static func compute_move_dir(
		genes: PackedFloat32Array,
		titan_pos: Vector3,
		nav_path_dir: Vector3,
		breach_dir: Vector3,
		citizen_dir: Vector3,
		player_pos: Vector3,
		spread_dir: Vector3,
		neighbour_positions: Array) -> Vector3:
	var accum: Vector3 = Vector3.ZERO

	# The nav path is the algorithmic guarantee; wallAssault + citizenSeek both
	# amplify it because the nav target IS the wall then the nearest citizen.
	var nav: Vector3 = _safe_dir(_flat(nav_path_dir))
	accum += nav * (genes[Genome.WALL_ASSAULT] + genes[Genome.CITIZEN_SEEK]) * 0.5

	# wallAssault * measured breach direction (steer for the gate gap).
	accum += _safe_dir(_flat(breach_dir)) * genes[Genome.WALL_ASSAULT]

	# citizenSeek * measured citizen direction (once past the wall).
	accum += _safe_dir(_flat(citizen_dir)) * genes[Genome.CITIZEN_SEEK]

	# playerAvoid * anti-player direction, ramped by proximity (condition here).
	accum += _anti_player_dir(titan_pos, player_pos) * genes[Genome.PLAYER_AVOID]

	# spreadOut * measured dispersal direction.
	accum += _safe_dir(_flat(spread_dir)) * genes[Genome.SPREAD_OUT]

	# separation * neighbour separation (push away from crowded neighbours).
	accum += _separation_dir(titan_pos, neighbour_positions) * genes[Genome.SEPARATION]

	if accum.length_squared() < MIN_DIR_SQ:
		return _safe_dir(_flat(nav_path_dir))
	return accum.normalized()


## Speed / commitment multiplier from the aggression gene (see handoff.md). Maps
## aggression in [0, GENE_MAX] onto [SPEED_MIN, SPEED_MAX] so a more aggressive
## titan pushes in faster WITHOUT changing its direction. Pure float in/out.
static func speed_scale(genes: PackedFloat32Array) -> float:
	if genes.size() <= Genome.AGGRESSION:
		return SPEED_MIN
	var span: float = Genome.gene_range(Genome.AGGRESSION)
	var t: float = clampf(genes[Genome.AGGRESSION] / span, 0.0, 1.0) if span > 0.0 else 0.0
	return lerpf(SPEED_MIN, SPEED_MAX, t)


# =====================================================================
# CONDITION HELPERS (measurements in code, weights in genes)
# =====================================================================

## Direction that pushes the titan AWAY from the player, ramped by proximity: at
## the player's position it repels hardest, at PLAYER_THREAT_RADIUS it is zero.
static func _anti_player_dir(titan_pos: Vector3, player_pos: Vector3) -> Vector3:
	var away: Vector3 = _flat(titan_pos - player_pos)
	var dist: float = away.length()
	if dist < MIN_DIR_SQ or dist >= PLAYER_THREAT_RADIUS:
		return Vector3.ZERO
	return away.normalized() * (1.0 - dist / PLAYER_THREAT_RADIUS)


static func _separation_dir(titan_pos: Vector3, neighbours: Array) -> Vector3:
	var push: Vector3 = Vector3.ZERO
	for n in neighbours:
		var offset: Vector3 = _flat(titan_pos - (n as Vector3))
		var dist: float = offset.length()
		if dist > MIN_DIR_SQ and dist < SEPARATION_RADIUS:
			# Closer neighbours push harder (inverse ramp to the radius edge).
			push += offset.normalized() * (1.0 - dist / SEPARATION_RADIUS)
	return _safe_dir(push)


static func _safe_dir(v: Vector3) -> Vector3:
	if v.length_squared() < MIN_DIR_SQ:
		return Vector3.ZERO
	return v.normalized()


static func _flat(v: Vector3) -> Vector3:
	return Vector3(v.x, 0.0, v.z)
