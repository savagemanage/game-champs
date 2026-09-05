/**
 * GameOverReason.ts - pure, Phaser-free mapping from a run outcome to the
 * translation key that describes it.
 *
 * A run can end in victory or by one of four distinct lose causes. The
 * game-over summary needs to show a cause-specific, localized line, so this
 * module owns the outcome -> {@link TrKey} mapping in isolation. Keeping it free
 * of Phaser lets it be unit-tested directly (see GameOverReason.test.ts).
 */

import type { TrKey } from '../i18n/strings';

/** The distinct ways a run can be lost. */
export type LoseReason = 'hero_dead' | 'inner_breached' | 'citizens_lost' | 'abandoned';

/** Maps each lose cause to its localized outcome-message key. */
const LOSE_MESSAGE_KEY: Record<LoseReason, TrKey> = {
  hero_dead: 'gameover.reason.hero_dead',
  inner_breached: 'gameover.reason.inner_breached',
  citizens_lost: 'gameover.reason.citizens_lost',
  abandoned: 'gameover.reason.abandoned',
};

/**
 * Resolve the translation key for a run outcome. Victory always maps to the
 * victory line; a loss maps to its cause-specific line. When a loss carries no
 * reason (should not happen once every call-site is wired) it falls back to the
 * inner-wall-breached message.
 */
export function outcomeMessageKey(victory: boolean, reason?: LoseReason): TrKey {
  if (victory) return 'gameover.victory';
  if (reason) return LOSE_MESSAGE_KEY[reason];
  return 'gameover.reason.inner_breached';
}
