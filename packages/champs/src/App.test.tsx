import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from './i18n';
import App from './App';

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the main menu title and eyebrow', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Arena Champions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ENTER THE LIVING ARENA')).toBeInTheDocument();
  });

  it('keeps a settings control reachable without the header bar', () => {
    render(<App />);
    // The old header bar is gone; the floating gear button must remain (as a
    // real, labelled button) so the settings/help panel and its language
    // toggle stay one click away on every screen.
    const settings = screen.getByRole('button', {
      name: 'Open settings and help',
    });
    expect(settings).toBeInTheDocument();
    expect(settings.tagName).toBe('BUTTON');
  });

  it('switches visible text between English and Korean via the language toggle', async () => {
    render(<App />);
    expect(screen.getByText('ENTER THE LIVING ARENA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    // React re-renders on language change; the eyebrow should now be Korean.
    expect(
      await screen.findByText('살아 움직이는 아레나에 입장하세요'),
    ).toBeInTheDocument();
  });
});
