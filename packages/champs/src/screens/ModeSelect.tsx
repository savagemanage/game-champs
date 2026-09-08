import { useTranslation } from 'react-i18next';
import { audio } from '../game/audio';
import type { GameMode } from '../App';
import { DIFFICULTIES, type Difficulty, type MatchKind } from '../game/tutorial/config';

interface ModeSelectProps {
  selected: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onSelect: (mode: GameMode) => void;
  onBack?: () => void;
}

const MODES: { id: GameMode; nameKey: string; descKey: string }[] = [
  { id: 'conquest', nameKey: 'mode.conquest', descKey: 'mode.conquestDesc' },
  { id: 'midline', nameKey: 'mode.midline', descKey: 'mode.midlineDesc' },
];

/** Chooses battlefield and difficulty for the menu-selected match kind. */
export default function ModeSelect({
  selected,
  matchKind,
  difficulty,
  onDifficultyChange,
  onSelect,
  onBack,
}: ModeSelectProps) {
  const { t } = useTranslation();

  const choose = (mode: GameMode) => {
    audio.resume();
    audio.play('ui');
    onSelect(mode);
  };

  return (
    <section className="screen mode-select" aria-label={t('mode.heading')}>
      <header className="mode-select__header">
        <p className="mode-select__eyebrow">{t('mode.eyebrow')}</p>
        <h1 className="screen__heading mode-select__heading">{t('mode.heading')}</h1>
        <p className="mode-select__kind">{t(`matchKind.${matchKind}`)}</p>
        <p className="screen__description mode-select__hint">{t('mode.hint')}</p>
      </header>

      <fieldset className="mode-select__difficulty">
        <legend>{t('difficulty.heading')}</legend>
        <div className="mode-select__difficulty-options">
          {DIFFICULTIES.map((value) => (
            <button
              key={value}
              type="button"
              className={`btn${difficulty === value ? ' is-selected' : ''}`}
              aria-pressed={difficulty === value}
              onClick={() => onDifficultyChange(value)}
            >
              {t(`difficulty.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mode-select__cards">
        {MODES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`mode-card mode-card--${item.id}${item.id === selected ? ' is-selected' : ''}${item.id === 'conquest' ? ' mode-card--primary' : ''}`}
            aria-pressed={item.id === selected}
            onClick={() => choose(item.id)}
          >
            <span className="mode-card__art" aria-hidden="true">
              <span className="mode-card__number">0{index + 1}</span>
              <span className="mode-card__glyph" />
            </span>
            <span className="mode-card__copy">
              {item.id === 'conquest' && <span className="mode-card__recommended">{t('mode.recommended')}</span>}
              <span className="mode-card__name">{t(item.nameKey)}</span>
              <span className="mode-card__desc">{t(item.descKey)}</span>
              <span className="mode-card__cta">{t('mode.select')} <span aria-hidden="true">→</span></span>
            </span>
          </button>
        ))}
      </div>

      {onBack && (
        <div className="mode-select__actions">
          <button type="button" className="btn btn--quiet" onClick={onBack}>
            <span aria-hidden="true">←</span> {t('common.back')}
          </button>
        </div>
      )}
    </section>
  );
}
