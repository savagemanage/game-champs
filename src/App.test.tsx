import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from './i18n';
import App from './App';

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the translated app title', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Arena Champions' }),
    ).toBeInTheDocument();
  });

  it('switches visible text between English and Korean via the language toggle', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Arena Champions',
    );

    fireEvent.click(screen.getByRole('button', { name: '한국어' }));
    // React re-renders on language change; the heading should now be Korean.
    expect(await screen.findByText('아레나 챔피언스')).toBeInTheDocument();
  });
});
