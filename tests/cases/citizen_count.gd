extends TestCase
## FEAT-003: deterministic model of the CitizenManager alive-count contract.
##
## The real CitizenManager is scene-side (needs a SceneTree to add_child), so it
## can't be instanced in this RefCounted harness. Instead we assert the PURE
## counting invariants the manager promises game_manager.gd's fail condition:
##   * N spawned citizens => alive == N,
##   * eating M DISTINCT citizens => alive == N - M (clamped at 0),
##   * eating the SAME citizen twice is idempotent (no double-decrement),
##   * alive reaching CITIZEN_LOSS_THRESHOLD (0) is the round-lost trigger.
## This mirrors citizen.gd's `eat()` idempotency and the manager's erase-once
## bookkeeping; nothing here scales with a round number.

const START_COUNT: int = 8   # matches CitizenManager.CITIZEN_COUNT
const LOSS_THRESHOLD: int = 0 # matches GameManager.CITIZEN_LOSS_THRESHOLD


# A tiny pure stand-in: a set of live citizen ids with idempotent eat().
class CitizenSet:
	extends RefCounted
	var _alive: Dictionary = {}

	func spawn(n: int) -> void:
		_alive.clear()
		for i in n:
			_alive[i] = true

	func alive() -> int:
		return _alive.size()

	# Returns true only when a LIVE citizen was consumed (idempotent).
	func eat(id: int) -> bool:
		if not _alive.has(id):
			return false
		_alive.erase(id)
		return true


func test_distinct_eats_decrement_to_zero() -> void:
	var set := CitizenSet.new()
	set.spawn(START_COUNT)
	check(set.alive() == START_COUNT, "spawn should give START_COUNT alive")
	var eaten: int = 0
	for id in START_COUNT:
		if set.eat(id):
			eaten += 1
		check(set.alive() == START_COUNT - eaten, "alive tracks distinct eats")
	check(set.alive() == LOSS_THRESHOLD, "all eaten hits the loss threshold")


func test_duplicate_eat_is_idempotent() -> void:
	var set := CitizenSet.new()
	set.spawn(START_COUNT)
	check(set.eat(3), "first eat of a live citizen succeeds")
	check(not set.eat(3), "second eat of the same citizen is a no-op")
	check(set.alive() == START_COUNT - 1, "duplicate eat must not double-decrement")


func test_eat_unknown_id_never_underflows() -> void:
	var set := CitizenSet.new()
	set.spawn(2)
	check(not set.eat(99), "eating an unknown id does nothing")
	check(set.alive() == 2, "alive count is unchanged by an unknown eat")
