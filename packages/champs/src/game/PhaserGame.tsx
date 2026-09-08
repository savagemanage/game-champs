import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import BattleScene, { type BattleSceneData } from './scenes/BattleScene';
import type { BattleOutcome, GameMode } from './battleStore';
import type { Difficulty, MatchKind } from './tutorial/config';

interface PhaserGameProps {
  playerChampionId: string;
  enemyChampionId: string;
  /** Which mode the battle runs (Three-Lane Conquest or Midline Skirmish). */
  mode: GameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  /**
   * Incremented by App on every battle entry. Including it in the effect deps
   * guarantees a fresh scene even when the same matchup is replayed (a rematch
   * of identical champions), which champion-id-only deps would miss.
   */
  matchNonce: number;
  onGameEnd: (outcome: BattleOutcome) => void;
  /** Fires once fonts, scene textures, scale refresh, and a rendered frame settle. */
  onReady: () => void;
  /** Reports a terminal renderer/startup failure without exposing a false HUD. */
  onError: (error: unknown) => void;
}

const GAME_WIDTH = 900;
const GAME_HEIGHT = 640;
const FONT_TIMEOUT_MS = 1800;
const FIRST_RENDER_TIMEOUT_MS = 500;
const STARTUP_WATCHDOG_MS = 6500;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function settleWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, timeoutMs);
    void promise.then(finish, finish);
  });
}

async function settleCriticalFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await settleWithTimeout(
      Promise.all([
        document.fonts.load('700 12px "Noto Sans KR"', '전투 Battle'),
        document.fonts.load('600 16px Cinzel', 'Arena'),
        document.fonts.ready,
      ]),
      FONT_TIMEOUT_MS,
    );
  } catch {
    // Font loading is an enhancement; system fallbacks must always boot battle.
  }
}

/**
 * Mounts a single Phaser.Game into a container div and tears it down on
 * unmount. Startup is cancellation-safe for React StrictMode and reports ready
 * only after critical browser/scene resources have a bounded chance to settle.
 */
export default function PhaserGame({
  playerChampionId,
  enemyChampionId,
  mode,
  matchKind,
  difficulty,
  matchNonce,
  onGameEnd,
  onReady,
  onError,
}: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onGameEndRef = useRef(onGameEnd);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onGameEndRef.current = onGameEnd;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    let cancelled = false;
    let game: Phaser.Game | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let layoutRaf = 0;
    let readinessRaf = 0;
    let renderTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let startupWatchdog: ReturnType<typeof globalThis.setTimeout> | undefined;
    let startupSettled = false;
    const motionQuery = window.matchMedia?.(REDUCED_MOTION_QUERY) ?? null;

    const preventContextMenu = (event: Event) => event.preventDefault();
    const refresh = () => game?.scale.refresh();

    const finishReady = () => {
      if (cancelled || startupSettled) return;
      startupSettled = true;
      if (renderTimeout !== undefined) {
        globalThis.clearTimeout(renderTimeout);
        renderTimeout = undefined;
      }
      if (startupWatchdog !== undefined) {
        globalThis.clearTimeout(startupWatchdog);
        startupWatchdog = undefined;
      }
      game?.events.off('postrender', finishReady);
      onReadyRef.current();
    };

    const failStartup = (error: unknown) => {
      if (cancelled || startupSettled) return;
      startupSettled = true;
      if (renderTimeout !== undefined) {
        globalThis.clearTimeout(renderTimeout);
        renderTimeout = undefined;
      }
      if (startupWatchdog !== undefined) {
        globalThis.clearTimeout(startupWatchdog);
        startupWatchdog = undefined;
      }
      game?.events.off('postrender', finishReady);
      onErrorRef.current(error);
    };

    const handleSceneReady = () => {
      if (cancelled || !game || readinessRaf !== 0) return;
      readinessRaf = requestAnimationFrame(() => {
        readinessRaf = 0;
        if (cancelled || !game) return;
        game.scale.refresh();
        // Phaser's postrender event means every scene has painted. The timeout
        // fallback covers background tabs, context loss, and test shims.
        game.events.once('postrender', finishReady);
        renderTimeout = globalThis.setTimeout(finishReady, FIRST_RENDER_TIMEOUT_MS);
      });
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      if (!game) return;
      const scene = game.scene.getScene('battle');
      if (scene instanceof BattleScene) scene.setReducedMotion(event.matches);
    };

    const boot = async () => {
      await settleCriticalFonts();
      if (cancelled || gameRef.current || !container.isConnected) return;

      const sceneData: BattleSceneData = {
        playerChampionId,
        enemyChampionId,
        mode,
        matchKind,
        difficulty,
        reducedMotion: motionQuery?.matches ?? false,
        onSceneReady: handleSceneReady,
        onGameEnd: (outcome) => onGameEndRef.current(outcome),
      };

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: '#071018',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
        },
        render: { antialias: true, roundPixels: true },
        scene: [BattleScene],
      });
      gameRef.current = game;
      game.scene.start('battle', sceneData);

      canvas = game.canvas;
      canvas?.addEventListener('contextmenu', preventContextMenu);
      motionQuery?.addEventListener('change', handleMotionChange);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(refresh);
        resizeObserver.observe(container);
      }
      layoutRaf = requestAnimationFrame(refresh);
      window.addEventListener('resize', refresh);
    };

    // Outermost bound: constructor/scene-create exceptions and browser
    // lifecycle stalls report an explicit failure instead of exposing a false HUD.
    startupWatchdog = globalThis.setTimeout(
      () => failStartup(new Error('Battle renderer startup timed out')),
      STARTUP_WATCHDOG_MS,
    );
    void boot().catch(failStartup);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', refresh);
      motionQuery?.removeEventListener('change', handleMotionChange);
      if (layoutRaf !== 0) cancelAnimationFrame(layoutRaf);
      if (readinessRaf !== 0) cancelAnimationFrame(readinessRaf);
      if (renderTimeout !== undefined) globalThis.clearTimeout(renderTimeout);
      if (startupWatchdog !== undefined) globalThis.clearTimeout(startupWatchdog);
      resizeObserver?.disconnect();
      canvas?.removeEventListener('contextmenu', preventContextMenu);
      game?.events.off('postrender', finishReady);
      game?.destroy(true);
      if (gameRef.current === game) gameRef.current = null;
    };
  }, [playerChampionId, enemyChampionId, mode, matchKind, difficulty, matchNonce]);

  return <div className="phaser-game" ref={containerRef} aria-hidden="true" />;
}
