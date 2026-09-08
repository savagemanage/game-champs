import { useTranslation } from 'react-i18next';
import { audio } from '../game/audio';
import type { GameMode } from '../App';

interface ModeSelectProps {
  /** The currently highlighted mode (defaults from App). */
  selected: GameMode;
  /** Called with the chosen mode when the player confirms. */
  onSelect: (mode: GameMode) => void;
  onBack?: () => void;
}

/** The two playable modes, in display order (primary first). */
const MODES: { id: GameMode; nameKey: string; descKey: string }[] = [
  { id: 'rift', nameKey: 'mode.rift', descKey: 'mode.riftDesc' },
  { id: 'aram', nameKey: 'mode.aram', descKey: 'mode.aramDesc' },
];

/**
 * Mode picker that sits between the main menu and champion select. The player
 * chooses Summoner's Rift (the full 3-lane 5v5 experience) or ARAM (a lighter
 * single-mid-lane skirmish). The selection is threaded through MatchSetup so
 * the Phaser scene configures its lane count. Keeps App's state-machine style.
 */
export default function ModeSelect({ selected, onSelect, onBack }: ModeSelectProps) {
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
        <p className="screen__description mode-select__hint">{t('mode.hint')}</p>
      </header>

      <div className="mode-select__cards">
        {MODES.map((m, index) => (
          <button
            key={m.id}
            type="button"
            className={`mode-card mode-card--${m.id}${m.id === selected ? ' is-selected' : ''}${m.id === 'rift' ? ' mode-card--primary' : ''}`}
            aria-pressed={m.id === selected}
            onClick={() => choose(m.id)}
          >
            <span className="mode-card__art" aria-hidden="true">
              <span className="mode-card__number">0{index + 1}</span>
              <span className="mode-card__glyph" />
            </span>
            <span className="mode-card__copy">
              {m.id === 'rift' && (
                <span className="mode-card__recommended">{t('mode.recommended')}</span>
              )}
              <span className="mode-card__name">{t(m.nameKey)}</span>
              <span className="mode-card__desc">{t(m.descKey)}</span>
              <span className="mode-card__cta">
                {t('mode.select')} <span aria-hidden="true">→</span>
              </span>
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
