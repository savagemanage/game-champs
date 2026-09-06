import { describe, it, expect } from 'vitest';
import { ArenaSystem } from './ArenaSystem';
import { ARENA } from '../config/GameConfig';

/**
 * Unit tests for the simulated PvP ladder: deterministic opponent generation,
 * win climbs / loss slips, reward on a win, rank clamping, and serialize.
 */
describe('ArenaSystem', () => {
  it('starts at the configured worst rank with a clean record', () => {
    const a = new ArenaSystem();
    expect(a.rank).toBe(ARENA.START_RANK);
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(0);
  });

  it('generates a deterministic opponent power for a given rank + seed', () => {
    const p1 = ArenaSystem.opponentPowerFor(50, 12345);
    const p2 = ArenaSystem.opponentPowerFor(50, 12345);
    expect(p1).toBe(p2);
    // Higher ranks (closer to 1) field stronger opponents.
    expect(ArenaSystem.opponentPowerFor(1, 12345)).toBeGreaterThan(
      ArenaSystem.opponentPowerFor(50, 12345),
    );
  });

  it('a strong player wins, climbs a rank, and earns sparks', () => {
    const a = new ArenaSystem();
    const opp = a.previewOpponentPower();
    const res = a.fight(opp * 10); // overwhelming power
    expect(res.win).toBe(true);
    expect(res.rankAfter).toBe(res.rankBefore - ARENA.RANK_GAIN_PER_WIN);
    expect(a.rank).toBe(ARENA.START_RANK - 1);
    expect(a.wins).toBe(1);
    expect(res.sparks).toBeGreaterThan(0);
  });

  it('a weak player loses, slips a rank, and earns nothing', () => {
    const a = new ArenaSystem();
    const res = a.fight(0); // no power at all
    expect(res.win).toBe(false);
    expect(a.losses).toBe(1);
    expect(res.sparks).toBe(0);
    // Already at the worst rank: a loss cannot slip below START_RANK.
    expect(a.rank).toBe(ARENA.START_RANK);
  });

  it('is deterministic: the same saved state + power reproduces the outcome', () => {
    const a1 = new ArenaSystem({ rank: 30, wins: 0, losses: 0, seed: 999 });
    const a2 = new ArenaSystem({ rank: 30, wins: 0, losses: 0, seed: 999 });
    const r1 = a1.fight(500);
    const r2 = a2.fight(500);
    expect(r1).toEqual(r2);
  });

  it('advances the seed each match so consecutive opponents differ', () => {
    const a = new ArenaSystem({ rank: 25, wins: 0, losses: 0, seed: 7 });
    const first = a.previewOpponentPower();
    a.fight(1); // a loss keeps the rank but advances the seed
    const second = a.previewOpponentPower();
    // Rank changed by the loss, but even the seed advance alone changes the roll.
    expect(second).not.toBe(first);
  });

  it('serializes and restores ladder state', () => {
    const a = new ArenaSystem();
    a.fight(1e9); // a win
    a.fight(0); // a loss
    const restored = ArenaSystem.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(restored.rank).toBe(a.rank);
    expect(restored.wins).toBe(a.wins);
    expect(restored.losses).toBe(a.losses);
    // A restored system reproduces the SAME next match as the original would.
    expect(restored.previewOpponentPower()).toBe(a.previewOpponentPower());
  });

  it('a missing/malformed save yields a fresh ladder', () => {
    expect(ArenaSystem.fromJSON(undefined).rank).toBe(ARENA.START_RANK);
    expect(ArenaSystem.fromJSON(null).wins).toBe(0);
  });
});
