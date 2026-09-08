import type { TelemetryClient } from './client';

export interface PerformanceSamplerEnvironment {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
  hidden(): boolean;
}

const SAMPLE_WINDOW_MS = 10_000;
const LONG_FRAME_MS = 50;

export function fpsBucketFor(fps: number): 'under-30' | '30-50' | 'over-50' {
  if (fps < 30) return 'under-30';
  if (fps <= 50) return '30-50';
  return 'over-50';
}

function browserEnvironment(): PerformanceSamplerEnvironment | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (typeof window.requestAnimationFrame !== 'function') return null;
  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    hidden: () => document.hidden,
  };
}

/** Records only a coarse FPS band and long-frame flag while the page is visible. */
export function startPrivacySafePerformanceSampling(
  client: TelemetryClient,
  environment: PerformanceSamplerEnvironment | null = browserEnvironment(),
  sampleWindowMs = SAMPLE_WINDOW_MS,
): () => void {
  if (!environment || !client.consent.enabled) return () => undefined;

  let frameHandle = 0;
  let stopped = false;
  let windowStartedAt: number | null = null;
  let previousFrameAt: number | null = null;
  let visibleFrames = 0;
  let longFrame = false;

  const resetWindow = (): void => {
    windowStartedAt = null;
    previousFrameAt = null;
    visibleFrames = 0;
    longFrame = false;
  };

  const onFrame = (timestamp: number): void => {
    if (stopped) return;

    if (!client.consent.enabled || environment.hidden()) {
      resetWindow();
      frameHandle = environment.requestFrame(onFrame);
      return;
    }

    if (windowStartedAt === null) windowStartedAt = timestamp;
    if (previousFrameAt !== null && timestamp - previousFrameAt > LONG_FRAME_MS) {
      longFrame = true;
    }
    previousFrameAt = timestamp;
    visibleFrames += 1;

    const elapsed = timestamp - windowStartedAt;
    if (elapsed >= sampleWindowMs && elapsed > 0) {
      client.record({
        type: 'performance-sample',
        fpsBucket: fpsBucketFor((visibleFrames * 1000) / elapsed),
        longFrame,
      });
      resetWindow();
    }

    frameHandle = environment.requestFrame(onFrame);
  };

  frameHandle = environment.requestFrame(onFrame);
  return () => {
    stopped = true;
    environment.cancelFrame(frameHandle);
  };
}
