class_name TestCase
extends RefCounted
## Base class for a hand-rolled headless test case (spec 0 harness - NO addons,
## GUT/gdUnit4 are forbidden). A test case is a plain RefCounted with `test_*`
## methods; the runner (res://tests/cli.gd) instantiates it, injects a freshly
## seeded RNG per method, clears `errors`, calls the method, then reports.
##
## Web-safe determinism invariants apply here too (see handoff.md): no Node, no
## get_tree(), no global randf(). Use the INJECTED `rng` for any randomness so
## runs are deterministic.

## Seeded RNG injected by the runner before each test_ method (deterministic).
var rng: RandomNumberGenerator

## Accumulated failure messages for the current method. Emptied per method by
## the runner. Empty after a method => the test passed.
var errors: Array = []


## Assert a boolean condition; records `msg` on failure.
func check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


## Assert two floats are within `eps` of each other; records `msg` (with the
## actual delta) on failure.
func near(a: float, b: float, eps: float, msg: String) -> void:
	if absf(a - b) > eps:
		errors.append("%s (|%f - %f| = %f > %f)" % [msg, a, b, absf(a - b), eps])


## Unconditionally record a failure message.
func fail(msg: String) -> void:
	errors.append(msg)
