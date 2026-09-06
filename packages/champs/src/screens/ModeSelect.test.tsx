import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import ModeSelect from './ModeSelect';

describe('ModeSelect', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders both game modes with localized names and descriptions', () => {
    render(<ModeSelect selected="rift" onSelect={() => {}} />);
    expect(screen.getByText(i18n.t('mode.rift'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('mode.aram'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('mode.riftDesc'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('mode.aramDesc'))).toBeInTheDocument();
  });

  it('calls onSelect with the chosen mode', () => {
    const onSelect = vi.fn();
    render(<ModeSelect selected="rift" onSelect={onSelect} />);
    fireEvent.click(screen.getByText(i18n.t('mode.aram')));
    expect(onSelect).toHaveBeenCalledWith('aram');
  });

  it('marks the currently selected mode as pressed', () => {
    render(<ModeSelect selected="aram" onSelect={() => {}} />);
    const aramCard = screen
      .getByText(i18n.t('mode.aram'))
      .closest('button');
    expect(aramCard).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onBack when the back button is used', () => {
    const onBack = vi.fn();
    render(<ModeSelect selected="rift" onSelect={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
