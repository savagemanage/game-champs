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
      <div className="main-menu__scene" aria-hidden="true">
        <span className="main-menu__orbit main-menu__orbit--one" />
        <span className="main-menu__orbit main-menu__orbit--two" />
        <span className="main-menu__crest"><span>AC</span></span>
      </div>

      <div className="main-menu__content">
        <p className="main-menu__eyebrow">{t('menu.eyebrow')}</p>
        <h1 className="screen__heading main-menu__title">{t('app.title')}</h1>
        <p className="main-menu__tagline">{t('menu.tagline')}</p>
        <p className="screen__description main-menu__description">
          {t('menu.description')}
        </p>

        <button
          type="button"
          className="btn btn--primary main-menu__play"
          onClick={() => {
            audio.resume();
            audio.play('ui');
            onPlay();
          }}
        >
          <span>{t('menu.play')}</span>
          <span className="main-menu__play-arrow" aria-hidden="true">→</span>
        </button>

        <div className="main-menu__features" aria-label={t('menu.featuresLabel')}>
          <span>{t('menu.featureStrategy')}</span>
          <span>{t('menu.featureChampions')}</span>
          <span>{t('menu.featureInstant')}</span>
        </div>
      </div>
    </section>
  );
}
