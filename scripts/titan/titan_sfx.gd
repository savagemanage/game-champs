extends RefCounted
class_name TitanSfx
## Tiny stateless audio helper for the titan (FEAT-002), kept separate so
## titan.gd stays under the 250-line cap and its movement/damage/gene logic is
## untouched (these are PRESENTATION-only hooks). All are guarded no-ops when
## the Sfx autoload is absent (headless / test), so they never affect logic.

## First-acquire aggro cue at the titan's position.
static func aggro(pos: Vector3) -> void:
	if Sfx != null:
		Sfx.play_at(SfxBank.TITAN_AGGRO, pos)


## Footstep thud at the titan's position (called on the movement cadence).
static func footstep(pos: Vector3) -> void:
	if Sfx != null:
		Sfx.play_at(SfxBank.TITAN_FOOTSTEP, pos)


## Death boom at the titan's position.
static func death(pos: Vector3) -> void:
	if Sfx != null:
		Sfx.play_at(SfxBank.TITAN_DEATH, pos)
