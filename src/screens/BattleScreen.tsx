import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BattleHud from '../game/BattleHud';
import ShopPanel from '../components/ShopPanel';
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
 * Hosts the Phaser battle canvas plus the React HUD overlay and item shop. When
 * the scene reports a win/lose via `onGameEnd`, control routes back to React
 * (App decides to show the results screen). The shop opens with the `B` key or
 * the HUD shop button. A quit button lets the player bail to select.
 */
export default function BattleScreen({
  match,
  matchNonce,
  onGameEnd,
  onQuit,
}: BattleScreenProps) {
  const { t } = useTranslation();
  const [shopOpen, setShopOpen] = useState(false);

  // Browsers only allow audio after a user gesture; the battle is always
  // reached via a click ("Lock In"/"Rematch"), so unlock the context on mount.
  useEffect(() => {
    audio.resume();
  }, [matchNonce]);

  // `B` toggles the shop (matching the settings help panel keybind).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        setShopOpen((open) => !open);
      } else if (e.key === 'Escape') {
        setShopOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
            mode={match.mode}
            matchNonce={matchNonce}
            onGameEnd={handleGameEnd}
          />
        </Suspense>
        <BattleHud onOpenShop={() => setShopOpen(true)} />
        <ShopPanel open={shopOpen} onClose={() => setShopOpen(false)} />
      </div>
      <button type="button" className="btn battle-screen__quit" onClick={onQuit}>
        {t('battle.surrender')}
      </button>
    </section>
  );
}
