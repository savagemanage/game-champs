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
          <span aria-hidden="true">{'\u2699'}</span>
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
