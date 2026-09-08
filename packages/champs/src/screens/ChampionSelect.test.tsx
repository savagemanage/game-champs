import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import ChampionSelect from './ChampionSelect';
import { CHAMPIONS } from '../data/champions';

describe('ChampionSelect', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders every champion card as a selectable option', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    // Scope to the roster listbox: the opponent <select> also exposes `option`
    // roles, so query within the lobby card grid specifically.
    const roster = screen.getByRole('listbox', {
      name: i18n.t('select.rosterLabel'),
    });
    const cards = within(roster).getAllByRole('option');
    expect(cards).toHaveLength(CHAMPIONS.length);
    expect(CHAMPIONS.length).toBeGreaterThanOrEqual(10);
    for (const champion of CHAMPIONS) {
      const name = i18n.t(champion.nameKey);
      // Names appear on the lobby cards (and in the opponent picker), so use getAllByText.
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('marks the first champion as the self pick by default', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    const roster = screen.getByRole('listbox', {
      name: i18n.t('select.rosterLabel'),
    });
    const first = within(roster).getByRole('option', {
      name: new RegExp(i18n.t(CHAMPIONS[0].nameKey)),
    });
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('selecting a different card updates the player pick', () => {
    const onLockIn = vi.fn();
    render(<ChampionSelect onLockIn={onLockIn} />);
    const roster = screen.getByRole('listbox', {
      name: i18n.t('select.rosterLabel'),
    });
    const target = CHAMPIONS[3];
    const card = within(roster).getByRole('option', {
      name: new RegExp(i18n.t(target.nameKey)),
    });
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-selected', 'true');

    // Locking in should now carry the newly selected champion as the player id.
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('select.findMatch') }),
    );
    expect(onLockIn.mock.calls[0][0]).toBe(target.id);
  });

  it('exposes the selected champion stats + ability tooltips via the detail drawer', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    const first = CHAMPIONS[0];
    // The detail drawer is collapsed by default; open it.
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(i18n.t(first.nameKey)) }),
    );
    expect(
      screen.getByText(i18n.t(first.passive.descKey)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t(first.abilities[3].nameKey)),
    ).toBeInTheDocument();
  });

  it('renders the FIND MATCH button and fires onLockIn with player + enemy ids', () => {
    const onLockIn = vi.fn();
    render(<ChampionSelect onLockIn={onLockIn} />);

    const findMatch = screen.getByRole('button', {
      name: i18n.t('select.findMatch'),
    });
    expect(findMatch).toBeInTheDocument();
    fireEvent.click(findMatch);

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

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('select.findMatch') }),
    );
    const [, enemyId] = onLockIn.mock.calls[0];
    expect(enemyId).toBe(opponent.id);
  });

  it('renders the decorative social/friends panel', () => {
    render(<ChampionSelect onLockIn={() => {}} />);
    expect(
      screen.getByRole('complementary', { name: i18n.t('client.social.title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: i18n.t('client.social.title') }),
    ).toBeInTheDocument();
  });

  it('calls onBack when the back button is used', () => {
    const onBack = vi.fn();
    render(<ChampionSelect onLockIn={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
