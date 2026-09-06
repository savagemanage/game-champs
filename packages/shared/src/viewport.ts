/**
 * viewport.ts - a tiny, SHARED "visible world rect" provider + refit-notify
 * mechanism that every landscape game uses to keep its scene BACKDROPS sized to
 * the live viewport across resize / orientationchange.
 *
 * THE PROBLEM this solves. The landscape games grow their Phaser surface to the
 * viewport aspect (see responsive.ts `resolveViewportPlan`) so a portrait phone
 * FILLS instead of letterboxing, and each scene paints its sky/backdrop across
 * the {@link VisibleWorldRect} the zoomed camera actually shows. But that rect
 * was read ONCE at scene `create()` from a boot-module-level plan, so after a
 * mid-scene device rotation the backdrop kept the PREVIOUS orientation's size
 * (dead margins on a grow / overspray on a shrink). Scenes also imported the
 * rect getter from their own `../main` boot module, coupling scene rendering to
 * a mutable module-level plan.
 *
 * THE MECHANISM. The boot module (main.ts) PUBLISHES the current visible-world
 * rect into the Phaser game registry and emits a game-level refit event on every
 * recompute; scenes READ the rect from the registry (no `../main` import) and
 * SUBSCRIBE to the refit event to re-size their backdrop objects. Because the
 * rect lives in the registry keyed by {@link VISIBLE_WORLD_RECT_KEY} and the
 * event name is the shared {@link VIEWPORT_REFIT_EVENT}, all three games share
 * ONE mechanism instead of an ad-hoc per-scene copy.
 *
 * Phaser-TYPE-only: this module imports Phaser purely for its `Scene`/`Game`
 * types (like phaserScale.ts) and pulls NOTHING from Phaser at runtime, so the
 * shared package still emits no dist and stays framework-light. The Scene it
 * receives supplies the registry + event emitter at call time.
 */

import type Phaser from 'phaser';
import { resolveVisibleWorldRect, type VisibleWorldRect } from './responsive';

/**
 * Game-registry key under which the live {@link VisibleWorldRect} is stored.
 * Scenes read it via {@link readVisibleWorldRect}; the boot module writes it via
 * {@link publishVisibleWorldRect}.
 */
export const VISIBLE_WORLD_RECT_KEY = 'shared:visibleWorldRect';

/**
 * Game-level event emitted (on `game.events`) whenever the visible-world rect
 * changes (a resize / orientationchange recompute). Scenes subscribe via
 * {@link onViewportRefit} to re-fit their backdrop objects.
 */
export const VIEWPORT_REFIT_EVENT = 'shared:viewport-refit';

/** The minimal registry surface {@link publishVisibleWorldRect} needs. */
interface RegistryLike {
  set(key: string, value: unknown): unknown;
  get(key: string): unknown;
}

/** The minimal game surface the provider needs (registry + event emitter). */
interface GameLike {
  registry: RegistryLike;
  events: { emit(event: string, ...args: unknown[]): unknown };
}

/**
 * PUBLISH the current visible-world rect into the game registry and notify live
 * scenes to re-fit. Call this from the boot module's recompute() (and once on
 * boot) AFTER the plan is updated. Storing the plain rect object means scenes
 * never reach back into the boot module for it.
 */
export function publishVisibleWorldRect(game: GameLike, rect: VisibleWorldRect): void {
  game.registry.set(VISIBLE_WORLD_RECT_KEY, rect);
  game.events.emit(VIEWPORT_REFIT_EVENT, rect);
}

/**
 * READ the current visible-world rect a scene should paint its backdrop across.
 * Reads the registry value the boot module published; if none has been published
 * yet (e.g. a unit/test harness, or a scene created before the first publish) it
 * falls back to the design rect at (0,0) via {@link resolveVisibleWorldRect}, so
 * callers always get a usable rect.
 *
 * @param scene         the calling Phaser scene (supplies the registry)
 * @param designWidth   design/logical width  (e.g. 960) for the fallback rect
 * @param designHeight  design/logical height (e.g. 540) for the fallback rect
 */
export function readVisibleWorldRect(
  scene: Phaser.Scene,
  designWidth: number,
  designHeight: number,
): VisibleWorldRect {
  const stored = scene.registry?.get(VISIBLE_WORLD_RECT_KEY) as VisibleWorldRect | undefined;
  if (
    stored &&
    typeof stored.width === 'number' &&
    typeof stored.height === 'number' &&
    stored.width > 0 &&
    stored.height > 0
  ) {
    return stored;
  }
  // Nothing published yet: fall back to the design rect (fill == design).
  return resolveVisibleWorldRect(designWidth, designHeight, {
    fillWidth: designWidth,
    fillHeight: designHeight,
  });
}

/**
 * SUBSCRIBE a scene to viewport-refit notifications so it can re-size its
 * backdrop objects when the viewport changes (resize / orientationchange).
 *
 * The handler is invoked with the fresh {@link VisibleWorldRect} on every refit
 * AND once immediately with the current rect, so a scene created mid-session
 * fits itself right away without duplicating the create()-time paint call. The
 * listener is automatically detached on scene SHUTDOWN and DESTROY, so restarts
 * and scene stops never leak handlers or fire into a torn-down scene.
 *
 * @param scene    the subscribing scene
 * @param design   the design size for the immediate/fallback rect
 * @param handler  called with the current visible-world rect to re-fit backdrops
 * @returns an unsubscribe function (also wired to scene shutdown/destroy)
 */
export function onViewportRefit(
  scene: Phaser.Scene,
  design: { width: number; height: number },
  handler: (rect: VisibleWorldRect) => void,
): () => void {
  const listener = (rect: VisibleWorldRect): void => handler(rect);
  scene.game.events.on(VIEWPORT_REFIT_EVENT, listener);

  const detach = (): void => {
    scene.game.events.off(VIEWPORT_REFIT_EVENT, listener);
  };
  // Detach on scene teardown so a restarted/stopped scene never keeps a stale
  // listener bound to its old instance.
  scene.events.once('shutdown', detach);
  scene.events.once('destroy', detach);

  // Fit once now with the current rect so the caller only writes the sizing
  // logic in one place (the handler), not also inline at create().
  handler(readVisibleWorldRect(scene, design.width, design.height));

  return detach;
}
