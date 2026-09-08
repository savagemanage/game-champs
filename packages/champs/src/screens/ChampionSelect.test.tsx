import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import i18n from '../i18n';
import ChampionSelect, { CHAMPION_UNLOCK_COST } from './ChampionSelect';
import { CHAMPIONS } from '../data/champions';
import { createDefaultProfile, type ChampsProfile } from '../profile';

const renderSelect = (props: Partial<ComponentProps<typeof ChampionSelect>> = {}, profile: ChampsProfile = createDefaultProfile()) =>
  render(
    <ChampionSelect
      profile={profile}
      accountLevel={1}
      onUnlock={() => {}}
      onLockIn={() => {}}
      {...props}
    />,
  );

describe('ChampionSelect', () => {
  beforeEach(async () => { await i18n.changeLanguage('en'); });

  it('renders all five champion cards and marks locked champions', () => {
    renderSelect();
    const roster = screen.getByRole('listbox', { name: i18n.t('select.rosterLabel') });
    const cards = within(roster).getAllByRole('option');
    expect(cards).toHaveLength(CHAMPIONS.length);
    expect(cards.filter((card) => card.getAttribute('aria-disabled') === 'true')).toHaveLength(2);
  });

  it('marks the first starter champion as the self pick by default', () => {
    renderSelect();
    const roster = screen.getByRole('listbox', { name: i18n.t('select.rosterLabel') });
    expect(within(roster).getByRole('option', { name: new RegExp(i18n.t(CHAMPIONS[0].nameKey)) })).toHaveAttribute('aria-selected', 'true');
  });

  it('never silently selects a locked champion and offers an accessible unlock', () => {
    const onUnlock = vi.fn();
    renderSelect({ onUnlock });
    const locked = CHAMPIONS[1];
    const card = within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(i18n.t(locked.nameKey)) });
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-selected', 'false');
    const unlock = screen.getByRole('button', { name: i18n.t('select.unlockAria', { champion: i18n.t(locked.nameKey), cost: CHAMPION_UNLOCK_COST }) });
    fireEvent.click(unlock);
    expect(onUnlock).toHaveBeenCalledWith(locked.id);
  });

  it('selecting an unlocked starter updates the player pick', () => {
    const onLockIn = vi.fn();
    renderSelect({ onLockIn });
    const target = CHAMPIONS[2];
    const card = within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(i18n.t(target.nameKey)) });
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('select.findMatch') }));
    expect(onLockIn.mock.calls[0][0]).toBe(target.id);
  });

  it('exposes selected champion stats and abilities via the detail drawer', () => {
    renderSelect();
    const first = CHAMPIONS[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i18n.t(first.nameKey)) }));
    expect(screen.getByText(i18n.t(first.passive.descKey))).toBeInTheDocument();
    expect(screen.getByText(i18n.t(first.abilities[3].nameKey))).toBeInTheDocument();
  });

  it('fires onLockIn with distinct player and enemy ids', () => {
    const onLockIn = vi.fn();
    renderSelect({ onLockIn });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('select.findMatch') }));
    expect(onLockIn).toHaveBeenCalledTimes(1);
    const [playerId, enemyId] = onLockIn.mock.calls[0];
    expect(playerId).toBe(CHAMPIONS[0].id);
    expect(enemyId).not.toBe(playerId);
  });

  it('lets the player choose a distinct opponent from the picker', () => {
    const onLockIn = vi.fn();
    renderSelect({ onLockIn });
    const opponent = CHAMPIONS[2];
    fireEvent.change(screen.getByRole('combobox', { name: i18n.t('select.opponentHeading') }), { target: { value: opponent.id } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('select.findMatch') }));
    expect(onLockIn.mock.calls[0][1]).toBe(opponent.id);
  });

  it('shows profile level, currency, mastery, and tutorial completion', () => {
    const profile = { ...createDefaultProfile(), tutorialCompleted: true };
    renderSelect({}, profile);
    expect(screen.getAllByText(i18n.t('profile.accountLevel', { value: 1 })).length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t('profile.masteryLevel', { value: 1 }))).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t('profile.tutorialComplete')).length).toBeGreaterThan(0);
  });

  it('calls onBack when the back button is used', () => {
    const onBack = vi.fn();
    renderSelect({ onBack });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
