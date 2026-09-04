extends TestCase
## Sample near()-BOUNDARY case (spec 0). Shows the tolerance edge of near():
## a delta just INSIDE eps passes; a delta just OUTSIDE eps would fail.

const EPS: float = 0.01


func test_near_just_inside_eps_passes() -> void:
	# |1.000 - 1.009| = 0.009 <= 0.01 -> passes.
	near(1.000, 1.009, EPS, "delta just inside eps must pass")

	# Boundary note (do NOT uncomment - it demonstrates the failing side):
	# |1.000 - 1.011| = 0.011 > 0.01 -> this WOULD record a failure:
	# near(1.000, 1.011, EPS, "delta just outside eps would fail")
