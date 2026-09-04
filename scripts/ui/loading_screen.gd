extends CanvasLayer
## Loading screen shown while the arena's navmesh is baked at RUNTIME.
##
## The web export is single-threaded, so a navmesh bake stalls a frame. Showing
## this overlay first means the stall is hidden behind a "Baking navigation..."
## message rather than a frozen game. GameManager shows it, kicks off the bake,
## and hides it via hide_screen() once the bake_finished signal fires.

## Translation KEY for the "Ready" state; resolved via tr() at display time so it
## follows the selected locale.
const READY_KEY: String = "LOADING_READY"
## Translation KEY for the default "Baking navigation..." message.
const BAKING_KEY: String = "LOADING_BAKING"

@onready var _label: Label = $Center/Label


func _ready() -> void:
	# Localize the scene's placeholder text at startup so nothing shows in the
	# authoring language before GameManager calls show_screen().
	if _label != null:
		_label.text = tr(BAKING_KEY)


## Show the loading overlay. `message` may be empty to use the default localized
## "Baking navigation..." text; callers pass a pre-localized string.
func show_screen(message: String = "") -> void:
	visible = true
	if _label != null:
		_label.text = message if message != "" else tr(BAKING_KEY)


func set_message(message: String) -> void:
	if _label != null:
		_label.text = message


func hide_screen() -> void:
	if _label != null:
		_label.text = tr(READY_KEY)
	visible = false
