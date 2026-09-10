import { getItemById, remainingBuildCost } from '../data/items';

export const INVENTORY_SLOT_LIMIT = 6;

export type PurchaseRejection =
  | 'unknown-item'
  | 'not-in-shop'
  | 'insufficient-gold'
  | 'inventory-full'
  | 'duplicate-finished-item';

export interface PurchaseState {
  gold: number;
  items: readonly string[];
  inShop: boolean;
}

export type PurchaseResult =
  | {
      accepted: true;
      itemId: string;
      cost: number;
      gold: number;
      items: string[];
      consumedIndices: number[];
    }
  | {
      accepted: false;
      itemId: string;
      reason: PurchaseRejection;
      cost: number;
      gold: number;
      items: string[];
      consumedIndices: number[];
    };

/** Authoritative six-slot recipe transaction shared by humans and bots. */
export function attemptPurchase(state: PurchaseState, itemId: string): PurchaseResult {
  const item = getItemById(itemId);
  const unchanged = {
    itemId,
    cost: 0,
    gold: Math.max(0, Math.floor(state.gold)),
    items: [...state.items],
    consumedIndices: [] as number[],
  };
  if (!item) return { accepted: false, reason: 'unknown-item', ...unchanged };
  if (!state.inShop) return { accepted: false, reason: 'not-in-shop', ...unchanged };
  if (item.legendary && state.items.includes(item.id)) {
    return { accepted: false, reason: 'duplicate-finished-item', ...unchanged };
  }

  const consumedIndices: number[] = [];
  if (item.recipe) {
    const reserved = new Set<number>();
    for (const componentId of item.recipe.components) {
      const index = state.items.findIndex(
        (ownedId, ownedIndex) => ownedId === componentId && !reserved.has(ownedIndex),
      );
      if (index >= 0) {
        reserved.add(index);
        consumedIndices.push(index);
      }
    }
  }

  const cost = remainingBuildCost(item, consumedIndices.map((index) => state.items[index]));
  if (state.gold < cost) {
    return { accepted: false, reason: 'insufficient-gold', ...unchanged, cost };
  }
  const finalSlots = state.items.length - consumedIndices.length + 1;
  if (finalSlots > INVENTORY_SLOT_LIMIT) {
    return { accepted: false, reason: 'inventory-full', ...unchanged, cost };
  }

  const consumed = new Set(consumedIndices);
  return {
    accepted: true,
    itemId,
    cost,
    gold: Math.max(0, Math.floor(state.gold - cost)),
    items: [...state.items.filter((_, index) => !consumed.has(index)), item.id],
    consumedIndices: consumedIndices.sort((a, b) => a - b),
  };
}
