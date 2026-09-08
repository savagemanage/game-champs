import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from './i18n';
import App from './App';
import { createDefaultProfile, saveProfile, setLastSetup } from './profile';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  it('renders local match entries and loaded profile status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Arena Champions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('menu.standard') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('menu.practice') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('menu.tutorial') })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('profile.currency', { value: 500 }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('menu.continue') })).not.toBeInTheDocument();
  });

  it('offers Continue when a versioned profile has a last setup', () => {
    const profile = setLastSetup(createDefaultProfile(), {
      mode: 'conquest',
      matchKind: 'practice',
      difficulty: 'easy',
      playerChampionId: 'ashborne',
      enemyChampionId: 'nightveil',
    });
    saveProfile(profile);
    render(<App />);
    expect(screen.getByRole('button', { name: i18n.t('menu.continue') })).toBeInTheDocument();
  });

  it('routes a stale locked Continue setup through champion selection', () => {
    const profile = setLastSetup(createDefaultProfile(), {
      mode: 'midline',
      matchKind: 'standard',
      difficulty: 'hard',
      playerChampionId: 'nightveil',
      enemyChampionId: 'ashborne',
    });
    saveProfile(profile);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('menu.continue') }));
    expect(screen.getByRole('heading', { name: i18n.t('select.heading') })).toBeInTheDocument();
    const roster = screen.getByRole('listbox', { name: i18n.t('select.rosterLabel') });
    const lockedCard = within(roster).getByRole('option', { name: new RegExp(i18n.t('champions.nightveil.name')) });
    expect(lockedCard).toHaveAttribute('aria-selected', 'false');
    expect(lockedCard).toHaveAttribute('aria-disabled', 'true');
  });

  it('uses sensible standard and tutorial defaults in the mode flow', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('menu.standard') }));
    expect(screen.getByText(i18n.t('matchKind.standard'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('difficulty.normal') })).toHaveAttribute('aria-pressed', 'true');
    unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('menu.tutorial') }));
    expect(screen.getByText(i18n.t('matchKind.tutorial'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('difficulty.easy') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a settings control reachable without the header bar', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Open settings and help' })).toBeInTheDocument();
  });

  it('switches visible text and the document language between English and Korean', async () => {
    render(<App />);
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    expect(await screen.findByText('살아 움직이는 아레나에 입장하세요')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ko');
  });
});
