import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { battleStore } from '../game/battleStore';
import { ITEMS, remainingBuildCost } from '../data/items';
import { attemptPurchase } from '../game/inventory';
import { recommendBuild } from '../game/rift/loadout';
import { getChampionById } from '../data/champions';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

interface ShopPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Accessible in-battle shop with a role-aware strategic build target. */
export default function ShopPanel({ open, onClose }: ShopPanelProps) {
  const { t, i18n } = useTranslation();
  const state = useSyncExternalStore(battleStore.subscribe, battleStore.getSnapshot);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [purchaseStatus, setPurchaseStatus] = useState('');
  const visible = open && state.shopAvailable;
  const panelRef = useDialogFocusTrap<HTMLDivElement>(visible, onClose, closeButtonRef);
  const formatNumber = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (open && !state.shopAvailable) onClose();
  }, [open, state.shopAvailable, onClose]);

  useEffect(() => {
    if (!visible) setPurchaseStatus('');
  }, [visible]);

  useEffect(() => {
    const feedback = state.purchaseFeedback;
    if (!feedback) return;
    const item = ITEMS.find((candidate) => candidate.id === feedback.itemId);
    const name = item ? t(item.nameKey) : feedback.itemId;
    setPurchaseStatus(
      feedback.accepted
        ? t('shop.purchaseSuccess', { item: name })
        : t(`shop.rejections.${feedback.reason ?? 'unknown-item'}`, { item: name }),
    );
  }, [state.purchaseFeedback, t]);

  if (!visible) return null;

  const player = getChampionById(state.playerChampionId);
  const owned = new Set(state.ownedItems);
  const build = player ? recommendBuild(player.role, state.ownedItems, state.gold) : undefined;

  return createPortal(
    <div className="shop-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="shop-panel" role="dialog" aria-modal="true" aria-labelledby="shop-title" tabIndex={-1}>
        <div className="shop-panel__head">
          <div className="shop-panel__heading-group">
            <span className="shop-panel__eyebrow">{t('shop.buildPlan')}</span>
            <h2 id="shop-title" className="shop-panel__title">{t('shop.title')}</h2>
          </div>
          <span className="shop-panel__gold">
            <span className="shop-panel__gold-icon" aria-hidden="true">◈</span>
            {formatNumber.format(state.gold)} {t('shop.gold')}
          </span>
          <button ref={closeButtonRef} type="button" className="shop-panel__close" aria-label={t('shop.close')} onClick={onClose}>{'\u2715'}</button>
        </div>

        {build && (
          <section className="shop-plan" aria-label={t('shop.buildPlan')}>
            <div><span>{t('shop.target')}</span><strong>{t(build.targetItem.nameKey)}</strong></div>
            <div><span>{t('shop.nextComponent')}</span><strong>{build.nextPurchasableComponent ? t(build.nextPurchasableComponent.nameKey) : t('shop.saveForComponent')}</strong></div>
            <div><span>{t('shop.remainingCost')}</span><strong>◈ {formatNumber.format(build.remainingCost)}</strong></div>
            <p className="shop-plan__note">{t('shop.checkoutNote')}</p>
          </section>
        )}

        <p className="sr-only" role="status" aria-live="polite">{purchaseStatus}</p>

        <ul className="shop-panel__list">
          {ITEMS.map((item) => {
            const isOwned = item.legendary && owned.has(item.id);
            const displayedCost = remainingBuildCost(item, state.ownedItems);
            const preview = attemptPurchase({
              gold: state.gold,
              items: state.ownedItems,
              inShop: state.shopAvailable,
            }, item.id);
            const affordable = state.gold >= displayedCost;
            const disabled = !preview.accepted;
            const isTarget = build?.targetItem.id === item.id;
            const isComponent = build?.nextPurchasableComponent?.id === item.id;
            const nameId = `shop-item-${item.id}-name`;
            const descId = `shop-item-${item.id}-desc`;
            return (
              <li
                key={item.id}
                className={`shop-item${item.legendary ? ' shop-item--legendary' : ''}${isOwned ? ' is-owned' : ''}${isTarget ? ' is-recommended' : ''}${isComponent ? ' is-component' : ''}`}
                aria-labelledby={nameId}
                aria-describedby={descId}
              >
                <div className="shop-item__head">
                  <h3 id={nameId} className="shop-item__name">{t(item.nameKey)}</h3>
                  {isTarget && !isOwned && <span className="shop-item__tag">{t('shop.target')}</span>}
                  {isComponent && !isOwned && <span className="shop-item__tag">{t('shop.nextComponent')}</span>}
                </div>
                <p id={descId} className="shop-item__desc">{t(item.descKey)}</p>
                <div className="shop-item__foot">
                  <span className="shop-item__cost"><span aria-hidden="true">◈</span> {formatNumber.format(displayedCost)}</span>
                  <button
                    type="button"
                    className="btn btn--primary shop-item__buy"
                    disabled={disabled}
                    onClick={() => {
                      battleStore.requestPurchase(item.id);
                      setPurchaseStatus(t('shop.purchaseQueued', { item: t(item.nameKey) }));
                    }}
                  >
                    {isOwned ? t('shop.owned') : !affordable ? t('shop.notEnoughGold') : t('shop.buy')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
