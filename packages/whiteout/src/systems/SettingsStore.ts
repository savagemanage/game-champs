/**
 * SettingsStore.ts - the Phaser-free persistence + parsing layer behind
 * {@link AudioManager}.
 *
 * Kept deliberately free of any Phaser import so the settings load path (in
 * particular first-run browser-language auto-detection and the "persisted
 * language always wins" rule) is unit-testable in the node/vitest environment,
 * matching the rest of the pure-logic systems. AudioManager owns the live sound
 * behaviour; this module owns only the shape, defaults, parsing, and storage of
 * {@link GameSettings}.
 */

import { LANGUAGES, type Language } from '../i18n/strings';
import { detectBrowserLanguage } from '../i18n/i18n';

/**
 * Persisted audio + UI settings. Master/SFX/music volumes are [0..1]
 * multipliers; the language is mirrored into the i18n runtime so the whole
 * game reads one source of truth for both sound and locale.
 */
export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** Active UI language ('ko' | 'en'); mirrored into the i18n runtime. */
  language: Language;
}

export const SETTINGS_STORAGE_KEY = 'frosthold:settings:v1';

export const SETTINGS_DEFAULTS: GameSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  // Frosthold is Korean-first, matching the i18n runtime default. This is also
  // the fallback when browser-language detection is unavailable.
  language: 'ko',
};

/** Clamp a value into [0..1], falling back to a default if not finite. */
export function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * The first-run initial language: derived from the browser when available,
 * falling back to the Korean-first default when `navigator` is absent (e.g. the
 * node/test environment). Only consulted when NO valid saved language exists;
 * once the player has chosen a language the persisted value wins.
 */
export function firstRunLanguage(): Language {
  return typeof navigator !== 'undefined' ? detectBrowserLanguage(navigator) : SETTINGS_DEFAULTS.language;
}

/** Read the persisted settings, or sensible defaults on first run / corruption. */
export function loadSettings(): GameSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    // No saved settings at all -> first run: auto-detect the browser language.
    if (!raw) return { ...SETTINGS_DEFAULTS, language: firstRunLanguage() };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    // A valid persisted language always wins; only fall back to detection when
    // the saved value is missing/invalid (still effectively first run for the
    // language choice).
    const language: Language =
      parsed.language && LANGUAGES.includes(parsed.language) ? parsed.language : firstRunLanguage();
    return {
      masterVolume: clamp01(parsed.masterVolume, SETTINGS_DEFAULTS.masterVolume),
      sfxVolume: clamp01(parsed.sfxVolume, SETTINGS_DEFAULTS.sfxVolume),
      musicVolume: clamp01(parsed.musicVolume, SETTINGS_DEFAULTS.musicVolume),
      language,
    };
  } catch {
    return { ...SETTINGS_DEFAULTS, language: firstRunLanguage() };
  }
}

/** Persist the settings snapshot; non-fatal if storage is unavailable. */
export function persistSettings(settings: GameSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    /* storage unavailable (private mode / quota) - non-fatal, keep in memory. */
  }
}
