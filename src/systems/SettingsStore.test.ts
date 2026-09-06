import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSettings, SETTINGS_STORAGE_KEY } from './SettingsStore';
import { setLanguage } from '../i18n/i18n';

/**
 * Pure-logic tests for the settings LOAD path (FEAT-006), focused on first-run
 * browser-language auto-detection and the "persisted language always wins"
 * rule. This exercises {@link loadSettings} from the Phaser-free SettingsStore
 * (which AudioManager delegates to), so no Phaser/DOM runtime is needed - we
 * only stub the `localStorage` / `navigator` globals.
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

describe('loadSettings first-run language detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLanguage('ko'); // keep the shared i18n runtime state clean between tests
  });

  it('detects Korean from the browser on first run (no saved settings)', () => {
    stubLocalStorage({});
    stubNavigator({ language: 'ko-KR', languages: ['ko-KR', 'en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('detects English from the browser on first run (non-Korean locale)', () => {
    stubLocalStorage({});
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('en');
  });

  it('falls back to ko when navigator is unavailable (Korean-first fallback)', () => {
    stubLocalStorage({});
    // Simulate an environment without a navigator (guarded by typeof checks).
    vi.stubGlobal('navigator', undefined);
    expect(loadSettings().language).toBe('ko');
  });

  it('falls back to ko when navigator exposes no usable locale', () => {
    stubLocalStorage({});
    stubNavigator({});
    expect(loadSettings().language).toBe('ko');
  });

  it('honors a persisted valid language over browser detection (en saved, ko browser)', () => {
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'en' }),
    });
    stubNavigator({ language: 'ko-KR', languages: ['ko-KR'] });
    expect(loadSettings().language).toBe('en');
  });

  it('honors a persisted valid language over browser detection (ko saved, en browser)', () => {
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'ko' }),
    });
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('ko');
  });

  it('re-detects when the saved language is invalid/missing', () => {
    // Saved blob without a valid language -> still effectively first run for locale.
    stubLocalStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ masterVolume: 0.5, sfxVolume: 0.5, musicVolume: 0.5, language: 'fr' }),
    });
    stubNavigator({ language: 'en-US', languages: ['en-US'] });
    expect(loadSettings().language).toBe('en');
  });

  it('preserves the other persisted volume settings while detecting language', () => {
    stubLocalStorage({}); // first run
    stubNavigator({ language: 'en-US' });
    const s = loadSettings();
    // Defaults preserved; only language is derived.
    expect(s.masterVolume).toBeCloseTo(0.8);
    expect(s.sfxVolume).toBeCloseTo(0.9);
    expect(s.musicVolume).toBeCloseTo(0.5);
    expect(s.language).toBe('en');
  });
});
