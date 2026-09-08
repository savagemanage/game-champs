import { describe, expect, it, vi } from 'vitest';
import {
  BattleStore,
  DEFAULT_DIFFICULTY,
  DEFAULT_MATCH_KIND,
} from './battleStore';

describe('BattleStore', () => {
  it('provides stable defaults for local match metadata', () => {
    expect(DEFAULT_MATCH_KIND).toBe('standard');
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('resets the expanded life and match HUD contract', () => {
    const store = new BattleStore();
    store.reset('ashborne', 'nightveil', 'midline');

    expect(store.getSnapshot()).toMatchObject({
      mode: 'midline',
      playerChampionId: 'ashborne',
      enemyChampionId: 'nightveil',
      objectives: [],
      playerLife: {
        phase: 'alive',
        deaths: 0,
        respawnSeconds: 0,
        invulnerableSeconds: 0,
      },
      matchStatus: {
        phase: 'regulation',
        suddenDeath: false,
        hardCapSecondsRemaining: 0,
      },
    });
  });

  it('notifies subscribers and drains authoritative purchase requests once', () => {
    const store = new BattleStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.reset('ashborne', 'nightveil');
    expect(listener).toHaveBeenCalledTimes(1);

    store.requestPurchase('swiftBoots');
    store.requestPurchase('shortsword');
    expect(store.consumePurchases()).toEqual(['swiftBoots', 'shortsword']);
    expect(store.consumePurchases()).toEqual([]);

    unsubscribe();
    store.reset('ashborne', 'nightveil');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
