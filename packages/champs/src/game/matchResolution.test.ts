import { describe, expect, it } from 'vitest';
import { rulesForMode } from '../config/matchRules';
import {
  matchPhaseAt,
  resolveMatch,
  scoreTeamForHardResolution,
  type MatchResolutionSnapshot,
  type MatchTeamSnapshot,
} from './matchResolution';

function team(overrides: Partial<MatchTeamSnapshot> = {}): MatchTeamSnapshot {
  return {
    nexusHp: 1_000,
    nexusMaxHp: 1_000,
    structuresStanding: 8,
    structuresTotal: 8,
    championKills: 4,
    objectivePoints: 1,
    gold: 5_000,
    ...overrides,
  };
}

function match(
  elapsedSeconds: number,
  ally: MatchTeamSnapshot = team(),
  enemy: MatchTeamSnapshot = team(),
): MatchResolutionSnapshot {
  return { elapsedSeconds, ally, enemy };
}

describe('match hard resolution', () => {
  it('enters sudden death at 12 minutes and hard cap at 15 minutes', () => {
    const rules = rulesForMode('conquest');
    expect(matchPhaseAt(rules.suddenDeathSeconds - 1)).toBe('regulation');
    expect(matchPhaseAt(rules.suddenDeathSeconds)).toBe('sudden-death');
    expect(matchPhaseAt(rules.hardCapSeconds)).toBe('hard-cap');
  });

  it('resolves a destroyed nexus before the hard cap', () => {
    const result = resolveMatch(match(100, team(), team({ nexusHp: 0 })));
    expect(result.winner).toBe('ally');
    expect(result.reason).toBe('nexus-destroyed');
  });

  it('keeps play unresolved before the cap, including sudden death', () => {
    const result = resolveMatch(match(rulesForMode('conquest').suddenDeathSeconds));
    expect(result.phase).toBe('sudden-death');
    expect(result.winner).toBeNull();
    expect(result.reason).toBeNull();
  });

  it('scores normalized map health, kills, objectives, and gold at the cap', () => {
    const stronger = team({
      nexusHp: 800,
      structuresStanding: 6,
      championKills: 8,
      objectivePoints: 3,
      gold: 8_000,
    });
    const weaker = team({
      nexusHp: 500,
      structuresStanding: 4,
      championKills: 5,
      objectivePoints: 1,
      gold: 6_000,
    });
    expect(scoreTeamForHardResolution(stronger)).toBeGreaterThan(
      scoreTeamForHardResolution(weaker),
    );

    const result = resolveMatch(
      match(rulesForMode('conquest').hardCapSeconds, stronger, weaker),
    );
    expect(result.winner).toBe('ally');
    expect(result.reason).toBe('hard-cap-score');
  });

  it('returns a draw for an exact hard-cap tie', () => {
    const capped = rulesForMode('conquest').hardCapSeconds;
    expect(resolveMatch(match(capped)).winner).toBe('draw');
  });
});
