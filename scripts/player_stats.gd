extends Node
## PlayerStats - the foundational adaptive-AI singleton (autoload).
##
## Registered in project.godot [autoload] as "PlayerStats", so every scene can
## reach it via the absolute path /root/PlayerStats (or the global name
## PlayerStats). It has three jobs:
##
##   1. COLLECT per-round player-behaviour stats while a round is playing
##      (which direction the player grapples/approaches from, how far they keep
##      from the titan, which way they dodge, how long the kill took, how much
##      damage they took).
##   2. PERSIST those stats to user://player_stats.json using FileAccess + JSON
##      so they survive between play sessions. user:// works in the browser
##      export too (it is backed by IndexedDB), so this stays fully local.
##   3. COMPUTE a `behavior_weights` dictionary that the titan reads at the
##      start of the next round. This is the real "gets smarter each round"
##      hook: the more the player leans on a habit, the more the weights push
##      the titan to counter it.
##
## Everything here is intentionally simple and heavily commented - it is a
## prototype foundation, not a finished ML system. Stage-2 can swap the weight
## maths for something richer without changing the public API.

# =====================================================================
# TUNABLES
# =====================================================================

## Where the save file lives. user:// resolves to a per-user, per-platform
## writable folder (and IndexedDB on web). Never hard-code an OS path here.
const SAVE_PATH: String = "user://player_stats.json"

## How strongly a single round's habits move the long-term weights (0..1).
## Low = the titan adapts slowly and smoothly over many rounds; high = it
## reacts hard to the most recent round. Exposed so it is easy to tune.
@export_range(0.0, 1.0) var adaptation_rate: float = 0.35

# =====================================================================
# PERSISTENT STATE (saved to disk between sessions)
# =====================================================================

## Total number of rounds the player has finished (killed the titan in).
var rounds_played: int = 0

## Long-term, smoothed behaviour weights the titan reads each round. Values are
## roughly 0..1. See _default_weights() for the meaning of each key.
var behavior_weights: Dictionary = {}

# =====================================================================
# PER-ROUND STATE (reset at the start of every round, folded into the
# long-term weights at the end of the round)
# =====================================================================

## Histogram of which side the player approaches the titan from, measured in
## the TITAN's own frame of reference (see record_approach_side). Counts of
## samples where the player was to the titan's left vs right vs roughly in
## front (dead ahead / behind, i.e. no clear side).
var _approach_hist: Dictionary = {
	"left": 0,
	"right": 0,
	"front": 0,
}

## Histogram of dodge directions (populated via record_dodge()).
var _dodge_hist: Dictionary = {
	"left": 0,
	"right": 0,
}

## Running average of the player's distance from the titan this round, plus the
## number of samples that built it (so we can update the mean incrementally).
var _distance_sum: float = 0.0
var _distance_samples: int = 0

## How much damage the player took this round.
var _damage_taken: float = 0.0

## Wall-clock time (seconds) when the current round started, for time-to-kill.
var _round_start_time_ms: int = 0


func _ready() -> void:
	# Load prior stats (or fall back to sane defaults on first ever run) so the
	# very first titan already has valid weights to read.
	_load()
	# Begin timing the first round immediately; GameManager also calls
	# begin_round() when it (re)spawns the titan, which simply re-arms the timer.
	begin_round()


# =====================================================================
# ROUND LIFECYCLE
# =====================================================================

## Call at the start of each round (GameManager does this on titan spawn).
## Clears the per-round accumulators and starts the time-to-kill timer.
func begin_round() -> void:
	_approach_hist = {"left": 0, "right": 0, "front": 0}
	_dodge_hist = {"left": 0, "right": 0}
	_distance_sum = 0.0
	_distance_samples = 0
	_damage_taken = 0.0
	_round_start_time_ms = Time.get_ticks_msec()


## Call when the titan dies. Folds this round's habits into the long-term
## behaviour weights, persists everything to disk, and returns the fresh
## weights so the caller can hand them straight to the next titan.
func end_round() -> Dictionary:
	rounds_played += 1
	_recompute_weights()
	_save()
	return behavior_weights


# =====================================================================
# DATA COLLECTION  (called from gameplay code; all cheap + non-crashing)
# =====================================================================

## Record which side the player is circling toward, already measured in the
## TITAN's own frame. The titan samples this each physics frame (it is the only
## node that knows both positions and the player's motion) and passes a signed
## value:
##   side < 0  -> player is peeling to the titan's LEFT
##   side > 0  -> player is peeling to the titan's RIGHT
##   side ~= 0 -> player is moving mostly straight toward/away (no clear side)
## `strength` is how sideways that motion is (0..1); we only bucket left/right
## once it is clear enough, otherwise it counts as "front".
## Because record and consume (titan._compute_target_position) now use the SAME
## titan-relative axis, the learned side genuinely maps to the player's real
## approach side - no mirroring needed.
func record_approach_side(side: float, strength: float) -> void:
	if strength < 0.4:
		_approach_hist["front"] += 1
	elif side < 0.0:
		_approach_hist["left"] += 1
	else:
		_approach_hist["right"] += 1


## Record a dodge direction: -1 = dodged left, +1 = dodged right.
func record_dodge(sideways: float) -> void:
	if sideways < 0.0:
		_dodge_hist["left"] += 1
	elif sideways > 0.0:
		_dodge_hist["right"] += 1


## Sample the current distance between player and titan (call each physics
## frame from the titan). Builds the round's average kept-distance.
func record_distance(distance: float) -> void:
	_distance_sum += distance
	_distance_samples += 1


## Record damage the player took this round (for future difficulty tuning).
func record_damage(amount: float) -> void:
	_damage_taken += maxf(0.0, amount)


# =====================================================================
# WEIGHT COMPUTATION
# =====================================================================

## The neutral starting weights used when there is no save file yet. Each is
## roughly 0..1 and documented so the titan code (and a beginner) knows what it
## means.
func _default_weights() -> Dictionary:
	return {
		# Which side (in the TITAN's own frame) the player historically circles
		# toward, so the titan can bias its intercept there to cut them off.
		# 0.5 = no preference; <0.5 = player favours the titan's left, >0.5 =
		# its right. Measured/consumed on the same titan-relative axis.
		"anticipate_side": 0.5,
		# How aggressively the titan closes distance vs holding position.
		# Higher when the player likes to keep their distance (kiting).
		"aggression": 0.5,
		# How much the titan turns to hide / guard its nape. Higher when the
		# player reliably attacks from one side.
		"guard_nape": 0.3,
	}


## Fold this round's per-round histograms into the long-term weights using an
## exponential moving average (adaptation_rate). This is what makes each new
## titan visibly a little better tuned against the player's habits.
func _recompute_weights() -> void:
	# Make sure we always have a full set of keys to blend into.
	var weights: Dictionary = behavior_weights.duplicate()
	var defaults := _default_weights()
	for key in defaults:
		if not weights.has(key):
			weights[key] = defaults[key]

	# --- anticipate_side: which side did the player attack from most? ---
	var left: int = int(_approach_hist.get("left", 0))
	var right: int = int(_approach_hist.get("right", 0))
	var total_sides: int = left + right
	if total_sides > 0:
		# 0 = player mostly on the titan's left, 1 = mostly on its right. The
		# titan biases its intercept along the SAME titan-relative axis to cut
		# the player off (see titan._compute_target_position).
		var side_target: float = float(right) / float(total_sides)
		weights["anticipate_side"] = lerpf(
			weights["anticipate_side"], side_target, adaptation_rate
		)

	# --- aggression: did the player keep their distance (kite)? ---
	if _distance_samples > 0:
		var avg_distance: float = _distance_sum / float(_distance_samples)
		# Map an average distance of ~5m -> 0 aggression, ~40m -> 1 aggression.
		# A player who kites from far away makes the titan more aggressive.
		var aggression_target: float = clampf(
			inverse_lerp(5.0, 40.0, avg_distance), 0.0, 1.0
		)
		weights["aggression"] = lerpf(
			weights["aggression"], aggression_target, adaptation_rate
		)

	# --- guard_nape: how one-sided are the player's attacks? ---
	# If attacks are heavily skewed to one side, the titan should guard harder.
	if total_sides > 0:
		var skew: float = absf(float(left - right)) / float(total_sides)
		weights["guard_nape"] = lerpf(
			weights["guard_nape"], skew, adaptation_rate
		)

	behavior_weights = weights


# =====================================================================
# PERSISTENCE  (FileAccess + JSON, fully local)
# =====================================================================

## Read the whole persistent state we serialise, as a plain Dictionary.
func _to_save_dict() -> Dictionary:
	return {
		"rounds_played": rounds_played,
		"behavior_weights": behavior_weights,
	}


func _save() -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_warning("PlayerStats: could not open %s for writing (err %d)."
			% [SAVE_PATH, FileAccess.get_open_error()])
		return
	# store_string + JSON.stringify keeps the file human-readable for debugging.
	file.store_string(JSON.stringify(_to_save_dict(), "\t"))
	file.close()


func _load() -> void:
	# First run (or a fresh browser profile): no file yet -> use defaults.
	if not FileAccess.file_exists(SAVE_PATH):
		behavior_weights = _default_weights()
		return

	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		push_warning("PlayerStats: could not open %s for reading; using defaults."
			% SAVE_PATH)
		behavior_weights = _default_weights()
		return

	var text := file.get_as_text()
	file.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("PlayerStats: save file was not valid JSON; using defaults.")
		behavior_weights = _default_weights()
		return

	var data: Dictionary = parsed
	rounds_played = int(data.get("rounds_played", 0))

	# Merge saved weights over the defaults so a save written by an older build
	# (missing a key) still yields a complete weight set. We only copy values
	# that are actually numbers: a corrupt or hand-edited JSON could hold a
	# string / null / array, and letting that flow into lerpf() later would
	# error. Non-numeric values are skipped so the default for that key stands.
	var weights := _default_weights()
	var saved_weights: Variant = data.get("behavior_weights", {})
	if typeof(saved_weights) == TYPE_DICTIONARY:
		for key in saved_weights:
			var value: Variant = saved_weights[key]
			if typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT:
				weights[key] = float(value)
			else:
				push_warning("PlayerStats: ignoring non-numeric weight '%s' in save file." % str(key))
	behavior_weights = weights


## Convenience for the titan: fetch a single weight with a safe fallback so it
## never crashes even if the key is somehow missing.
func get_weight(key: String, fallback: float = 0.5) -> float:
	return float(behavior_weights.get(key, fallback))
