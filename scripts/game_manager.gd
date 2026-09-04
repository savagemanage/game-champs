extends Node
## GameManager - owns the round lifecycle. Runtime-bakes the navmesh (via
## NavBaker) behind a loading screen, spawns EXACTLY 4 titans + the FIXED citizen
## set per round, drives the evolution screen, and resolves the round: WIN = all
## titans down, LOSE = all citizens eaten (FEAT-003). INVARIANT (handoff.md):
## counts/stats FIXED; no scaling by round number.

const TITAN_COUNT: int = 4  ## FIXED per round; NEVER scaled by round number.
const RESPAWN_DELAY: float = 2.0  ## seconds between last kill and next spawn
# Translation KEYS for user-facing text (resolved via tr() at display time).
const KEY_LOADING_BAKING: String = "LOADING_BAKING"
const KEY_ROUND_N: String = "ROUND_N"
const KEY_STATUS_TITANS_STRIKE: String = "STATUS_TITANS_STRIKE"
const KEY_STATUS_TITANS_LEFT: String = "STATUS_TITANS_LEFT"
const KEY_STATUS_ROUND_CLEARED: String = "STATUS_ROUND_CLEARED"
const KEY_STATUS_ROUND_LOST: String = "STATUS_ROUND_LOST"  # FEAT-003 fail path

@export var titan_scene: PackedScene  # scene wiring set in Main.tscn
@export var arena_path: NodePath = ^"../Arena"
@export var player_path: NodePath = ^"../Player"
@export var round_label_path: NodePath = ^"UI/RoundLabel"
@export var status_label_path: NodePath = ^"UI/StatusLabel"
@export var loading_screen_path: NodePath = ^"LoadingScreen"
@export var evolution_screen_path: NodePath = ^"../EvolutionScreen"
@export var citizen_manager_path: NodePath = ^"CitizenManager"  # FEAT-003

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
var _citizen_manager: Node  ## FEAT-003: spawns/tracks the eatable plaza citizens
var _round_over: bool = false  ## FEAT-003: guards win/lose so both fire once

func _ready() -> void:
	_arena = get_node_or_null(arena_path) as Node3D
	_player = get_node_or_null(player_path) as Node3D
	_round_label = get_node_or_null(round_label_path) as Label
	_status_label = get_node_or_null(status_label_path) as Label
	_loading_screen = get_node_or_null(loading_screen_path) as CanvasLayer
	_evolution_screen = get_node_or_null(evolution_screen_path) as CanvasLayer
	if _evolution_screen != null and _evolution_screen.has_signal("finished"):
		_evolution_screen.finished.connect(_on_evolution_screen_finished)
	_citizen_manager = get_node_or_null(citizen_manager_path)
	if _citizen_manager != null and _citizen_manager.has_signal("all_eaten"):
		_citizen_manager.all_eaten.connect(_on_all_citizens_eaten)
	if _citizen_manager != null and _citizen_manager.has_signal("citizen_eaten"):
		_citizen_manager.citizen_eaten.connect(_on_citizen_eaten)  # FEAT-005 telemetry
	if titan_scene == null:
		push_warning("GameManager: titan_scene unassigned; no titans will spawn.")
	_refresh_hud_locale()  # localize HUD now + on live locale switch
	if typeof(Settings) != TYPE_NIL and Settings != null and Settings.has_signal("locale_changed"):
		Settings.locale_changed.connect(func(_l): _refresh_hud_locale())
	_begin_runtime_bake()


func _refresh_hud_locale() -> void:  # startup + live locale switch
	if _round_label != null:
		_round_label.text = tr(KEY_ROUND_N) % maxi(_round_number, 1)
	if _status_label != null and not _gameplay_started:
		_status_label.text = tr(KEY_LOADING_BAKING)


func _begin_runtime_bake() -> void:
	if _loading_screen != null and _loading_screen.has_method("show_screen"):
		_loading_screen.call("show_screen", tr(KEY_LOADING_BAKING))
	_nav_region = _first_nav_region(_arena) if _arena != null else null
	var baker: Node = NavBaker.new()
	add_child(baker)
	baker.finished.connect(_on_bake_finished)
	baker.call("bake", _nav_region)


func _on_bake_finished() -> void:
	if _gameplay_started:
		return
	_gameplay_started = true
	if _loading_screen != null and _loading_screen.has_method("hide_screen"):
		_loading_screen.call("hide_screen")
	_start_round()


func _start_round() -> void:
	_round_number += 1
	_round_over = false
	_reset_player()
	_spawn_citizens()  # FEAT-003: repopulate the plaza before titans arrive
	_spawn_titans()
	_set_status(tr(KEY_STATUS_TITANS_STRIKE) % TITAN_COUNT)
	_refresh_hud_locale()
	if Telemetry != null:
		Telemetry.start_round()  # spec 2: begin recording this round


func _physics_process(delta: float) -> void:
	if _gameplay_started and Telemetry != null:
		Telemetry.sample_tick(delta)


func _spawn_citizens() -> void:  # FEAT-003: repopulate the plaza citizen set
	if _citizen_manager == null or not _citizen_manager.has_method("spawn_citizens"):
		return
	var area: Node = null
	if _arena != null and _arena.has_node("CitizenArea"):
		area = _arena.get_node("CitizenArea")
	_citizen_manager.call("spawn_citizens", area)

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
		if titan.has_method("set_citizen_manager") and _citizen_manager != null:
			titan.set_citizen_manager(_citizen_manager)  # FEAT-004 eat hook
		if titan.has_signal("titan_killed"):
			titan.titan_killed.connect(_on_titan_killed)
		_titans.append(titan)
		_alive += 1
	_inject_evolved_genes()

func _inject_evolved_genes() -> void:  # latest best genome + siblings per titan
	if typeof(TitanEvo) == TYPE_NIL or TitanEvo == null:
		return
	var genes: PackedFloat32Array = TitanEvo.current_best_genes()
	if TitanEvo.has_method("set_citizen_manager") and _citizen_manager != null:
		TitanEvo.set_citizen_manager(_citizen_manager)  # citizen positions -> sim
	for titan in _titans:
		if titan == null or not is_instance_valid(titan):
			continue
		if titan.has_method("set_genes"):
			titan.set_genes(genes)
		if titan.has_method("set_neighbours"):
			titan.set_neighbours(_titans)

func _on_citizen_eaten(_alive_citizens: int) -> void:  # FEAT-005 telemetry
	if Telemetry != null and Telemetry.has_method("report_citizen_eaten"):
		Telemetry.report_citizen_eaten()


func _on_titan_killed() -> void:
	_alive -= 1
	if Telemetry != null and Telemetry.has_method("report_titan_killed"):
		Telemetry.report_titan_killed()  # titans only die to the player's slash
	if _round_over:
		return  # round already resolved (e.g. citizens lost); ignore late kills
	if _alive > 0:
		_set_status(tr(KEY_STATUS_TITANS_LEFT) % _alive)
		if not _first_kill_screen_shown:  # evolution screen: once after 1st kill
			_first_kill_screen_shown = true
			_try_show_evo_screen("request_first_kill_show")
		return
	_round_over = true  # WIN: all titans down
	_set_status(tr(KEY_STATUS_ROUND_CLEARED) % _round_number)
	if Telemetry != null:
		Telemetry.end_round()
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null:
		TitanEvo.start_evolution_burst()
	if _try_show_evo_screen("request_round_show", _round_number):
		return
	get_tree().create_timer(RESPAWN_DELAY).timeout.connect(_start_round)

func _try_show_evo_screen(method: String, arg = null) -> bool:  # returns took-over
	if _evolution_screen == null or not _evolution_screen.has_method(method):
		return false
	var took_over: bool = _evolution_screen.call(method, arg) if arg != null else _evolution_screen.call(method)
	if not took_over:
		return false
	if typeof(TitanEvo) != TYPE_NIL and TitanEvo != null and not TitanEvo.is_evolving():
		TitanEvo.start_evolution_burst()
	get_tree().paused = true
	return true

func _on_evolution_screen_finished() -> void:  # resume gameplay post-evo screen
	get_tree().paused = false
	if _alive <= 0:
		get_tree().create_timer(RESPAWN_DELAY).timeout.connect(_start_round)

## FEAT-003 FAIL PATH: plaza citizens wiped out. Round LOST: stop titans + restart.
func _on_all_citizens_eaten() -> void:
	if _round_over:
		return
	_round_over = true
	if Telemetry != null:
		Telemetry.end_round()
	_clear_titans()
	_alive = 0
	_set_status(tr(KEY_STATUS_ROUND_LOST) % _round_number)
	get_tree().create_timer(RESPAWN_DELAY).timeout.connect(_start_round)


func get_titans() -> Array: return _titans  # read-only: nape indicator enumerates
func get_citizen_manager() -> Node: return _citizen_manager  # FEAT-004/005 hook
func _clear_titans() -> void:
	for titan in _titans:
		if titan != null and is_instance_valid(titan):
			titan.queue_free()
	_titans.clear()

func _reset_player() -> void:
	if _player == null: return
	_player.global_transform = _player_spawn_transform()
	if _player is CharacterBody3D:
		(_player as CharacterBody3D).velocity = Vector3.ZERO

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

func _titan_spawn_transforms() -> Array[Transform3D]:  # 4 outside-wall markers
	var result: Array[Transform3D] = []
	if _arena != null:
		for i in range(1, TITAN_COUNT + 1):
			if _arena.has_node("TitanSpawn%d" % i):
				result.append((_arena.get_node("TitanSpawn%d" % i) as Node3D).global_transform)
	if result.is_empty():
		for i in TITAN_COUNT:
			var a: float = TAU * float(i) / float(TITAN_COUNT)
			result.append(Transform3D(Basis.IDENTITY, Vector3(sin(a) * 50.0, 2.0, cos(a) * 50.0)))
	return result

func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text
