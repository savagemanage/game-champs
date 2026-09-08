import { useTranslation } from 'react-i18next';
import { audio } from '../game/audio';
import type { ChampsProfile } from '../profile';

interface MainMenuProps {
  profile: ChampsProfile;
  accountLevel: number;
  onContinue?: () => void;
  onStandard: () => void;
  onPractice: () => void;
  onTutorial: () => void;
}

/** Landing screen with honest local-play routes and persisted profile status. */
export default function MainMenu({
  profile,
  accountLevel,
  onContinue,
  onStandard,
  onPractice,
  onTutorial,
}: MainMenuProps) {
  const { t } = useTranslation();
  const activate = (action: () => void) => {
    audio.resume();
    audio.play('ui');
    action();
  };

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
        <p className="screen__description main-menu__description">{t('menu.description')}</p>

        <div className="profile-summary" aria-label={t('profile.summary')}>
          <span>{t('profile.accountLevel', { value: accountLevel })}</span>
          <span>{t('profile.currency', { value: profile.currency })}</span>
          <span>{profile.tutorialCompleted ? t('profile.tutorialComplete') : t('profile.tutorialIncomplete')}</span>
        </div>

        <div className="main-menu__actions">
          {onContinue && (
            <button type="button" className="btn btn--primary main-menu__play" onClick={() => activate(onContinue)}>
              <span>{t('menu.continue')}</span><span className="main-menu__play-arrow" aria-hidden="true">→</span>
            </button>
          )}
          <button type="button" className={`btn ${onContinue ? '' : 'btn--primary'} main-menu__play`} onClick={() => activate(onStandard)}>
            <span>{t('menu.standard')}</span><span className="main-menu__play-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="btn main-menu__play" onClick={() => activate(onPractice)}>{t('menu.practice')}</button>
          <button type="button" className="btn main-menu__play" onClick={() => activate(onTutorial)}>{t('menu.tutorial')}</button>
        </div>

        <div className="main-menu__features" aria-label={t('menu.featuresLabel')}>
          <span>{t('menu.featureStrategy')}</span>
          <span>{t('menu.featureChampions')}</span>
          <span>{t('menu.featureInstant')}</span>
        </div>
      </div>
    </section>
  );
}
