/** Local-calendar period helpers. Calendar arithmetic deliberately uses local Date
 * fields and UTC only to number civil dates, so DST days are not assumed to be
 * exactly 24 elapsed hours. */
const CIVIL_DAY_MS = 86_400_000;
// Monday 1969-12-29 starts ordinal 0, so Unix epoch belongs to week 0.
const MONDAY_1970_UTC = -3;
const SEASON_ANCHOR_DAY = Date.UTC(2024, 0, 1) / CIVIL_DAY_MS;

export const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
export const SEASON_LENGTH_DAYS = 28;

/** Stable ordinal for the user's local civil date. */
export function localDayOrdinal(now: number): number {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) return -1;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / CIVIL_DAY_MS);
}

/** Stable ordinal for a local Monday-to-Monday week. */
export function localWeekOrdinal(now: number): number {
  const day = localDayOrdinal(now);
  return day < 0 ? -1 : Math.floor((day - MONDAY_1970_UTC) / 7);
}

/** Consecutive 28-day season ordinal anchored at local 2024-01-01. */
export function localSeasonOrdinal(now: number): number {
  const day = localDayOrdinal(now);
  return day < 0 ? -1 : Math.max(0, Math.floor((day - SEASON_ANCHOR_DAY) / SEASON_LENGTH_DAYS));
}

/** Local timestamp at the start of the next civil day. */
export function nextLocalMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

/** Local timestamp at the next Monday 00:00. */
export function nextLocalMonday(now: number): number {
  const d = new Date(now);
  const days = ((8 - d.getDay()) % 7) || 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0).getTime();
}

/** Local timestamp at the end of the currently active 28-day season. */
export function currentSeasonEnd(now: number): number {
  const ordinal = localSeasonOrdinal(now);
  const endDay = SEASON_ANCHOR_DAY + (ordinal + 1) * SEASON_LENGTH_DAYS;
  const utc = new Date(endDay * CIVIL_DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 0, 0, 0, 0).getTime();
}

/** True when wall time is more than the allowed tolerance behind trusted time. */
export function isClockRollback(now: number, maxSeenWallTime: number): boolean {
  return maxSeenWallTime > 0 && now < maxSeenWallTime - CLOCK_ROLLBACK_TOLERANCE_MS;
}
