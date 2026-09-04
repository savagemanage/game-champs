extends Node
## GameManager - owns the round lifecycle for wirework (spec 1). Bakes the arena
## navmesh at RUNTIME behind a loading screen, spawns EXACTLY 4 titans per round,
## respawns 4 IDENTICAL titans on clear, and drives the spec-4 evolution screen
## between rounds (see _on_titan_killed). INVARIANT (steering 1): titan count and
## stats are FIXED; nothing scales with _round_number - only evolved genes do.

const TITAN_COUNT: int = 4  ## FIXED per round; NEVER scaled by round number.
const RESPAWN_DELAY: float = 2.0  ## seconds between last kill and next spawn
const BAKE_POLL_INTERVAL: float = 0.1  ## navmesh bake_finished poll fallback

# --- Translation KEYS for user-facing text (resolved via tr() at display time) ---
const KEY_LOADING_BAKING: String = "LOADING_BAKING"
const KEY_ROUND_N: String = "ROUND_N"
const KEY_STATUS_TITANS_STRIKE: String = "STATUS_TITANS_STRIKE"
const KEY_STATUS_TITANS_LEFT: String = "STATUS_TITANS_LEFT"
const KEY_STATUS_ROUND_CLEARED: String = "STATUS_ROUND_CLEARED"

@export var titan_scene: PackedScene  # scene wiring set in Main.tscn
@export var arena_path: NodePath = ^"../Arena"
@export var player_path: NodePath = ^"../Player"
@export var round_label_path: NodePath = ^"UI/RoundLabel"
@export var status_label_path: NodePath = ^"UI/StatusLabel"
@export var loading_screen_path: NodePath = ^"LoadingScreen"
@export var evolution_screen_path: NodePath = ^"../EvolutionScreen"

var _arena: Node3D
var _player: Node3D
var _round_label: Label
var _status_label: Label
var _loading_screen: CanvasLayer
var _nav_region: NavigationRegion3D
var _titans: Array[CharacterBody3D] = []
var _alive: int = 0
var _round_number: int = 0
var _gameplay_started: bool = false
var _evolution_screen: CanvasLayer  ## shown after 1st kill, then every 3 rounds
var _first_kill_screen_shown: bool = false


func _ready() -> void:
	_arena = get_node_or_null(arena_path) as Node3D
	_player = get_node_or_null(player_path) as Node3D
	_round_label = get_node_or_null(round_label_path) as Label
	_status_label = get_node_or_null(status_label_path) as Label
	_loading_screen = get_node_or_null(loading_screen_path) as CanvasLayer
	_evolution_screen = get_node_or_null(evolution_screen_path) as CanvasLayer
	if _evolution_screen != null and _evolution_screen.has_signal("finished"):
		_evolution_screen.finished.connect(_on_evolution_screen_finished)
	if titan_scene == null:
		push_warning("GameManager: titan_scene unassigned; no titans will spawn.")
	_refresh_hud_locale()  # localize HUD now + on live locale switch
	if typeof(Settings) != TYPE_NIL and Settings != null and Settings.has_signal("locale_changed"):
		Settings.locale_changed.connect(func(_l): _refresh_hud_locale())
	_begin_runtime_bake()


## Re-apply localized text to the HUD labels (startup + live locale switch).
func _refresh_hud_locale() -> void:
	if _round_label != null:
		_round_label.text = tr(KEY_ROUND_N) % maxi(_round_number, 1)
	if _status_label != null and not _gameplay_started:
		_status_label.text = tr(KEY_LOADING_BAKING)


# --- RUNTIME NAVMESH BAKE (behind the loading screen) ---
func _begin_runtime_bake() -> void:
	if _loading_screen != null and _loading_screen.has_method("show_screen"):
		_loading_screen.call("show_screen", tr(KEY_LOADING_BAKING))
	_nav_region = _find_nav_region()
	if _nav_region == null:
		push_warning("GameManager: no NavigationRegion3D found; skipping bake.")
		_on_bake_finished()
		return
	# Bake next frame so the loading screen has painted first (bake stalls).
	if _nav_region.has_signal("bake_finished"):
		_nav_region.bake_finished.connect(_on_bake_finished, CONNECT_ONE_SHOT)
	call_deferred("_run_bake")


func _run_bake() -> void:  # runtime bake, hidden by the loading screen
	_nav_region.bake_navigation_mesh()
	if not _nav_region.has_signal("bake_finished"):
		get_tree().create_timer(BAKE_POLL_INTERVAL).timeout.connect(_on_bake_finished)


func _on_bake_finished() -> void:
	if _gameplay_started:
		return
	_gameplay_started = true
	if _loading_screen != null and _loading_screen.has_method("hide_screen"):
		_loading_screen.call("hide_screen")
	_start_round()


# --- ROUND LIFECYCLE ---
func _start_round() -> void:
	_round_number += 1
	_reset_player()
	_spawn_titans()
	_set_status(tr(KEY_STATUS_TITANS_STRIKE) % TITAN_COUNT)
	_refresh_hud_locale()
	if Telemetry != null:
		Telemetry.start_round()  # spec 2: begin recording this round


## Drive the telemetry recorder once per physics tick (spec 2).
func _physics_process(delta: float) -> void:
	if _gameplay_started and Telemetry != null:
		Telemetry.sample_tick(delta)


func _spawn_titans() -> void:
	if titan_scene == null:
		return
	_clear_titans()
	_alive = 0
	var spawns: Array[Transform3D] = _titan_spawn_transforms()
	for i in TITAN_COUNT:
		var titan := titan_scene.instantiate() as CharacterBody3D
		if titan == null:
			push_warning("GameManager: titan_scene did not instantiate a CharacterBody3D.")
			continue
		add_child(titan)
		titan.global_transform = spawns[i % spawns.size()]
		if titan.has_method("set_target") and _player != null:
			titan.set_target(_player)
		if titan.has_signal("titan_killed"):
			titan.titan_killed.connect(_on_titan_killed)
		_titans.append(titan)
		_alive += 1
	_inject_evolved_genes()


## Inject the latest best genome + siblings into every titan (spec 3, steering 3.8).
func _inject_evolved_genes() -> void:
	if typeof(TitanEvo) == TYPE_NIL or TitanEvo == null:
		return
	var genes: PackedFloat32Array = TitanEvo.current_best_genes()
	var preferred: Vector3 = TitanEvo.preferred_entry_dir()
	for titan in _titans:
		if titan == null or not is_instance_valid(titan):
			continue
		if titan.has_method("set_genes"):
			titan.set_genes(genes, preferred)
		if titan.has_method("set_neighbours"):
			titan.set_neighbours(_titans)


func _on_titan_killed() -> void:
	_alive -= 1
	if _alive > 0:
		_set_status(tr(KEY_STATUS_TITANS_LEFT) % _alive)
		# Evolution screen (spec 4): appear ONCE after the FIRST kill.
		if not _first_kill_screen_shown:
			_first_kill_screen_shown = true
			_try_show_evo_screen("request_first_kill_show")
		return
	_set_status(tr(KEY_STATUS_ROUND_CLEARED) % _round_number)
	if Telemetry != null:
		Telemetry.end_round()
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null:
		TitanEvo.start_evolution_burst()
	if _try_show_evo_screen("request_round_show", _round_number):
		return
	get_tree().create_timer(RESPAWN_DELAY).timeout.connect(_start_round)


## Delegate to the spec-4 evolution screen; return true when it took over.
func _try_show_evo_screen(method: String, arg = null) -> bool:
	if _evolution_screen == null or not _evolution_screen.has_method(method):
		return false
	var took_over: bool = _evolution_screen.call(method, arg) if arg != null else _evolution_screen.call(method)
	if not took_over:
		return false
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null and not TitanEvo.is_evolving():
		TitanEvo.start_evolution_burst()
	get_tree().paused = true
	return true


## Resume gameplay once the evolution screen finished.
func _on_evolution_screen_finished() -> void:
	get_tree().paused = false
	if _alive <= 0:
		get_tree().create_timer(RESPAWN_DELAY).timeout.connect(_start_round)


# --- HELPERS ---

## Read-only (FEAT-002): live titans for the nape indicator to enumerate. Do not mutate.
func get_titans() -> Array: return _titans


func _clear_titans() -> void:
	for titan in _titans:
		if titan != null and is_instance_valid(titan):
			titan.queue_free()
	_titans.clear()


func _reset_player() -> void:
	if _player == null:
		return
	_player.global_transform = _player_spawn_transform()
	if _player is CharacterBody3D:
		(_player as CharacterBody3D).velocity = Vector3.ZERO


func _find_nav_region() -> NavigationRegion3D:
	if _arena == null:
		return null
	return _first_nav_region(_arena)


func _first_nav_region(node: Node) -> NavigationRegion3D:
	if node is NavigationRegion3D:
		return node as NavigationRegion3D
	for child in node.get_children():
		var found := _first_nav_region(child)
		if found != null:
			return found
	return null


func _player_spawn_transform() -> Transform3D:
	if _arena != null and _arena.has_node("PlayerSpawn"):
		return (_arena.get_node("PlayerSpawn") as Node3D).global_transform
	return Transform3D(Basis.IDENTITY, Vector3(0.0, 2.0, 0.0))


## Collect the 4 titan-spawn markers on the connected base floor (ring fallback).
func _titan_spawn_transforms() -> Array[Transform3D]:
	var result: Array[Transform3D] = []
	if _arena != null:
		for i in range(1, TITAN_COUNT + 1):
			var marker_name := "TitanSpawn%d" % i
			if _arena.has_node(marker_name):
				result.append((_arena.get_node(marker_name) as Node3D).global_transform)
	if result.is_empty():
		for i in TITAN_COUNT:
			var angle: float = TAU * float(i) / float(TITAN_COUNT)
			result.append(Transform3D(Basis.IDENTITY,
				Vector3(cos(angle) * 30.0, 2.0, sin(angle) * 30.0)))
	return result


func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text
