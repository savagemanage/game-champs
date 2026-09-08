import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import ModeSelect from './ModeSelect';

const baseProps = {
  selected: 'conquest' as const,
  matchKind: 'standard' as const,
  difficulty: 'normal' as const,
  onDifficultyChange: () => {},
  onSelect: () => {},
};

describe('ModeSelect', () => {
  beforeEach(async () => { await i18n.changeLanguage('en'); });

  it('renders both game modes plus the selected match kind and difficulties', () => {
    render(<ModeSelect {...baseProps} />);
    expect(screen.getByText(i18n.t('mode.conquest'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('mode.midline'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('matchKind.standard'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('difficulty.easy') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('difficulty.normal') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with the chosen mode', () => {
    const onSelect = vi.fn();
    render(<ModeSelect {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(i18n.t('mode.midline')));
    expect(onSelect).toHaveBeenCalledWith('midline');
  });

  it('updates difficulty through its explicit callback', () => {
    const onDifficultyChange = vi.fn();
    render(<ModeSelect {...baseProps} onDifficultyChange={onDifficultyChange} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('difficulty.hard') }));
    expect(onDifficultyChange).toHaveBeenCalledWith('hard');
  });

  it('marks the currently selected mode as pressed', () => {
    render(<ModeSelect {...baseProps} selected="midline" />);
    expect(screen.getByText(i18n.t('mode.midline')).closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onBack when the back button is used', () => {
    const onBack = vi.fn();
    render(<ModeSelect {...baseProps} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
