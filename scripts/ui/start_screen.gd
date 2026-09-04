extends Control
## Start / title screen shown FIRST at launch (project.godot run/main_scene).
##
## It presents the game title, a Start button that loads the existing Main scene
## via change_scene_to_file, and a Settings section whose minimum content is a
## Korean/English language selector. The selector is routed through the Settings
## autoload (FEAT-001): set_locale() applies the locale to the TranslationServer,
## persists it to user://wirework_settings.json, and emits locale_changed. This
## screen listens to that signal and re-applies tr() so its own text updates live
## when the language changes. It does NOT persist the locale itself.
##
## Main.tscn's flow (GameManager runtime bake -> round loop) is unchanged; it is
## simply the scene loaded after pressing Start.

# =====================================================================
# CONSTANTS (no magic strings/paths below this block)
# =====================================================================

## Scene loaded when Start is pressed. Its GameManager runs the normal loop.
const MAIN_SCENE_PATH: String = "res://scenes/Main.tscn"
## Locale codes in the order they appear in the language selector. Index maps
## 1:1 to LOCALE_LABELS and to the OptionButton item ids.
const LOCALES: Array[String] = ["en", "ko"]
## Display labels for each locale. Names are shown in their own language and are
## intentionally NOT translated (a language menu names languages natively).
const LOCALE_LABELS: Array[String] = ["English", "한국어"]

# The game name is a proper noun kept as-is (see steering: no IP, but the
# project's own title "wirework" is not localized).
const TITLE_TEXT: String = "wirework"

# tr() keys for the localized labels/buttons (rows in locale/ui.csv).
const KEY_SUBTITLE: String = "START_SUBTITLE"
const KEY_PLAY: String = "START_PLAY"
const KEY_SETTINGS: String = "START_SETTINGS"
const KEY_LANGUAGE: String = "START_LANGUAGE"

# --- NODE REFS (paths must match scenes/StartScreen.tscn) ---
@onready var _title: Label = $Center/VBox/Title
@onready var _subtitle: Label = $Center/VBox/Subtitle
@onready var _start_button: Button = $Center/VBox/StartButton
@onready var _settings_title: Label = $Center/VBox/SettingsPanel/Margin/SettingsVBox/SettingsTitle
@onready var _language_label: Label = $Center/VBox/SettingsPanel/Margin/SettingsVBox/LanguageRow/LanguageLabel
@onready var _language_option: OptionButton = $Center/VBox/SettingsPanel/Margin/SettingsVBox/LanguageRow/LanguageOption


func _ready() -> void:
	# Main/player captures the mouse itself on load, so the start screen keeps a
	# visible cursor for the buttons/selector.
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	_populate_language_option()
	_language_option.item_selected.connect(_on_language_selected)
	_start_button.pressed.connect(_on_start)

	# Re-render this screen's text whenever the locale changes so switching the
	# selector updates the labels immediately.
	Settings.locale_changed.connect(_on_locale_changed)

	_apply_translations()


## Fill the selector with the supported locales and preselect the current one.
func _populate_language_option() -> void:
	_language_option.clear()
	for i in LOCALES.size():
		_language_option.add_item(LOCALE_LABELS[i], i)
	var current: int = LOCALES.find(Settings.get_locale())
	if current < 0:
		current = 0
	_language_option.select(current)


## Selector -> Settings autoload. set_locale persists + emits locale_changed,
## which triggers _on_locale_changed to refresh the visible text.
func _on_language_selected(index: int) -> void:
	if index < 0 or index >= LOCALES.size():
		return
	Settings.set_locale(LOCALES[index])


## Keep the selector in sync (e.g. if the locale changed elsewhere) and re-apply
## all localized text.
func _on_locale_changed(locale: String) -> void:
	var idx: int = LOCALES.find(locale)
	if idx >= 0 and _language_option.selected != idx:
		_language_option.select(idx)
	_apply_translations()


## Apply tr() to every localized label/button. The title stays the proper noun.
func _apply_translations() -> void:
	_title.text = TITLE_TEXT
	_subtitle.text = tr(KEY_SUBTITLE)
	_start_button.text = tr(KEY_PLAY)
	_settings_title.text = tr(KEY_SETTINGS)
	_language_label.text = tr(KEY_LANGUAGE)


## Start pressed: hand off to the existing Main scene, which runs its normal
## runtime-bake + round loop. No gameplay logic is touched here.
func _on_start() -> void:
	get_tree().change_scene_to_file(MAIN_SCENE_PATH)
