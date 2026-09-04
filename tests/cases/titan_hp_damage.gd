extends TestCase
## FEAT-004: deterministic model of the titan FIXED-HP + per-part damage contract
## and the wall-assault / breach / eat objective state machine.
##
## The real titan is scene-side (CharacterBody3D needs a SceneTree), so we assert
## the PURE maths it promises:
##   * a NAPE crit removes far more HP than a BODY hit for the same base damage,
##   * the nape is a WEAK POINT not the sole kill gate: N body hits also fell it,
##   * HP is FIXED (never round-scaled) and die() is idempotent (HP clamps at 0),
##   * the base damage formula (DamagePreview) is shared/unchanged, and
##   * TitanObjective drives approach-wall -> seek-citizen -> eat correctly.
## Numbers mirror titan.gd's consts; nothing here scales with a round number.

# Mirror of titan.gd tuning (kept in sync with the FIXED consts there).
const TITAN_MAX_HP: float = 100.0
const BODY_DAMAGE_MULT: float = 22.0
const NAPE_DAMAGE_MULT: float = 90.0
const WALL_RADIUS: float = 34.0
const EAT_REACH: float = 3.5


# Pure stand-in for the titan's HP + per-part damage bookkeeping.
class TitanHP:
	extends RefCounted
	var hp: float = TITAN_MAX_HP
	var dead: bool = false

	func part_damage(base: float, is_nape: bool) -> float:
		return base * (NAPE_DAMAGE_MULT if is_nape else BODY_DAMAGE_MULT)

	# Returns true if the hit felled the titan (mirrors receive_hit).
	func receive_hit(base: float, is_nape: bool) -> bool:
		if dead:
			return true
		hp -= part_damage(base, is_nape)
		if hp <= 0.0:
			hp = 0.0
			dead = true
			return true
		return false


func test_nape_crit_hits_harder_than_body() -> void:
	var t := TitanHP.new()
	var base: float = 1.0
	check(t.part_damage(base, true) > t.part_damage(base, false),
		"a nape crit must remove more HP than a body hit for equal base damage")
	# The multiplier gap is the documented crit factor (~4x).
	near(t.part_damage(base, true) / t.part_damage(base, false),
		NAPE_DAMAGE_MULT / BODY_DAMAGE_MULT, 0.001, "crit factor matches the consts")


func test_body_hits_are_not_one_shot_but_do_fell() -> void:
	# A solid body hit (base ~2.0 => 44 HP) is a fraction, so it takes several.
	var t := TitanHP.new()
	var base: float = 2.0
	check(not t.receive_hit(base, false), "first solid body hit must NOT one-shot")
	check(t.hp < TITAN_MAX_HP, "a sub-lethal body hit still chips HP")
	check(not t.receive_hit(base, false), "second body hit still sub-lethal")
	check(t.receive_hit(base, false), "a third solid body hit fells the titan")
	check(t.dead and t.hp == 0.0, "HP clamps at 0 on death")


func test_clean_nape_crit_can_one_shot() -> void:
	var t := TitanHP.new()
	# A clean nape crit (base ~2.0 => 180 HP) exceeds the 100 HP pool: one-shot.
	check(t.receive_hit(2.0, true), "a clean nape crit fells in one hit (weak point)")


func test_die_is_idempotent() -> void:
	var t := TitanHP.new()
	check(t.receive_hit(2.0, true), "nape crit kills")
	check(t.receive_hit(2.0, true), "a post-death hit reports dead, no underflow")
	check(t.hp == 0.0, "HP never goes negative")


func test_base_damage_formula_matches_shared_module() -> void:
	# A tangential blade (travel perpendicular to the surface normal) at the
	# speed reference peaks: speed_term 1.0 + angle_term 1.0 = 2.0.
	var speed_ref: float = 30.0
	var vel := Vector3(0.0, 0.0, 30.0)
	var normal := Vector3(1.0, 0.0, 0.0)  # perpendicular to travel
	var dmg: float = DamagePreview.compute(vel, normal, speed_ref, 1.0, 1.0)
	near(dmg, 2.0, 0.001, "clean fast tangential slash peaks base damage at 2.0")


func test_objective_approach_then_seek_then_eat() -> void:
	var gates: Array = [Vector3(0.0, 0.0, 34.0), Vector3(0.0, 0.0, -34.0)]
	var citizens: Array = [Vector3(0.0, 0.0, 14.0)]

	# OUTSIDE the wall (radius 50) => approach the nearest gate (+Z, closer).
	var outside := TitanObjective.resolve(TitanObjective.STATE_APPROACH_WALL,
		Vector3(0.0, 0.0, 50.0), gates, citizens, WALL_RADIUS, EAT_REACH)
	check(int(outside["state"]) == TitanObjective.STATE_APPROACH_WALL, "outside => approach wall")
	check((outside["target"] as Vector3).z > 0.0, "targets the nearer +Z gate")

	# INSIDE the wall, far from the citizen => seek it.
	var seek := TitanObjective.resolve(TitanObjective.STATE_SEEK_CITIZEN,
		Vector3(0.0, 0.0, 25.0), gates, citizens, WALL_RADIUS, EAT_REACH)
	check(int(seek["state"]) == TitanObjective.STATE_SEEK_CITIZEN, "inside + far => seek citizen")
	check(not bool(seek["eat"]), "not close enough to eat yet")

	# WITHIN eat reach of the citizen => eat.
	var eat := TitanObjective.resolve(TitanObjective.STATE_SEEK_CITIZEN,
		Vector3(0.0, 0.0, 12.0), gates, citizens, WALL_RADIUS, EAT_REACH)
	check(int(eat["state"]) == TitanObjective.STATE_EAT, "inside + close => eat state")
	check(bool(eat["eat"]), "eat flag set when within reach")
