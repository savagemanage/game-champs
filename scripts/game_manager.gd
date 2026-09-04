extends Node
## GameManager - owns the round lifecycle.
##
## Responsibilities:
##   * Spawn a titan at the map's TitanSpawn marker at the start of each round.
##   * Hand the titan the player reference and let it read the current adaptive
##     weights (which PlayerStats recomputes between rounds).
##   * Listen for the titan's `titan_killed` signal.
##   * On a kill: tell PlayerStats to end the round (persist stats + recompute
##     the behaviour weights), then start the next round so the new titan
##     visibly uses the updated weights.
##   * Drive a minimal on-screen UI (round number + status text).
##
## This node lives in Main.tscn alongside the instanced TestMap and Player.

# =====================================================================
# CONFIG
# =====================================================================

## The titan scene to spawn. Set in the Inspector (Main.tscn wires it up).
@export var titan_scene: PackedScene

## Node paths within Main.tscn. Exposed so the scene wiring is visible/tweakable.
@export var map_path: NodePath = ^"../TestMap"
@export var player_path: NodePath = ^"../Player"
@export var round_label_path: NodePath = ^"UI/RoundLabel"
@export var status_label_path: NodePath = ^"UI/StatusLabel"

## Short pause (seconds) between a titan dying and the next one spawning, so the
## "Titan down" message is readable.
@export var respawn_delay: float = 2.0

# =====================================================================
# STATE
# =====================================================================

var _map: Node3D
var _player: Node3D
var _round_label: Label
var _status_label: Label

var _titan: CharacterBody3D = null
var _round_number: int = 0


func _ready() -> void:
	_map = get_node_or_null(map_path) as Node3D
	_player = get_node_or_null(player_path) as Node3D
	_round_label = get_node_or_null(round_label_path) as Label
	_status_label = get_node_or_null(status_label_path) as Label

	if titan_scene == null:
		push_warning("GameManager: titan_scene is not assigned; no titan will spawn.")

	_start_round()


# =====================================================================
# ROUND LIFECYCLE
# =====================================================================

func _start_round() -> void:
	_round_number += 1

	# Reset the player to the spawn marker so each round starts clean.
	_reset_player()

	# Let PlayerStats arm its per-round accumulators / timer for this round.
	var stats := get_node_or_null("/root/PlayerStats")
	if stats != null and stats.has_method("begin_round"):
		stats.begin_round()

	_spawn_titan()

	_set_status("Nape exposed - slash it!")
	_update_round_label()


func _spawn_titan() -> void:
	if titan_scene == null:
		return

	var titan := titan_scene.instantiate() as CharacterBody3D
	if titan == null:
		push_warning("GameManager: titan_scene did not instantiate a CharacterBody3D.")
		return

	# Place it at the TitanSpawn marker on the map.
	var spawn := _titan_spawn_transform()
	# Add to the tree first so global_transform is valid, then position it.
	add_child(titan)
	titan.global_transform = spawn

	# Wire up the titan: give it the player and listen for its death.
	if titan.has_method("set_target") and _player != null:
		titan.set_target(_player)
	if titan.has_signal("titan_killed"):
		titan.titan_killed.connect(_on_titan_killed)

	_titan = titan


func _on_titan_killed() -> void:
	_set_status("Titan down - round %d cleared!" % _round_number)

	# End the round: persist stats + recompute the adaptive weights. The NEXT
	# titan we spawn will read these updated weights in its _ready().
	var stats := get_node_or_null("/root/PlayerStats")
	if stats != null and stats.has_method("end_round"):
		stats.end_round()

	# Clean up the dead titan after a short beat, then start the next round.
	if _titan != null and is_instance_valid(_titan):
		_titan.queue_free()
		_titan = null

	get_tree().create_timer(respawn_delay).timeout.connect(_start_round)


# =====================================================================
# HELPERS
# =====================================================================

func _reset_player() -> void:
	if _player == null:
		return
	var spawn := _player_spawn_transform()
	_player.global_transform = spawn
	# Zero out any leftover momentum from the previous round.
	if _player is CharacterBody3D:
		(_player as CharacterBody3D).velocity = Vector3.ZERO


func _titan_spawn_transform() -> Transform3D:
	if _map != null and _map.has_node("TitanSpawn"):
		return (_map.get_node("TitanSpawn") as Node3D).global_transform
	# Fallback spawn if the marker is missing.
	return Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, -30.0))


func _player_spawn_transform() -> Transform3D:
	if _map != null and _map.has_node("PlayerSpawn"):
		return (_map.get_node("PlayerSpawn") as Node3D).global_transform
	return Transform3D(Basis.IDENTITY, Vector3(0.0, 1.0, 0.0))


func _update_round_label() -> void:
	if _round_label != null:
		_round_label.text = "Round %d" % _round_number


func _set_status(text: String) -> void:
	if _status_label != null:
		_status_label.text = text
