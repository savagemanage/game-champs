import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import BattleHud from '../game/BattleHud';
import ShopPanel from '../components/ShopPanel';
import { audio } from '../game/audio';
import { battleStore, type BattleOutcome } from '../game/battleStore';
import type { MatchRequest } from '../game/matchRequest';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

const PhaserGame = lazy(() => import('../game/PhaserGame'));

interface BattleScreenProps {
  match: MatchRequest;
  matchNonce: number;
  settingsOpen?: boolean;
  onGameEnd: (outcome: BattleOutcome) => void;
  onQuit: () => void;
}

export default function BattleScreen({
  match,
  matchNonce,
  settingsOpen = false,
  onGameEnd,
  onQuit,
}: BattleScreenProps) {
  const { t } = useTranslation();
  const hud = useSyncExternalStore(battleStore.subscribe, battleStore.getSnapshot);
  const [shopOpen, setShopOpen] = useState(false);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const battleKey = [matchNonce, retryNonce, match.matchId].join(':');
  const sceneReady = readyKey === battleKey;
  const sceneFailed = failedKey === battleKey;
  const pauseFirstRef = useRef<HTMLButtonElement>(null);
  const pauseVisible = sceneReady && hud.lifecycle === 'paused' && !settingsOpen;
  const closePause = useCallback(() => {
    if (confirmSurrender) setConfirmSurrender(false);
    else battleStore.request({ type: 'resume', reason: 'manual' });
  }, [confirmSurrender]);
  const pauseRef = useDialogFocusTrap<HTMLDivElement>(pauseVisible, closePause, pauseFirstRef);

  useEffect(() => {
    audio.resume();
    setShopOpen(false);
    setFailedKey(null);
    setConfirmSurrender(false);
  }, [battleKey]);

  useEffect(() => {
    if (!sceneReady) return;
    battleStore.request({ type: settingsOpen ? 'pause' : 'resume', reason: 'settings' });
  }, [sceneReady, settingsOpen]);

  useEffect(() => {
    if (!sceneReady) return undefined;
    const onVisibility = () => {
      battleStore.request({
        type: document.hidden ? 'pause' : 'resume',
        reason: 'hidden',
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [sceneReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!sceneReady) return;
      const target = event.target;
      const isFormControl =
        target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement;
      const modalOpen = document.querySelector('[aria-modal="true"]');

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (confirmSurrender) { setConfirmSurrender(false); return; }
        if (shopOpen) { setShopOpen(false); return; }
        if (hud.lifecycle === 'paused' && !settingsOpen) {
          battleStore.request({ type: 'resume', reason: 'manual' });
          return;
        }
        if (modalOpen) return;
        battleStore.request({ type: 'pause', reason: 'manual' });
        return;
      }
      if (isFormControl || modalOpen) return;
      if (event.key === 'p' || event.key === 'P') {
        battleStore.request({ type: hud.lifecycle === 'paused' ? 'resume' : 'pause', reason: 'manual' });
      } else if (event.key === 'b' || event.key === 'B') {
        if (hud.shopAvailable) setShopOpen((open) => !open);
        else battleStore.request({ type: 'recall' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmSurrender, hud.lifecycle, hud.shopAvailable, sceneReady, settingsOpen, shopOpen]);

  const handleGameEnd = useCallback((result: BattleOutcome) => onGameEnd(result), [onGameEnd]);
  const handleReady = useCallback(() => { setReadyKey(battleKey); setFailedKey(null); }, [battleKey]);
  const handleError = useCallback(() => setFailedKey(battleKey), [battleKey]);
  const togglePause = () => battleStore.request({ type: hud.lifecycle === 'paused' ? 'resume' : 'pause', reason: 'manual' });

  return (
    <section className="battle-screen" aria-label={t('battle.title')}>
      <div className="battle-stage-slot">
        <div className="battle-stage" aria-busy={!sceneReady && !sceneFailed}>
          <Suspense fallback={null}>
            <PhaserGame
              match={match}
              matchNonce={matchNonce + retryNonce}
              onGameEnd={handleGameEnd}
              onReady={handleReady}
              onError={handleError}
            />
          </Suspense>
          {!sceneReady && !sceneFailed && <div className="battle-stage__loading" role="status" aria-live="polite" aria-atomic="true">{t('common.loading')}</div>}
          {sceneFailed && (
            <div className="battle-stage__loading battle-stage__loading--error" role="alert">
              <p>{t('battle.loadError')}</p>
              <div className="battle-error__actions">
                <button type="button" className="btn btn--primary" onClick={() => { setReadyKey(null); setFailedKey(null); setRetryNonce((value) => value + 1); }}>{t('battle.retry')}</button>
                <button type="button" className="btn" onClick={onQuit}>{t('battle.backToSelect')}</button>
              </div>
            </div>
          )}
          {sceneReady && <BattleHud onOpenShop={() => setShopOpen(true)} />}
          {sceneReady && shopOpen && <ShopPanel open onClose={() => setShopOpen(false)} />}
          {sceneReady && hud.lifecycle === 'paused' && !settingsOpen && (
            <div ref={pauseRef} className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-heading">
              <h2 id="pause-heading">{t('battle.paused')}</h2>
              {!confirmSurrender ? (
                <div className="pause-overlay__actions">
                  <button ref={pauseFirstRef} type="button" className="btn btn--primary" onClick={togglePause}>{t('battle.resume')}</button>
                  <button type="button" className="btn" onClick={() => setConfirmSurrender(true)}>{t('battle.surrender')}</button>
                </div>
              ) : (
                <div className="pause-overlay__actions">
                  <p>{t('battle.surrenderConfirm')}</p>
                  <button ref={pauseFirstRef} type="button" className="btn" onClick={() => setConfirmSurrender(false)}>{t('common.cancel')}</button>
                  <button type="button" className="btn btn--danger" onClick={() => battleStore.request({ type: 'surrender' })}>{t('battle.surrenderYes')}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {sceneReady && (
        <div className="battle-touch-controls" aria-label={t('battle.touchControls')}>
          <button type="button" onClick={() => battleStore.request({ type: 'attack-move' })}>{t('battle.attackMove')}</button>
          <button type="button" onClick={() => battleStore.request({ type: 'stop' })}>{t('battle.stop')}</button>
          <button type="button" onClick={() => battleStore.request({ type: 'recall' })}>{t('battle.recall')}</button>
          <button type="button" onClick={togglePause}>{t('battle.pause')}</button>
          {hud.wardenChargeSeconds > 0 && <button type="button" onClick={() => battleStore.request({ type: 'use-warden' })}>{t('battle.useWarden')}</button>}
        </div>
      )}
    </section>
  );
}
