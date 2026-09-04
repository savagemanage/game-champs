extends RefCounted
class_name Fitness
## Group fitness for one candidate genome, action-defense objective (see
## handoff.md "Design"). PURE: it consumes a plain measurement Dictionary
## produced by BackgroundSim and returns a float.
##
##   groupFitness =
##       citizens_eaten          * EATEN_W    # PRIMARY - dominant pressure
##     + breach_progress         * BREACH_W   # reward reaching / opening the wall
##     + wall_contact_ratio      * CONTACT_W  # dense early gradient toward the wall
##     - titans_killed_by_player * KILLED_PEN # small cost for losing titans
##
## The defense framing DELIBERATELY replaces the old grapple-era rules:
##   * The old PRIMARY (per-titan nape NON-exposure ratio) is GONE - selection
##     now rewards EATING CITIZENS, not hiding a weak point.
##   * The old "NO survival-time term" and "NO distance penalty" invariants are
##     RETIRED for this objective. citizens_eaten dominates; breach_progress and
##     a continuous wall_contact_ratio give early generations a gradient toward
##     the wall so even the baseline rush gets scored above zero (if the primary
##     term were the only signal, a gen-1 titan that never quite reaches a
##     citizen would score flat and there would be no early selection pressure).
##
## Callers normalise a candidate's fitness by the GENERATION MEAN (see
## Population) to cancel scenario difficulty variance - that division is
## deliberately NOT done here so this stays a pure per-window score.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Weight per citizen eaten - the PRIMARY, dominant term. Large so a single
## extra citizen outweighs any amount of the shaping terms below.
const EATEN_W: float = 10.0
## Weight on mean breach progress in [0,1] (fraction of titans that got inside).
const BREACH_W: float = 3.0
## Weight on the continuous mean wall-contact ratio in [0,1] (how much of the
## window the titans spent pressed against / inside the wall). Small: it is only
## an early gradient, not a thing to optimise instead of eating.
const CONTACT_W: float = 1.0
## Penalty per titan the player killed (discourages feeding into the defender).
const KILLED_PEN: float = 0.5
## Small floor so a normalised fitness never divides toward zero downstream.
const MIN_SCORE: float = 0.0001


## Score one evaluated window. `m` is the measurement Dictionary from
## BackgroundSim.evaluate_window():
##   {
##     "titan_count": int,
##     "citizens_eaten": int,       # PRIMARY - citizens consumed this window
##     "breach_progress": float,    # mean fraction of titans that breached [0,1]
##     "wall_contact_ratio": float, # mean fraction of ticks at/inside wall [0,1]
##     "titans_killed": int,        # titans the player felled this window
##   }
static func score_window(m: Dictionary) -> float:
	var eaten: float = float(int(m.get("citizens_eaten", 0))) * EATEN_W
	var breach: float = float(m.get("breach_progress", 0.0)) * BREACH_W
	var contact: float = float(m.get("wall_contact_ratio", 0.0)) * CONTACT_W
	var killed: float = float(int(m.get("titans_killed", 0))) * KILLED_PEN
	return maxf(MIN_SCORE, eaten + breach + contact - killed)


## Average the per-window scores for one candidate across MULTIPLE windows
## (guard against single-scenario overfit). `window_scores` is an Array[float].
static func average(window_scores: Array) -> float:
	if window_scores.is_empty():
		return MIN_SCORE
	var sum: float = 0.0
	for s in window_scores:
		sum += float(s)
	return maxf(MIN_SCORE, sum / float(window_scores.size()))
