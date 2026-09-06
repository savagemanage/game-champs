import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';

/**
 * Segmented control that switches the active language between ko and en.
 * Persistence is handled by the i18next LanguageDetector localStorage cache.
 */
export default function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];

  const changeLanguage = (lng: SupportedLanguage) => {
    void i18n.changeLanguage(lng);
  };

  return (
    <div className="language-toggle" role="group" aria-label={t('nav.language')}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          className={`language-toggle__button${current === lng ? ' is-active' : ''}`}
          aria-pressed={current === lng}
          onClick={() => changeLanguage(lng)}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
