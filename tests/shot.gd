extends SceneTree
## STUB screenshot renderer (spec 0, OPTIONAL). Renders one frame of an empty
## scene and saves a PNG, then quits 0. Spec 4 (evolution-screen) attaches the
## real evolution screen. Invoked via tools/screenshot.sh (which supplies a
## virtual framebuffer through xvfb-run and --rendering-driver opengl3).

const OUT_DIR: String = "reports"
const OUT_FILE: String = "reports/shot.png"


func _initialize() -> void:
	# Wait one process frame so the (empty) viewport has something to capture.
	process_frame.connect(_capture, CONNECT_ONE_SHOT)


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
		print("[shot] could not capture a frame (err %d) - non-fatal stub." % err)

	quit(0)
