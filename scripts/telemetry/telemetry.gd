extends Node
## Telemetry autoload - the ONLY telemetry piece that touches game scenes.
##
## It samples the player + titans each physics tick, forwards plain data to the
## RoundRecorder (pure), keeps the last 3 rounds' engagement windows in a RING
## BUFFER, owns the shared 24-bin PlayerModel, and persists everything to
## user:// as JSON. Gameplay code (grapple/slash/titan/game_manager) reports
## events here via the register_*/report_* API so that scripts/telemetry/ stays
## free of game-scene TYPES (it receives Vector3s / floats only).
##
## Wired as an autoload named "Telemetry" (see project.godot [autoload]).
##
## PERSISTENCE (see handoff.md): user:// + FileAccess + JSON only. A save
## failure MUST NOT crash - FileAccess.open null returns are guarded, we
## push_warning and continue. A missing / corrupt file loads as a clean state.

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## Keep the engagement windows of the last N rounds (spec-3 point 3.5: 3 rounds).
## Persistence path / schema version live in TelemetryStore.
const ROUND_RING_SIZE: int = 3

# =====================================================================
# STATE
# =====================================================================

## The per-round recorder (recreated at the start of each round).
var _recorder: RoundRecorder = null
## Ring buffer of finished rounds: each entry = Array[EngagementWindow].
## Only the last ROUND_RING_SIZE rounds are kept.
var _window_ring: Array = []
## Shared opponent model, decayed across the whole session. SEPARATE from
## evolution: spec 3 reads it, never mutates it here.
var player_model: PlayerModel = PlayerModel.new()

var _rounds_played: int = 0
var _recording: bool = false

## Registered live game references, used only to SAMPLE (read) each tick. Stored
## as plain Node refs; we extract Vector3/float before handing to the recorder.
var _player: Node3D = null
var _titans: Array = []

## Cache of the last per-round summary, for the round-end panel to read.
var last_round_summary: Dictionary = {}

signal round_summary_ready(summary: Dictionary)


func _ready() -> void:
	load_state()


# =====================================================================
# REGISTRATION (called by gameplay; game scenes pass themselves in)
# =====================================================================

func register_player(player: Node3D) -> void:
	_player = player


func register_titan(titan: Node3D) -> void:
	if titan != null and not _titans.has(titan):
		_titans.append(titan)


func unregister_titan(titan: Node3D) -> void:
	_titans.erase(titan)


# =====================================================================
# ROUND LIFECYCLE (called by game_manager)
# =====================================================================

func start_round() -> void:
	_recorder = RoundRecorder.new()
	_recording = true


func end_round() -> void:
	if _recorder == null:
		return
	_recording = false
	_recorder.finalize()
	_rounds_played += 1

	# Feed the shared player model from this round's windows.
	for w in _recorder.windows:
		var win := w as EngagementWindow
		player_model.observe(win.approach_dir_xz, win.engagement_distance, win.entry_speed)

	# Push this round's windows into the 3-round ring buffer.
	_window_ring.append(_recorder.windows)
	while _window_ring.size() > ROUND_RING_SIZE:
		_window_ring.pop_front()

	last_round_summary = _build_summary(_recorder)
	save_state()
	round_summary_ready.emit(last_round_summary)


# =====================================================================
# PER-TICK SAMPLING (called by game_manager each physics tick)
# =====================================================================

func sample_tick(delta: float) -> void:
	if not _recording or _recorder == null or _player == null:
		return
	_recorder.record_tick(delta, _player_snapshot(), _titan_snapshots())


# =====================================================================
# EVENT REPORTING (called by grapple / slash)
# =====================================================================

func report_grapple_fire(anchor: Vector3) -> void:
	if not _recording or _recorder == null:
		return
	_recorder.record_grapple_fire(anchor, _player_snapshot(), _titan_snapshots())


func report_grapple_release() -> void:
	if not _recording or _recorder == null:
		return
	_recorder.record_grapple_release()


## result is one of EngagementWindow.RESULT_WHIFF / RESULT_SUB / RESULT_KILL.
func report_slash(pos: Vector3, dir: Vector3, rel_speed: float, result: int) -> void:
	if not _recording or _recorder == null:
		return
	_recorder.record_slash(pos, dir, rel_speed, result)


# =====================================================================
# SNAPSHOT HELPERS (Node -> plain data; the boundary of scene coupling)
# =====================================================================

func _player_snapshot() -> Dictionary:
	var pos: Vector3 = _player.global_position
	var vel: Vector3 = Vector3.ZERO
	if _player is CharacterBody3D:
		vel = (_player as CharacterBody3D).velocity
	var look: Vector3 = Vector3.FORWARD
	var cam: Camera3D = _player.get_node_or_null("YawPivot/PitchPivot/Camera3D") as Camera3D
	if cam != null:
		look = -cam.global_transform.basis.z
	return {"pos": pos, "vel": vel, "look": look.normalized()}


func _titan_snapshots() -> Array:
	var out: Array = []
	for t in _titans:
		if t == null or not is_instance_valid(t):
			continue
		var nape_normal: Vector3 = Vector3.ZERO
		if t.has_method("get_nape_normal"):
			nape_normal = t.call("get_nape_normal")
		var nape_pos: Vector3 = t.global_position
		var nape_node: Node3D = t.get_node_or_null("Nape") as Node3D
		if nape_node != null:
			nape_pos = nape_node.global_position
		var vel: Vector3 = Vector3.ZERO
		if t is CharacterBody3D:
			vel = (t as CharacterBody3D).velocity
		out.append({
			"id": t.get_instance_id(),
			"pos": t.global_position,
			"vel": vel,
			"nape_normal": nape_normal,
			"nape_pos": nape_pos,
		})
	return out


# =====================================================================
# SUMMARY (for the round-end panel)
# =====================================================================

func _build_summary(rec: RoundRecorder) -> Dictionary:
	return {
		"round": _rounds_played,
		"left_approach_ratio": rec.left_approach_ratio(),
		"avg_engagement_distance": rec.average_engagement_distance(),
		"avg_entry_speed": rec.average_entry_speed(),
		"exposure_per_titan": rec.exposure_ratio_per_titan(),
		"avg_exposure_ratio": rec.average_exposure_ratio(),
		"slash_attempts": rec.slash_attempt_count(),
		"slash_successes": rec.slash_success_count(),
		"slash_success_rate": rec.slash_success_rate(),
		"window_count": rec.window_count(),
		"player_model_bins": player_model.to_array(),
	}


## Total engagement windows currently held across the 3-round ring buffer.
func ring_window_count() -> int:
	var n: int = 0
	for round_windows in _window_ring:
		n += (round_windows as Array).size()
	return n


## All EngagementWindows across the 3-round ring, flattened. Spec-3 evolution
## reads these (as plain data via each window's to_dict()) to replay in the
## background sim. Telemetry still OWNS them; evolution only reads.
func get_ring_windows() -> Array:
	var out: Array = []
	for round_windows in _window_ring:
		for w in (round_windows as Array):
			out.append(w)
	return out


# =====================================================================
# PERSISTENCE (delegated to TelemetryStore; failures never crash)
# =====================================================================

func save_state() -> void:
	TelemetryStore.save(_rounds_played, player_model, _window_ring, last_round_summary)


func load_state() -> void:
	_rounds_played = TelemetryStore.load_into(player_model)
