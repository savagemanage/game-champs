import { describe, expect, it } from 'vitest';
import { TelemetryClient } from './client';
import { createCrashPayload } from './crash';
import { redactTelemetryPayload } from './events';
import { TelemetryConsent } from './privacy';
import { TelemetryQueue } from './queue';
import { LocalTelemetrySink } from './sinks';

describe('privacy-first telemetry', () => {
  it('is disabled until explicit consent and privacy signals still override consent', () => {
    const disabled = new TelemetryConsent(null, 'test', () => ({
      globalPrivacyControl: false,
      doNotTrack: false,
    }));
    expect(disabled.enabled).toBe(false);
    disabled.grant();
    expect(disabled.enabled).toBe(true);

    const gpc = new TelemetryConsent(null, 'test', () => ({
      globalPrivacyControl: true,
      doNotTrack: false,
    }));
    gpc.grant();
    expect(gpc.enabled).toBe(false);
  });

  it('projects input onto allowlisted fields and excludes crash details', () => {
    expect(
      redactTelemetryPayload({
        type: 'session-started',
        sessionKind: 'local',
        userText: 'must not survive',
        pageUrl: 'https://example.invalid/?private=value',
      }),
    ).toEqual({ type: 'session-started', sessionKind: 'local' });
    expect(createCrashPayload('error')).toEqual({
      type: 'crash',
      category: 'error',
      source: 'manual',
    });
  });

  it('bounds and expires queued events', () => {
    let now = 10;
    const queue = new TelemetryQueue(1, 5, () => now);
    const consent = new TelemetryConsent(null, 'test', () => ({
      globalPrivacyControl: false,
      doNotTrack: false,
    }));
    consent.grant();
    const client = new TelemetryClient({
      consent,
      queue,
      now: () => now,
      createId: () => `event-${now}`,
    });

    client.record({ type: 'session-started', sessionKind: 'local' });
    now = 11;
    client.record({ type: 'session-started', sessionKind: 'practice' });
    expect(client.queuedCount).toBe(1);
    now = 17;
    expect(client.queuedCount).toBe(0);
  });

  it('flushes only after consent to a local sink', async () => {
    const sink = new LocalTelemetrySink();
    const consent = new TelemetryConsent(null, 'test', () => ({
      globalPrivacyControl: false,
      doNotTrack: false,
    }));
    const client = new TelemetryClient({ consent, sink, now: () => 1, createId: () => 'event-1' });

    expect(client.record({ type: 'session-started', sessionKind: 'local' })).toBe(false);
    consent.grant();
    expect(client.record({ type: 'session-started', sessionKind: 'local' })).toBe(true);
    expect(await client.flush()).toBe(1);
    expect(sink.read()).toHaveLength(1);
  });
});
