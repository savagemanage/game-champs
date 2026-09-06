import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAMPIONS,
  getAllAbilities,
  getChampionById,
  randomChampionId,
  type Champion,
  type ChampionStats,
} from '../data/champions';
import AbilityCard from '../components/AbilityCard';
import ChampionCard from '../components/ChampionCard';
import ChampionFigure from '../components/ChampionFigure';

import type { GameMode } from '../App';

interface ChampionSelectProps {
  /** The chosen game mode (affects the pick hint). Defaults to Rift. */
  mode?: GameMode;
  /** Called with the chosen player + enemy ids when the player locks in. */
  onLockIn: (playerId: string, enemyId: string) => void;
  onBack?: () => void;
}

const STAT_ORDER: (keyof ChampionStats)[] = [
  'hp',
  'hpRegen',
  'moveSpeed',
  'attackDamage',
  'attackRange',
  'attackSpeed',
];

/**
 * League-style champion select. The player browses the roster, inspects a
 * detail panel with localized P/Q/W/E/R ability cards, picks (or randomizes)
 * an opponent, and locks in to start the battle.
 */
export default function ChampionSelect({
  mode = 'rift',
  onLockIn,
  onBack,
}: ChampionSelectProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>(CHAMPIONS[0].id);
  const [enemyId, setEnemyId] = useState<string>(() =>
    randomChampionId(CHAMPIONS[0].id),
  );

  const selected: Champion | undefined = useMemo(
    () => getChampionById(selectedId),
    [selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // Keep player and opponent distinct when possible.
    if (id === enemyId) {
      setEnemyId(randomChampionId(id));
    }
  };

  const handleRandomizeOpponent = () => {
    setEnemyId(randomChampionId(selectedId));
  };

  const handleLockIn = () => {
    onLockIn(selectedId, enemyId);
  };

  return (
    <section className="champion-select" aria-label={t('select.heading')}>
      <div className="champion-select__topbar">
        <h2 className="screen__heading champion-select__heading">
          {t('select.heading')}
        </h2>
        <p className="champion-select__hint">
          {t('select.pickHint')}
          {' · '}
          {t(`mode.${mode}`)}
        </p>
      </div>

      <div className="champion-select__body">
        <div
          className="champion-select__roster"
          role="listbox"
          aria-label={t('select.rosterLabel')}
        >
          {CHAMPIONS.map((champion) => (
            <ChampionCard
              key={champion.id}
              champion={champion}
              selected={champion.id === selectedId}
              badge={champion.id === enemyId ? t('select.opponent') : undefined}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <aside className="champion-select__detail">
          {selected ? (
            <>
              <header className="champion-detail__header">
                <ChampionFigure
                  champion={selected}
                  className="champion-detail__figure"
                />
                <div>
                  <h3 className="champion-detail__name">
                    {t(selected.nameKey)}
                  </h3>
                  <p className="champion-detail__title">
                    {t(selected.titleKey)}
                  </p>
                </div>
                <span className="champion-detail__tags">
                  <span
                    className="champion-detail__role"
                    style={{ color: selected.accentColor }}
                  >
                    {t(`role.${selected.role}`)}
                  </span>
                  <span className="champion-detail__lane">
                    {t(`laneRole.${selected.laneRole}`)}
                  </span>
                </span>
              </header>

              <section className="champion-detail__stats">
                <h4 className="champion-detail__subheading">
                  {t('select.statsHeading')}
                </h4>
                <dl className="stat-grid">
                  {STAT_ORDER.map((key) => (
                    <div className="stat-grid__item" key={key}>
                      <dt>{t(`stat.${key}`)}</dt>
                      <dd>{selected.stats[key]}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="champion-detail__abilities">
                <h4 className="champion-detail__subheading">
                  {t('select.abilitiesHeading')}
                </h4>
                <div className="ability-list">
                  {getAllAbilities(selected).map((ability) => (
                    <AbilityCard
                      key={ability.slot}
                      ability={ability}
                      accentColor={selected.accentColor}
                      championId={selected.id}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <p className="screen__description">{t('select.empty')}</p>
          )}
        </aside>
      </div>

      <footer className="champion-select__footer">
        <div className="champion-select__opponent">
          <span className="champion-select__opponent-label">
            {t('select.opponentHeading')}
          </span>
          <select
            className="champion-select__opponent-picker"
            aria-label={t('select.opponentHeading')}
            value={enemyId}
            onChange={(event) => setEnemyId(event.target.value)}
          >
            {CHAMPIONS.map((champion) => (
              <option key={champion.id} value={champion.id}>
                {t(champion.nameKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn champion-select__randomize"
            onClick={handleRandomizeOpponent}
          >
            {t('select.randomize')}
          </button>
        </div>

        <div className="champion-select__actions">
          {onBack && (
            <button type="button" className="btn" onClick={onBack}>
              {t('common.back')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary champion-select__lock-in"
            onClick={handleLockIn}
          >
            {t('select.lockIn')}
          </button>
        </div>
      </footer>
    </section>
  );
}
