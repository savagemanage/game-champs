extends TestCase
## Sample INTENTIONAL-FAILURE case (spec 0), COMMENTED OUT so the default run is
## green. Uncomment the method below to prove the runner returns exit code 1 on
## any failure (acceptance criterion: a deliberately failing case flips
## ./tools/test.sh to exit 1).

# func test_intentional_failure() -> void:
# 	check(false, "this should fail and make ./tools/test.sh exit 1")
# 	fail("fail() always records an error")
# 	near(0.0, 1.0, 1e-6, "0.0 is not within eps of 1.0")
