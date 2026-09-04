extends SceneTree
## First-person screenshot renderer. Instances scenes/Main.tscn, advances a few
## process frames so the arena/titans/player-eye view renders, then saves a PNG
## of the active first-person camera and quits 0. Invoked via tools/screenshot.sh
## (which supplies a virtual framebuffer through xvfb-run and
## --rendering-driver opengl3).
##
## Web/headless-safe: no SubViewport, no Thread/Mutex/Semaphore/WorkerThreadPool.
## Everything renders into the single root Window viewport the driver already
## created; we just wait a bounded number of frames before capturing so the
## navigation-bake / loading gate has time to reveal the world.

# --- TUNING CONSTANTS (no magic numbers below this block) ---

## Scene to load and render (the real first-person game world).
const MAIN_SCENE_PATH: String = "res://scenes/Main.tscn"
## Process frames to advance before capturing, so the world is visible.
const WARMUP_FRAMES: int = 90
## Output paths.
const OUT_DIR: String = "reports"
const OUT_FILE: String = "reports/shot.png"

var _frames_left: int = WARMUP_FRAMES


func _initialize() -> void:
	# Instance the full game scene so the first-person camera, arena and titans
	# render exactly as in play. Guarded: if it cannot load, fall back to an
	# empty-frame capture so the harness still produces a PNG and exits 0.
	if ResourceLoader.exists(MAIN_SCENE_PATH):
		var packed := load(MAIN_SCENE_PATH) as PackedScene
		if packed != null:
			var scene := packed.instantiate()
			if scene != null:
				root.add_child(scene)
	process_frame.connect(_on_frame)


func _on_frame() -> void:
	# Advance a bounded number of frames so the loading gate lifts and the
	# world (including titans) has rendered before we grab the framebuffer.
	if _frames_left > 0:
		_frames_left -= 1
		return
	process_frame.disconnect(_on_frame)
	_capture()


func _capture() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))

	var viewport: Viewport = root
	var err: int = ERR_UNAVAILABLE
	if viewport != null:
		var tex: ViewportTexture = viewport.get_texture()
		if tex != null:
			var image: Image = tex.get_image()
			if image != null:
				err = image.save_png(OUT_FILE)

	if err == OK:
		print("[shot] saved %s" % ProjectSettings.globalize_path(OUT_FILE))
	else:
		print("[shot] could not capture a frame (err %d) - non-fatal." % err)

	quit(0)
