extends Control
class_name NapeIndicator
## Per-titan, screen-projected NAPE weak-point overlay. Titans own a FIXED HP pool
## (FEAT-004) with the nape as a WEAK POINT, so this teaches the part-damage model
## on top of an HP meter. For each alive TITAN (never a citizen) it screen-projects
## the nape (Camera3D.unproject_position, NO SubViewport) and draws a state word -
## GUARDED (nape turned away), else EXPOSED (facing, no live swing), else LETHAL if
## the CURRENT aim would remove >= the titan's remaining HP as a NAPE crit, else
## WEAK - plus a meter = titan HP remaining. Projected part damage is read from the
## live slash terms + the titan's own multiplier; no maths here. On a real slash it
## floats a readout of HP removed + survivor HP ("-18 HP (32% left)" / "KILL") via
## the ADDITIVE slash.gd `slash_resolved` signal. Presentation only; web-safe (pure
## _draw + _process, no SubViewport/threads; every lookup guarded).

# =====================================================================
# TUNING CONSTANTS (no magic numbers below this block)
# =====================================================================

## State colours.
const LETHAL_COLOR: Color = Color(0.35, 1.0, 0.45, 1.0)
const WEAK_COLOR: Color = Color(1.0, 0.75, 0.25, 1.0)
const GUARDED_COLOR: Color = Color(0.6, 0.63, 0.7, 0.9)
const METER_BG_COLOR: Color = Color(0.1, 0.11, 0.14, 0.75)
const TEXT_OUTLINE_COLOR: Color = Color(0.0, 0.0, 0.0, 0.85)

## EXPOSED when dot(nape_normal, dir_to_player) > this; below = turned away.
const EXPOSE_DOT_THRESHOLD: float = 0.15
const WORLD_Y_OFFSET: float = 1.2  ## metres above the nape for the label
const MAX_DISPLAY_DISTANCE: float = 90.0  ## skip indicators past this (m)
const UPDATE_INTERVAL: float = 0.05  ## refresh throttle (~20 Hz)

## Meter bar geometry (px).
const METER_WIDTH: float = 66.0
const METER_HEIGHT: float = 7.0
const METER_LABEL_GAP: float = 4.0
const LABEL_FONT_SIZE: int = 15
const OUTLINE_PX: int = 3

## Floating damage popup (on a real slash): lifetime (s), upward drift (px), size.
const POPUP_LIFETIME: float = 1.0
const POPUP_RISE: float = 46.0
const POPUP_FONT_SIZE: int = 20

## Translation KEYS (resolved via tr() at draw time so labels localize live).
const KEY_LETHAL: String = "NAPE_LETHAL"
const KEY_WEAK: String = "NAPE_WEAK"
const KEY_GUARDED: String = "NAPE_GUARDED"
const KEY_EXPOSED: String = "NAPE_EXPOSED"
const KEY_DMG_KILL: String = "DMG_READOUT_KILL"
const KEY_DMG_HP: String = "DMG_READOUT_HP"

## Where to find the GameManager (owns get_titans()) and the player.
@export var game_manager_path: NodePath = ^"../.."
@export var player_group: String = "player"

# =====================================================================
# STATE (presentation only)
# =====================================================================

var _game_manager: Node
var _slash: Node  ## the player's Slash node (read-only accessors)
var _time_since_update: float = 0.0
# One popup per recent slash: {pos: Vector3, text: String, color: Color, age}.
var _popups: Array = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_game_manager = get_node_or_null(game_manager_path)
	_resolve_player_slash()
	# Localize on live switch (mirror game_manager.gd): a redraw re-runs tr().
	if typeof(Settings) != TYPE_NIL and Settings != null and Settings.has_signal("locale_changed"):
		Settings.locale_changed.connect(func(_l): queue_redraw())


## Find the player's Slash node and subscribe to its additive result signal.
func _resolve_player_slash() -> void:
	var player: Node = _find_player()
	if player == null:
		return
	if player.has_node("Slash"):
		_slash = player.get_node("Slash")
		if _slash != null and _slash.has_signal("slash_resolved") \
				and not _slash.slash_resolved.is_connected(_on_slash_resolved):
			_slash.slash_resolved.connect(_on_slash_resolved)


func _find_player() -> Node:
	var players := get_tree().get_nodes_in_group(player_group)
	if players.size() > 0:
		return players[0] as Node
	var root := get_tree().current_scene
	if root != null and root.has_node("Player"):
		return root.get_node("Player")
	return null


func _process(delta: float) -> void:
	# Lazily (re)bind the Slash node if the player spawned after us.
	if _slash == null or not is_instance_valid(_slash):
		_resolve_player_slash()

	var dirty: bool = false
	if not _popups.is_empty():  # age out floating popups
		var kept: Array = []
		for p in _popups:
			p["age"] += delta
			if p["age"] < POPUP_LIFETIME:
				kept.append(p)
		_popups = kept
		dirty = true

	_time_since_update += delta
	if _time_since_update >= UPDATE_INTERVAL:
		_time_since_update = 0.0
		dirty = true
	if dirty:
		queue_redraw()


## Additive readout hook (FEAT-004): remember a floating popup of the HP removed
## and the survivor's remaining HP fraction (or KILL) at the hit position.
func _on_slash_resolved(applied: float, hp_ratio: float, killed: bool, is_nape: bool, world_pos: Vector3) -> void:
	var text: String
	var color: Color
	if killed:
		text = tr(KEY_DMG_KILL)
		color = LETHAL_COLOR
	else:
		text = tr(KEY_DMG_HP) % [applied, hp_ratio * 100.0]
		color = WEAK_COLOR
	_popups.append({"pos": world_pos, "text": text, "color": color, "age": 0.0})
	queue_redraw()


# =====================================================================
# DRAW (single canvas; screen-projected via the active camera)
# =====================================================================

func _draw() -> void:
	var cam: Camera3D = get_viewport().get_camera_3d()
	if cam == null:
		return
	_draw_titan_indicators(cam)
	_draw_popups(cam)


func _draw_titan_indicators(cam: Camera3D) -> void:
	var titans: Array = _titans()
	if titans.is_empty():
		return
	var player_pos: Vector3 = _player_position()
	for t in titans:
		if t == null or not is_instance_valid(t):
			continue
		if t.has_method("is_alive") and not t.is_alive():
			continue
		if not t.has_method("get_nape_world_position"):
			continue
		var nape_pos: Vector3 = t.get_nape_world_position()
		if cam.is_position_behind(nape_pos) \
				or cam.global_position.distance_to(nape_pos) > MAX_DISPLAY_DISTANCE:
			continue
		_draw_one(cam, t, nape_pos, player_pos)


func _draw_one(cam: Camera3D, titan: Node, nape_pos: Vector3, player_pos: Vector3) -> void:
	var nape_normal: Vector3 = Vector3.ZERO
	if titan.has_method("get_nape_normal"):
		nape_normal = titan.get_nape_normal()

	# EXPOSED vs GUARDED: is the back-of-neck turned toward the attacker?
	var exposed: bool = true
	var to_player: Vector3 = player_pos - nape_pos
	if nape_normal.length() > 0.001 and to_player.length() > 0.001:
		exposed = nape_normal.normalized().dot(to_player.normalized()) > EXPOSE_DOT_THRESHOLD

	# HP meter (FEAT-004): the bar now tracks the titan's remaining HP fraction.
	var hp_ratio: float = 1.0
	if titan.has_method("hp_ratio"):
		hp_ratio = clampf(titan.hp_ratio(), 0.0, 1.0)

	# Would the CURRENT aim, landing as a NAPE crit, fell the titan? (live terms)
	var lethal: bool = false
	var aiming: bool = false  # true once the live swing would deal real damage
	if _slash != null and is_instance_valid(_slash) and _slash.has_method("projected_damage"):
		var base: float = _slash.projected_damage(nape_normal)
		aiming = base > 0.0
		if titan.has_method("part_damage") and titan.has_method("remaining_hp"):
			var remaining_hp: float = titan.remaining_hp()
			lethal = titan.part_damage(base, true) >= remaining_hp and remaining_hp > 0.0

	# GUARDED (turned away) -> EXPOSED (facing, no live swing) -> WEAK / LETHAL.
	var state_key: String = KEY_GUARDED if not exposed else (KEY_EXPOSED if not aiming else (KEY_LETHAL if lethal else KEY_WEAK))
	var color: Color = GUARDED_COLOR if not exposed else (LETHAL_COLOR if lethal else WEAK_COLOR)
	var screen: Vector2 = cam.unproject_position(nape_pos + Vector3.UP * WORLD_Y_OFFSET)
	_draw_meter(screen, color, hp_ratio, not exposed)
	_draw_text(screen - Vector2(0.0, METER_HEIGHT + METER_LABEL_GAP), tr(state_key), color, LABEL_FONT_SIZE)


func _draw_meter(centre: Vector2, color: Color, ratio: float, guarded: bool) -> void:
	var origin := Vector2(centre.x - METER_WIDTH * 0.5, centre.y)
	draw_rect(Rect2(origin, Vector2(METER_WIDTH, METER_HEIGHT)), METER_BG_COLOR, true)
	if not guarded and ratio > 0.0:
		draw_rect(Rect2(origin, Vector2(METER_WIDTH * ratio, METER_HEIGHT)), color, true)
	draw_rect(Rect2(origin, Vector2(METER_WIDTH, METER_HEIGHT)), color, false, 1.0)


func _draw_popups(cam: Camera3D) -> void:
	for p in _popups:
		var world: Vector3 = p["pos"]
		if cam.is_position_behind(world):
			continue
		var age: float = p["age"]
		var frac: float = clampf(age / POPUP_LIFETIME, 0.0, 1.0)
		var screen: Vector2 = cam.unproject_position(world) - Vector2(0.0, POPUP_RISE * frac)
		var color: Color = p["color"]
		color.a = 1.0 - frac  # fade out over its life
		_draw_text(screen, p["text"], color, POPUP_FONT_SIZE)


## Draw centred text with a cheap outline (offset copies) so it reads over 3D.
func _draw_text(centre: Vector2, text: String, color: Color, size: int) -> void:
	var font: Font = get_theme_default_font()
	if font == null:
		return
	var width: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var pos := Vector2(centre.x - width * 0.5, centre.y)
	var outline := TEXT_OUTLINE_COLOR
	outline.a *= color.a
	for ox in [-OUTLINE_PX, OUTLINE_PX]:
		draw_string(font, pos + Vector2(ox, 0.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, outline)
	for oy in [-OUTLINE_PX, OUTLINE_PX]:
		draw_string(font, pos + Vector2(0.0, oy), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, outline)
	draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


# --- HELPERS (read-only). _titans() only enumerates GameManager titans, never
# citizens, so a citizen can never receive a nape/GUARDED tag. ---
func _titans() -> Array:
	if _game_manager != null and is_instance_valid(_game_manager) and _game_manager.has_method("get_titans"):
		return _game_manager.get_titans()
	return []

func _player_position() -> Vector3:
	var player: Node = _find_player()
	if player is Node3D:
		return (player as Node3D).global_position
	return Vector3.ZERO
