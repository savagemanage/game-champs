import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BattleOutcome } from '../game/battleStore';
import { getChampionById } from '../data/champions';
import ChampionFigure from '../components/ChampionFigure';

interface ResultScreenProps {
  outcome: BattleOutcome;
  onRematch: () => void;
  onMenu: () => void;
}

/** A localized, keyboard-friendly post-match performance summary. */
export default function ResultScreen({
  outcome,
  onRematch,
  onMenu,
}: ResultScreenProps) {
  const { t, i18n } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const player = getChampionById(outcome.playerChampionId);
  const enemy = getChampionById(outcome.enemyChampionId);
  const playerName = player ? t(player.nameKey) : outcome.playerChampionId;
  const enemyName = enemy ? t(enemy.nameKey) : outcome.enemyChampionId;
  const formatNumber = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className={`screen result-screen result-screen--${outcome.win ? 'win' : 'lose'}`}
      aria-labelledby="result-heading"
    >
      <div className="result-screen__title-group">
        <p className="result-screen__eyebrow">
          {t('result.title')} · {t(`mode.${outcome.mode}`)}
        </p>
        <h1
          ref={headingRef}
          id="result-heading"
          className="result-screen__banner"
          tabIndex={-1}
        >
          {outcome.win ? t('result.victory') : t('result.defeat')}
        </h1>
        <p className="result-screen__subtitle">
          {outcome.win ? t('result.winSubtitle') : t('result.loseSubtitle')}
        </p>
      </div>

      <div className="result-screen__matchup" aria-label={`${playerName} ${t('result.vs')} ${enemyName}`}>
        <span
          className="result-screen__champ"
          style={player ? { color: player.accentColor } : undefined}
        >
          {player && (
            <ChampionFigure
              champion={player}
              team="ally"
              className="result-screen__figure"
            />
          )}
          <span className="result-screen__champ-name">{playerName}</span>
        </span>
        <span className="result-screen__vs" aria-hidden="true">{t('result.vs')}</span>
        <span
          className="result-screen__champ"
          style={enemy ? { color: enemy.accentColor } : undefined}
        >
          {enemy && (
            <ChampionFigure
              champion={enemy}
              team="enemy"
              className="result-screen__figure"
            />
          )}
          <span className="result-screen__champ-name">{enemyName}</span>
        </span>
      </div>

      <dl className="result-screen__stats">
        <ResultStat label={t('result.duration')} value={formatTime(outcome.stats.durationSeconds)} />
        <ResultStat label={t('result.championKills')} value={formatNumber.format(outcome.stats.championKills)} />
        <ResultStat label={t('result.minionKills')} value={formatNumber.format(outcome.stats.minionKills)} />
        <ResultStat label={t('result.damageDealt')} value={formatNumber.format(outcome.stats.damageDealt)} />
        <ResultStat label={t('result.level')} value={formatNumber.format(outcome.stats.level)} />
        <ResultStat label={t('result.gold')} value={formatNumber.format(outcome.stats.gold)} />
      </dl>

      <div className="result-screen__actions">
        <button type="button" className="btn btn--primary" onClick={onRematch}>
          {t('result.rematch')} <span aria-hidden="true">↻</span>
        </button>
        <button type="button" className="btn" onClick={onMenu}>
          {t('result.toMenu')}
        </button>
      </div>
    </section>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-screen__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
