import type { TelemetryClient } from './client';
import type { TelemetryPayload } from './events';

export interface CrashCaptureTarget {
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void;
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void;
}

export function createCrashPayload(
  category: Extract<TelemetryPayload, { type: 'crash' }>['category'],
  source: Extract<TelemetryPayload, { type: 'crash' }>['source'] = 'manual',
): Extract<TelemetryPayload, { type: 'crash' }> {
  return { type: 'crash', category, source };
}

/**
 * Captures only coarse crash categories. Stack traces, URLs/query strings,
 * messages, rejected values, and other user-provided content are never read.
 */
export function installPrivacySafeCrashCapture(
  client: TelemetryClient,
  target: CrashCaptureTarget = window,
): () => void {
  const onError = (_event: ErrorEvent): void => {
    client.record(createCrashPayload('error', 'window'));
  };
  const onUnhandledRejection = (_event: PromiseRejectionEvent): void => {
    client.record(createCrashPayload('unhandled-rejection', 'window'));
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
