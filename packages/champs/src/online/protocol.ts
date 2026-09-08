import { isJsonObject, isJsonValue, type JsonObject, type JsonValue } from './json';

export const MATCH_PROTOCOL_VERSION = 1 as const;
export type MatchProtocolVersion = typeof MATCH_PROTOCOL_VERSION;
export type MatchId = string;
export type ParticipantId = string;
export type CommandId = string;
export type EventId = string;

export type CommandType = 'move' | 'cast' | 'purchase' | 'surrender';
export type EventType =
  | 'accepted'
  | 'rejected'
  | 'damage'
  | 'purchase'
  | 'surrender'
  | 'match-ended'
  | 'checkpoint';

interface CommandBase {
  protocolVersion: MatchProtocolVersion;
  matchId: MatchId;
  participantId: ParticipantId;
  commandId: CommandId;
  /** Monotonic per participant. */
  sequence: number;
  /** Simulation tick at which the client intends the command to apply. */
  tick: number;
  type: CommandType;
}

export interface MoveCommand extends CommandBase {
  type: 'move';
  destination: { x: number; y: number };
}

export type CastTarget =
  | { kind: 'position'; x: number; y: number }
  | { kind: 'entity'; entityId: string }
  | { kind: 'self' };

export interface CastCommand extends CommandBase {
  type: 'cast';
  abilityId: string;
  target: CastTarget;
}

export interface PurchaseCommand extends CommandBase {
  type: 'purchase';
  itemId: string;
}

export interface SurrenderCommand extends CommandBase {
  type: 'surrender';
}

export type MatchCommand = MoveCommand | CastCommand | PurchaseCommand | SurrenderCommand;

interface EventBase {
  protocolVersion: MatchProtocolVersion;
  matchId: MatchId;
  participantId: ParticipantId | null;
  commandId: CommandId | null;
  eventId: EventId;
  /** Monotonic for the complete authoritative match event stream. */
  sequence: number;
  tick: number;
  type: EventType;
}

export interface AcceptedEvent extends EventBase {
  type: 'accepted';
  commandType: CommandType;
}

export type RejectionReason =
  | 'invalid-command'
  | 'wrong-match'
  | 'unauthorized-participant'
  | 'out-of-order'
  | 'simulation-rejected';

export interface RejectedEvent extends EventBase {
  type: 'rejected';
  reason: RejectionReason;
}

export interface DamageEvent extends EventBase {
  type: 'damage';
  sourceParticipantId: ParticipantId | null;
  targetEntityId: string;
  amount: number;
  remainingHealth: number;
}

export interface PurchaseEvent extends EventBase {
  type: 'purchase';
  itemId: string;
  cost: number;
  remainingBalance: number;
}

export interface SurrenderEvent extends EventBase {
  type: 'surrender';
  surrenderingParticipantId: ParticipantId;
}

export interface MatchEndedEvent extends EventBase {
  type: 'match-ended';
  winnerParticipantId: ParticipantId | null;
  reason: 'objective' | 'surrender' | 'abandoned' | 'practice-complete';
}

export interface CheckpointEvent extends EventBase {
  type: 'checkpoint';
  snapshotCursor: number;
  checksum: string;
}

export type MatchEvent =
  | AcceptedEvent
  | RejectedEvent
  | DamageEvent
  | PurchaseEvent
  | SurrenderEvent
  | MatchEndedEvent
  | CheckpointEvent;

type EventEnvelopeKey = Exclude<keyof EventBase, 'type'>;

/** Domain outcomes an adapter may return; authority fills all envelope fields. */
export type MatchEventPayload =
  | Omit<DamageEvent, EventEnvelopeKey>
  | Omit<PurchaseEvent, EventEnvelopeKey>
  | Omit<SurrenderEvent, EventEnvelopeKey>
  | Omit<MatchEndedEvent, EventEnvelopeKey>;

const rejectionReasons: readonly RejectionReason[] = [
  'invalid-command',
  'wrong-match',
  'unauthorized-participant',
  'out-of-order',
  'simulation-rejected',
];

const matchEndReasons: readonly MatchEndedEvent['reason'][] = [
  'objective',
  'surrender',
  'abandoned',
  'practice-complete',
];

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasCommandBase(value: JsonObject): boolean {
  return (
    value.protocolVersion === MATCH_PROTOCOL_VERSION &&
    isIdentifier(value.matchId) &&
    isIdentifier(value.participantId) &&
    isIdentifier(value.commandId) &&
    isIndex(value.sequence) &&
    isIndex(value.tick)
  );
}

function isCastTarget(value: unknown): value is CastTarget {
  if (!isJsonObject(value)) return false;
  if (value.kind === 'self') return true;
  if (value.kind === 'entity') return isIdentifier(value.entityId);
  return value.kind === 'position' && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isMatchCommand(value: unknown): value is MatchCommand {
  if (!isJsonObject(value) || !isJsonValue(value) || !hasCommandBase(value)) return false;
  switch (value.type) {
    case 'move':
      return (
        isJsonObject(value.destination) &&
        isFiniteNumber(value.destination.x) &&
        isFiniteNumber(value.destination.y)
      );
    case 'cast':
      return isIdentifier(value.abilityId) && isCastTarget(value.target);
    case 'purchase':
      return isIdentifier(value.itemId);
    case 'surrender':
      return true;
    default:
      return false;
  }
}

function hasEventBase(value: JsonObject): boolean {
  return (
    value.protocolVersion === MATCH_PROTOCOL_VERSION &&
    isIdentifier(value.matchId) &&
    (value.participantId === null || isIdentifier(value.participantId)) &&
    (value.commandId === null || isIdentifier(value.commandId)) &&
    isIdentifier(value.eventId) &&
    isIndex(value.sequence) &&
    isIndex(value.tick)
  );
}

export function isMatchEvent(value: unknown): value is MatchEvent {
  if (!isJsonObject(value) || !isJsonValue(value) || !hasEventBase(value)) return false;
  switch (value.type) {
    case 'accepted':
      return ['move', 'cast', 'purchase', 'surrender'].includes(String(value.commandType));
    case 'rejected':
      return rejectionReasons.includes(value.reason as RejectionReason);
    case 'damage':
      return (
        (value.sourceParticipantId === null || isIdentifier(value.sourceParticipantId)) &&
        isIdentifier(value.targetEntityId) &&
        isFiniteNumber(value.amount) &&
        value.amount >= 0 &&
        isFiniteNumber(value.remainingHealth) &&
        value.remainingHealth >= 0
      );
    case 'purchase':
      return (
        isIdentifier(value.itemId) &&
        isFiniteNumber(value.cost) &&
        value.cost >= 0 &&
        isFiniteNumber(value.remainingBalance) &&
        value.remainingBalance >= 0
      );
    case 'surrender':
      return isIdentifier(value.surrenderingParticipantId);
    case 'match-ended':
      return (
        (value.winnerParticipantId === null || isIdentifier(value.winnerParticipantId)) &&
        matchEndReasons.includes(value.reason as MatchEndedEvent['reason'])
      );
    case 'checkpoint':
      return isIndex(value.snapshotCursor) && isIdentifier(value.checksum);
    default:
      return false;
  }
}

export class ProtocolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolValidationError';
  }
}

export function parseMatchCommand(value: unknown): MatchCommand {
  if (!isMatchCommand(value)) throw new ProtocolValidationError('Invalid match command');
  return value;
}

export function parseMatchEvent(value: unknown): MatchEvent {
  if (!isMatchEvent(value)) throw new ProtocolValidationError('Invalid match event');
  return value;
}

export function protocolValue(value: MatchCommand | MatchEvent): JsonValue {
  return value as unknown as JsonValue;
}
