extends CanvasLayer
## Loading screen shown while the arena's navmesh is baked at RUNTIME.
##
## The web export is single-threaded, so a navmesh bake stalls a frame. Showing
## this overlay first means the stall is hidden behind a "Baking navigation..."
## message rather than a frozen game. GameManager shows it, kicks off the bake,
## and hides it via hide_screen() once the bake_finished signal fires.

const READY_TEXT: String = "Ready"

@onready var _label: Label = $Center/Label


func show_screen(message: String = "Baking navigation...") -> void:
	visible = true
	if _label != null:
		_label.text = message


func set_message(message: String) -> void:
	if _label != null:
		_label.text = message


func hide_screen() -> void:
	if _label != null:
		_label.text = READY_TEXT
	visible = false
