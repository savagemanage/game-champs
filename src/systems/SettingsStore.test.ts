import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSettings, SETTINGS_STORAGE_KEY } from './SettingsStore';
import { setLanguage } from '../i18n/i18n';

/**
 * Pure-logic tests for the settings LOAD path, focused on the Korean-first
 * first-run default and the "persisted language always wins" rule. Kingdom Rise
 * is Korean-first and STAYS Korean for a brand-new player regardless of the
 * browser locale (browser-language auto-detection was removed because a fresh
 * `navigator.language` of 'en-US' used to flip the UI to English). This
 * exercises {@link loadSettings} from the Phaser-free SettingsStore (which
 * AudioManager delegates to), so no Phaser/DOM runtime is needed - we only stub
 * the `localStorage` / `navigator` globals.
 */

function stubLocalStorage(store: Record<string, string>): void {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
}

function stubNavigator(nav: { language?: string; languages?: readonly string[] }): void {
  vi.stubGlobal('navigator', nav);
}

describe('loadSettings first-run language default (Korean-first)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLanguage('ko'); // keep the shared i18n runtime state clean between tests
  });

  it('first run with a ko-KR browser stays Korean (no saved settings)', () => {
    stubLocalStorage({});
    stubNavigator({ language: 'ko-KR', languages: ['ko-KR', 'en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('first run with an en-US browser STILL stays Korean (no auto-detect flip)', () => {
    stubLocalStorage({});
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('first run with no navigator stays Korean (Korean-first default)', () => {
    stubLocalStorage({});
    // Simulate an environment without a navigator (guarded by typeof checks).
    vi.stubGlobal('navigator', undefined);
    expect(loadSettings().language).toBe('ko');
  });

  it('first run with a navigator exposing no usable locale stays Korean', () => {
    stubLocalStorage({});
    stubNavigator({});
    expect(loadSettings().language).toBe('ko');
  });

  it('honors a persisted valid language over the default (en saved, ko browser)', () => {
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'en' }),
    });
    stubNavigator({ language: 'ko-KR', languages: ['ko-KR'] });
    expect(loadSettings().language).toBe('en');
  });

  it('honors a persisted valid language over the default (ko saved, en browser)', () => {
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'ko' }),
    });
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('falls back to the Korean default when the saved language is invalid/missing', () => {
    // Saved blob without a valid language -> Korean-first default (browser ignored).
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'fr' }),
    });
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('preserves the other persisted volume settings while defaulting the language', () => {
    stubLocalStorage({}); // first run
    stubNavigator({ language: 'en-US' });
    const s = loadSettings();
    // Defaults preserved; language stays Korean-first.
    expect(s.masterVolume).toBeCloseTo(0.8);
    expect(s.sfxVolume).toBeCloseTo(0.9);
    expect(s.musicVolume).toBeCloseTo(0.5);
    expect(s.language).toBe('ko');
  });
});
