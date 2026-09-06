import { useTranslation } from 'react-i18next';
import type { Champion } from '../data/champions';
import ChampionFigure from './ChampionFigure';

interface ChampionCardProps {
  champion: Champion;
  selected?: boolean;
  /** Optional badge label, e.g. to mark the opponent. */
  badge?: string;
  onSelect?: (id: string) => void;
}

/** Two-letter initials used for the CSS-art portrait (no external images). */
function initials(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Selectable roster tile. The portrait frame is an accent-tinted gradient
 * (built from the champion's accent color) hosting the champion's illustrated
 * inline-SVG figure, with the initials kept as a subtle fallback tell behind
 * it. No binary image assets are required. Reused by the champion-select grid.
 */
export default function ChampionCard({
  champion,
  selected = false,
  badge,
  onSelect,
}: ChampionCardProps) {
  const { t } = useTranslation();
  const name = t(champion.nameKey);
  const portraitStyle = {
    background: `radial-gradient(circle at 30% 25%, ${champion.accentColor}, transparent 70%), linear-gradient(160deg, ${champion.accentColor}33, #010a13 85%)`,
    borderColor: champion.accentColor,
  };

  return (
    <button
      type="button"
      className={`champion-card${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${name} - ${t(champion.titleKey)}`}
      onClick={() => onSelect?.(champion.id)}
      style={selected ? { borderColor: champion.accentColor } : undefined}
    >
      {badge && <span className="champion-card__badge">{badge}</span>}
      <span className="champion-card__portrait" style={portraitStyle} aria-hidden="true">
        <span className="champion-card__initials">{initials(name)}</span>
        <ChampionFigure champion={champion} className="champion-card__figure" />
      </span>
      <span className="champion-card__name">{name}</span>
      <span className="champion-card__role">{t(`role.${champion.role}`)}</span>
    </button>
  );
}
