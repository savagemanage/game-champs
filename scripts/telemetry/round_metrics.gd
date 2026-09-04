extends RefCounted
class_name RoundMetrics
## Derived-metric extractors for one round (spec 2 - telemetry).
##
## PURE, STATELESS helpers that read a finished RoundRecorder's public data
## (windows / slashes / per-titan tallies) and compute the numbers evolution and
## the round-end panel consume. Kept separate from RoundRecorder so recording
## and deriving stay independently testable, and so this file (and the recorder)
## each stay well under the 250-line cap.
##
## No scene references - everything is plain floats / Vector3s / Dictionaries.

# =====================================================================
# NAPE EXPOSURE
# =====================================================================

## Per-titan nape exposure ratio: {id: ratio}. ratio = exposed ticks / total,
## where "exposed" means the nape was in the player's view cone AND in range.
static func exposure_ratio_per_titan(titan_ticks: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for id in titan_ticks:
		var tally: Dictionary = titan_ticks[id]
		var ticks: int = int(tally.get("ticks", 0))
		out[id] = (float(tally.get("exposed", 0)) / float(ticks)) if ticks > 0 else 0.0
	return out


## Averaged nape exposure ratio across all titans this round.
static func average_exposure_ratio(titan_ticks: Dictionary) -> float:
	var ratios: Dictionary = exposure_ratio_per_titan(titan_ticks)
	if ratios.is_empty():
		return 0.0
	var sum: float = 0.0
	for id in ratios:
		sum += ratios[id]
	return sum / float(ratios.size())


# =====================================================================
# ENGAGEMENT-WINDOW AGGREGATES
# =====================================================================

static func average_engagement_distance(windows: Array) -> float:
	if windows.is_empty():
		return 0.0
	var sum: float = 0.0
	for w in windows:
		sum += (w as EngagementWindow).engagement_distance
	return sum / float(windows.size())


static func average_entry_speed(windows: Array) -> float:
	if windows.is_empty():
		return 0.0
	var sum: float = 0.0
	for w in windows:
		sum += (w as EngagementWindow).entry_speed
	return sum / float(windows.size())


## Fraction of engagement windows whose approach came from the player's left.
## "Left" = approach_dir_xz.x < 0 in world space (a simple, stable proxy).
static func left_approach_ratio(windows: Array) -> float:
	if windows.is_empty():
		return 0.0
	var left: int = 0
	for w in windows:
		if (w as EngagementWindow).approach_dir_xz.x < 0.0:
			left += 1
	return float(left) / float(windows.size())


# =====================================================================
# SLASH AGGREGATES
# =====================================================================

static func slash_success_count(slashes: Array) -> int:
	var kills: int = 0
	for s in slashes:
		if int(s.get("result", 0)) == EngagementWindow.RESULT_KILL:
			kills += 1
	return kills


static func slash_success_rate(slashes: Array) -> float:
	if slashes.is_empty():
		return 0.0
	return float(slash_success_count(slashes)) / float(slashes.size())
