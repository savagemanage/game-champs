/**
 * Pure, Phaser-free "game feel" math for combat juice ('타격감').
 *
 * The BattleScene drives visual juice (screen shake, hit-flash, squash-stretch,
 * knockback, damage popups, kill slow-mo) off of TWEENS/TIMERS/CAMERA only, so
 * it never touches the deterministic simulation. The numeric decisions behind
 * that juice -- how big a hit is, how hard to shake, how far to nudge, how much
 * to squash -- are plain math with no Phaser dependency, so they live here where
 * they can be unit-tested directly.
 *
 * IMPORTANT: nothing in this module reads or writes gameplay state. It only maps
 * inputs (damage fraction, importance) to cosmetic magnitudes.
 */

/** How impactful a hit is, used to scale every juice effect consistently. */
export type HitImportance = 'chip' | 'normal' | 'ability' | 'ult' | 'big';

/**
 * Damage at or above this fraction of the target's max HP is a "big" hit and
 * earns the strongest feedback. Kept in sync with BattleScene.BIG_HIT_FRACTION.
 */
export const BIG_HIT_FRACTION = 0.12;

/** A hit dealing less than this fraction of max HP reads as light "chip" damage. */
export const CHIP_HIT_FRACTION = 0.04;

/**
 * Classify a hit into an {@link HitImportance} band from its damage fraction,
 * whether it came from an ability / ultimate, and whether it was lethal.
 *
 * Ordering of feedback strength: chip < normal < ability < ult < big. A lethal
 * blow or a hit >= {@link BIG_HIT_FRACTION} of max HP is always "big" regardless
 * of source, so kills and huge nukes feel the heaviest.
 */
export function classifyHit(opts: {
  fraction: number;
  ability?: boolean;
  ult?: boolean;
  lethal?: boolean;
}): HitImportance {
  const frac = Number.isFinite(opts.fraction) ? Math.max(0, opts.fraction) : 0;
  if (opts.lethal || frac >= BIG_HIT_FRACTION) return 'big';
  if (opts.ult) return 'ult';
  if (opts.ability) return 'ability';
  if (frac < CHIP_HIT_FRACTION) return 'chip';
  return 'normal';
}

/** Camera shake amount for a hit: `duration` in ms, `intensity` in [0,1]-ish. */
export interface ShakeSpec {
  duration: number;
  intensity: number;
}

/**
 * Hard ceiling on any single shake's intensity. The scene clamps to this too;
 * kept here so the pure math and the Phaser layer agree on "the camera can
 * never lurch more than this". Deliberately well below the old 0.03 so even a
 * legitimate on-screen big hit is a gentle bump, not a lurch.
 */
export const MAX_SHAKE_INTENSITY = 0.012;

/**
 * Minimum real-time gap (ms) between two camera shakes. In a 5v5 with ten
 * champions in constant combat, hits land many times per second; without a
 * floor the shakes coalesce into a permanent tremor. A new shake that arrives
 * inside this window is dropped (unless it is strictly stronger -- see
 * {@link shouldShake}) so the camera settles between bumps.
 */
export const SHAKE_MIN_INTERVAL_MS = 220;

/**
 * Screen-shake magnitude scaled by importance and (for the heaviest tiers)
 * damage fraction. Chip AND normal hits do not shake at all -- only abilities,
 * ults and big/lethal blows do -- so ordinary autoattack trading never moves
 * the camera. The intensity is clamped to {@link MAX_SHAKE_INTENSITY} so even a
 * monster nuke stays a subtle bump.
 */
export function shakeForHit(importance: HitImportance, fraction = 0): ShakeSpec {
  const frac = Number.isFinite(fraction) ? Math.max(0, fraction) : 0;
  switch (importance) {
    case 'chip':
      return { duration: 0, intensity: 0 };
    case 'normal':
      return { duration: 0, intensity: 0 };
    case 'ability':
      return { duration: 110, intensity: 0.003 };
    case 'ult':
      return { duration: 150, intensity: 0.006 };
    case 'big':
      return { duration: 180, intensity: clamp(0.007 + frac * 0.02, 0.007, MAX_SHAKE_INTENSITY) };
  }
}

/** A dedicated, slightly stronger shake for structure (turret/nexus) death. */
export function structureDestructionShake(): ShakeSpec {
  return { duration: 240, intensity: MAX_SHAKE_INTENSITY };
}

/**
 * Pure decision for whether a requested camera shake should actually fire,
 * given everything the scene knows about it. Keeping this Phaser-free lets it
 * be unit-tested; the scene supplies the live inputs (on-screen test from the
 * camera worldView, time since the last shake, and the currently-playing
 * shake's intensity from the shake effect).
 *
 * A shake fires only when it has real magnitude AND it is perceivable by the
 * player (either the player's champion is involved, or the hit is on-screen),
 * AND it is not being throttled. Throttling drops a shake that arrives within
 * {@link SHAKE_MIN_INTERVAL_MS} of the previous one UNLESS it is strictly
 * stronger than what is already playing (so a big hit can still punch through a
 * lingering weak tremor, but a weak hit can never restart/extend a stronger
 * one).
 */
export function shouldShake(opts: {
  /** Requested shake intensity (already looked up from the band). */
  intensity: number;
  /** Is the player's champion the attacker or the victim of this hit? */
  involvesPlayer: boolean;
  /** Is the hit's projected position inside the camera's visible view? */
  onScreen: boolean;
  /** Real-time ms elapsed since the last shake actually fired. */
  sinceLastMs: number;
  /** Is a shake currently playing on the camera? */
  running: boolean;
  /** Intensity of the currently-playing shake (0 when none). */
  runningIntensity: number;
}): boolean {
  if (!(opts.intensity > 0)) return false;
  // Only shake for combat the player can perceive.
  if (!opts.involvesPlayer && !opts.onScreen) return false;
  // Never restart/extend a shake weaker than the one currently playing.
  if (opts.running && opts.intensity <= opts.runningIntensity) return false;
  // Throttle bursts: within the min interval, only a shake strictly stronger
  // than what is currently playing punches through (so a big hit can still be
  // felt over a lingering weak tremor). A shake with nothing playing but inside
  // the interval is dropped, so rapid hits cannot stack into a permanent shake.
  if (opts.sinceLastMs < SHAKE_MIN_INTERVAL_MS) {
    if (!opts.running || opts.intensity <= opts.runningIntensity) return false;
  }
  return true;
}

/**
 * Number of impact spark particles to emit for a hit. Scales with importance so
 * big/lethal hits throw a fuller burst than chip damage.
 */
export function sparkCountForHit(importance: HitImportance): number {
  switch (importance) {
    case 'chip':
      return 3;
    case 'normal':
      return 5;
    case 'ability':
      return 7;
    case 'ult':
      return 10;
    case 'big':
      return 14;
  }
}

/**
 * Visual-only knockback distance (screen px) the struck billboard is nudged
 * away from its attacker before tweening back. Purely cosmetic: the caller
 * applies it to the rendered CONTAINER offset, never to `unit.pos`.
 */
export function knockbackForHit(importance: HitImportance): number {
  switch (importance) {
    case 'chip':
      return 2;
    case 'normal':
      return 3;
    case 'ability':
      return 5;
    case 'ult':
      return 7;
    case 'big':
      return 9;
  }
}

/** A unit-vector direction, or a fallback when the two points coincide. */
export function knockbackDir(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: -1 };
  return { x: dx / len, y: dy / len };
}

/** Damage-popup styling derived from importance. */
export interface PopupStyle {
  /** Font size in px. */
  fontSize: number;
  /** Peak scale the number pops to before settling. */
  pop: number;
  /** Max random horizontal jitter (px) applied to the spawn point. */
  jitter: number;
  /** Whether this popup should read as a heavy hit (distinct color/weight). */
  heavy: boolean;
}

/** Damage-number popup styling: big hits pop bigger, jitter more, read heavier. */
export function popupStyleForHit(importance: HitImportance): PopupStyle {
  switch (importance) {
    case 'chip':
      return { fontSize: 11, pop: 0.95, jitter: 2, heavy: false };
    case 'normal':
      return { fontSize: 12, pop: 1.05, jitter: 3, heavy: false };
    case 'ability':
      return { fontSize: 14, pop: 1.2, jitter: 4, heavy: false };
    case 'ult':
      return { fontSize: 16, pop: 1.35, jitter: 6, heavy: true };
    case 'big':
      return { fontSize: 18, pop: 1.5, jitter: 8, heavy: true };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
