import { useTranslation } from 'react-i18next';
import type { Ability } from '../data/champions';
import { abilitySvgFor } from '../game/render/abilityIcons';

interface AbilityCardProps {
  ability: Ability;
  /** Accent color used for the slot badge, typically the champion's color. */
  accentColor?: string;
  /**
   * Owning champion id, used to resolve the flavored SVG skill icon. When
   * omitted the icon falls back to the ability's behavior glyph.
   */
  championId?: string;
  /** Current CDR-adjusted cooldown; selection cards omit it and use base cooldown. */
  effectiveCooldown?: number;
}

/**
 * Presentational card showing a single ability's slot, name, localized
 * tooltip, behavior tag, and key numeric stats. Reused by the champion select
 * detail panel and, later, the in-battle HUD.
 */
export default function AbilityCard({
  ability,
  accentColor = 'var(--color-gold)',
  championId,
  effectiveCooldown,
}: AbilityCardProps) {
  const { t } = useTranslation();
  const isPassive = ability.slot === 'P';
  const slotLabel = isPassive ? t('ability.passive') : t(`slot.${ability.slot}`);
  const iconSvg = abilitySvgFor(
    championId ?? '',
    ability.slot,
    ability.behavior,
  );

  return (
    <article className="ability-card" data-slot={ability.slot}>
      <div className="ability-card__head">
        <span
          className="ability-card__slot"
          style={{ borderColor: accentColor, color: accentColor }}
          aria-hidden="true"
        >
          <span
            className="ability-card__icon"
            dangerouslySetInnerHTML={{ __html: iconSvg }}
          />
          <span className="ability-card__slot-key">{t(`slot.${ability.slot}`)}</span>
        </span>
        <div className="ability-card__titles">
          <h4 className="ability-card__name">{t(ability.nameKey)}</h4>
          <span className="ability-card__meta">
            {slotLabel}
            {' · '}
            {t(`ability.behavior.${ability.behavior}`)}
          </span>
        </div>
      </div>

      <p className="ability-card__desc">{t(ability.descKey)}</p>

      <dl className="ability-card__stats">
        {!isPassive && (
          <div className="ability-card__stat">
            <dt>{t('ability.cooldown')}</dt>
            <dd>{t('ability.seconds', { value: effectiveCooldown ?? ability.cooldown })}</dd>
          </div>
        )}
        {ability.damage > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.damage')}</dt>
            <dd>{ability.damage} + {(ability.mechanics?.apRatio ?? 0.6) * 100}% AP</dd>
          </div>
        )}
        {(ability.mechanics?.healing ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.healing')}</dt>
            <dd>{ability.mechanics!.healing} + {(ability.mechanics?.apRatio ?? 0.4) * 100}% AP</dd>
          </div>
        )}
        {(ability.mechanics?.shield ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.shield')}</dt>
            <dd>{ability.mechanics!.shield}</dd>
          </div>
        )}
        {(ability.mechanics?.radius ?? (ability.behavior === 'aoe' ? 220 : 0)) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.radius')}</dt>
            <dd>{ability.mechanics?.radius ?? 220}</dd>
          </div>
        )}
        {(ability.mechanics?.armor ?? 0) !== 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.armor')}</dt>
            <dd>+{ability.mechanics!.armor}</dd>
          </div>
        )}
        {(ability.mechanics?.slowPercent ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.slow')}</dt>
            <dd>{ability.mechanics!.slowPercent! * 100}%</dd>
          </div>
        )}
        {(ability.mechanics?.movementPercent ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.movement')}</dt>
            <dd>+{ability.mechanics!.movementPercent! * 100}%</dd>
          </div>
        )}
        {(ability.mechanics?.pullDuration ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.pull')}</dt>
            <dd>{t('ability.seconds', { value: ability.mechanics!.pullDuration })}</dd>
          </div>
        )}
        {(ability.mechanics?.trapDuration ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.trap')}</dt>
            <dd>{t('ability.seconds', { value: ability.mechanics!.trapDuration })}</dd>
          </div>
        )}
        {ability.mechanics?.cleanseSlows && (
          <div className="ability-card__stat">
            <dt>{t('ability.cleanse')}</dt>
            <dd>✓</dd>
          </div>
        )}
        {(ability.mechanics?.duration ?? 0) > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.duration')}</dt>
            <dd>{t('ability.seconds', { value: ability.mechanics!.duration })}</dd>
          </div>
        )}
        {ability.range > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.range')}</dt>
            <dd>{ability.range}</dd>
          </div>
        )}
        {ability.cost > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.cost')}</dt>
            <dd>{ability.cost}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
