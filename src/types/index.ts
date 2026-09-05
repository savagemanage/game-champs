/**
 * Shared game-wide types. Entity- and system-specific types live alongside
 * their implementations; this module holds cross-cutting contracts.
 */

/** A live entity that can take damage and be destroyed. */
export interface Damageable {
  hp: number;
  readonly maxHp: number;
  takeDamage(amount: number): void;
  readonly isDead: boolean;
}

/** Summary of a single run, passed to the GameOver scene. */
export interface RunResult {
  victory: boolean;
  wavesSurvived: number;
  citizensSaved: number;
}
