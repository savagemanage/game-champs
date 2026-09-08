import type { LoggedMatchEvent } from './eventLog';
import {
  MATCH_PROTOCOL_VERSION,
  type MatchId,
  type MatchProtocolVersion,
  type ParticipantId,
} from './protocol';
import type { SnapshotEnvelope } from './snapshot';

export type LocalSessionKind = 'local' | 'practice';

/** JSON-safe statement of capability. `network` is deliberately never `internet`. */
export interface MatchSessionDescriptor {
  protocolVersion: MatchProtocolVersion;
  sessionId: string;
  matchId: MatchId;
  participantId: ParticipantId;
  participantIds: readonly ParticipantId[];
  kind: LocalSessionKind;
  network: 'none';
  resumable: boolean;
}

export interface SessionResumeRequest {
  protocolVersion: MatchProtocolVersion;
  sessionId: string;
  matchId: MatchId;
  participantId: ParticipantId;
  lastEventCursor: number;
  snapshotChecksum: string | null;
}

export type SessionResumeResult =
  | {
      status: 'resumed';
      session: MatchSessionDescriptor;
      snapshot: SnapshotEnvelope | null;
      events: readonly LoggedMatchEvent[];
      eventCursor: number;
    }
  | {
      status: 'rejected';
      reason:
        | 'protocol-mismatch'
        | 'session-not-found'
        | 'participant-mismatch'
        | 'cursor-ahead'
        | 'history-unavailable';
    };

export function isSessionResumeRequest(value: unknown): value is SessionResumeRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    request.protocolVersion === MATCH_PROTOCOL_VERSION &&
    typeof request.sessionId === 'string' &&
    request.sessionId.length > 0 &&
    typeof request.matchId === 'string' &&
    request.matchId.length > 0 &&
    typeof request.participantId === 'string' &&
    request.participantId.length > 0 &&
    typeof request.lastEventCursor === 'number' &&
    Number.isSafeInteger(request.lastEventCursor) &&
    request.lastEventCursor >= 0 &&
    (request.snapshotChecksum === null || typeof request.snapshotChecksum === 'string')
  );
}
