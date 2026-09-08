import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { battleStore } from '../game/battleStore';
import { ITEMS } from '../data/items';
import { recommendPurchase } from '../game/rift/loadout';
import { getChampionById } from '../data/champions';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

interface ShopPanelProps {
  /** Whether the shop overlay is currently open. */
  open: boolean;
  /** Close the shop (also called after the player leaves base). */
  onClose: () => void;
}

/**
 * In-battle item shop. Purchases are queued through the battle store so Phaser
 * remains authoritative, while React owns the accessible modal presentation.
 */
export default function ShopPanel({ open, onClose }: ShopPanelProps) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    battleStore.subscribe,
    battleStore.getSnapshot,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [purchaseStatus, setPurchaseStatus] = useState('');
  const visible = open && state.shopAvailable;
  const panelRef = useDialogFocusTrap<HTMLDivElement>(
    visible,
    onClose,
    closeButtonRef,
  );

  // Close automatically when the player leaves the base shop zone.
  useEffect(() => {
    if (open && !state.shopAvailable) onClose();
  }, [open, state.shopAvailable, onClose]);

  useEffect(() => {
    if (!visible) setPurchaseStatus('');
  }, [visible]);

  if (!visible) return null;

  const player = getChampionById(state.playerChampionId);
  const owned = new Set(state.ownedItems);
  const recommended = player
    ? recommendPurchase(player.role, state.gold, state.ownedItems)
    : undefined;

  const dialog = (
    <div
      className="shop-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="shop-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
        tabIndex={-1}
      >
        <div className="shop-panel__head">
          <div className="shop-panel__heading-group">
            <span className="shop-panel__eyebrow">{t('shop.recommended')}</span>
            <h2 id="shop-title" className="shop-panel__title">{t('shop.title')}</h2>
          </div>
          <span className="shop-panel__gold" aria-live="polite">
            <span className="shop-panel__gold-icon" aria-hidden="true">◈</span>
            {state.gold.toLocaleString()} {t('shop.gold')}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="shop-panel__close"
            aria-label={t('shop.close')}
            onClick={onClose}
          >
            {'\u2715'}
          </button>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {purchaseStatus}
        </p>

        <ul className="shop-panel__list">
          {ITEMS.map((item) => {
            const isOwned = owned.has(item.id);
            const affordable = state.gold >= item.cost;
            const disabled = isOwned || !affordable;
            const isRecommended = recommended?.id === item.id;
            const nameId = `shop-item-${item.id}-name`;
            const descId = `shop-item-${item.id}-desc`;
            return (
              <li
                key={item.id}
                className={`shop-item${item.legendary ? ' shop-item--legendary' : ''}${isOwned ? ' is-owned' : ''}${isRecommended ? ' is-recommended' : ''}`}
                aria-labelledby={nameId}
                aria-describedby={descId}
              >
                <div className="shop-item__head">
                  <h3 id={nameId} className="shop-item__name">{t(item.nameKey)}</h3>
                  {isRecommended && !isOwned && (
                    <span className="shop-item__tag">{t('shop.recommended')}</span>
                  )}
                </div>
                <p id={descId} className="shop-item__desc">{t(item.descKey)}</p>
                <div className="shop-item__foot">
                  <span className="shop-item__cost">
                    <span aria-hidden="true">◈</span> {item.cost.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary shop-item__buy"
                    disabled={disabled}
                    onClick={() => {
                      battleStore.requestPurchase(item.id);
                      setPurchaseStatus(
                        t('shop.purchaseQueued', { item: t(item.nameKey) }),
                      );
                    }}
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

  return createPortal(dialog, document.body);
}
