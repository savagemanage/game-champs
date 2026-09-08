import { MATCH_PROTOCOL_VERSION, type ParticipantId } from './protocol';
import type { LocalSessionKind, MatchSessionDescriptor } from './session';

export interface MatchmakingRequest {
  kind: LocalSessionKind;
  participantId?: ParticipantId;
  /** Local human/bot identifiers. No identifier is represented as an internet opponent. */
  participantIds?: readonly ParticipantId[];
}

export interface MatchmakingCapabilities {
  internetOpponents: false;
  localPractice: true;
  localParticipants: true;
}

export interface MatchmakingClient {
  readonly capabilities: MatchmakingCapabilities;
  createSession(request: MatchmakingRequest): Promise<MatchSessionDescriptor>;
}

let fallbackId = 0;

function localId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}:${randomUuid}`;
  fallbackId += 1;
  return `${prefix}:${Date.now().toString(36)}:${fallbackId.toString(36)}`;
}

function validParticipantIds(values: readonly string[]): boolean {
  return values.length > 0 && new Set(values).size === values.length && values.every(Boolean);
}

/** Honest offline matchmaking: immediate local/practice allocation, never remote search. */
export class LocalMatchmakingClient implements MatchmakingClient {
  readonly capabilities: MatchmakingCapabilities = {
    internetOpponents: false,
    localPractice: true,
    localParticipants: true,
  };

  constructor(private readonly createId: (prefix: string) => string = localId) {}

  async createSession(request: MatchmakingRequest): Promise<MatchSessionDescriptor> {
    const participantId = request.participantId ?? this.createId('participant');
    const participantIds = request.participantIds ?? [participantId];
    if (!validParticipantIds(participantIds) || !participantIds.includes(participantId)) {
      throw new TypeError('Local session participants must be unique and include the requester');
    }

    return {
      protocolVersion: MATCH_PROTOCOL_VERSION,
      sessionId: this.createId('session'),
      matchId: this.createId('match'),
      participantId,
      participantIds: participantIds.slice(),
      kind: request.kind,
      network: 'none',
      resumable: true,
    };
  }
}
