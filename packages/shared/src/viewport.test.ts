import { describe, it, expect, vi } from 'vitest';
import {
  VISIBLE_WORLD_RECT_KEY,
  VIEWPORT_REFIT_EVENT,
  publishVisibleWorldRect,
  readVisibleWorldRect,
  onViewportRefit,
} from './viewport';
import { resolveVisibleWorldRect, type VisibleWorldRect } from './responsive';

/**
 * The viewport provider is Phaser-TYPE-only, so we exercise it with minimal
 * fakes that expose exactly the registry + event surface it touches (a real
 * Phaser.Game/Scene is not needed for the pure store/notify behavior). This
 * covers the resize-refit mechanism that closes the stale-backdrop bug: publish
 * updates the registry AND fires the event, scenes read the live rect, and
 * subscribers are notified on refit + detached on teardown.
 */

/** A tiny EventEmitter matching the on/off/once/emit subset the module uses. */
function makeEmitter() {
  const map = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(evt: string, fn: (...args: unknown[]) => void) {
      (map.get(evt) ?? map.set(evt, new Set()).get(evt)!).add(fn);
    },
    off(evt: string, fn: (...args: unknown[]) => void) {
      map.get(evt)?.delete(fn);
    },
    once(evt: string, fn: (...args: unknown[]) => void) {
      const wrap = (...args: unknown[]) => {
        this.off(evt, wrap);
        fn(...args);
      };
      this.on(evt, wrap);
    },
    emit(evt: string, ...args: unknown[]) {
      for (const fn of [...(map.get(evt) ?? [])]) fn(...args);
    },
    listenerCount(evt: string) {
      return map.get(evt)?.size ?? 0;
    },
  };
}

function makeGame() {
  const store = new Map<string, unknown>();
  return {
    registry: {
      set: (k: string, v: unknown) => store.set(k, v),
      get: (k: string) => store.get(k),
    },
    events: makeEmitter(),
  };
}

/** A scene fake sharing the game's registry + events, with its own scene events. */
function makeScene(game: ReturnType<typeof makeGame>) {
  return {
    game,
    registry: game.registry,
    events: makeEmitter(),
  } as unknown as import('phaser').Scene & { events: ReturnType<typeof makeEmitter> };
}

const rect = (w: number, h: number): VisibleWorldRect => resolveVisibleWorldRect(960, 540, {
  fillWidth: w,
  fillHeight: h,
});

describe('publishVisibleWorldRect', () => {
  it('stores the rect in the registry and emits the refit event', () => {
    const game = makeGame();
    const seen: VisibleWorldRect[] = [];
    game.events.on(VIEWPORT_REFIT_EVENT, (r) => seen.push(r as VisibleWorldRect));

    const r = rect(960, 1664);
    publishVisibleWorldRect(game, r);

    expect(game.registry.get(VISIBLE_WORLD_RECT_KEY)).toBe(r);
    expect(seen).toEqual([r]);
  });
});

describe('readVisibleWorldRect', () => {
  it('returns the published rect when present', () => {
    const game = makeGame();
    const scene = makeScene(game);
    const r = rect(960, 1664);
    publishVisibleWorldRect(game, r);
    expect(readVisibleWorldRect(scene, 960, 540)).toBe(r);
  });

  it('falls back to the design rect (fill == design) when nothing is published', () => {
    const game = makeGame();
    const scene = makeScene(game);
    expect(readVisibleWorldRect(scene, 960, 540)).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });

  it('falls back when the stored value is degenerate', () => {
    const game = makeGame();
    const scene = makeScene(game);
    game.registry.set(VISIBLE_WORLD_RECT_KEY, { x: 0, y: 0, width: 0, height: 0 });
    expect(readVisibleWorldRect(scene, 960, 540)).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });
});

describe('onViewportRefit', () => {
  it('fits once immediately with the current rect', () => {
    const game = makeGame();
    const scene = makeScene(game);
    const r = rect(960, 1664);
    publishVisibleWorldRect(game, r);

    const handler = vi.fn();
    onViewportRefit(scene, { width: 960, height: 540 }, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(r);
  });

  it('re-fits on every subsequent publish', () => {
    const game = makeGame();
    const scene = makeScene(game);
    const handler = vi.fn();
    onViewportRefit(scene, { width: 960, height: 540 }, handler); // immediate (design fallback)

    const landscape = rect(960, 540);
    const portrait = rect(960, 1664);
    publishVisibleWorldRect(game, landscape);
    publishVisibleWorldRect(game, portrait);

    // immediate + 2 publishes = 3 calls; last reflects the portrait rotation.
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenLastCalledWith(portrait);
  });

  it('detaches on scene shutdown so a torn-down scene is never notified', () => {
    const game = makeGame();
    const scene = makeScene(game);
    const handler = vi.fn();
    onViewportRefit(scene, { width: 960, height: 540 }, handler);
    handler.mockClear();

    scene.events.emit('shutdown');
    publishVisibleWorldRect(game, rect(960, 1664));

    expect(handler).not.toHaveBeenCalled();
    expect(game.events.listenerCount(VIEWPORT_REFIT_EVENT)).toBe(0);
  });

  it('the returned unsubscribe also detaches', () => {
    const game = makeGame();
    const scene = makeScene(game);
    const handler = vi.fn();
    const off = onViewportRefit(scene, { width: 960, height: 540 }, handler);
    handler.mockClear();

    off();
    publishVisibleWorldRect(game, rect(960, 1664));
    expect(handler).not.toHaveBeenCalled();
  });
});
