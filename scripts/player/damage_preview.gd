class_name DamagePreview
extends RefCounted
## Pure, stateless damage formula shared by the slash sweep (scripts/player/
## slash.gd) and the presentation-only nape indicator (scripts/ui/
## nape_indicator.gd).
##
## WHY THIS EXISTS: slash.gd sits at the 250-line cap and its damage MUST stay
## the single source of truth (design: continuous damage model). Extracting
## the formula into one static function lets the read-only indicator PREVIEW the
## exact same number the live slash would deal WITHOUT duplicating the maths or
## touching slash.gd's kill decision. The numeric model and thresholds are
## unchanged - this is a lift-and-shift of the existing terms only.
##
## damage = speed_term + angle_term where
##   speed_term = clampf(blade_speed / speed_reference, 0, 1) * speed_weight
##   angle_term = (1 - |travel_dir . nape_normal|) * angle_weight
## A clean slice runs TANGENT to the nape surface, so the angle term peaks when
## blade travel is perpendicular to the nape normal (1 - |dot|).


## Continuous damage for a blade travelling at `blade_velocity` (m/s) hitting a
## nape whose outward normal is `nape_normal`. Read-only; no side effects.
static func compute(
		blade_velocity: Vector3,
		nape_normal: Vector3,
		speed_reference: float,
		speed_weight: float,
		angle_weight: float) -> float:
	var speed: float = blade_velocity.length()
	var speed_term: float = clampf(speed / speed_reference, 0.0, 1.0) * speed_weight

	var angle_term: float = 0.0
	if speed > 0.001 and nape_normal.length() > 0.001:
		var travel_dir: Vector3 = blade_velocity / speed
		var n: Vector3 = nape_normal.normalized()
		var alignment: float = absf(travel_dir.dot(n))
		angle_term = (1.0 - alignment) * angle_weight
	return speed_term + angle_term
