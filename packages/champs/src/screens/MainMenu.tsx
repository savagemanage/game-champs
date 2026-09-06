import { useTranslation } from 'react-i18next';
import { audio } from '../game/audio';

interface MainMenuProps {
  onPlay: () => void;
}

/**
 * Landing screen: game title, tagline, and a Play button that routes to
 * champion select. Language switching lives in the floating top-right
 * controls (and inside the Settings panel), not on this screen.
 */
export default function MainMenu({ onPlay }: MainMenuProps) {
  const { t } = useTranslation();

  return (
    <section className="screen screen--menu main-menu" aria-label={t('nav.play')}>
      <h2 className="screen__heading main-menu__title">{t('menu.heading')}</h2>
      <p className="main-menu__tagline">{t('menu.tagline')}</p>
      <p className="screen__description">{t('menu.description')}</p>
      <button
        type="button"
        className="btn btn--primary main-menu__play"
        onClick={() => {
          audio.resume();
          audio.play('ui');
          onPlay();
        }}
      >
        {t('menu.play')}
      </button>
    </section>
  );
}
