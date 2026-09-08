import { isTelemetryEvent, type TelemetryEvent } from './events';

export interface TelemetrySink {
  /** Sinks are local-only. This interface intentionally has no endpoint configuration. */
  write(events: readonly TelemetryEvent[]): Promise<void>;
}

export class NoopTelemetrySink implements TelemetrySink {
  async write(_events: readonly TelemetryEvent[]): Promise<void> {
    // Explicitly discard events.
  }
}

/** Bounded in-memory sink for local diagnostics. */
export class LocalTelemetrySink implements TelemetrySink {
  private events: TelemetryEvent[] = [];

  constructor(readonly capacity = 512) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Local telemetry capacity must be a positive safe integer');
    }
  }

  async write(events: readonly TelemetryEvent[]): Promise<void> {
    this.events.push(...events.filter(isTelemetryEvent));
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
  }

  read(): readonly TelemetryEvent[] {
    return this.events.slice();
  }

  clear(): void {
    this.events = [];
  }
}

/** Collects a bounded local export; data leaves the app only when the caller reads it. */
export class ExportTelemetrySink implements TelemetrySink {
  private readonly local: LocalTelemetrySink;

  constructor(capacity = 512) {
    this.local = new LocalTelemetrySink(capacity);
  }

  async write(events: readonly TelemetryEvent[]): Promise<void> {
    await this.local.write(events);
  }

  exportJson(): string {
    return JSON.stringify(
      {
        format: 'champs-telemetry-export',
        version: 1,
        events: this.local.read(),
      },
      null,
      2,
    );
  }

  clear(): void {
    this.local.clear();
  }
}
