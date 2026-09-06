import { describe, it, expect } from 'vitest';
import {
  resolveRenderScale,
  resolveRenderPlan,
  MIN_RENDER_SCALE,
} from '@open-games/shared';

/**
 * whiteout's render-scale math now lives ENTIRELY in @open-games/shared: main.ts
 * imports it directly (there is no whiteout ui/renderScale wrapper any more).
 * The exhaustive backbuffer/camera math is covered in
 * packages/shared/src/responsive.test.ts; this file keeps a couple of smoke
 * checks against the shared API so the whiteout wiring (main.ts
 * registerRenderScale + per-scene camera zoom) keeps the contract it depends on.
 */
describe('shared render-scale contract used by whiteout main.ts', () => {
  it('keeps the crisp-text contract main.ts relies on (smoke)', () => {
    // 960x540 logical stretched to a 1920x1080 dpr=1 window needs a 2x buffer.
    expect(resolveRenderScale(960, 540, 1920, 1080, 1)).toBe(2);
    const plan = resolveRenderPlan(960, 540, 1920, 1080, 1);
    expect(plan.bufferWidth).toBe(1920);
    expect(plan.bufferHeight).toBe(1080);
    // Zoomed camera world view stays exactly logical-sized.
    expect(plan.bufferWidth / plan.scale).toBe(960);
    expect(plan.bufferHeight / plan.scale).toBe(540);
  });

  it('never renders below the logical size (floors at MIN_RENDER_SCALE)', () => {
    expect(resolveRenderScale(960, 540, 480, 270, 1)).toBe(MIN_RENDER_SCALE);
  });
});
