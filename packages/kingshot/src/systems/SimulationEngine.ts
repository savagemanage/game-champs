import { ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingKind, Resources, TroopKind } from '../types';
import type { GameSnapshot } from './SaveManager';
import { ResourceStore } from './ResourceStore';
import type { TechId } from '../config/ResearchConfig';

export type SimulationMode = 'live' | 'offline';

export interface SimulationReceipt {
  from: number;
  to: number;
  simulatedSeconds: number;
  /** Last economic tick boundary actually applied; may trail `to` by <1s. */
  economicCursorAt: number;
  gains: Resources;
  fuelWoodSpent: number;
  warmthBefore: number;
  warmthAfter: number;
  buildingsDone: BuildingKind[];
  researchDone: TechId[];
  trainingDone: Partial<Record<TroopKind, number>>;
  trainedCount: number;
}

/**
 * Canonical 1,000ms simulation used by both live play and load reconciliation.
 * At every timestamp it applies due buildings (canonical BuildingSystem order),
 * research, then training before production and Hearth settlement.
 */
export function advanceSimulation(
  snapshot: GameSnapshot,
  from: number,
  to: number,
  mode: SimulationMode,
): SimulationReceipt {
  const safeFrom = finiteTime(from, to);
  const safeTo = Math.max(safeFrom, finiteTime(to, safeFrom));
  const maxWindowMs = ECONOMY.MAX_OFFLINE_SECONDS * 1000;
  const economicStart = mode === 'offline' ? Math.max(safeFrom, safeTo - maxWindowMs) : safeFrom;
  const gains = ResourceStore.emptyBundle();
  const buildingsDone: BuildingKind[] = [];
  const researchDone: TechId[] = [];
  const trainingDone: Partial<Record<TroopKind, number>> = {};
  const warmthBefore = snapshot.warmth.warmth;
  let fuelWoodSpent = 0;

  // Absolute deadlines before an offline cap window still finish, but do not
  // earn production/fuel/warmth outside the recognized eight hours.
  settleDue(snapshot, economicStart, buildingsDone, researchDone, trainingDone);

  let cursor = economicStart;
  while (cursor + ECONOMY.TICK_MS <= safeTo) {
    const tickEnd = cursor + ECONOMY.TICK_MS;
    // Deadlines reached during this authoritative step are the first operation
    // of that step, so their new levels/effects apply to its production.
    settleDue(snapshot, tickEnd, buildingsDone, researchDone, trainingDone);
    const tc = snapshot.buildings.townCenterLevel;
    const rates = snapshot.buildings.productionRates();
    const multiplier =
      snapshot.research.productionMultiplier() *
      snapshot.heroes.economyMultiplier() *
      snapshot.warmth.productionMultiplier(tc);
    const boosted = ResourceStore.emptyBundle();
    for (const resource of RESOURCE_ORDER) boosted[resource] = rates[resource] * multiplier;
    const efficiency =
      mode === 'offline'
        ? ECONOMY.OFFLINE_EFFICIENCY * snapshot.research.offlineEfficiencyMultiplier()
        : 1;
    accumulate(
      gains,
      snapshot.resources.applyProduction(
        boosted,
        ECONOMY.TICK_MS,
        efficiency,
        snapshot.research.storageMultiplier(),
      ),
    );
    const woodBefore = snapshot.resources.get('wood');
    snapshot.warmth.tick(ECONOMY.TICK_MS, tc, snapshot.resources);
    fuelWoodSpent += Math.max(0, woodBefore - snapshot.resources.get('wood'));
    cursor = tickEnd;
  }

  // Timers are wall-clock deadlines and always advance all the way to now,
  // including beyond the production/Hearth cap and through a fractional tail.
  settleDue(snapshot, safeTo, buildingsDone, researchDone, trainingDone);
  const trainedCount = Object.values(trainingDone).reduce((sum, n) => sum + (n ?? 0), 0);
  return {
    from: safeFrom,
    to: safeTo,
    simulatedSeconds: Math.floor((safeTo - economicStart) / 1000),
    economicCursorAt: cursor,
    gains,
    fuelWoodSpent,
    warmthBefore,
    warmthAfter: snapshot.warmth.warmth,
    buildingsDone,
    researchDone,
    trainingDone,
    trainedCount,
  };
}

function settleDue(
  snapshot: GameSnapshot,
  at: number,
  buildingsDone: BuildingKind[],
  researchDone: TechId[],
  trainingDone: Partial<Record<TroopKind, number>>,
): void {
  buildingsDone.push(...snapshot.buildings.update(at));
  researchDone.push(...snapshot.research.update(at));
  const trained = snapshot.training.advance(at);
  for (const [kind, count] of Object.entries(trained) as [TroopKind, number][]) {
    trainingDone[kind] = (trainingDone[kind] ?? 0) + count;
  }
}

function accumulate(dst: Resources, src: Resources): void {
  for (const resource of RESOURCE_ORDER) dst[resource] += src[resource];
}

function finiteTime(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : Math.max(0, fallback);
}
