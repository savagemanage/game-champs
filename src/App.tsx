import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './components/LanguageToggle';
import SettingsPanel from './components/SettingsPanel';
import MainMenu from './screens/MainMenu';
import ModeSelect from './screens/ModeSelect';
import ChampionSelect from './screens/ChampionSelect';
import BattleScreen from './screens/BattleScreen';
import ResultScreen from './screens/ResultScreen';
import type { BattleOutcome, GameMode } from './game/battleStore';

/** Re-export so screens can import the shared game-mode type from `../App`. */
export type { GameMode } from './game/battleStore';

/** The high-level screens the app can display. */
export type Screen = 'menu' | 'mode' | 'select' | 'battle' | 'result';

/** The champions + mode chosen in select, passed down to the battle screen. */
export interface MatchSetup {
  playerChampionId: string;
  enemyChampionId: string;
  mode: GameMode;
}

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<GameMode>('rift');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped on every (re)entry into battle. Passed to the battle canvas so an
  // identical-champion rematch still forces a fresh Phaser scene restart -
  // without this, the scene would not recreate when the champion ids are the
  // same across a rematch.
  const [matchNonce, setMatchNonce] = useState(0);

  // The old header showed the game title; with the header removed we surface
  // the localized title as the document title so the branding is not lost.
  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  const handleModeSelect = (chosen: GameMode) => {
    setMode(chosen);
    setScreen('select');
  };

  const handleLockIn = (playerChampionId: string, enemyChampionId: string) => {
    setMatch({ playerChampionId, enemyChampionId, mode });
    setOutcome(null);
    setMatchNonce((n) => n + 1);
    setScreen('battle');
  };

  const handleGameEnd = (result: BattleOutcome) => {
    setOutcome(result);
    setScreen('result');
  };

  const handleRematch = () => {
    if (match) {
      setOutcome(null);
      setMatchNonce((n) => n + 1);
      setScreen('battle');
    } else {
      setScreen('mode');
    }
  };

  return (
    <div className="app-shell">
      {/* Compact floating controls in the top-right corner. This replaces the
          old full-width header bar/frame so the game fills the viewport
          edge-to-edge, while keeping language switching visible and the
          settings/help panel one click away on every screen. Kept clear of the
          battle HUD's shop button, minimap and QWER bar, which sit lower/left. */}
      <div className="app-controls">
        <LanguageToggle />
        <button
          type="button"
          className="app-controls__settings"
          aria-label={t('settings.openAria')}
          title={t('settings.open')}
          onClick={() => setSettingsOpen(true)}
        >
          {/* Inline gear icon so the control renders identically regardless of
             which webfonts load. Uses currentColor to inherit the button's
             gold color and hover state. */}
          <svg
            className="app-controls__gear"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3.25" />
            <path d="M12 2.5v3M12 18.5v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2.5 12h3M18.5 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        </button>
      </div>

      <main className="app-main">
        {screen === 'menu' && <MainMenu onPlay={() => setScreen('mode')} />}

        {screen === 'mode' && (
          <ModeSelect
            selected={mode}
            onSelect={handleModeSelect}
            onBack={() => setScreen('menu')}
          />
        )}

        {screen === 'select' && (
          <ChampionSelect
            mode={mode}
            onLockIn={handleLockIn}
            onBack={() => setScreen('mode')}
          />
        )}

        {screen === 'battle' && match && (
          <BattleScreen
            match={match}
            matchNonce={matchNonce}
            onGameEnd={handleGameEnd}
            onQuit={() => setScreen('select')}
          />
        )}

        {screen === 'result' && outcome && (
          <ResultScreen
            outcome={outcome}
            onRematch={handleRematch}
            onMenu={() => setScreen('menu')}
          />
        )}
      </main>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
