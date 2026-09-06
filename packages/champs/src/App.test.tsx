import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from './i18n';
import App from './App';

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the main menu heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Welcome to the Arena' }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Welcome to the Arena',
    );

    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    // React re-renders on language change; the heading should now be Korean.
    expect(
      await screen.findByText('아레나에 오신 것을 환영합니다'),
    ).toBeInTheDocument();
  });
});
