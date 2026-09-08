import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { battleStore } from './battleStore';
import { getChampionById } from '../data/champions';
import { abilitySvgFor } from './render/abilityIcons';
import ChampionFigure from '../components/ChampionFigure';

interface BattleHudProps {
  onOpenShop?: () => void;
}

/** React HUD with quiet progress semantics and explicit critical-state alerts. */
export default function BattleHud({ onOpenShop }: BattleHudProps) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(battleStore.subscribe, battleStore.getSnapshot);
  const [status, setStatus] = useState('');
  const previousLife = useRef(state.playerLife.phase);
  const previousMatchPhase = useRef(state.matchStatus.phase);

  useEffect(() => {
    const phase = state.playerLife.phase;
    if (phase !== previousLife.current) {
      if (phase === 'dead') setStatus(t('hud.statusDefeated', { seconds: Math.ceil(state.playerLife.respawnSeconds) }));
      else if (phase === 'respawning') setStatus(t('hud.statusRespawning'));
      else if (phase === 'invulnerable') setStatus(t('hud.statusRespawned'));
      previousLife.current = phase;
    }
  }, [state.playerLife.phase, state.playerLife.respawnSeconds, t]);

  useEffect(() => {
    const phase = state.matchStatus.phase;
    if (phase !== previousMatchPhase.current) {
      setStatus(phase === 'sudden-death' ? t('hud.statusSuddenDeath') : phase === 'hard-cap' ? t('hud.statusHardCap') : '');
      previousMatchPhase.current = phase;
    }
  }, [state.matchStatus.phase, t]);

  const player = getChampionById(state.playerChampionId);
  const enemy = getChampionById(state.enemyChampionId);
  if (!player || !enemy) return null;

  const percent = (value: number, maximum: number) =>
    Math.max(0, Math.min(100, maximum > 0 ? (value / maximum) * 100 : 0));
  const hpPct = (value: number, maximum: number) => `${percent(value, maximum)}%`;
  const progressValue = (value: number, maximum: number) =>
    Math.round(Math.max(0, Math.min(maximum, value)));
  const lifeOverlay = state.playerLife.phase === 'dead' || state.playerLife.phase === 'respawning';
  const suddenDeath = state.matchStatus.suddenDeath || state.matchStatus.phase === 'sudden-death';

  return (
    <div className="battle-hud">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</p>

      {lifeOverlay && (
        <div className="battle-hud__alert battle-hud__alert--respawn" aria-hidden="true">
          <strong>{t('hud.defeated')}</strong>
          <span>{t('hud.respawnIn', { seconds: Math.ceil(state.playerLife.respawnSeconds) })}</span>
        </div>
      )}
      {(suddenDeath || state.matchStatus.phase === 'hard-cap') && (
        <div className="battle-hud__alert battle-hud__alert--sudden" aria-hidden="true">
          <strong>{state.matchStatus.phase === 'hard-cap' ? t('hud.hardCap') : t('hud.suddenDeath')}</strong>
          {state.matchStatus.hardCapSecondsRemaining > 0 && (
            <span>{t('hud.hardCapIn', { seconds: Math.ceil(state.matchStatus.hardCapSecondsRemaining) })}</span>
          )}
        </div>
      )}

      <div className="battle-hud__top">
        <div className="battle-hud__topbar">
          <div className="battle-hud__structures battle-hud__structures--ally">
            <span className="battle-hud__team battle-hud__team--ally">{t(player.nameKey)}</span>
            <span className="battle-hud__struct">{t('hud.turrets')} {state.allyStructures.turrets}/{state.allyStructures.turretsMax}</span>
            <span className="battle-hud__struct">{t('hud.inhibitors')} {state.allyStructures.inhibitors}/{state.allyStructures.inhibitorsMax}</span>
          </div>
          <div className="battle-hud__center">
            <span className="battle-hud__mode">{t(`mode.${state.mode}`)}</span>
            <span className="battle-hud__timer">{formatTime(state.elapsed)}</span>
          </div>
          <div className="battle-hud__structures battle-hud__structures--enemy">
            <span className="battle-hud__team battle-hud__team--enemy">{t(enemy.nameKey)}</span>
            <span className="battle-hud__struct">{t('hud.turrets')} {state.enemyStructures.turrets}/{state.enemyStructures.turretsMax}</span>
            <span className="battle-hud__struct">{t('hud.inhibitors')} {state.enemyStructures.inhibitors}/{state.enemyStructures.inhibitorsMax}</span>
          </div>
        </div>
        {state.mode === 'conquest' && (
          <div className="battle-hud__objectives">
            {state.objectives.map((objective) => (
              <span key={objective.id} className={`battle-hud__objective${objective.alive ? ' is-alive' : ''}`}>
                {t(`objective.${objective.id}`)}: {objective.alive ? t('hud.alive') : formatTime(objective.spawnsIn)}
              </span>
            ))}
            <span className="battle-hud__dragons">{t('objective.dragon')} ×{state.dragonStacks}</span>
          </div>
        )}
      </div>

      <div className="battle-hud__minimap" role="img" aria-label={t('hud.minimapSummary', { count: state.minimap.length })}>
        {state.minimap.map((blip) => (
          <span key={blip.id} aria-hidden="true" className={`battle-hud__blip battle-hud__blip--${blip.team} battle-hud__blip--${blip.kind}`} style={{ left: `${blip.x * 100}%`, top: `${blip.y * 100}%` }} />
        ))}
      </div>

      <div className="battle-hud__bottom-band">
        <p className="battle-hud__hint"><span className="battle-hud__hint-text">{t('battle.controlsHint')}</span></p>
        <div className="battle-hud__bottom">
          <div className="battle-hud__champion">
            <span className="battle-hud__portrait" style={{ borderColor: player.accentColor, color: player.accentColor }} aria-hidden="true">
              <span className="battle-hud__level">{state.level}</span>
              <ChampionFigure champion={player} className="battle-hud__figure" />
            </span>
            <div className="battle-hud__bars">
              <div className="battle-hud__bar-row">
                <span className="battle-hud__bar-label">{t('stat.hp')}</span>
                <div className="battle-hud__bar battle-hud__bar--hp" role="progressbar" aria-label={t('stat.hp')} aria-valuemin={0} aria-valuemax={state.playerMaxHp} aria-valuenow={progressValue(state.playerHp, state.playerMaxHp)}>
                  <div className="battle-hud__bar-fill battle-hud__bar-fill--hp" style={{ width: hpPct(state.playerHp, state.playerMaxHp) }} />
                  <span className="battle-hud__bar-text">{state.playerHp} / {state.playerMaxHp}</span>
                </div>
              </div>
              <div className="battle-hud__bar-row">
                <span className="battle-hud__bar-label">{t('battle.resource')}</span>
                <div className="battle-hud__bar battle-hud__bar--mana" role="progressbar" aria-label={t('battle.resource')} aria-valuemin={0} aria-valuemax={state.playerMaxResource} aria-valuenow={progressValue(state.playerResource, state.playerMaxResource)}>
                  <div className="battle-hud__bar-fill battle-hud__bar-fill--mana" style={{ width: hpPct(state.playerResource, state.playerMaxResource) }} />
                  <span className="battle-hud__bar-text">{state.playerResource} / {state.playerMaxResource}</span>
                </div>
              </div>
              <div className="battle-hud__bar-row">
                <span className="battle-hud__bar-label">{t('hud.xp')}</span>
                <div className="battle-hud__bar battle-hud__bar--xp" role="progressbar" aria-label={t('hud.xp')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue(state.xpPct * 100, 100)}>
                  <div className="battle-hud__bar-fill battle-hud__bar-fill--xp" style={{ width: `${Math.round(state.xpPct * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="battle-hud__abilities">
            {state.abilities.map((ability, index) => {
              const definition = player.abilities[index];
              const iconSvg = abilitySvgFor(player.id, ability.slot, definition ? definition.behavior : 'skillshot');
              return (
                <button
                  type="button"
                  key={ability.slot}
                  className={`battle-ability${ability.ready ? ' is-ready' : ' is-cooling'}`}
                  style={{ borderColor: player.accentColor, color: player.accentColor }}
                  title={definition ? t(definition.nameKey) : ability.slot}
                  aria-label={`${ability.slot} — ${definition ? t(definition.nameKey) : ability.slot}`}
                  aria-keyshortcuts={ability.slot}
                  disabled={!ability.ready}
                  onClick={() => window.dispatchEvent(new CustomEvent('champs:cast-ability', { detail: { slot: ability.slot } }))}
                >
                  <span className="battle-ability__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg }} />
                  <span className="battle-ability__key">{t(`slot.${ability.slot}`)}</span>
                  {!ability.ready && (
                    <>
                      <span className="battle-ability__cooldown" style={{ height: `${(1 - ability.progress) * 100}%` }} />
                      <span className="battle-ability__timer">{ability.remaining}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div className="battle-hud__side">
            <div className="battle-hud__gold"><span aria-hidden="true">◈</span> {state.gold}</div>
            {state.buffs.length > 0 && (
              <div className="battle-hud__buffs">
                {state.buffs.map((buff) => <span key={buff.kind} className={`battle-hud__buff battle-hud__buff--${buff.kind}`} title={t(`buff.${buff.kind}`)}>{t(`buff.${buff.kind}`)} {buff.remaining}</span>)}
              </div>
            )}
            <button type="button" className="btn battle-hud__shop" onClick={onOpenShop} disabled={!state.shopAvailable}>{t('shop.open')} (B)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}
