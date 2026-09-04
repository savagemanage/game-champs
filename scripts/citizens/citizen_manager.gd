extends Node
## CitizenManager (FEAT-003) - scene-side owner of the eatable citizen NPCs that
## live inside the Wall-Maria plaza. Spawns a FIXED number of citizens at the
## Arena's CitizenArea markers, tracks the live count, and exposes a clean,
## PLAIN-DATA API so the round fail-condition (game_manager.gd) and later the GA
## fitness (FEAT-005, via telemetry) can consume numbers only:
##   * get_citizen_positions() -> Array[Vector3]   (live citizen world positions)
##   * citizens_alive() / citizens_total() -> int
##   * report_citizen_eaten(citizen) / eat_nearest(pos, radius) -> bool
## and emits `citizen_eaten(alive)` per eat and `all_eaten()` when it hits 0.
##
## INVARIANT (see handoff.md): the citizen count is FIXED and NEVER scales with
## the round number. This is a Node (scene-side); it is NOT in scripts/evo or
## scripts/telemetry, which stay RefCounted-only / scene-free - only the plain
## counts/positions above cross that boundary.
##
## Web-safe: no Thread/Mutex/Semaphore/WorkerThreadPool, no SubViewport. No
## global randf()/randi() - spawning is deterministic (marker order).

signal citizen_eaten(alive: int)  ## emitted after each eat, carries new alive count
signal all_eaten                  ## emitted once when the last citizen is eaten

# --- TUNING CONSTANTS (no magic numbers below this block) ---
## FIXED citizen count. Never scales with round number. Marker count wins if the
## CitizenArea exposes fewer/more markers; this is the default/fallback target.
const CITIZEN_COUNT: int = 8
## Default horizontal radius (m) used by eat_nearest() when a titan "reaches"
## the plaza and consumes the closest citizen (the FEAT-004 eat interaction).
const EAT_RADIUS: float = 4.0

@export var citizen_scene: PackedScene  ## scenes/Citizen.tscn (set in Main.tscn)
@export var citizen_area_path: NodePath  ## Arena/CitizenArea (the markers parent)

var _citizens: Array[Node3D] = []
var _total: int = 0


## Spawn the fixed citizen set at the CitizenArea markers. `area` is the node
## holding the C1..Cn Marker3D children; passing null resolves citizen_area_path.
func spawn_citizens(area: Node = null) -> void:
	_clear()
	var markers: Array[Node3D] = _collect_markers(area)
	if markers.is_empty() or citizen_scene == null:
		return
	for marker in markers:
		var citizen := citizen_scene.instantiate() as Node3D
		if citizen == null:
			continue
		add_child(citizen)
		citizen.global_transform = marker.global_transform
		if citizen.has_signal("eaten"):
			citizen.eaten.connect(_on_citizen_eaten.bind(citizen))
		_citizens.append(citizen)
	_total = _citizens.size()


## Live citizen world positions (plain Vector3 array) for telemetry / fitness.
func get_citizen_positions() -> Array:
	var out: Array = []
	for c in _citizens:
		if c != null and is_instance_valid(c):
			out.append(c.global_position)
	return out


func citizens_alive() -> int:
	var n: int = 0
	for c in _citizens:
		if c != null and is_instance_valid(c):
			n += 1
	return n


func citizens_total() -> int:
	return _total


## Eat a specific citizen (FEAT-004 reach interaction). Returns true if it was a
## live citizen we consumed. The citizen's `eaten` signal drives the bookkeeping.
func report_citizen_eaten(citizen: Node) -> bool:
	if citizen == null or not is_instance_valid(citizen):
		return false
	if not citizen.has_method("eat"):
		return false
	if citizen.has_method("is_alive") and not citizen.is_alive():
		return false
	citizen.eat()
	return true


## Consume the nearest live citizen within `radius` of `world_pos` (horizontal).
## Returns true when one was eaten. Used by FEAT-004 titan-reach logic.
func eat_nearest(world_pos: Vector3, radius: float = EAT_RADIUS) -> bool:
	var best: Node3D = null
	var best_d: float = radius * radius
	for c in _citizens:
		if c == null or not is_instance_valid(c):
			continue
		var d: Vector3 = c.global_position - world_pos
		d.y = 0.0
		var dsq: float = d.length_squared()
		if dsq <= best_d:
			best_d = dsq
			best = c
	return report_citizen_eaten(best)


func _on_citizen_eaten(citizen: Node) -> void:
	_citizens.erase(citizen)
	var alive: int = citizens_alive()
	citizen_eaten.emit(alive)
	if alive <= 0:
		all_eaten.emit()


func _collect_markers(area: Node) -> Array[Node3D]:
	var host: Node = area
	if host == null and not citizen_area_path.is_empty():
		host = get_node_or_null(citizen_area_path)
	var out: Array[Node3D] = []
	if host == null:
		return out
	for child in host.get_children():
		if child is Node3D:
			out.append(child as Node3D)
	return out


func _clear() -> void:
	for c in _citizens:
		if c != null and is_instance_valid(c):
			c.queue_free()
	_citizens.clear()
	_total = 0
