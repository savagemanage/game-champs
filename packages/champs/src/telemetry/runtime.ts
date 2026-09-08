import { TelemetryClient } from './client';
import { installPrivacySafeCrashCapture } from './crash';
import type { TelemetryPayload } from './events';
import { startPrivacySafePerformanceSampling } from './performance';
import {
  readPrivacySignals,
  TelemetryConsent,
  type ConsentStorage,
  type TelemetryConsentState,
} from './privacy';
import { ExportTelemetrySink } from './sinks';

export interface TelemetryRuntimeStatus {
  consentState: TelemetryConsentState;
  enabled: boolean;
  privacyBlocked: boolean;
}

function safeLocalStorage(): ConsentStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    storage.getItem('champs:telemetry-storage-check');
    return storage;
  } catch {
    return null;
  }
}

const consent = new TelemetryConsent(safeLocalStorage());
const sink = new ExportTelemetrySink();
const client = new TelemetryClient({ consent, sink });

export function telemetryRuntimeStatus(): TelemetryRuntimeStatus {
  const signals = readPrivacySignals();
  return {
    consentState: consent.consentState,
    enabled: consent.enabled,
    privacyBlocked: signals.globalPrivacyControl || signals.doNotTrack,
  };
}

export function grantTelemetryConsent(): TelemetryRuntimeStatus {
  consent.grant();
  return telemetryRuntimeStatus();
}

export function denyTelemetryConsent(): TelemetryRuntimeStatus {
  consent.deny();
  clearTelemetryData();
  return telemetryRuntimeStatus();
}

export function clearTelemetryData(): void {
  client.clear();
  sink.clear();
}

export function recordTelemetry(payload: TelemetryPayload): boolean {
  return client.record(payload);
}

export async function exportTelemetryData(): Promise<string> {
  if (!consent.enabled) {
    clearTelemetryData();
    return sink.exportJson();
  }
  await client.flush();
  return sink.exportJson();
}

/** Installs capture only after effective consent and returns complete cleanup. */
export function startConsentGatedTelemetryCapture(): () => void {
  if (!consent.enabled || typeof window === 'undefined') return () => undefined;
  const stopCrashCapture = installPrivacySafeCrashCapture(client, window);
  const stopPerformanceSampling = startPrivacySafePerformanceSampling(client);
  return () => {
    stopPerformanceSampling();
    stopCrashCapture();
  };
}

export function matchDurationBucket(
  durationSeconds: number,
): 'under-5m' | '5m-15m' | 'over-15m' {
  if (durationSeconds < 300) return 'under-5m';
  if (durationSeconds <= 900) return '5m-15m';
  return 'over-15m';
}
