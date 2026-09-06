import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import BattleScene, { type BattleSceneData } from './scenes/BattleScene';
import type { BattleOutcome, GameMode } from './battleStore';

interface PhaserGameProps {
  playerChampionId: string;
  enemyChampionId: string;
  /** Which mode the battle runs (3-lane Rift or single-lane ARAM). */
  mode: GameMode;
  /**
   * Incremented by App on every battle entry. Including it in the effect deps
   * guarantees a fresh scene even when the same matchup is replayed (a rematch
   * of identical champions), which champion-id-only deps would miss.
   */
  matchNonce: number;
  onGameEnd: (outcome: BattleOutcome) => void;
}

const GAME_WIDTH = 900;
const GAME_HEIGHT = 640;

/**
 * Mounts a single Phaser.Game into a container div and tears it down on
 * unmount. React 18 StrictMode double-invokes effects in development, which
 * would otherwise create two Phaser.Game instances; the `gameRef` guard ensures
 * exactly one instance exists at a time, and the cleanup destroys it fully.
 */
export default function PhaserGame({
  playerChampionId,
  enemyChampionId,
  mode,
  matchNonce,
  onGameEnd,
}: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  // Keep the latest callback without re-creating the game when it changes.
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const sceneData: BattleSceneData = {
      playerChampionId,
      enemyChampionId,
      mode,
      onGameEnd: (outcome) => onGameEndRef.current(outcome),
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: '#071018',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      },
      render: { antialias: true, roundPixels: false },
      scene: [BattleScene],
    });
    gameRef.current = game;
    game.scene.start('battle', sceneData);

    // Right-click is a move command in-battle (LoL-style), so suppress the
    // browser context menu over the game canvas. The scene also calls
    // input.mouse.disableContextMenu(); this listener is a belt-and-suspenders
    // guard bound to the actual canvas element and removed on teardown so no
    // stray handler leaks across remounts (StrictMode / rematch).
    const preventContextMenu = (e: Event) => e.preventDefault();
    const canvas = game.canvas;
    canvas?.addEventListener('contextmenu', preventContextMenu);

    // Phaser.Scale.FIT measures the parent element once at creation. If the
    // container has not been laid out yet (or was momentarily collapsed), the
    // canvas can lock to a tiny size and never grow. Refresh the scale manager
    // whenever the container resizes so the canvas always fills `.battle-stage`
    // at its full 900x640 aspect ratio, and once more after first layout.
    const container = containerRef.current;
    const refresh = () => gameRef.current?.scale.refresh();
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(container);
    const rafId = requestAnimationFrame(refresh);
    window.addEventListener('resize', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas?.removeEventListener('contextmenu', preventContextMenu);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // Recreate when participants change OR when the match nonce bumps (rematch).
  }, [playerChampionId, enemyChampionId, mode, matchNonce]);

  return <div className="phaser-game" ref={containerRef} aria-hidden="true" />;
}
