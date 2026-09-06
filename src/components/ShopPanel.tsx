import { useSyncExternalStore, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { battleStore } from '../game/battleStore';
import { ITEMS } from '../data/items';
import { recommendPurchase } from '../game/rift/loadout';
import { getChampionById } from '../data/champions';

interface ShopPanelProps {
  /** Whether the shop overlay is currently open. */
  open: boolean;
  /** Close the shop (also called after the player leaves base). */
  onClose: () => void;
}

/**
 * In-battle React item shop. It reads the shared `battleStore` (gold, owned
 * items, whether the shop is available because the player is in base) via
 * `useSyncExternalStore`, lists the `items.ts` catalog with localized name,
 * description and cost, disables items that are owned or unaffordable, and
 * routes a purchase through `battleStore.requestPurchase` - the channel the
 * Phaser scene drains each frame to validate gold and apply item modifiers.
 *
 * All text comes from the `shop.*` and `items.*` i18n namespaces (present in
 * both locales). The panel auto-closes if the player walks out of base.
 */
export default function ShopPanel({ open, onClose }: ShopPanelProps) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    battleStore.subscribe,
    battleStore.getSnapshot,
  );

  // Close automatically when the player is no longer in base (shop gone).
  useEffect(() => {
    if (open && !state.shopAvailable) onClose();
  }, [open, state.shopAvailable, onClose]);

  if (!open || !state.shopAvailable) return null;

  const player = getChampionById(state.playerChampionId);
  const owned = new Set(state.ownedItems);
  const recommended = player
    ? recommendPurchase(player.role, state.gold, state.ownedItems)
    : undefined;

  return (
    <div
      className="shop-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('shop.title')}
      onClick={onClose}
    >
      <div className="shop-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shop-panel__head">
          <h2 className="shop-panel__title">{t('shop.title')}</h2>
          <span className="shop-panel__gold">
            <span className="shop-panel__gold-icon" aria-hidden="true">◈</span>
            {state.gold} {t('shop.gold')}
          </span>
          <button
            type="button"
            className="shop-panel__close"
            aria-label={t('shop.close')}
            onClick={onClose}
          >
            {'\u2715'}
          </button>
        </div>

        <ul className="shop-panel__list">
          {ITEMS.map((item) => {
            const isOwned = owned.has(item.id);
            const affordable = state.gold >= item.cost;
            const disabled = isOwned || !affordable;
            const isRecommended = recommended?.id === item.id;
            return (
              <li
                key={item.id}
                className={`shop-item${item.legendary ? ' shop-item--legendary' : ''}${isOwned ? ' is-owned' : ''}${isRecommended ? ' is-recommended' : ''}`}
              >
                <div className="shop-item__head">
                  <span className="shop-item__name">{t(item.nameKey)}</span>
                  {isRecommended && !isOwned && (
                    <span className="shop-item__tag">{t('shop.recommended')}</span>
                  )}
                </div>
                <p className="shop-item__desc">{t(item.descKey)}</p>
                <div className="shop-item__foot">
                  <span className="shop-item__cost">
                    <span aria-hidden="true">◈</span> {item.cost}
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary shop-item__buy"
                    disabled={disabled}
                    onClick={() => battleStore.requestPurchase(item.id)}
                  >
                    {isOwned
                      ? t('shop.owned')
                      : !affordable
                        ? t('shop.notEnoughGold')
                        : t('shop.buy')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
