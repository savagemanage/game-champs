import { describe, expect, it } from 'vitest';
import {
  LocalMatchAuthority,
  type LocalSimulationAdapter,
} from './authority';
import { BoundedEventLog } from './eventLog';
import { LocalMatchmakingClient } from './matchmaking';
import {
  MATCH_PROTOCOL_VERSION,
  isMatchCommand,
  type MatchCommand,
  type MatchEvent,
} from './protocol';
import type { MatchSessionDescriptor } from './session';
import { LocalStorageSnapshotStore, createSnapshotEnvelope, type SnapshotEnvelope } from './snapshot';
import { LocalTransport } from './transport';

function accepted(sequence: number): MatchEvent {
  return {
    protocolVersion: MATCH_PROTOCOL_VERSION,
    matchId: 'match-1',
    participantId: 'player-1',
    commandId: `command-${sequence}`,
    eventId: `event-${sequence}`,
    sequence,
    tick: sequence,
    type: 'accepted',
    commandType: 'move',
  };
}

const session: MatchSessionDescriptor = {
  protocolVersion: MATCH_PROTOCOL_VERSION,
  sessionId: 'session-1',
  matchId: 'match-1',
  participantId: 'player-1',
  participantIds: ['player-1'],
  kind: 'practice',
  network: 'none',
  resumable: true,
};

function move(sequence: number): MatchCommand {
  return {
    protocolVersion: MATCH_PROTOCOL_VERSION,
    matchId: session.matchId,
    participantId: session.participantId,
    commandId: `command-${sequence}`,
    sequence,
    tick: sequence,
    type: 'move',
    destination: { x: sequence, y: sequence },
  };
}

class TestSimulation implements LocalSimulationAdapter {
  state = 0;
  invalidNext = false;

  apply(_command: MatchCommand): ReturnType<LocalSimulationAdapter['apply']> {
    this.state += 1;
    if (this.invalidNext) {
      this.invalidNext = false;
      return {
        accepted: true,
        events: [{
          type: 'damage',
          sourceParticipantId: null,
          targetEntityId: 'target',
          amount: Number.NaN,
          remainingHealth: 1,
        }],
      };
    }
    return { accepted: true };
  }

  capture() {
    return { simulation: { state: this.state }, rng: { algorithm: 'test', state: 1 } };
  }

  restore(snapshot: SnapshotEnvelope): void {
    const simulation = snapshot.simulation;
    this.state =
      simulation !== null &&
      typeof simulation === 'object' &&
      !Array.isArray(simulation) &&
      typeof simulation.state === 'number'
        ? simulation.state
        : 0;
  }
}

describe('online protocol foundation', () => {
  it('accepts JSON-safe commands and rejects non-finite coordinates', () => {
    const command = {
      protocolVersion: MATCH_PROTOCOL_VERSION,
      matchId: 'match-1',
      participantId: 'player-1',
      commandId: 'command-1',
      sequence: 1,
      tick: 2,
      type: 'move',
      destination: { x: 12, y: 34 },
    };

    expect(isMatchCommand(command)).toBe(true);
    expect(isMatchCommand({ ...command, destination: { x: Number.NaN, y: 34 } })).toBe(false);
  });

  it('keeps a bounded append-only event window and reports truncation', () => {
    const log = new BoundedEventLog(2);
    log.append(accepted(1));
    log.append(accepted(2));
    log.append(accepted(3));

    expect(log.all().map((entry) => entry.event.sequence)).toEqual([2, 3]);
    expect(log.since(0).truncated).toBe(true);
    expect(() => log.append(accepted(3))).toThrow(/increase monotonically/);
  });

  it('detects persisted snapshot corruption', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const store = new LocalStorageSnapshotStore(storage);
    const snapshot = createSnapshotEnvelope({
      matchId: 'match-1',
      tick: 9,
      eventCursor: 4,
      authority: { eventSequence: 4, participantSequences: { 'player-1': 2 } },
      rng: { algorithm: 'test-seeded', state: { seed: 42 } },
      simulation: { complete: true, units: [] },
      createdAt: 100,
    });

    expect(store.save(snapshot)).toBe(true);
    expect(store.load('match-1')).toEqual(snapshot);
    const key = [...values.keys()][0]!;
    values.set(key, values.get(key)!.replace('"tick":9', '"tick":10'));
    expect(store.load('match-1')).toBeNull();
  });

  it('describes matchmaking as local-only', async () => {
    let id = 0;
    const client = new LocalMatchmakingClient((prefix) => `${prefix}-${++id}`);
    const localSession = await client.createSession({ kind: 'practice' });

    expect(client.capabilities.internetOpponents).toBe(false);
    expect(localSession.network).toBe('none');
    expect(localSession.kind).toBe('practice');
  });

  it('correlates malformed commands and keeps adapter failures atomic', async () => {
    const simulation = new TestSimulation();
    const authority = new LocalMatchAuthority({ session, simulation });
    const malformed = { ...move(1), destination: { x: Number.NaN, y: 1 } };

    await expect(authority.submit(malformed)).resolves.toMatchObject([
      { type: 'rejected', reason: 'invalid-command', sequence: 1 },
    ]);
    simulation.invalidNext = true;
    await expect(authority.submit(move(1))).resolves.toMatchObject([
      { type: 'rejected', reason: 'simulation-rejected', sequence: 2 },
    ]);
    expect(simulation.state).toBe(0);
    await expect(authority.submit(move(2))).resolves.toMatchObject([
      { type: 'accepted', sequence: 3 },
    ]);
  });

  it('restores authority continuity and rejects future resume cursors', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const snapshotStore = new LocalStorageSnapshotStore(storage);
    const authority = new LocalMatchAuthority({
      session,
      simulation: new TestSimulation(),
      snapshotStore,
    });
    await authority.submit(move(1));
    const snapshot = authority.checkpoint();

    const restoredSimulation = new TestSimulation();
    const restored = new LocalMatchAuthority({ session, simulation: restoredSimulation, snapshotStore });
    restored.restore(snapshot);
    await expect(restored.submit(move(2))).resolves.toMatchObject([
      { type: 'accepted', sequence: 3 },
    ]);
    expect(restoredSimulation.state).toBe(2);
    await expect(
      restored.resume({
        protocolVersion: MATCH_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        matchId: session.matchId,
        participantId: session.participantId,
        lastEventCursor: 99,
        snapshotChecksum: snapshot.checksum,
      }),
    ).resolves.toEqual({ status: 'rejected', reason: 'cursor-ahead' });
  });

  it('delivers accepted events through the connected local transport', async () => {
    const authority = new LocalMatchAuthority({ session, simulation: new TestSimulation() });
    const transport = new LocalTransport(authority);
    const delivered: MatchEvent[][] = [];
    transport.subscribe((events) => delivered.push([...events]));

    await transport.connect();
    const events = await transport.send(move(1));
    expect(events[0]?.type).toBe('accepted');
    expect(delivered).toHaveLength(1);
  });
});
