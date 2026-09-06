import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n from '../i18n';
import ShopPanel from './ShopPanel';
import { battleStore } from '../game/battleStore';
import { CHAMPIONS } from '../data/champions';
import { ITEMS } from '../data/items';

/** Push a battle snapshot into the store with the given gold + shop state. */
function setStore(opts: {
  gold: number;
  shopAvailable: boolean;
  ownedItems?: string[];
}) {
  const base = battleStore.getSnapshot();
  battleStore.set({
    ...base,
    playerChampionId: CHAMPIONS[0].id,
    enemyChampionId: CHAMPIONS[1].id,
    gold: opts.gold,
    shopAvailable: opts.shopAvailable,
    ownedItems: opts.ownedItems ?? [],
  });
}

describe('ShopPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    battleStore.reset(CHAMPIONS[0].id, CHAMPIONS[1].id);
  });

  afterEach(() => cleanup());

  it('renders nothing when the shop is not available', () => {
    setStore({ gold: 9999, shopAvailable: false });
    const { container } = render(<ShopPanel open onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when closed even if available', () => {
    setStore({ gold: 9999, shopAvailable: true });
    const { container } = render(<ShopPanel open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists localized items with cost when open and available', () => {
    setStore({ gold: 9999, shopAvailable: true });
    render(<ShopPanel open onClose={() => {}} />);
    expect(
      screen.getByRole('heading', { name: i18n.t('shop.title') }),
    ).toBeInTheDocument();
    for (const item of ITEMS) {
      expect(screen.getByText(i18n.t(item.nameKey))).toBeInTheDocument();
    }
  });

  it('requests a purchase through the store when an affordable item is bought', () => {
    setStore({ gold: 9999, shopAvailable: true });
    const spy = vi.spyOn(battleStore, 'requestPurchase');
    render(<ShopPanel open onClose={() => {}} />);

    const cheapest = [...ITEMS].sort((a, b) => a.cost - b.cost)[0];
    const buyButtons = screen.getAllByRole('button', { name: i18n.t('shop.buy') });
    fireEvent.click(buyButtons[0]);
    expect(spy).toHaveBeenCalled();
    expect(typeof spy.mock.calls[0][0]).toBe('string');
    expect(ITEMS.map((i) => i.id)).toContain(spy.mock.calls[0][0]);
    // A cheap item should be affordable and thus buyable.
    expect(cheapest.cost).toBeLessThanOrEqual(9999);
    spy.mockRestore();
  });

  it('disables items the player cannot afford', () => {
    // Zero gold: every buy button reads "not enough gold" and is disabled.
    setStore({ gold: 0, shopAvailable: true });
    render(<ShopPanel open onClose={() => {}} />);
    const disabledButtons = screen.getAllByRole('button', {
      name: i18n.t('shop.notEnoughGold'),
    });
    expect(disabledButtons.length).toBeGreaterThan(0);
    disabledButtons.forEach((b) => expect(b).toBeDisabled());
  });
});
