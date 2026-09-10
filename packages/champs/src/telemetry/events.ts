export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export type TelemetrySchemaVersion = typeof TELEMETRY_SCHEMA_VERSION;

export type TelemetryPayload =
  | { type: 'session-started'; sessionKind: 'local' | 'practice' }
  | {
      type: 'match-completed';
      mode: 'conquest' | 'midline';
      result: 'win' | 'loss' | 'draw' | 'abandoned';
      durationBucket: 'under-5m' | '5m-15m' | 'over-15m';
    }
  | {
      type: 'command-rejected';
      commandType: 'move' | 'cast' | 'purchase' | 'surrender';
      reasonCode:
        | 'invalid-command'
        | 'wrong-match'
        | 'unauthorized-participant'
        | 'out-of-order'
        | 'simulation-rejected';
    }
  | {
      type: 'performance-sample';
      fpsBucket: 'under-30' | '30-50' | 'over-50';
      longFrame: boolean;
    }
  | {
      type: 'crash';
      category: 'error' | 'unhandled-rejection' | 'unknown';
      source: 'window' | 'manual';
    };

export type TelemetryEvent = TelemetryPayload & {
  schemaVersion: TelemetrySchemaVersion;
  eventId: string;
  timestamp: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

/** Projects unknown input onto one of the allowlisted, non-identifying schemas. */
export function redactTelemetryPayload(value: unknown): TelemetryPayload | null {
  const input = record(value);
  if (!input || typeof input.type !== 'string') return null;

  switch (input.type) {
    case 'session-started':
      if (!oneOf(input.sessionKind, ['local', 'practice'])) return null;
      return { type: input.type, sessionKind: input.sessionKind };
    case 'match-completed':
      if (
        !oneOf(input.mode, ['conquest', 'midline']) ||
        !oneOf(input.result, ['win', 'loss', 'draw', 'abandoned']) ||
        !oneOf(input.durationBucket, ['under-5m', '5m-15m', 'over-15m'])
      ) {
        return null;
      }
      return {
        type: input.type,
        mode: input.mode,
        result: input.result,
        durationBucket: input.durationBucket,
      };
    case 'command-rejected':
      if (
        !oneOf(input.commandType, ['move', 'cast', 'purchase', 'surrender']) ||
        !oneOf(input.reasonCode, [
          'invalid-command',
          'wrong-match',
          'unauthorized-participant',
          'out-of-order',
          'simulation-rejected',
        ])
      ) {
        return null;
      }
      return { type: input.type, commandType: input.commandType, reasonCode: input.reasonCode };
    case 'performance-sample':
      if (!oneOf(input.fpsBucket, ['under-30', '30-50', 'over-50']) || typeof input.longFrame !== 'boolean') {
        return null;
      }
      return { type: input.type, fpsBucket: input.fpsBucket, longFrame: input.longFrame };
    case 'crash':
      if (
        !oneOf(input.category, ['error', 'unhandled-rejection', 'unknown']) ||
        !oneOf(input.source, ['window', 'manual'])
      ) {
        return null;
      }
      return { type: input.type, category: input.category, source: input.source };
    default:
      return null;
  }
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  const input = record(value);
  if (
    !input ||
    input.schemaVersion !== TELEMETRY_SCHEMA_VERSION ||
    typeof input.eventId !== 'string' ||
    input.eventId.length === 0 ||
    typeof input.timestamp !== 'number' ||
    !Number.isSafeInteger(input.timestamp) ||
    input.timestamp < 0
  ) {
    return false;
  }

  const payload = redactTelemetryPayload(input);
  if (!payload) return false;
  const payloadKeys: Record<TelemetryPayload['type'], readonly string[]> = {
    'session-started': ['schemaVersion', 'eventId', 'timestamp', 'type', 'sessionKind'],
    'match-completed': ['schemaVersion', 'eventId', 'timestamp', 'type', 'mode', 'result', 'durationBucket'],
    'command-rejected': ['schemaVersion', 'eventId', 'timestamp', 'type', 'commandType', 'reasonCode'],
    'performance-sample': ['schemaVersion', 'eventId', 'timestamp', 'type', 'fpsBucket', 'longFrame'],
    crash: ['schemaVersion', 'eventId', 'timestamp', 'type', 'category', 'source'],
  };
  return hasOnlyKeys(input, payloadKeys[payload.type]);
}
