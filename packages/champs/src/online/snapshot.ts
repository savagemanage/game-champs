import {
  canonicalJson,
  checksumJson,
  isJsonObject,
  isJsonValue,
  parseJson,
  type JsonValue,
} from './json';
import { MATCH_PROTOCOL_VERSION, type MatchId, type MatchProtocolVersion } from './protocol';

export interface RngSnapshot {
  algorithm: string;
  state: JsonValue;
}

export interface AuthoritySnapshot {
  eventSequence: number;
  participantSequences: { [participantId: string]: number };
}

export interface SnapshotEnvelope {
  protocolVersion: MatchProtocolVersion;
  matchId: MatchId;
  tick: number;
  /** Event-log cursor represented by the simulation payload. */
  eventCursor: number;
  authority: AuthoritySnapshot;
  rng: RngSnapshot;
  /** Complete authoritative simulation state, never a HUD-only projection. */
  simulation: JsonValue;
  createdAt: number;
  checksum: string;
}

export type SnapshotInput = Omit<SnapshotEnvelope, 'checksum' | 'protocolVersion'>;

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isAuthoritySnapshot(value: unknown): value is AuthoritySnapshot {
  return (
    isJsonObject(value) &&
    isIndex(value.eventSequence) &&
    isJsonObject(value.participantSequences) &&
    Object.entries(value.participantSequences).every(
      ([participantId, sequence]) => participantId.length > 0 && isIndex(sequence),
    )
  );
}

function checksumPayload(snapshot: Omit<SnapshotEnvelope, 'checksum'>): JsonValue {
  return snapshot as unknown as JsonValue;
}

export function createSnapshotEnvelope(input: SnapshotInput): SnapshotEnvelope {
  if (
    input.matchId.length === 0 ||
    !isIndex(input.tick) ||
    !isIndex(input.eventCursor) ||
    !isIndex(input.createdAt) ||
    !isAuthoritySnapshot(input.authority) ||
    input.authority.eventSequence < input.eventCursor ||
    input.rng.algorithm.length === 0 ||
    !isJsonValue(input.rng.state) ||
    !isJsonValue(input.simulation)
  ) {
    throw new TypeError('Snapshot input is not JSON-safe or is incomplete');
  }

  const withoutChecksum: Omit<SnapshotEnvelope, 'checksum'> = {
    protocolVersion: MATCH_PROTOCOL_VERSION,
    ...input,
  };
  return { ...withoutChecksum, checksum: checksumJson(checksumPayload(withoutChecksum)) };
}

export function isSnapshotEnvelope(value: unknown): value is SnapshotEnvelope {
  if (!isJsonObject(value) || !isJsonValue(value)) return false;
  if (
    value.protocolVersion !== MATCH_PROTOCOL_VERSION ||
    typeof value.matchId !== 'string' ||
    value.matchId.length === 0 ||
    !isIndex(value.tick) ||
    !isIndex(value.eventCursor) ||
    !isIndex(value.createdAt) ||
    !isAuthoritySnapshot(value.authority) ||
    value.authority.eventSequence < value.eventCursor ||
    typeof value.checksum !== 'string' ||
    !isJsonObject(value.rng) ||
    typeof value.rng.algorithm !== 'string' ||
    value.rng.algorithm.length === 0 ||
    !isJsonValue(value.rng.state) ||
    !isJsonValue(value.simulation)
  ) {
    return false;
  }

  const { checksum, ...withoutChecksum } = value;
  return checksum === checksumJson(withoutChecksum);
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Defensive localStorage persistence. Storage failures never masquerade as saves. */
export class LocalStorageSnapshotStore {
  constructor(
    private readonly storage: SnapshotStorage | null = browserStorage(),
    private readonly namespace = 'champs:match-snapshot',
  ) {}

  private key(matchId: MatchId): string {
    return `${this.namespace}:v${MATCH_PROTOCOL_VERSION}:${encodeURIComponent(matchId)}`;
  }

  save(snapshot: SnapshotEnvelope): boolean {
    if (!this.storage || !isSnapshotEnvelope(snapshot)) return false;
    try {
      this.storage.setItem(this.key(snapshot.matchId), canonicalJson(snapshot as unknown as JsonValue));
      return true;
    } catch {
      return false;
    }
  }

  load(matchId: MatchId): SnapshotEnvelope | null {
    if (!this.storage) return null;
    try {
      const text = this.storage.getItem(this.key(matchId));
      if (text === null) return null;
      const parsed = parseJson(text);
      return isSnapshotEnvelope(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  remove(matchId: MatchId): boolean {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(this.key(matchId));
      return true;
    } catch {
      return false;
    }
  }
}
