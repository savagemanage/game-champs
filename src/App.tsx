import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './components/LanguageToggle';
import SettingsPanel from './components/SettingsPanel';
import MainMenu from './screens/MainMenu';
import ChampionSelect from './screens/ChampionSelect';
import BattleScreen from './screens/BattleScreen';
import ResultScreen from './screens/ResultScreen';
import type { BattleOutcome } from './game/battleStore';

/** The high-level screens the app can display. Later features fill these in. */
export type Screen = 'menu' | 'select' | 'battle' | 'result';

/** The champions chosen in select, passed down to the battle screen. */
export interface MatchSetup {
  playerChampionId: string;
  enemyChampionId: string;
}

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('menu');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped on every (re)entry into battle. Passed to the battle canvas so an
  // identical-champion rematch still forces a fresh Phaser scene restart -
  // without this, the scene would not recreate when the champion ids are the
  // same across a rematch.
  const [matchNonce, setMatchNonce] = useState(0);

  const handleLockIn = (playerChampionId: string, enemyChampionId: string) => {
    setMatch({ playerChampionId, enemyChampionId });
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
      setScreen('select');
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <h1 className="app-title">{t('app.title')}</h1>
          <p className="app-subtitle">{t('app.subtitle')}</p>
        </div>
        <div className="app-header__controls">
          <LanguageToggle />
          <button
            type="button"
            className="btn app-header__settings"
            onClick={() => setSettingsOpen(true)}
          >
            {t('settings.open')}
          </button>
        </div>
      </header>

      <main className="app-main">
        {screen === 'menu' && <MainMenu onPlay={() => setScreen('select')} />}

        {screen === 'select' && (
          <ChampionSelect
            onLockIn={handleLockIn}
            onBack={() => setScreen('menu')}
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
