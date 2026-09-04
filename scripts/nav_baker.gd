class_name NavBaker
extends Node
## Runtime navmesh baker (extracted from game_manager.gd to keep both files under
## the 250-line cap). Bakes the arena NavigationRegion3D at RUNTIME - never in the
## editor (handoff.md invariant) - behind the loading screen, then reports back
## via the `finished` signal. The NavigationMesh parses STATIC COLLIDERS as its
## source geometry (set in Arena.tscn), so the solid Wall-Maria ring shapes the
## walkable surface and contains titans OUTSIDE the plaza until a breach.
##
## Web-safe (handoff.md): no Thread/Mutex/Semaphore/WorkerThreadPool. The bake
## call itself is synchronous but is deferred one frame so the loading screen
## paints first; work is not spread across threads.

signal finished  ## emitted once the bake completes (or is skipped)

const BAKE_POLL_INTERVAL: float = 0.1  ## bake_finished poll fallback (seconds)

var _region: NavigationRegion3D
var _done: bool = false


## Kick off the runtime bake of `region`. Emits `finished` when complete; a null
## region (nothing to bake) emits immediately so the caller can proceed.
func bake(region: NavigationRegion3D) -> void:
	_region = region
	if _region == null:
		push_warning("NavBaker: no NavigationRegion3D; skipping bake.")
		_emit_finished()
		return
	if _region.has_signal("bake_finished"):
		_region.bake_finished.connect(_emit_finished, CONNECT_ONE_SHOT)
	call_deferred("_run_bake")  # bake next frame so the loading screen paints


func _run_bake() -> void:
	_region.bake_navigation_mesh()
	if not _region.has_signal("bake_finished"):
		get_tree().create_timer(BAKE_POLL_INTERVAL).timeout.connect(_emit_finished)


func _emit_finished() -> void:
	if _done:
		return
	_done = true
	finished.emit()
