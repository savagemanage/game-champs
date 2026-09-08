import { BoundedEventLog, type EventLogBatch } from './eventLog';
import type { JsonValue } from './json';
import {
  MATCH_PROTOCOL_VERSION,
  ProtocolValidationError,
  isMatchCommand,
  isMatchEvent,
  type MatchCommand,
  type MatchEvent,
  type MatchEventPayload,
  type RejectionReason,
} from './protocol';
import type {
  MatchSessionDescriptor,
  SessionResumeRequest,
  SessionResumeResult,
} from './session';
import {
  LocalStorageSnapshotStore,
  createSnapshotEnvelope,
  isSnapshotEnvelope,
  type RngSnapshot,
  type SnapshotEnvelope,
} from './snapshot';

export interface LocalSimulationCapture {
  simulation: JsonValue;
  rng: RngSnapshot;
}

export type LocalCommandResolution =
  | { accepted: true; events?: readonly MatchEventPayload[] }
  | { accepted: false };

/** Bridge implemented by a deterministic simulation; render state does not belong here. */
export interface LocalSimulationAdapter {
  apply(command: MatchCommand): LocalCommandResolution;
  capture(): LocalSimulationCapture;
  restore(snapshot: SnapshotEnvelope): void;
}

export interface MatchAuthority {
  readonly session: MatchSessionDescriptor;
  submit(command: unknown): Promise<readonly MatchEvent[]>;
  eventsSince(cursor: number): EventLogBatch;
  checkpoint(): SnapshotEnvelope;
  resume(request: SessionResumeRequest): Promise<SessionResumeResult>;
}

export interface LocalMatchAuthorityOptions {
  session: MatchSessionDescriptor;
  simulation: LocalSimulationAdapter;
  eventLogCapacity?: number;
  snapshotStore?: LocalStorageSnapshotStore;
  now?: () => number;
}

interface CommandCorrelation {
  matchId: string;
  participantId: string;
  commandId: string;
  sequence: number;
  tick: number;
}

type DomainEventType = MatchEventPayload['type'];
const domainEventTypes: readonly DomainEventType[] = [
  'damage',
  'purchase',
  'surrender',
  'match-ended',
];

function commandCorrelation(value: unknown): CommandCorrelation | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  if (
    typeof command.matchId !== 'string' ||
    command.matchId.length === 0 ||
    typeof command.participantId !== 'string' ||
    command.participantId.length === 0 ||
    typeof command.commandId !== 'string' ||
    command.commandId.length === 0 ||
    typeof command.sequence !== 'number' ||
    !Number.isSafeInteger(command.sequence) ||
    command.sequence < 0 ||
    typeof command.tick !== 'number' ||
    !Number.isSafeInteger(command.tick) ||
    command.tick < 0
  ) {
    return null;
  }
  return {
    matchId: command.matchId,
    participantId: command.participantId,
    commandId: command.commandId,
    sequence: command.sequence,
    tick: command.tick,
  };
}

function resolutionEvents(value: unknown): readonly unknown[] | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const resolution = value as Record<string, unknown>;
  if (resolution.accepted === false) return [];
  if (resolution.accepted !== true) return null;
  return resolution.events === undefined
    ? []
    : Array.isArray(resolution.events)
      ? resolution.events
      : null;
}

export class LocalMatchAuthority implements MatchAuthority {
  readonly session: MatchSessionDescriptor;
  private readonly simulation: LocalSimulationAdapter;
  private readonly eventLog: BoundedEventLog;
  private readonly snapshotStore: LocalStorageSnapshotStore;
  private readonly now: () => number;
  private readonly participantSequences = new Map<string, number>();
  private eventSequence = 0;
  private currentTick = 0;

  constructor(options: LocalMatchAuthorityOptions) {
    if (options.session.network !== 'none') {
      throw new TypeError('Local authority only supports network-free sessions');
    }
    this.session = options.session;
    this.simulation = options.simulation;
    this.eventLog = new BoundedEventLog(options.eventLogCapacity);
    this.snapshotStore = options.snapshotStore ?? new LocalStorageSnapshotStore();
    this.now = options.now ?? Date.now;
  }

  private baseAt<T extends MatchEvent['type']>(
    sequence: number,
    type: T,
    participantId: string | null,
    commandId: string | null,
    tick: number,
  ) {
    return {
      protocolVersion: MATCH_PROTOCOL_VERSION,
      matchId: this.session.matchId,
      participantId,
      commandId,
      eventId: `${this.session.matchId}:event:${sequence}`,
      sequence,
      tick,
      type,
    } as const;
  }

  private reject(command: CommandCorrelation, reason: RejectionReason): MatchEvent {
    const sequence = this.eventSequence + 1;
    const event: MatchEvent = {
      ...this.baseAt(sequence, 'rejected', command.participantId, command.commandId, command.tick),
      reason,
    };
    this.eventSequence = sequence;
    this.eventLog.append(event);
    return event;
  }

  private domainEventAt(
    command: MatchCommand,
    payload: unknown,
    sequence: number,
  ): MatchEvent {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ProtocolValidationError('Simulation produced an invalid event');
    }
    const values = payload as Record<string, unknown>;
    if (
      typeof values.type !== 'string' ||
      !domainEventTypes.includes(values.type as DomainEventType)
    ) {
      throw new ProtocolValidationError('Simulation produced an invalid event');
    }
    const type = values.type as DomainEventType;
    const event = {
      ...values,
      ...this.baseAt(sequence, type, command.participantId, command.commandId, command.tick),
    };
    if (!isMatchEvent(event)) {
      throw new ProtocolValidationError('Simulation produced an invalid event');
    }
    return event;
  }

  private captureSnapshot(
    eventCursor = this.eventLog.cursor,
    eventSequence = this.eventSequence,
  ): SnapshotEnvelope {
    const capture = this.simulation.capture();
    return createSnapshotEnvelope({
      matchId: this.session.matchId,
      tick: this.currentTick,
      eventCursor,
      authority: {
        eventSequence,
        participantSequences: Object.fromEntries(this.participantSequences),
      },
      rng: capture.rng,
      simulation: capture.simulation,
      createdAt: Math.max(0, Math.floor(this.now())),
    });
  }

  async submit(value: unknown): Promise<readonly MatchEvent[]> {
    const correlation = commandCorrelation(value);
    if (!isMatchCommand(value)) {
      if (correlation === null) throw new ProtocolValidationError('Invalid uncorrelatable command');
      return [this.reject(correlation, 'invalid-command')];
    }
    const command = value;
    let rejection: RejectionReason | null = null;

    if (command.matchId !== this.session.matchId) rejection = 'wrong-match';
    else if (!this.session.participantIds.includes(command.participantId)) {
      rejection = 'unauthorized-participant';
    } else {
      const expected = (this.participantSequences.get(command.participantId) ?? 0) + 1;
      if (command.sequence !== expected || command.tick < this.currentTick) rejection = 'out-of-order';
    }

    if (rejection !== null) return [this.reject(command, rejection)];

    const rollback = this.captureSnapshot();
    let rawResolution: unknown;
    try {
      rawResolution = this.simulation.apply(command);
    } catch {
      rawResolution = null;
    }

    const rawEvents = resolutionEvents(rawResolution);
    const accepted =
      rawResolution !== null &&
      typeof rawResolution === 'object' &&
      !Array.isArray(rawResolution) &&
      (rawResolution as Record<string, unknown>).accepted === true;

    if (!accepted || rawEvents === null) {
      this.simulation.restore(rollback);
      this.participantSequences.set(command.participantId, command.sequence);
      return [this.reject(command, 'simulation-rejected')];
    }

    let events: MatchEvent[];
    try {
      const firstSequence = this.eventSequence + 1;
      const acceptedEvent: MatchEvent = {
        ...this.baseAt(
          firstSequence,
          'accepted',
          command.participantId,
          command.commandId,
          command.tick,
        ),
        commandType: command.type,
      };
      events = [
        acceptedEvent,
        ...rawEvents.map((payload, index) =>
          this.domainEventAt(command, payload, firstSequence + index + 1),
        ),
      ];
    } catch {
      this.simulation.restore(rollback);
      this.participantSequences.set(command.participantId, command.sequence);
      return [this.reject(command, 'simulation-rejected')];
    }

    this.participantSequences.set(command.participantId, command.sequence);
    this.currentTick = Math.max(this.currentTick, command.tick);
    this.eventSequence += events.length;
    this.eventLog.appendAll(events);
    return events;
  }

  eventsSince(cursor: number): EventLogBatch {
    return this.eventLog.since(cursor);
  }

  checkpoint(): SnapshotEnvelope {
    const sequence = this.eventSequence + 1;
    const snapshot = this.captureSnapshot(this.eventLog.cursor + 1, sequence);
    this.snapshotStore.save(snapshot);

    const event: MatchEvent = {
      ...this.baseAt(sequence, 'checkpoint', null, null, this.currentTick),
      snapshotCursor: snapshot.eventCursor,
      checksum: snapshot.checksum,
    };
    this.eventSequence = sequence;
    this.eventLog.append(event);
    return snapshot;
  }

  async resume(request: SessionResumeRequest): Promise<SessionResumeResult> {
    if (request.protocolVersion !== MATCH_PROTOCOL_VERSION) {
      return { status: 'rejected', reason: 'protocol-mismatch' };
    }
    if (request.sessionId !== this.session.sessionId || request.matchId !== this.session.matchId) {
      return { status: 'rejected', reason: 'session-not-found' };
    }
    if (request.participantId !== this.session.participantId) {
      return { status: 'rejected', reason: 'participant-mismatch' };
    }

    const direct = this.eventLog.since(request.lastEventCursor);
    if (direct.ahead) return { status: 'rejected', reason: 'cursor-ahead' };
    if (!direct.truncated) {
      return {
        status: 'resumed',
        session: this.session,
        snapshot: null,
        events: direct.events,
        eventCursor: direct.cursor,
      };
    }

    const snapshot = this.snapshotStore.load(this.session.matchId);
    if (snapshot === null) return { status: 'rejected', reason: 'history-unavailable' };
    const afterSnapshot = this.eventLog.since(snapshot.eventCursor);
    if (afterSnapshot.truncated || afterSnapshot.ahead) {
      return { status: 'rejected', reason: 'history-unavailable' };
    }

    return {
      status: 'resumed',
      session: this.session,
      snapshot: request.snapshotChecksum === snapshot.checksum ? null : snapshot,
      events: afterSnapshot.events,
      eventCursor: afterSnapshot.cursor,
    };
  }

  /** Rehydrates a newly constructed authority at an append-only snapshot boundary. */
  restore(snapshot: SnapshotEnvelope): void {
    if (!isSnapshotEnvelope(snapshot) || snapshot.matchId !== this.session.matchId) {
      throw new ProtocolValidationError('Snapshot is invalid or belongs to another match');
    }
    if (this.eventLog.cursor !== 0 || this.eventSequence !== 0 || this.participantSequences.size > 0) {
      throw new ProtocolValidationError('Only a new authority can restore a snapshot');
    }
    const sequenceEntries = Object.entries(snapshot.authority.participantSequences);
    if (sequenceEntries.some(([participantId]) => !this.session.participantIds.includes(participantId))) {
      throw new ProtocolValidationError('Snapshot contains an unknown participant');
    }

    this.simulation.restore(snapshot);
    this.eventLog.restoreCursor(snapshot.eventCursor, snapshot.authority.eventSequence);
    this.participantSequences.clear();
    for (const [participantId, sequence] of sequenceEntries) {
      this.participantSequences.set(participantId, sequence);
    }
    this.eventSequence = snapshot.authority.eventSequence;
    this.currentTick = snapshot.tick;
  }
}
