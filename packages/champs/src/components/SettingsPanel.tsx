import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './LanguageToggle';
import { audio, type AudioSettings } from '../game/audio';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import type { TelemetryRuntimeStatus } from '../telemetry/runtime';

interface SettingsPanelProps {
  onClose: () => void;
  telemetryStatus: TelemetryRuntimeStatus;
  onTelemetryGrant: () => void;
  onTelemetryDeny: () => void;
  onTelemetryExport: () => Promise<void>;
  onTelemetryClear: () => void;
}

/** The keybinds documented in the help panel, as [key i18n, action i18n] pairs. */
const KEYBINDS: { keys: string; actionKey: string }[] = [
  { keys: 'settings.keybinds.clickKey', actionKey: 'settings.keybinds.move' },
  { keys: 'Q', actionKey: 'settings.keybinds.q' },
  { keys: 'W', actionKey: 'settings.keybinds.w' },
  { keys: 'E', actionKey: 'settings.keybinds.e' },
  { keys: 'R', actionKey: 'settings.keybinds.r' },
  { keys: 'A', actionKey: 'settings.keybinds.attackMove' },
  { keys: 'S', actionKey: 'settings.keybinds.stop' },
  { keys: 'B', actionKey: 'settings.keybinds.shop' },
];

/**
 * A localized Settings / Help modal reachable from the floating top-right
 * controls on every screen (menu, select, battle, results). It documents the
 * controls, exposes the
 * persisted audio controls (mute, master volume, ambient drone), and surfaces
 * the language toggle. Every string is localized; nothing is hardcoded.
 */
export default function SettingsPanel({
  onClose,
  telemetryStatus,
  onTelemetryGrant,
  onTelemetryDeny,
  onTelemetryExport,
  onTelemetryClear,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDialogFocusTrap<HTMLDivElement>(
    true,
    onClose,
    closeButtonRef,
  );
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
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <div className="settings-panel__head">
          <h2 id="settings-title" className="settings-panel__title">{t('settings.title')}</h2>
          <button
            ref={closeButtonRef}
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

        {/* Privacy-safe local diagnostics ------------------------------ */}
        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.diagnostics.title')}</h3>
          <p className="settings-diagnostics__copy">{t('settings.diagnostics.description')}</p>
          <div
            className="settings-diagnostics__choices"
            role="group"
            aria-label={t('settings.diagnostics.consentLabel')}
          >
            <button
              type="button"
              className="btn btn--secondary settings-diagnostics__choice"
              aria-pressed={telemetryStatus.consentState === 'granted'}
              onClick={onTelemetryGrant}
            >
              {t('settings.diagnostics.allow')}
            </button>
            <button
              type="button"
              className="btn btn--secondary settings-diagnostics__choice"
              aria-pressed={telemetryStatus.consentState === 'denied'}
              onClick={onTelemetryDeny}
            >
              {t('settings.diagnostics.deny')}
            </button>
          </div>
          <p className="settings-diagnostics__status" role="status">
            {telemetryStatus.privacyBlocked
              ? t('settings.diagnostics.blocked')
              : telemetryStatus.enabled
                ? t('settings.diagnostics.enabled')
                : t('settings.diagnostics.disabled')}
          </p>
          <div className="settings-diagnostics__actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!telemetryStatus.enabled}
              onClick={() => void onTelemetryExport()}
            >
              {t('settings.diagnostics.export')}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onTelemetryClear}>
              {t('settings.diagnostics.clear')}
            </button>
          </div>
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
