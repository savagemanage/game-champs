import {
  TELEMETRY_SCHEMA_VERSION,
  isTelemetryEvent,
  redactTelemetryPayload,
  type TelemetryEvent,
} from './events';
import { TelemetryConsent } from './privacy';
import { TelemetryQueue } from './queue';
import { NoopTelemetrySink, type TelemetrySink } from './sinks';

export interface TelemetryClientOptions {
  consent?: TelemetryConsent;
  queue?: TelemetryQueue;
  sink?: TelemetrySink;
  now?: () => number;
  createId?: () => string;
}

let eventCounter = 0;

function defaultEventId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `telemetry:${uuid}`;
  eventCounter += 1;
  return `telemetry:${Date.now().toString(36)}:${eventCounter.toString(36)}`;
}

/** Consent-gated telemetry with no built-in remote destination. */
export class TelemetryClient {
  readonly consent: TelemetryConsent;
  private readonly queue: TelemetryQueue;
  private readonly sink: TelemetrySink;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: TelemetryClientOptions = {}) {
    this.consent = options.consent ?? new TelemetryConsent();
    this.queue = options.queue ?? new TelemetryQueue();
    this.sink = options.sink ?? new NoopTelemetrySink();
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultEventId;
  }

  /** Returns false when disabled or when input does not match an allowlisted schema. */
  record(value: unknown): boolean {
    if (!this.consent.enabled) return false;
    const payload = redactTelemetryPayload(value);
    if (!payload) return false;

    const event = {
      ...payload,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventId: this.createId(),
      timestamp: Math.max(0, Math.floor(this.now())),
    } as TelemetryEvent;
    if (!isTelemetryEvent(event)) return false;
    this.queue.enqueue(event);
    return true;
  }

  async flush(): Promise<number> {
    if (!this.consent.enabled) {
      this.queue.clear();
      return 0;
    }
    const events = this.queue.peek();
    if (events.length === 0) return 0;
    await this.sink.write(events);
    this.queue.acknowledge(events.length);
    return events.length;
  }

  clear(): void {
    this.queue.clear();
  }

  get queuedCount(): number {
    return this.queue.size;
  }
}
