import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BattleHud from '../game/BattleHud';
import { audio } from '../game/audio';
import type { BattleOutcome } from '../game/battleStore';
import type { MatchSetup } from '../App';

// Phaser is heavy and depends on the DOM canvas; lazy-load it so the module is
// only pulled in when a battle actually starts. This also keeps Phaser out of
// the module graph for unit tests that render App without entering battle.
const PhaserGame = lazy(() => import('../game/PhaserGame'));

interface BattleScreenProps {
  match: MatchSetup;
  /** Bumped by App on every battle entry so identical rematches restart. */
  matchNonce: number;
  /** Fired once when the match resolves, with the full outcome for results. */
  onGameEnd: (outcome: BattleOutcome) => void;
  onQuit: () => void;
}

/**
 * Hosts the Phaser battle canvas plus the React HUD overlay. When the scene
 * reports a win/lose via `onGameEnd`, control routes back to React (App decides
 * to show the results screen). A quit button lets the player bail to select.
 */
export default function BattleScreen({
  match,
  matchNonce,
  onGameEnd,
  onQuit,
}: BattleScreenProps) {
  const { t } = useTranslation();

  // Browsers only allow audio after a user gesture; the battle is always
  // reached via a click ("Lock In"/"Rematch"), so unlock the context on mount.
  useEffect(() => {
    audio.resume();
  }, [matchNonce]);

  const handleGameEnd = useCallback(
    (outcome: BattleOutcome) => {
      onGameEnd(outcome);
    },
    [onGameEnd],
  );

  return (
    <section className="battle-screen" aria-label={t('battle.title')}>
      <div className="battle-stage">
        <Suspense fallback={<div className="battle-stage__loading">{t('common.loading')}</div>}>
          <PhaserGame
            playerChampionId={match.playerChampionId}
            enemyChampionId={match.enemyChampionId}
            matchNonce={matchNonce}
            onGameEnd={handleGameEnd}
          />
        </Suspense>
        <BattleHud />
      </div>
      <button type="button" className="btn battle-screen__quit" onClick={onQuit}>
        {t('battle.surrender')}
      </button>
    </section>
  );
}
