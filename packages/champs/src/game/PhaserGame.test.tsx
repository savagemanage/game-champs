import { render, waitFor } from '@testing-library/react';

const gameConstructor = vi.hoisted(() => vi.fn());

vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Scene: class Scene {},
    Game: gameConstructor,
  },
}));

import PhaserGame from './PhaserGame';

describe('PhaserGame startup failure', () => {
  beforeEach(() => {
    gameConstructor.mockReset();
  });

  it('reports an error without settling readiness when Phaser construction fails', async () => {
    gameConstructor.mockImplementation(() => {
      throw new Error('renderer unavailable');
    });
    const onReady = vi.fn();
    const onError = vi.fn();

    render(
      <PhaserGame
        playerChampionId="ashborne"
        enemyChampionId="nightveil"
        mode="conquest"
        matchKind="practice"
        difficulty="easy"
        matchNonce={1}
        onGameEnd={vi.fn()}
        onReady={onReady}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onReady).not.toHaveBeenCalled();
  });
});
