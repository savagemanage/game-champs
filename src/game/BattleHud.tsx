import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { battleStore } from './battleStore';
import { getChampionById } from '../data/champions';

/**
 * React overlay HUD rendered on top of the Phaser canvas. It subscribes to the
 * shared `battleStore` via `useSyncExternalStore`, so it re-renders in lockstep
 * with the scene's per-frame updates without React ever touching Phaser. All
 * text is localized.
 */
export default function BattleHud() {
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
      <div className="battle-hud__objective">
        <span className="battle-hud__team battle-hud__team--ally">
          {t(player.nameKey)}
        </span>
        <div className="battle-hud__nexus-bars">
          <div className="battle-hud__nexus">
            <span className="battle-hud__nexus-label">{t('battle.yourNexus')}</span>
            <div className="battle-hud__nexus-track">
              <div
                className="battle-hud__nexus-fill battle-hud__nexus-fill--ally"
                style={{ width: `${Math.round(state.allyNexusPct * 100)}%` }}
              />
            </div>
          </div>
          <span className="battle-hud__timer">
            {formatTime(state.elapsed)}
          </span>
          <div className="battle-hud__nexus">
            <span className="battle-hud__nexus-label">{t('battle.enemyNexus')}</span>
            <div className="battle-hud__nexus-track">
              <div
                className="battle-hud__nexus-fill battle-hud__nexus-fill--enemy"
                style={{ width: `${Math.round(state.enemyNexusPct * 100)}%` }}
              />
            </div>
          </div>
        </div>
        <span className="battle-hud__team battle-hud__team--enemy">
          {t(enemy.nameKey)}
        </span>
      </div>

      <p className="battle-hud__hint">{t('battle.controlsHint')}</p>

      {/* Bottom player status + ability bar. */}
      <div className="battle-hud__bottom">
        <div className="battle-hud__champion">
          <span
            className="battle-hud__portrait"
            style={{ borderColor: player.accentColor, color: player.accentColor }}
          >
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

        <div className="battle-hud__enemy">
          <span className="battle-hud__enemy-name">{t(enemy.nameKey)}</span>
          <div className="battle-hud__bar battle-hud__bar--enemy">
            <div
              className="battle-hud__bar-fill battle-hud__bar-fill--enemy"
              style={{ width: hpPct(state.enemyHp, state.enemyMaxHp) }}
            />
            <span className="battle-hud__bar-text">
              {state.enemyHp} / {state.enemyMaxHp}
            </span>
          </div>
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
