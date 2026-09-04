extends Node3D
## Guarded runtime loader for a CC0 low-poly humanoid GLB (Kenney "Blocky
## Characters" 2.0, CC0 - see assets/CREDITS.md). Attached to a "CharacterModel"
## Node3D that is a VISUAL-ONLY sibling of the owning body's CollisionShape3D:
## it never adds a physics body or collision shape, so movement / navigation /
## the nape Area3D are driven entirely by the existing capsule collider.
##
## Why loaded at runtime instead of a baked ext_resource: the repo .gitignore
## excludes *.import, so the GLB ships WITHOUT its .import sidecar and is not a
## valid resource until a one-time editor import. A hard ext_resource to an
## unimported .glb would break a headless/first-open text parse. So we mirror
## the guarded-load pattern in scripts/player/slash_fx.gd: if the resource
## exists we instance it and hide the primitive capsule fallback; otherwise we
## leave the primitive capsule visible so the scene never renders empty.
##
## Web-safe: no Thread/Mutex/Semaphore/WorkerThreadPool, no SubViewport. Godot
## imports a .glb as a PackedScene of plain Node3D / MeshInstance3D nodes plus
## an AnimationPlayer (these Kenney rigs are node-transform animated, 0 skins),
## none of which are physics bodies, so no collider is ever introduced.

# --- TUNING CONSTANTS (no magic numbers below this block) ---

## Fallback loop animation played on the instanced GLB's AnimationPlayer when
## present. Empty string = ship the static rest pose (no animation).
const IDLE_ANIM: String = "idle"

# --- CONFIGURABLE PER-ENTITY (set in the .tscn via the inspector) ---

## Path to the GLB to instance. Guarded with ResourceLoader.exists().
@export var model_path: String = "res://assets/models/player_character.glb"
## Uniform scale applied to the instanced model (Kenney rig is ~1.4-1.5 tall).
@export var model_scale: float = 1.35
## Local Y offset of the model root (feet sit at the body's local y=0).
@export var model_y_offset: float = 0.0
## Yaw (degrees) so the model faces the same forward the body moves. The Kenney
## rig faces +Z; the body's visual forward is -Z, so a 180 flip aligns them.
@export var model_yaw_deg: float = 180.0
## Node path (relative to this CharacterModel node) to the primitive capsule
## MeshInstance3D kept as the guaranteed fallback. Hidden once the GLB loads.
@export var fallback_mesh_path: NodePath = NodePath("../MeshInstance3D")
## Play IDLE_ANIM looping when the GLB provides it (else stay a static pose).
@export var play_idle: bool = true

var _instance: Node3D


func _ready() -> void:
	var fallback: MeshInstance3D = get_node_or_null(fallback_mesh_path) as MeshInstance3D

	# Guarded load: unimported / missing GLB -> keep the primitive capsule.
	if not ResourceLoader.exists(model_path):
		return
	var packed := load(model_path) as PackedScene
	if packed == null:
		return
	var inst := packed.instantiate() as Node3D
	if inst == null:
		return

	_instance = inst
	inst.scale = Vector3.ONE * model_scale
	inst.position = Vector3(0.0, model_y_offset, 0.0)
	inst.rotation = Vector3(0.0, deg_to_rad(model_yaw_deg), 0.0)
	add_child(inst)

	# GLB imported fine: hide the primitive capsule fallback.
	if fallback != null:
		fallback.visible = false

	if play_idle and IDLE_ANIM != "":
		_play_idle_loop(inst)


## Find the instanced GLB's AnimationPlayer and loop IDLE_ANIM. Web/60fps-safe:
## a single node-transform clip, no AnimationTree / state machine.
func _play_idle_loop(root: Node) -> void:
	var anim := _find_animation_player(root)
	if anim == null:
		return
	if not anim.has_animation(IDLE_ANIM):
		return
	var clip := anim.get_animation(IDLE_ANIM)
	if clip != null:
		clip.loop_mode = Animation.LOOP_LINEAR
	anim.play(IDLE_ANIM)


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found != null:
			return found
	return null
