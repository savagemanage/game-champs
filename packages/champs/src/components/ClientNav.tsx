import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ClientNavProps {
  /**
   * Right-side controls (settings gear + language toggle) injected by the app
   * shell so they live in the nav on client-style screens without being
   * duplicated by the floating `.app-controls`.
   */
  controls?: ReactNode;
}

/** Decorative top tabs. Only HOME is active; the rest evoke the arena shell. */
const TABS: { key: string; active?: boolean }[] = [
  { key: 'client.home', active: true },
  { key: 'client.tactics' },
  { key: 'client.gauntlet' },
];

/**
 * Original arena-client navigation. Left: a small inline-SVG diamond wordmark
 * using the localized app title. Center: decorative HOME / TACTICS / GAUNTLET
 * tabs (HOME active). Right: decorative essence + credit chips, a profile pill,
 * and the injected settings/language controls.
 *
 * Everything except the injected controls is cosmetic; the labels are all
 * localized so ko/en parity holds. The bar is a real <nav> landmark for
 * accessibility.
 */
export default function ClientNav({ controls }: ClientNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="client-nav" aria-label={t('client.home')}>
      <div className="client-nav__brand">
        <span className="client-nav__mark" aria-hidden="true">
          {/* Inline arena diamond mark - no external asset. */}
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M12 1.5l10.5 10.5L12 22.5 1.5 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 5.5l6.5 6.5L12 18.5 5.5 12z"
              fill="currentColor"
              opacity="0.85"
            />
          </svg>
        </span>
        <span className="client-nav__wordmark">{t('app.title')}</span>
      </div>

      <ul className="client-nav__tabs">
        {TABS.map((tab) => (
          <li key={tab.key}>
            <span
              className={`client-nav__tab${tab.active ? ' is-active' : ''}`}
              aria-current={tab.active ? 'page' : undefined}
            >
              {t(tab.key)}
            </span>
          </li>
        ))}
      </ul>

      <div className="client-nav__right">
        <div className="client-nav__currency" aria-hidden="true">
          <span className="client-nav__chip">
            <span className="client-nav__chip-dot client-nav__chip-dot--essence" />
            <span className="client-nav__chip-label">{t('client.essence')}</span>
            <span className="client-nav__chip-value">7,420</span>
          </span>
          <span className="client-nav__chip">
            <span className="client-nav__chip-dot client-nav__chip-dot--credits" />
            <span className="client-nav__chip-label">{t('client.credits')}</span>
            <span className="client-nav__chip-value">1,350</span>
          </span>
        </div>

        <span className="client-nav__profile" aria-hidden="true">
          <span className="client-nav__avatar" />
          <span className="client-nav__profile-text">
            <span className="client-nav__profile-name">{t('client.profile')}</span>
            <span className="client-nav__profile-level">
              {t('client.level', { value: 30 })}
            </span>
          </span>
        </span>

        {controls && <div className="client-nav__controls">{controls}</div>}
      </div>
    </nav>
  );
}
