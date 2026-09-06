import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import BattleScene, { type BattleSceneData } from './scenes/BattleScene';
import type { BattleOutcome } from './battleStore';

interface PhaserGameProps {
  playerChampionId: string;
  enemyChampionId: string;
  /**
   * Incremented by App on every battle entry. Including it in the effect deps
   * guarantees a fresh scene even when the same matchup is replayed (a rematch
   * of identical champions), which champion-id-only deps would miss.
   */
  matchNonce: number;
  onGameEnd: (outcome: BattleOutcome) => void;
}

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 420;

/**
 * Mounts a single Phaser.Game into a container div and tears it down on
 * unmount. React 18 StrictMode double-invokes effects in development, which
 * would otherwise create two Phaser.Game instances; the `gameRef` guard ensures
 * exactly one instance exists at a time, and the cleanup destroys it fully.
 */
export default function PhaserGame({
  playerChampionId,
  enemyChampionId,
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
      render: { pixelArt: false, antialias: true },
      scene: [BattleScene],
    });
    gameRef.current = game;
    game.scene.start('battle', sceneData);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // Recreate when participants change OR when the match nonce bumps (rematch).
  }, [playerChampionId, enemyChampionId, matchNonce]);

  return <div className="phaser-game" ref={containerRef} aria-hidden="true" />;
}
