import { useTranslation } from 'react-i18next';
import type { Ability } from '../data/champions';

interface AbilityCardProps {
  ability: Ability;
  /** Accent color used for the slot badge, typically the champion's color. */
  accentColor?: string;
}

/**
 * Presentational card showing a single ability's slot, name, localized
 * tooltip, behavior tag, and key numeric stats. Reused by the champion select
 * detail panel and, later, the in-battle HUD.
 */
export default function AbilityCard({
  ability,
  accentColor = 'var(--color-gold)',
}: AbilityCardProps) {
  const { t } = useTranslation();
  const isPassive = ability.slot === 'P';
  const slotLabel = isPassive ? t('ability.passive') : t(`slot.${ability.slot}`);

  return (
    <article className="ability-card" data-slot={ability.slot}>
      <div className="ability-card__head">
        <span
          className="ability-card__slot"
          style={{ borderColor: accentColor, color: accentColor }}
          aria-hidden="true"
        >
          {t(`slot.${ability.slot}`)}
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
            <dd>{t('ability.seconds', { value: ability.cooldown })}</dd>
          </div>
        )}
        {ability.damage > 0 && (
          <div className="ability-card__stat">
            <dt>{t('ability.damage')}</dt>
            <dd>{ability.damage}</dd>
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
