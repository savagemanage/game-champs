import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './components/LanguageToggle';
import SettingsPanel from './components/SettingsPanel';
import MainMenu from './screens/MainMenu';
import ModeSelect from './screens/ModeSelect';
import ChampionSelect, { CHAMPION_UNLOCK_COST } from './screens/ChampionSelect';
import BattleScreen from './screens/BattleScreen';
import ResultScreen from './screens/ResultScreen';
import type { BattleOutcome, GameMode } from './game/battleStore';
import type { Difficulty, MatchKind } from './game/tutorial/config';
import {
  accountLevelForXp,
  applyMatchOutcome,
  loadProfile,
  rewardsForMatch,
  saveProfile,
  setLastSetup,
  unlockChampion,
  type ChampsProfile,
  type LastMatchSetup,
  type MatchRewards,
} from './profile';
import {
  clearTelemetryData,
  denyTelemetryConsent,
  exportTelemetryData,
  grantTelemetryConsent,
  matchDurationBucket,
  recordTelemetry,
  startConsentGatedTelemetryCapture,
  telemetryRuntimeStatus,
} from './telemetry/runtime';

/** Re-export so screens can import the shared game-mode type from `../App`. */
export type { GameMode } from './game/battleStore';

/** The high-level screens the app can display. */
export type Screen = 'menu' | 'mode' | 'select' | 'battle' | 'result';

/** Complete local setup passed unchanged through React into BattleScene. */
export type MatchSetup = LastMatchSetup;

const defaultsForKind = (matchKind: MatchKind): Difficulty =>
  matchKind === 'standard' ? 'normal' : 'easy';

export default function App() {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<ChampsProfile>(() => loadProfile());
  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<GameMode>('conquest');
  const [matchKind, setMatchKind] = useState<MatchKind>('standard');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [rewards, setRewards] = useState<MatchRewards | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchNonce, setMatchNonce] = useState(0);
  const [telemetryStatus, setTelemetryStatus] = useState(telemetryRuntimeStatus);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    document.title = t('app.title');
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
  }, [i18n.language, i18n.resolvedLanguage, t]);

  useEffect(() => {
    if (!telemetryStatus.enabled) return undefined;
    return startConsentGatedTelemetryCapture();
  }, [telemetryStatus.enabled]);

  const grantDiagnostics = useCallback(() => {
    setTelemetryStatus(grantTelemetryConsent());
  }, []);

  const denyDiagnostics = useCallback(() => {
    setTelemetryStatus(denyTelemetryConsent());
  }, []);

  const clearDiagnostics = useCallback(() => {
    clearTelemetryData();
  }, []);

  const downloadDiagnostics = useCallback(async () => {
    const json = await exportTelemetryData();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `champs-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const persistSetup = useCallback((setup: MatchSetup) => {
    setProfile((current) => {
      const next = setLastSetup(current, setup);
      saveProfile(next);
      return next;
    });
  }, []);

  const enterBattle = useCallback((setup: MatchSetup) => {
    recordTelemetry({
      type: 'session-started',
      sessionKind: setup.matchKind === 'practice' ? 'practice' : 'local',
    });
    setMode(setup.mode);
    setMatchKind(setup.matchKind);
    setDifficulty(setup.difficulty);
    setMatch(setup);
    setOutcome(null);
    setRewards(null);
    persistSetup(setup);
    setMatchNonce((nonce) => nonce + 1);
    setScreen('battle');
  }, [persistSetup]);

  const beginFlow = (kind: MatchKind) => {
    setMatchKind(kind);
    setDifficulty(defaultsForKind(kind));
    setMode('conquest');
    setScreen('mode');
  };

  const handleModeSelect = (chosen: GameMode) => {
    setMode(chosen);
    setScreen('select');
  };

  const handleLockIn = (playerChampionId: string, enemyChampionId: string) => {
    if (!profile.unlockedChampionIds.includes(playerChampionId)) return;
    enterBattle({
      playerChampionId,
      enemyChampionId,
      mode,
      matchKind,
      difficulty,
    });
  };

  const handleContinue = () => {
    const setup = profile.lastSetup;
    if (!setup) return;
    if (!profile.unlockedChampionIds.includes(setup.playerChampionId)) {
      setMode(setup.mode);
      setMatchKind(setup.matchKind);
      setDifficulty(setup.difficulty);
      setScreen('select');
      return;
    }
    enterBattle(setup);
  };

  const handleUnlock = (championId: string) => {
    setProfile((current) => {
      const next = unlockChampion(current, championId, CHAMPION_UNLOCK_COST);
      if (next !== current) saveProfile(next);
      return next;
    });
  };

  const handleGameEnd = (result: BattleOutcome) => {
    recordTelemetry({
      type: 'match-completed',
      mode: result.mode,
      result: result.win ? 'win' : 'loss',
      durationBucket: matchDurationBucket(result.stats.durationSeconds),
    });
    setProfile((current) => {
      const next = applyMatchOutcome(current, result);
      saveProfile(next);
      return next;
    });
    setRewards(rewardsForMatch(result));
    setOutcome(result);
    setScreen('result');
  };

  const handleRematch = () => {
    if (match) enterBattle(match);
    else setScreen('mode');
  };

  const controls = (
    <>
      <LanguageToggle />
      <button
        type="button"
        className="app-controls__settings"
        aria-label={t('settings.openAria')}
        title={t('settings.open')}
        onClick={openSettings}
      >
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
    </>
  );

  const controlsInNav = screen === 'select';

  return (
    <div className="app-shell">
      {!controlsInNav && <div className="app-controls">{controls}</div>}

      <main className="app-main">
        {screen === 'menu' && (
          <MainMenu
            profile={profile}
            accountLevel={accountLevelForXp(profile.accountXp)}
            onContinue={profile.lastSetup ? handleContinue : undefined}
            onStandard={() => beginFlow('standard')}
            onPractice={() => beginFlow('practice')}
            onTutorial={() => beginFlow('tutorial')}
          />
        )}

        {screen === 'mode' && (
          <ModeSelect
            selected={mode}
            matchKind={matchKind}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            onSelect={handleModeSelect}
            onBack={() => setScreen('menu')}
          />
        )}

        {screen === 'select' && (
          <ChampionSelect
            mode={mode}
            profile={profile}
            accountLevel={accountLevelForXp(profile.accountXp)}
            onUnlock={handleUnlock}
            onLockIn={handleLockIn}
            onBack={() => setScreen('mode')}
            navControls={controls}
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

        {screen === 'result' && outcome && rewards && (
          <ResultScreen
            outcome={outcome}
            profile={profile}
            rewards={rewards}
            onRematch={handleRematch}
            onMenu={() => setScreen('menu')}
          />
        )}
      </main>

      {settingsOpen && (
        <SettingsPanel
          onClose={closeSettings}
          telemetryStatus={telemetryStatus}
          onTelemetryGrant={grantDiagnostics}
          onTelemetryDeny={denyDiagnostics}
          onTelemetryExport={downloadDiagnostics}
          onTelemetryClear={clearDiagnostics}
        />
      )}
    </div>
  );
}
