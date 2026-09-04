extends RefCounted
class_name Fitness
## Group fitness for one candidate genome (steering 3.6). PURE: it consumes a
## plain measurement Dictionary produced by BackgroundSim and returns a float.
##
##   groupFitness =
##       Σ(per-titan nape NON-exposure time ratio) / N   # PRIMARY, per-tick
##     + abortedSlashAttempts * MISS_W
##     + damageDealtToPlayer  * DMG_W
##     + (if player died) remainingTimeRatio * KILL_BONUS
##
## HARD INVARIANTS (steering 3.6 / section 6 - the most dangerous place to get
## wrong; do NOT add either of the following, they silently breed run-away
## titans that are near-impossible to diagnose later):
##   * NO survival-time term. Fitness never rewards how long the titan lived.
##   * NO continuous distance penalty. Approach is a BINARY "did it touch" count
##     only (touches feed the damage term, never a distance-scaled penalty).
##
## The primary term is per-titan nape NON-exposure ratio because it is measured
## every tick, so even generation-1 individuals get a non-zero gradient (if the
## primary term were sparse there would be no selection pressure early on).
##
## Callers normalise a candidate's fitness by the GENERATION MEAN (see
## Population) to cancel map / trajectory difficulty variance - that division is
## deliberately NOT done here so this stays a pure per-window score.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Reward per aborted / whiffed slash attempt the titans forced (steering 3.6).
const MISS_W: float = 0.35
## Reward per unit of damage dealt to the player.
const DMG_W: float = 0.5
## Bonus multiplier on the remaining-time ratio when the player is killed. This
## rewards a FAST kill (more time remaining = bigger bonus) WITHOUT introducing
## a survival-time term - it is gated on the player dying, not on elapsed time.
const KILL_BONUS: float = 2.0
## Small floor so a normalised fitness never divides toward zero downstream.
const MIN_SCORE: float = 0.0001


## Score one evaluated window. `m` is the measurement Dictionary from
## BackgroundSim.evaluate_window():
##   {
##     "titan_count": int,
##     "nape_non_exposure_sum": float,   # Σ over titans of NON-exposure ratio
##     "aborted_slashes": int,           # slashes the sim forced to whiff/abort
##     "damage_to_player": float,
##     "player_died": bool,
##     "remaining_time_ratio": float,    # only meaningful if player_died
##   }
static func score_window(m: Dictionary) -> float:
	var n: int = int(m.get("titan_count", 0))
	var primary: float = 0.0
	if n > 0:
		# PRIMARY term: mean per-titan nape NON-exposure ratio (continuous).
		primary = float(m.get("nape_non_exposure_sum", 0.0)) / float(n)

	var aborted: float = float(int(m.get("aborted_slashes", 0))) * MISS_W
	var damage: float = float(m.get("damage_to_player", 0.0)) * DMG_W

	var kill: float = 0.0
	if bool(m.get("player_died", false)):
		kill = float(m.get("remaining_time_ratio", 0.0)) * KILL_BONUS

	# NOTE: intentionally NO survival-time term and NO distance term here.
	return maxf(MIN_SCORE, primary + aborted + damage + kill)


## Average the per-window scores for one candidate across MULTIPLE windows
## (steering 3.5: average over windows to guard against single-trajectory
## overfit). `window_scores` is an Array[float].
static func average(window_scores: Array) -> float:
	if window_scores.is_empty():
		return MIN_SCORE
	var sum: float = 0.0
	for s in window_scores:
		sum += float(s)
	return maxf(MIN_SCORE, sum / float(window_scores.size()))
