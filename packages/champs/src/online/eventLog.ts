import type { MatchEvent } from './protocol';

export interface LoggedMatchEvent {
  /** Append cursor, independent from the protocol event sequence. */
  cursor: number;
  event: MatchEvent;
}

export interface EventLogBatch {
  events: readonly LoggedMatchEvent[];
  cursor: number;
  /** True when the requested cursor predates events retained in memory. */
  truncated: boolean;
  /** True when the requested cursor claims events this authority has not produced. */
  ahead: boolean;
}

/** Bounded, append-only in-memory event history. Oldest entries expire first. */
export class BoundedEventLog {
  private entries: LoggedMatchEvent[] = [];
  private nextCursor = 1;
  private lastEventSequence = -1;

  constructor(readonly capacity = 2048) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Event log capacity must be a positive safe integer');
    }
  }

  get cursor(): number {
    return this.nextCursor - 1;
  }

  get size(): number {
    return this.entries.length;
  }

  append(event: MatchEvent): LoggedMatchEvent {
    if (event.sequence <= this.lastEventSequence) {
      throw new RangeError('Event sequence must increase monotonically');
    }

    const entry = { cursor: this.nextCursor, event };
    this.nextCursor += 1;
    this.lastEventSequence = event.sequence;
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    return entry;
  }

  appendAll(events: readonly MatchEvent[]): readonly LoggedMatchEvent[] {
    return events.map((event) => this.append(event));
  }

  /** Seeds an empty reconstructed log at a durable snapshot boundary. */
  restoreCursor(cursor: number, lastEventSequence: number): void {
    if (this.entries.length > 0 || this.cursor !== 0 || this.lastEventSequence !== -1) {
      throw new Error('Only an empty event log can be restored');
    }
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Number.isSafeInteger(lastEventSequence) ||
      lastEventSequence < cursor
    ) {
      throw new RangeError('Invalid restored event cursor');
    }
    this.nextCursor = cursor + 1;
    this.lastEventSequence = lastEventSequence;
  }

  since(cursor: number): EventLogBatch {
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new RangeError('Event cursor must be a non-negative safe integer');
    }
    const oldestCursor = this.entries[0]?.cursor ?? this.nextCursor;
    return {
      events: this.entries.filter((entry) => entry.cursor > cursor),
      cursor: this.cursor,
      truncated: cursor < oldestCursor - 1,
      ahead: cursor > this.cursor,
    };
  }

  all(): readonly LoggedMatchEvent[] {
    return this.entries.slice();
  }
}
