import type { TelemetryEvent } from './events';

interface QueuedTelemetryEvent {
  event: TelemetryEvent;
  expiresAt: number;
}

/** Bounded memory queue with age-based expiry. */
export class TelemetryQueue {
  private entries: QueuedTelemetryEvent[] = [];

  constructor(
    readonly capacity = 128,
    readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Telemetry queue capacity must be a positive safe integer');
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('Telemetry queue TTL must be positive');
    }
  }

  get size(): number {
    this.expire();
    return this.entries.length;
  }

  enqueue(event: TelemetryEvent): void {
    this.expire();
    this.entries.push({ event, expiresAt: this.now() + this.ttlMs });
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  peek(): readonly TelemetryEvent[] {
    this.expire();
    return this.entries.map((entry) => entry.event);
  }

  acknowledge(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid acknowledgement');
    this.entries.splice(0, count);
  }

  clear(): void {
    this.entries = [];
  }

  private expire(): void {
    const currentTime = this.now();
    this.entries = this.entries.filter((entry) => entry.expiresAt > currentTime);
  }
}
