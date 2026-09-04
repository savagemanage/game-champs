extends Node3D
## A single citizen NPC (FEAT-003). A PASSIVE entity inside the walled plaza that
## a titan can "eat" (remove) once a titan reaches it (the eat interaction is
## wired in FEAT-004; here the citizen only exists, tracks alive state, and can
## be consumed on request). Visual-only: it carries NO collision shape so it
## never seeds the runtime-baked navmesh and never blocks titan pathing.
##
## Model swap (FEAT-006) is made trivial by shipping a "CharacterModel" child
## running scripts/player/character_visual.gd with a primitive-capsule fallback:
## the guarded GLB loader hides the primitive once a real citizen model imports.
##
## Web-safe (see handoff.md): no Thread/Mutex/Semaphore/WorkerThreadPool, no
## SubViewport. No randomness here (nothing to seed).

signal eaten  ## emitted once when this citizen is consumed by a titan

var _alive: bool = true


## True until the citizen has been eaten. is_instance_valid() still holds until
## the manager frees the node on the next frame.
func is_alive() -> bool:
	return _alive


## Consume this citizen (called by the CitizenManager / FEAT-004 eat logic).
## Idempotent: a second call in the same frame is harmless. Emits `eaten` once.
func eat() -> void:
	if not _alive:
		return
	_alive = false
	eaten.emit()
	queue_free()
