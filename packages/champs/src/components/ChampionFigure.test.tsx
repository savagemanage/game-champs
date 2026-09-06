import { render } from '@testing-library/react';
import ChampionFigure from './ChampionFigure';
import { CHAMPIONS } from '../data/champions';

describe('ChampionFigure', () => {
  it('renders an inline <svg> element for the champion', () => {
    const { container } = render(<ChampionFigure champion={CHAMPIONS[0]} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('is decorative (aria-hidden) so it adds no accessible text', () => {
    const { container } = render(<ChampionFigure champion={CHAMPIONS[0]} />);
    const wrapper = container.querySelector('.champion-figure');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies the extra sizing class alongside the base class', () => {
    const { container } = render(
      <ChampionFigure champion={CHAMPIONS[0]} className="champion-card__figure" />,
    );
    const wrapper = container.querySelector('.champion-figure');
    expect(wrapper?.classList.contains('champion-card__figure')).toBe(true);
  });

  it('renders different art for the enemy team tint', () => {
    const ally = render(<ChampionFigure champion={CHAMPIONS[0]} team="ally" />);
    const enemy = render(
      <ChampionFigure champion={CHAMPIONS[0]} team="enemy" />,
    );
    const allySvg = ally.container.querySelector('.champion-figure')?.innerHTML;
    const enemySvg = enemy.container.querySelector('.champion-figure')?.innerHTML;
    expect(allySvg).toBeTruthy();
    expect(enemySvg).toBeTruthy();
    expect(allySvg).not.toBe(enemySvg);
  });
});
