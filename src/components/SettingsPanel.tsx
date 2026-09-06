import { useSyncExternalStore, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './LanguageToggle';
import { audio, type AudioSettings } from '../game/audio';

interface SettingsPanelProps {
  onClose: () => void;
}

/** The keybinds documented in the help panel, as [key i18n, action i18n] pairs. */
const KEYBINDS: { keys: string; actionKey: string }[] = [
  { keys: 'W A S D', actionKey: 'settings.keybinds.move' },
  { keys: 'Q', actionKey: 'settings.keybinds.q' },
  { keys: 'W', actionKey: 'settings.keybinds.w' },
  { keys: 'E', actionKey: 'settings.keybinds.e' },
  { keys: 'R', actionKey: 'settings.keybinds.r' },
  { keys: 'B', actionKey: 'settings.keybinds.shop' },
  { keys: 'settings.keybinds.clickKey', actionKey: 'settings.keybinds.click' },
];

/**
 * A localized Settings / Help modal reachable from the header on every screen
 * (menu, select, battle, results). It documents the controls, exposes the
 * persisted audio controls (mute, master volume, ambient drone), and surfaces
 * the language toggle. Every string is localized; nothing is hardcoded.
 */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useTranslation();
  const settings = useSyncExternalStore<AudioSettings>(
    audio.subscribe,
    audio.getSettings,
    audio.getSettings,
  );

  const onVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    audio.resume();
    audio.setVolume(Number(e.target.value) / 100);
  }, []);

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      onClick={onClose}
    >
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel__head">
          <h2 className="settings-panel__title">{t('settings.title')}</h2>
          <button
            type="button"
            className="settings-panel__close"
            aria-label={t('settings.close')}
            onClick={onClose}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Controls / keybinds ------------------------------------------- */}
        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.controls')}</h3>
          <dl className="settings-keybinds">
            {KEYBINDS.map(({ keys, actionKey }) => (
              <div key={actionKey} className="settings-keybind">
                <dt className="settings-keybind__keys">
                  {keys.startsWith('settings.') ? t(keys) : keys}
                </dt>
                <dd className="settings-keybind__action">{t(actionKey)}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Audio --------------------------------------------------------- */}
        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.audio')}</h3>

          <label className="settings-row">
            <span>{t('settings.mute')}</span>
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => audio.setMuted(e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>{t('settings.volume')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={onVolume}
              disabled={settings.muted}
              aria-label={t('settings.volume')}
            />
            <span className="settings-row__value">
              {Math.round(settings.volume * 100)}
            </span>
          </label>

          <label className="settings-row">
            <span>{t('settings.ambient')}</span>
            <input
              type="checkbox"
              checked={settings.ambient}
              onChange={(e) => {
                audio.resume();
                audio.setAmbient(e.target.checked);
              }}
            />
          </label>
        </section>

        {/* Language ------------------------------------------------------ */}
        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.language')}</h3>
          <LanguageToggle />
        </section>

        <button type="button" className="btn btn--primary settings-panel__done" onClick={onClose}>
          {t('settings.done')}
        </button>
      </div>
    </div>
  );
}
