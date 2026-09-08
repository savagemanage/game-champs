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
 * Hosts the Phaser battle canvas plus the React HUD overlay and item shop. The
 * loading layer remains authoritative until Phaser reports fonts, critical
 * textures, scale refresh, and a first render have all settled or fallen back.
 */
export default function BattleScreen({
  match,
  matchNonce,
  onGameEnd,
  onQuit,
}: BattleScreenProps) {
  const { t } = useTranslation();
  const [shopOpen, setShopOpen] = useState(false);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const battleKey = [
    matchNonce,
    match.playerChampionId,
    match.enemyChampionId,
    match.mode,
    match.matchKind,
    match.difficulty,
  ].join(':');
  const sceneReady = readyKey === battleKey;
  const sceneFailed = failedKey === battleKey;

  // Browsers only allow audio after a user gesture; the battle is always
  // reached via a click ("Lock In"/"Rematch"), so unlock the context on mount.
  useEffect(() => {
    audio.resume();
    setShopOpen(false);
    setFailedKey(null);
  }, [battleKey]);

  // `B` toggles the shop. Global shortcuts stay dormant while loading, while
  // any modal is open, or while the player is interacting with a form control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!sceneReady) return;
      const shopDialogOpen = document.querySelector('.shop-panel[aria-modal="true"]');
      if ((event.key === 'b' || event.key === 'B') && shopDialogOpen) {
        event.preventDefault();
        event.stopPropagation();
        setShopOpen(false);
        return;
      }

      const target = event.target;
      const isFormControl =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement;
      const modalOpen = document.querySelector('[aria-modal="true"]');
      if (isFormControl || modalOpen) return;

      if (event.key === 'b' || event.key === 'B') {
        setShopOpen((open) => !open);
      } else if (event.key === 'Escape') {
        setShopOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sceneReady]);

  const handleGameEnd = useCallback(
    (outcome: BattleOutcome) => {
      onGameEnd(outcome);
    },
    [onGameEnd],
  );

  const handleReady = useCallback(() => {
    setReadyKey(battleKey);
    setFailedKey(null);
  }, [battleKey]);

  const handleError = useCallback((_error: unknown) => {
    setFailedKey(battleKey);
  }, [battleKey]);

  return (
    <section className="battle-screen" aria-label={t('battle.title')}>
      <div className="battle-stage-slot">
        <div className="battle-stage" aria-busy={!sceneReady && !sceneFailed}>
          <Suspense fallback={null}>
            <PhaserGame
              playerChampionId={match.playerChampionId}
              enemyChampionId={match.enemyChampionId}
              mode={match.mode}
              matchKind={match.matchKind}
              difficulty={match.difficulty}
              matchNonce={matchNonce}
              onGameEnd={handleGameEnd}
              onReady={handleReady}
              onError={handleError}
            />
          </Suspense>
          {!sceneReady && !sceneFailed && (
            <div
              className="battle-stage__loading"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {t('common.loading')}
            </div>
          )}
          {sceneFailed && (
            <div className="battle-stage__loading battle-stage__loading--error" role="alert">
              {t('battle.loadError')}
            </div>
          )}
          {sceneReady && <BattleHud onOpenShop={() => setShopOpen(true)} />}
          {sceneReady && shopOpen && (
            <ShopPanel open onClose={() => setShopOpen(false)} />
          )}
        </div>
      </div>
      <button type="button" className="btn battle-screen__quit" onClick={onQuit}>
        {t('battle.surrender')}
      </button>
    </section>
  );
}
