import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../i18n';
import type { MatchRequest } from '../game/matchRequest';
import BattleScreen from './BattleScreen';

vi.mock('../game/PhaserGame', () => ({
  default: ({ onReady, onError }: { onReady: () => void; onError: (error: unknown) => void }) => (
    <>
      <button type="button" onClick={onReady}>Complete Phaser readiness</button>
      <button type="button" onClick={() => onError(new Error('renderer unavailable'))}>Fail Phaser startup</button>
    </>
  ),
}));

vi.mock('../game/BattleHud', () => ({
  default: () => <div data-testid="battle-hud">Battle HUD</div>,
}));

const MATCH: MatchRequest = {
  matchId: 'local-1-test',
  matchSeed: 'test',
  mode: 'conquest',
  matchKind: 'practice',
  difficulty: 'easy',
  playerChampionId: 'ashborne',
  enemyChampionId: 'nightveil',
};

describe('BattleScreen readiness', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('keeps the stage busy and HUD unavailable until Phaser reports ready', async () => {
    render(
      <BattleScreen
        match={MATCH}
        matchNonce={1}
        onGameEnd={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(i18n.t('common.loading'));
    expect(status.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('battle-hud')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Complete Phaser readiness' }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('battle-hud')).toBeInTheDocument();
      expect(screen.getByTestId('battle-hud').parentElement).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('shows an error fallback without exposing the HUD when Phaser fails', async () => {
    render(
      <BattleScreen
        match={MATCH}
        matchNonce={1}
        onGameEnd={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fail Phaser startup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('battle.loadError'));
    expect(screen.getByRole('alert').parentElement).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('battle-hud')).not.toBeInTheDocument();
  });

  it('returns to loading when a new match nonce mounts', async () => {
    const { rerender } = render(
      <BattleScreen
        match={MATCH}
        matchNonce={1}
        onGameEnd={vi.fn()}
        onQuit={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Phaser readiness' }));
    await screen.findByTestId('battle-hud');

    rerender(
      <BattleScreen
        match={MATCH}
        matchNonce={2}
        onGameEnd={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('battle-hud')).not.toBeInTheDocument();
  });
});
