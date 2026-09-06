import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { battleStore } from './battleStore';
import { getChampionById } from '../data/champions';

interface BattleHudProps {
  /** Open the item shop (also bound to the `B` key by the battle screen). */
  onOpenShop?: () => void;
}

/**
 * React overlay HUD rendered on top of the Phaser canvas. It subscribes to the
 * shared `battleStore` via `useSyncExternalStore`, so it re-renders in lockstep
 * with the scene's per-frame updates without React ever touching Phaser. It
 * shows gold, level/XP, active buffs, objective timers + dragon stacks, both
 * teams' structure status, a minimap, and the player ability bar. All text is
 * localized.
 */
export default function BattleHud({ onOpenShop }: BattleHudProps) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    battleStore.subscribe,
    battleStore.getSnapshot,
  );

  const player = getChampionById(state.playerChampionId);
  const enemy = getChampionById(state.enemyChampionId);
  if (!player || !enemy) return null;

  const hpPct = (hp: number, max: number) =>
    `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;

  return (
    <div className="battle-hud" aria-live="polite">
      {/* Top objective / structures bar. */}
      <div className="battle-hud__topbar">
        <div className="battle-hud__structures battle-hud__structures--ally">
          <span className="battle-hud__team battle-hud__team--ally">{t(player.nameKey)}</span>
          <span className="battle-hud__struct">
            {t('hud.turrets')} {state.allyStructures.turrets}/{state.allyStructures.turretsMax}
          </span>
          <span className="battle-hud__struct">
            {t('hud.inhibitors')} {state.allyStructures.inhibitors}/{state.allyStructures.inhibitorsMax}
          </span>
        </div>

        <div className="battle-hud__center">
          <span className="battle-hud__mode">{t(`mode.${state.mode}`)}</span>
          <span className="battle-hud__timer">{formatTime(state.elapsed)}</span>
        </div>

        <div className="battle-hud__structures battle-hud__structures--enemy">
          <span className="battle-hud__team battle-hud__team--enemy">{t(enemy.nameKey)}</span>
          <span className="battle-hud__struct">
            {t('hud.turrets')} {state.enemyStructures.turrets}/{state.enemyStructures.turretsMax}
          </span>
          <span className="battle-hud__struct">
            {t('hud.inhibitors')} {state.enemyStructures.inhibitors}/{state.enemyStructures.inhibitorsMax}
          </span>
        </div>
      </div>

      {/* Objective timers + dragon stacks. */}
      <div className="battle-hud__objectives">
        {state.objectives.map((obj) => (
          <span
            key={obj.id}
            className={`battle-hud__objective${obj.alive ? ' is-alive' : ''}`}
          >
            {t(`objective.${obj.id}`)}
            {': '}
            {obj.alive ? t('hud.alive') : formatTime(obj.spawnsIn)}
          </span>
        ))}
        <span className="battle-hud__dragons">
          {t('objective.dragon')} ×{state.dragonStacks}
        </span>
      </div>

      {/* Minimap. */}
      <div className="battle-hud__minimap" aria-label={t('hud.minimap')}>
        {state.minimap.map((blip) => (
          <span
            key={blip.id}
            className={`battle-hud__blip battle-hud__blip--${blip.team} battle-hud__blip--${blip.kind}`}
            style={{ left: `${blip.x * 100}%`, top: `${blip.y * 100}%` }}
          />
        ))}
      </div>

      <p className="battle-hud__hint">{t('battle.controlsHint')}</p>

      {/* Bottom player status + ability bar. */}
      <div className="battle-hud__bottom">
        <div className="battle-hud__champion">
          <span
            className="battle-hud__portrait"
            style={{ borderColor: player.accentColor, color: player.accentColor }}
          >
            <span className="battle-hud__level">{state.level}</span>
            {player.id.slice(0, 2).toUpperCase()}
          </span>
          <div className="battle-hud__bars">
            <div className="battle-hud__bar-row">
              <span className="battle-hud__bar-label">{t('stat.hp')}</span>
              <div className="battle-hud__bar battle-hud__bar--hp">
                <div
                  className="battle-hud__bar-fill battle-hud__bar-fill--hp"
                  style={{ width: hpPct(state.playerHp, state.playerMaxHp) }}
                />
                <span className="battle-hud__bar-text">
                  {state.playerHp} / {state.playerMaxHp}
                </span>
              </div>
            </div>
            <div className="battle-hud__bar-row">
              <span className="battle-hud__bar-label">{t('battle.resource')}</span>
              <div className="battle-hud__bar battle-hud__bar--mana">
                <div
                  className="battle-hud__bar-fill battle-hud__bar-fill--mana"
                  style={{ width: hpPct(state.playerResource, state.playerMaxResource) }}
                />
                <span className="battle-hud__bar-text">
                  {state.playerResource} / {state.playerMaxResource}
                </span>
              </div>
            </div>
            <div className="battle-hud__bar-row">
              <span className="battle-hud__bar-label">{t('hud.xp')}</span>
              <div className="battle-hud__bar battle-hud__bar--xp">
                <div
                  className="battle-hud__bar-fill battle-hud__bar-fill--xp"
                  style={{ width: `${Math.round(state.xpPct * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="battle-hud__abilities">
          {state.abilities.map((ability, index) => {
            const def = player.abilities[index];
            return (
              <div
                key={ability.slot}
                className={`battle-ability${ability.ready ? ' is-ready' : ' is-cooling'}`}
                style={{ borderColor: player.accentColor }}
                title={def ? t(def.nameKey) : ability.slot}
              >
                <span className="battle-ability__key">{t(`slot.${ability.slot}`)}</span>
                {!ability.ready && (
                  <>
                    <span
                      className="battle-ability__cooldown"
                      style={{ height: `${(1 - ability.progress) * 100}%` }}
                    />
                    <span className="battle-ability__timer">{ability.remaining}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="battle-hud__side">
          <div className="battle-hud__gold">
            <span aria-hidden="true">◈</span> {state.gold}
          </div>
          {state.buffs.length > 0 && (
            <div className="battle-hud__buffs">
              {state.buffs.map((buff) => (
                <span
                  key={buff.kind}
                  className={`battle-hud__buff battle-hud__buff--${buff.kind}`}
                  title={t(`buff.${buff.kind}`)}
                >
                  {t(`buff.${buff.kind}`)} {buff.remaining}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn battle-hud__shop"
            onClick={onOpenShop}
            disabled={!state.shopAvailable}
          >
            {t('shop.open')} (B)
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
