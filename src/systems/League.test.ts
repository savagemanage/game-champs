import { describe, it, expect } from 'vitest';
import {
  aiAlliancePower,
  freshLeague,
  matchOpponent,
  playerRank,
  rankReward,
  resolveLeagueMatch,
  rolloverLeague,
  standings,
  teamPower,
} from './League';
import { LEAGUE } from '../config/Progression';
import type { Combatant, Team } from './Formation';
import type { HeroRole, HeroType } from '../types';

/**
 * League tests: AI alliance power is deterministic per period, standings rank
 * everyone by power, the player is placed by their team power, and a league
 * match resolves via the FEAT-003 Combat engine (no networking). These fail if
 * the deterministic AI seeding, power-based placement, or Combat delegation
 * were reverted.
 */
describe('League', () => {
  function unit(
    id: string,
    type: HeroType,
    role: HeroRole,
    stats: Partial<Pick<Combatant, 'maxHp' | 'atk' | 'def' | 'speed'>> = {},
    row: Combatant['row'] = 'front',
  ): Combatant {
    return {
      id,
      row,
      type,
      role,
      maxHp: stats.maxHp ?? 1000,
      atk: stats.atk ?? 100,
      def: stats.def ?? 50,
      speed: stats.speed ?? 50,
    };
  }
  const team = (members: Combatant[]): Team => ({ members, sameTypeBuff: false });

  const strongSquad = (): Team =>
    team([
      unit('s1', 'tank', 'dealer', { maxHp: 8000, atk: 900, def: 400, speed: 95 }),
      unit('s2', 'tank', 'dealer', { maxHp: 8000, atk: 900, def: 400, speed: 92 }, 'front'),
      unit('s3', 'missile', 'dealer', { maxHp: 6000, atk: 800, def: 200, speed: 90 }, 'back'),
      unit('s4', 'aircraft', 'dealer', { maxHp: 6000, atk: 800, def: 200, speed: 88 }, 'back'),
      unit('s5', 'tank', 'support', { maxHp: 7000, atk: 400, def: 300, speed: 60 }, 'back'),
    ]);

  it('AI alliance power is deterministic per (index, period) and non-negative', () => {
    expect(aiAlliancePower(0, 0)).toBe(aiAlliancePower(0, 0));
    expect(aiAlliancePower(3, 5)).toBe(aiAlliancePower(3, 5));
    for (let i = 0; i < LEAGUE.AI_ALLIANCE_COUNT; i += 1) {
      expect(aiAlliancePower(i, 2)).toBeGreaterThanOrEqual(0);
    }
    // Power drifts with the period (not identical across all periods for an ally).
    const drifts = [0, 1, 2, 3, 4].map((p) => aiAlliancePower(0, p));
    expect(new Set(drifts).size).toBeGreaterThan(1);
  });

  it('standings include the player + all AI alliances, ranked by power', () => {
    const table = standings(10000, 0);
    expect(table).toHaveLength(LEAGUE.AI_ALLIANCE_COUNT + 1);
    // Descending power order.
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i - 1].power).toBeGreaterThanOrEqual(table[i].power);
    }
    // Ranks are 1..N with no gaps.
    expect(table.map((e) => e.rank)).toEqual(table.map((_, i) => i + 1));
    // Exactly one player entry.
    expect(table.filter((e) => e.isPlayer)).toHaveLength(1);
  });

  it('player placement improves with more team power', () => {
    const weakRank = playerRank(0, 0);
    const strongRank = playerRank(1_000_000, 0);
    expect(strongRank).toBeLessThan(weakRank); // lower rank number = better
    expect(strongRank).toBe(1); // dominating power tops the table
  });

  it('teamPower rewards a bigger/stronger squad', () => {
    const small = team([unit('a', 'tank', 'tank', { maxHp: 500, atk: 50, def: 20 })]);
    expect(teamPower(strongSquad())).toBeGreaterThan(teamPower(small));
    expect(teamPower({ members: [], sameTypeBuff: false })).toBe(0);
  });

  it('rank rewards follow the config brackets (better rank = better reward)', () => {
    expect(rankReward(1)).toEqual(LEAGUE.RANK_REWARDS[0].reward);
    expect(rankReward(2)).toEqual(LEAGUE.RANK_REWARDS[1].reward);
    expect(rankReward(999)).toEqual(LEAGUE.RANK_REWARDS[LEAGUE.RANK_REWARDS.length - 1].reward);
    expect((rankReward(1).shards ?? 0)).toBeGreaterThan(rankReward(999).shards ?? 0);
  });

  it('a league match resolves via Combat and is deterministic per seed', () => {
    const a = resolveLeagueMatch(strongSquad(), 4242);
    const b = resolveLeagueMatch(strongSquad(), 4242);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (a && b) {
      // Delegates to the combat engine: has a timeline + winner.
      expect(a.battle.timeline.length).toBeGreaterThan(0);
      expect(a.battle.winner).toBe(a.win ? 'attacker' : 'defender');
      expect(a.battle.timeline).toEqual(b.battle.timeline);
      // A crushing squad beats the scaled AI formation.
      expect(a.win).toBe(true);
    }
    // No squad -> no match (single-player offline sim, nothing to fight with).
    expect(resolveLeagueMatch({ members: [], sameTypeBuff: false }, 1)).toBeNull();
  });

  it('matchOpponent draws a scaled AI formation deterministically', () => {
    const o1 = matchOpponent(77);
    const o2 = matchOpponent(77);
    expect(o1.members.map((m) => m.id)).toEqual(o2.members.map((m) => m.id));
    expect(o1.members.length).toBeGreaterThan(0);
  });

  it('league rollover grants a placement reward and keeps the best rank', () => {
    const state = { ...freshLeague(), period: 0, bestRank: 0 };
    const res = rolloverLeague(state, 1_000_000, 1); // dominating -> rank 1
    expect(res.rank).toBe(1);
    expect(res.reward).toEqual(rankReward(1));
    expect(res.state.period).toBe(1);
    expect(res.state.wins).toBe(0);
    expect(res.state.losses).toBe(0);
    expect(res.state.bestRank).toBe(1);

    // A worse subsequent placement does not erode the recorded best rank.
    const worse = rolloverLeague(res.state, 0, 2); // weak -> poor rank
    expect(worse.state.bestRank).toBe(1);
  });
});
