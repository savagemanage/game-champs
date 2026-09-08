export type TelemetryConsentState = 'unknown' | 'granted' | 'denied';

export interface PrivacySignals {
  globalPrivacyControl: boolean;
  doNotTrack: boolean;
}

export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean };
type PrivacyWindow = Window & { doNotTrack?: string | null };

export function readPrivacySignals(): PrivacySignals {
  if (typeof navigator === 'undefined') {
    return { globalPrivacyControl: false, doNotTrack: false };
  }
  const privacyNavigator = navigator as PrivacyNavigator;
  const dnt = navigator.doNotTrack ??
    (typeof window === 'undefined' ? null : (window as PrivacyWindow).doNotTrack);
  return {
    globalPrivacyControl: privacyNavigator.globalPrivacyControl === true,
    doNotTrack: dnt === '1' || dnt?.toLowerCase() === 'yes',
  };
}

/** Explicit consent gate. Unknown is the default and always means disabled. */
export class TelemetryConsent {
  private state: TelemetryConsentState;

  constructor(
    private readonly storage: ConsentStorage | null = null,
    private readonly storageKey = 'champs:telemetry-consent:v1',
    private readonly signals: () => PrivacySignals = readPrivacySignals,
  ) {
    this.state = this.readStoredState();
  }

  private readStoredState(): TelemetryConsentState {
    if (!this.storage) return 'unknown';
    try {
      const stored = this.storage.getItem(this.storageKey);
      return stored === 'granted' || stored === 'denied' ? stored : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  get consentState(): TelemetryConsentState {
    return this.state;
  }

  get enabled(): boolean {
    const privacy = this.signals();
    return this.state === 'granted' && !privacy.globalPrivacyControl && !privacy.doNotTrack;
  }

  grant(): void {
    this.set('granted');
  }

  deny(): void {
    this.set('denied');
  }

  reset(): void {
    this.state = 'unknown';
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      // Consent remains reset in memory when storage is unavailable.
    }
  }

  private set(state: Exclude<TelemetryConsentState, 'unknown'>): void {
    this.state = state;
    try {
      this.storage?.setItem(this.storageKey, state);
    } catch {
      // Explicit in-memory choice remains authoritative for this session.
    }
  }
}
