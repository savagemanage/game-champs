import { useMemo } from 'react';
import type { Champion } from '../data/champions';
import { championArtSvg, type SpriteTeam } from '../game/render/svgArt';

interface ChampionFigureProps {
  champion: Champion;
  /** Which team tint to use for the rim tell (matches the battle art). */
  team?: SpriteTeam;
  /** Extra class for CSS sizing of the wrapper. */
  className?: string;
}

/**
 * Purely decorative inline-SVG champion illustration. It reuses the same
 * Phaser-free art path the battle renderer uses ({@link championArtSvg}), so
 * the figure in the DOM UI matches what the player sees in battle, tinted by
 * the champion's accent and the ally/enemy rim.
 *
 * The SVG string is rendered inline via `dangerouslySetInnerHTML` so it scales
 * crisply and inherits sizing from CSS. The markup is generated entirely from
 * our own trusted, deterministic builders (no user input), so there is no
 * injection risk. The wrapper is `aria-hidden` because the illustration is
 * decorative and the champion name is always shown as real text nearby.
 */
export default function ChampionFigure({
  champion,
  team = 'ally',
  className,
}: ChampionFigureProps) {
  const svg = useMemo(() => championArtSvg(champion, team), [champion, team]);
  const wrapperClass = className
    ? `champion-figure ${className}`
    : 'champion-figure';

  return (
    <span
      className={wrapperClass}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
