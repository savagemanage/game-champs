import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import ChampionSelect from './ChampionSelect';
import { CHAMPIONS } from '../data/champions';

describe('ChampionSelect', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the full roster', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    for (const champion of CHAMPIONS) {
      const name = i18n.t(champion.nameKey);
      // Names appear in the roster (and possibly the opponent picker), so use getAllByText.
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('shows the selected champion detail panel with localized ability tooltips', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    const first = CHAMPIONS[0];
    // The first champion is selected by default; its passive desc should render.
    expect(
      screen.getByText(i18n.t(first.passive.descKey)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t(first.abilities[3].nameKey)),
    ).toBeInTheDocument();
  });

  it('updates the detail panel when a different champion is selected', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    const target = CHAMPIONS[3];
    const card = screen.getByRole('button', {
      name: new RegExp(i18n.t(target.nameKey)),
    });
    fireEvent.click(card);
    expect(
      screen.getByText(i18n.t(target.passive.descKey)),
    ).toBeInTheDocument();
  });

  it('Lock In triggers the battle transition with player + enemy ids', () => {
    const onLockIn = vi.fn();
    render(<ChampionSelect onLockIn={onLockIn} />);

    fireEvent.click(screen.getByRole('button', { name: i18n.t('select.lockIn') }));

    expect(onLockIn).toHaveBeenCalledTimes(1);
    const [playerId, enemyId] = onLockIn.mock.calls[0];
    expect(CHAMPIONS.map((c) => c.id)).toContain(playerId);
    expect(CHAMPIONS.map((c) => c.id)).toContain(enemyId);
    expect(playerId).toBe(CHAMPIONS[0].id);
  });

  it('lets the player choose the opponent from the picker', () => {
    const onLockIn = vi.fn();
    render(<ChampionSelect onLockIn={onLockIn} />);

    const picker = screen.getByRole('combobox', {
      name: i18n.t('select.opponentHeading'),
    });
    const opponent = CHAMPIONS[2];
    fireEvent.change(picker, { target: { value: opponent.id } });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('select.lockIn') }));
    const [, enemyId] = onLockIn.mock.calls[0];
    expect(enemyId).toBe(opponent.id);
  });

  it('calls onBack when the back button is used', () => {
    const onBack = vi.fn();
    render(<ChampionSelect onLockIn={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
