import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAMPIONS,
  getAllAbilities,
  getChampionById,
  randomChampionId,
  type Champion,
  type ChampionStats,
} from '../data/champions';
import { abilitySvgFor } from '../game/render/abilityIcons';
import AbilityCard from '../components/AbilityCard';
import ChampionFigure from '../components/ChampionFigure';
import ClientNav from '../components/ClientNav';

import type { GameMode } from '../App';

interface ChampionSelectProps {
  /** The chosen game mode (affects the pick hint). Defaults to Rift. */
  mode?: GameMode;
  /** Called with the chosen player + enemy ids when the player locks in. */
  onLockIn: (playerId: string, enemyId: string) => void;
  onBack?: () => void;
  /**
   * Right-side nav controls (settings gear + language toggle) supplied by the
   * app shell so they live in the client nav instead of the floating overlay,
   * keeping them reachable without duplication.
   */
  navControls?: ReactNode;
}

const STAT_ORDER: (keyof ChampionStats)[] = [
  'hp',
  'hpRegen',
  'moveSpeed',
  'attackDamage',
  'attackRange',
  'attackSpeed',
];

/** Decorative social panel friend rows: name key + status key + status class. */
const FRIENDS: { nameKey: string; statusKey: string; status: string }[] = [
  { nameKey: 'client.social.friend1', statusKey: 'client.social.inGame', status: 'ingame' },
  { nameKey: 'client.social.friend2', statusKey: 'client.social.online', status: 'online' },
  { nameKey: 'client.social.friend3', statusKey: 'client.social.online', status: 'online' },
  { nameKey: 'client.social.friend4', statusKey: 'client.social.away', status: 'away' },
];

/**
 * League-client-style champion select. A Hextech top nav sits above a lobby of
 * FIVE vertical champion cards (the full roster) rendered side by side, each
 * with a circular framed portrait, name, role/lane, and a summoner-spell slot
 * row (the champion's Q/W/E/R icons). The selected card is highlighted and
 * rendered taller/centered like the client's own pick. A decorative social
 * (friends) panel sits on the right. Below, an opponent picker (kept working so
 * lock-in has an enemy id) leads into a big glowing FIND MATCH button. The
 * selected champion's full stats + localized ability cards remain reachable in
 * an expandable detail drawer beneath the card row.
 */
export default function ChampionSelect({
  mode = 'rift',
  onLockIn,
  onBack,
  navControls,
}: ChampionSelectProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>(CHAMPIONS[0].id);
  const [enemyId, setEnemyId] = useState<string>(() =>
    randomChampionId(CHAMPIONS[0].id),
  );
  const [detailOpen, setDetailOpen] = useState(false);

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
      <ClientNav controls={navControls} />

      <div className="champion-select__stage">
        <div className="champion-select__main">
          <header className="champion-select__topbar">
            <h2 className="screen__heading champion-select__heading">
              {t('select.heading')}
            </h2>
            <p className="champion-select__hint">
              {t('select.pickHint')}
              {' · '}
              {t(`mode.${mode}`)}
            </p>
          </header>

          <div
            className="champion-select__cards"
            role="listbox"
            aria-label={t('select.rosterLabel')}
          >
            {CHAMPIONS.map((champion) => {
              const isSelf = champion.id === selectedId;
              const isEnemy = champion.id === enemyId;
              const name = t(champion.nameKey);
              const portraitStyle = {
                background: `radial-gradient(circle at 30% 22%, ${champion.accentColor}, transparent 72%), linear-gradient(160deg, ${champion.accentColor}33, #010a13 88%)`,
                borderColor: champion.accentColor,
              };
              return (
                <button
                  key={champion.id}
                  type="button"
                  role="option"
                  aria-selected={isSelf}
                  aria-label={`${name} - ${t(champion.titleKey)}`}
                  className={`lobby-card${isSelf ? ' is-self' : ''}`}
                  onClick={() => handleSelect(champion.id)}
                >
                  <span className="lobby-card__slotlabel">
                    {isSelf
                      ? t('select.you')
                      : isEnemy
                        ? t('select.opponent')
                        : t(`laneRole.${champion.laneRole}`)}
                  </span>
                  <span
                    className="lobby-card__portrait"
                    style={portraitStyle}
                    aria-hidden="true"
                  >
                    <ChampionFigure
                      champion={champion}
                      className="lobby-card__figure"
                    />
                  </span>
                  <span className="lobby-card__name">{name}</span>
                  <span
                    className="lobby-card__role"
                    style={{ color: champion.accentColor }}
                  >
                    {t(`role.${champion.role}`)}
                  </span>
                  <span className="lobby-card__spells" aria-hidden="true">
                    {getAllAbilities(champion)
                      .filter((a) => a.slot !== 'P')
                      .map((ability) => (
                        <span
                          key={ability.slot}
                          className="lobby-card__spell"
                          style={{ borderColor: champion.accentColor }}
                          dangerouslySetInnerHTML={{
                            __html: abilitySvgFor(
                              champion.id,
                              ability.slot,
                              ability.behavior,
                            ),
                          }}
                        />
                      ))}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
            <section className="champion-select__detail">
              <button
                type="button"
                className="champion-select__detail-toggle"
                aria-expanded={detailOpen}
                onClick={() => setDetailOpen((open) => !open)}
              >
                <span className="champion-select__detail-name">
                  {t(selected.nameKey)}
                </span>
                <span className="champion-select__detail-title">
                  {t(selected.titleKey)}
                </span>
                <span className="champion-select__detail-caret" aria-hidden="true">
                  {detailOpen ? '\u25B2' : '\u25BC'}
                </span>
              </button>

              {detailOpen && (
                <div className="champion-select__detail-body">
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
                </div>
              )}
            </section>
          )}

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

            <button
              type="button"
              className="champion-select__find-match"
              onClick={handleLockIn}
            >
              {t('select.findMatch')}
            </button>

            {onBack && (
              <button type="button" className="btn champion-select__back" onClick={onBack}>
                {t('common.back')}
              </button>
            )}
          </footer>
        </div>

        <aside className="social-panel" aria-label={t('client.social.title')}>
          <h3 className="social-panel__title">{t('client.social.title')}</h3>
          <ul className="social-panel__list">
            {FRIENDS.map((friend) => (
              <li className="social-panel__friend" key={friend.nameKey}>
                <span
                  className={`social-panel__dot social-panel__dot--${friend.status}`}
                  aria-hidden="true"
                />
                <span className="social-panel__friend-info">
                  <span className="social-panel__friend-name">
                    {t(friend.nameKey)}
                  </span>
                  <span className="social-panel__friend-status">
                    {t(friend.statusKey)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
