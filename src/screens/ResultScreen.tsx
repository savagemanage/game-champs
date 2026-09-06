import { useTranslation } from 'react-i18next';
import type { BattleOutcome } from '../game/battleStore';
import { getChampionById } from '../data/champions';

interface ResultScreenProps {
  outcome: BattleOutcome;
  onRematch: () => void;
  onMenu: () => void;
}

/**
 * Post-match summary. Shows a large localized Victory/Defeat banner with a
 * matching accent, the champion played and the opponent faced, and a stat
 * board (duration, takedowns, minions, damage). Rematch replays the same
 * matchup; Main Menu returns to the landing screen. All copy is localized.
 */
export default function ResultScreen({
  outcome,
  onRematch,
  onMenu,
}: ResultScreenProps) {
  const { t } = useTranslation();
  const player = getChampionById(outcome.playerChampionId);
  const enemy = getChampionById(outcome.enemyChampionId);
  const playerName = player ? t(player.nameKey) : outcome.playerChampionId;
  const enemyName = enemy ? t(enemy.nameKey) : outcome.enemyChampionId;

  return (
    <section
      className={`screen result-screen result-screen--${outcome.win ? 'win' : 'lose'}`}
      aria-label={t('result.title')}
    >
      <p className="result-screen__eyebrow">
        {t('result.title')} · {t(`mode.${outcome.mode}`)}
      </p>
      <h2 className="result-screen__banner">
        {outcome.win ? t('result.victory') : t('result.defeat')}
      </h2>
      <p className="result-screen__subtitle">
        {outcome.win ? t('result.winSubtitle') : t('result.loseSubtitle')}
      </p>

      <p className="result-screen__matchup">
        <span
          className="result-screen__champ"
          style={player ? { color: player.accentColor } : undefined}
        >
          {playerName}
        </span>
        <span className="result-screen__vs">{t('result.vs')}</span>
        <span
          className="result-screen__champ"
          style={enemy ? { color: enemy.accentColor } : undefined}
        >
          {enemyName}
        </span>
      </p>

      <dl className="result-screen__stats">
        <div className="result-screen__stat">
          <dt>{t('result.duration')}</dt>
          <dd>{formatTime(outcome.stats.durationSeconds)}</dd>
        </div>
        <div className="result-screen__stat">
          <dt>{t('result.championKills')}</dt>
          <dd>{outcome.stats.championKills}</dd>
        </div>
        <div className="result-screen__stat">
          <dt>{t('result.minionKills')}</dt>
          <dd>{outcome.stats.minionKills}</dd>
        </div>
        <div className="result-screen__stat">
          <dt>{t('result.damageDealt')}</dt>
          <dd>{outcome.stats.damageDealt}</dd>
        </div>
        <div className="result-screen__stat">
          <dt>{t('result.level')}</dt>
          <dd>{outcome.stats.level}</dd>
        </div>
        <div className="result-screen__stat">
          <dt>{t('result.gold')}</dt>
          <dd>{outcome.stats.gold}</dd>
        </div>
      </dl>

      <div className="result-screen__actions">
        <button type="button" className="btn btn--primary" onClick={onRematch}>
          {t('result.rematch')}
        </button>
        <button type="button" className="btn" onClick={onMenu}>
          {t('result.toMenu')}
        </button>
      </div>
    </section>
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
