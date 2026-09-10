import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
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
  const dragAim = useRef<{
    slot: 'Q' | 'W' | 'E' | 'R';
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

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

  const beginAbilityAim = (event: PointerEvent<HTMLButtonElement>, slot: 'Q' | 'W' | 'E' | 'R') => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragAim.current = {
      slot,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    battleStore.request({ type: 'aim-start', slot, clientX: event.clientX, clientY: event.clientY });
  };
  const updateAbilityAim = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragAim.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 8) drag.moved = true;
    battleStore.request({ type: 'aim-update', slot: drag.slot, clientX: event.clientX, clientY: event.clientY });
  };
  const finishAbilityAim = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragAim.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (drag.moved) {
      battleStore.request({ type: 'aim-commit', slot: drag.slot, clientX: event.clientX, clientY: event.clientY });
    } else {
      battleStore.request({ type: 'aim-cancel', slot: drag.slot });
      battleStore.request({ type: 'arm-cast', slot: drag.slot });
    }
    dragAim.current = null;
  };
  const cancelAbilityAim = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragAim.current?.pointerId !== event.pointerId) return;
    battleStore.request({ type: 'aim-cancel', slot: dragAim.current.slot });
    dragAim.current = null;
  };

  return (
    <div className="battle-hud">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</p>
      <section className="sr-only" aria-label={t('hud.semanticSummary')}>
        <h2>{t('hud.semanticSummary')}</h2>
        <p>{t('hud.semanticState', {
          hp: Math.round(state.playerHp),
          maxHp: Math.round(state.playerMaxHp),
          resource: Math.round(state.playerResource),
          level: state.level,
          target: state.currentTargetId ?? t('hud.noTarget'),
          life: state.playerLife.phase,
          objectivePoints: state.objectivePoints,
          cooldowns: state.abilities.map((ability) => `${ability.slot}:${ability.remaining}`).join(', '),
          objectives: state.objectives.map((objective) => `${objective.id}:${objective.alive ? 'up' : objective.spawnsIn}`).join(', '),
          respawn: state.playerLife.respawnSeconds.toFixed(1),
          invulnerable: state.playerLife.invulnerableSeconds.toFixed(1),
        })}</p>
      </section>

      {state.learning?.current && (
        <div className="battle-hud__learning" role="status">
          <span>{t(`learning.steps.${state.learning.current}`)}</span>
          <button type="button" onClick={() => battleStore.request({ type: 'skip-learning' })}>{t('learning.skip')}</button>
        </div>
      )}
      {state.recall.channeling && (
        <div className="battle-hud__recall" role="status">
          <strong>{t('hud.recalling')}</strong>
          <span>{t('hud.recallRemaining', { seconds: state.recall.remaining.toFixed(1) })}</span>
        </div>
      )}
      {!state.recall.channeling && state.recall.cancellation && (
        <p className="battle-hud__recall-cancel" role="status">{t(`hud.recallCancelled.${state.recall.cancellation}`)}</p>
      )}
      {lifeOverlay && (
        <div className="battle-hud__alert battle-hud__alert--respawn" aria-hidden="true">
          <strong>{t('hud.defeated')}</strong>
          <span>{t('hud.respawnIn', { seconds: state.playerLife.respawnSeconds.toFixed(1) })}</span>
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
            <span className="battle-hud__mode">{t(`mode.${state.mode}`)} · {t(`matchKind.${state.matchKind}`)} · {t(`difficulty.${state.difficulty}`)}</span>
            <span className="battle-hud__timer">{formatTime(state.elapsed)}</span>
          </div>
          <div className="battle-hud__structures battle-hud__structures--enemy">
            <span className="battle-hud__team battle-hud__team--enemy">{t(enemy.nameKey)}</span>
            <span className="battle-hud__struct">{t('hud.turrets')} {state.enemyStructures.turrets}/{state.enemyStructures.turretsMax}</span>
            <span className="battle-hud__struct">{t('hud.inhibitors')} {state.enemyStructures.inhibitors}/{state.enemyStructures.inhibitorsMax}</span>
          </div>
        </div>
        {state.mode === 'conquest' && (
          <>
          <div className="battle-hud__objectives">
            {state.objectives.map((objective) => (
              <span key={objective.id} className={`battle-hud__objective${objective.alive ? ' is-alive' : ''}`}>
                {t(`objective.${objective.id}`)}: {objective.alive ? t('hud.alive') : formatTime(objective.spawnsIn)}
              </span>
            ))}
            <span className="battle-hud__dragons">{t('objective.dragon')} ×{state.dragonStacks}</span>
          </div>
          <div className="battle-hud__camps" aria-label={t('hud.campTimers')}>
            {state.camps.map((camp) => (
              <span key={camp.id} className={`battle-hud__camp${camp.alive ? ' is-alive' : ''}`}>
                {t(`camp.${camp.type}`)} {camp.side === 'ally' ? '◆' : '◇'}: {camp.alive
                  ? `${camp.membersAlive}/${camp.membersTotal}`
                  : formatTime(camp.respawnsIn)}
              </span>
            ))}
          </div>
          </>
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
                  className={`battle-ability${ability.ready ? ' is-ready' : ' is-cooling'}${state.aimingSlot === ability.slot ? ' is-aiming' : ''}`}
                  style={{ borderColor: player.accentColor, color: player.accentColor }}
                  title={definition ? [
                    t(definition.nameKey),
                    `${t('ability.cost')} ${definition.cost}`,
                    `${t('ability.cooldown')} ${ability.cooldown ?? definition.cooldown}s`,
                    `${t('ability.range')} ${definition.range}`,
                    definition.damage > 0 ? `${t('ability.damage')} ${definition.damage} + ${(definition.mechanics?.apRatio ?? 0.6) * 100}% AP` : '',
                    definition.mechanics?.duration ? `${t('ability.duration')} ${definition.mechanics.duration}s` : '',
                    definition.mechanics?.slowPercent ? `${t('ability.slow')} ${definition.mechanics.slowPercent * 100}%` : '',
                    definition.mechanics?.armor ? `${t('ability.armor')} +${definition.mechanics.armor}` : '',
                    definition.mechanics?.shield ? `${t('ability.shield')} ${definition.mechanics.shield}` : '',
                    definition.mechanics?.healing ? `${t('ability.healing')} ${definition.mechanics.healing} + ${(definition.mechanics.apRatio ?? 0.4) * 100}% AP` : '',
                    definition.mechanics?.movementPercent ? `${t('ability.movement')} +${definition.mechanics.movementPercent * 100}%` : '',
                    definition.mechanics?.pullDuration ? `${t('ability.pull')} ${definition.mechanics.pullDuration}s` : '',
                    definition.mechanics?.trapDuration ? `${t('ability.trap')} ${definition.mechanics.trapDuration}s` : '',
                  ].filter(Boolean).join(' · ') : ability.slot}
                  aria-label={`${ability.slot} — ${definition ? t(definition.nameKey) : ability.slot}${definition ? `, ${t('ability.cost')} ${definition.cost}` : ''}`}
                  aria-keyshortcuts={ability.slot}
                  aria-pressed={state.aimingSlot === ability.slot}
                  disabled={!ability.ready || state.lifecycle !== 'running'}
                  onPointerDown={(event) => beginAbilityAim(event, ability.slot)}
                  onPointerMove={updateAbilityAim}
                  onPointerUp={finishAbilityAim}
                  onPointerCancel={cancelAbilityAim}
                  onClick={(event) => {
                    if (event.detail === 0) battleStore.request({ type: 'arm-cast', slot: ability.slot });
                  }}
                >
                  <span className="battle-ability__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSvg }} />
                  <span className="battle-ability__key">{t(`slot.${ability.slot}`)}</span>
                  {definition && <span className="battle-ability__cost">{definition.cost}</span>}
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
