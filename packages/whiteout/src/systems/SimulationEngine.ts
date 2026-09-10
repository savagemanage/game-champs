import { POPULATION, QUESTS, REFINERY, RESOURCE_ORDER } from '../config/GameConfig';
import { BUILDING_ORDER, buildingDef, isProducer, outputPerSec } from '../config/BuildingConfig';
import { economyMultiplierFor, combineModifiers } from '../config/StatModifiers';
import type { BuildingKind, ResourceKind, Resources } from '../types';
import type { QuestMetric, QuestReward } from '../config/QuestConfig';
import type { GameSnapshot } from './SaveManager';

export interface SimulationResult {
  buildingsDone: BuildingKind[];
  trainingDone: Partial<Record<'trapper' | 'marksman' | 'vanguard', number>>;
  researchDone: string[];
  resourceDelta: Resources;
  sparksDelta: number;
}

/** UTC midnight immediately after a timestamp. */
function nextUtcBoundary(now: number): number {
  return (Math.floor(now / QUESTS.DAY_MS) + 1) * QUESTS.DAY_MS;
}

function grant(snapshot: GameSnapshot, reward: QuestReward): void {
  if (reward.resources) snapshot.resources.add(reward.resources);
  if (reward.sparks) snapshot.premium.grant(reward.sparks);
  if (reward.shards) {
    for (const [id, amount] of Object.entries(reward.shards)) {
      snapshot.heroes.addShards(id as keyof typeof reward.shards, amount ?? 0);
    }
  }
}

function record(snapshot: GameSnapshot, metric: QuestMetric, amount: number, now: number): void {
  for (const reward of snapshot.quests.record(metric, amount, now)) grant(snapshot, reward);
}

function economyModifiers(snapshot: GameSnapshot) {
  return combineModifiers(
    snapshot.research.modifiers(),
    snapshot.gear.modifiers(),
    { economyOutput: snapshot.heroes.bonuses().economy },
    snapshot.alliance.modifiers(),
    snapshot.vip.modifiers(),
  );
}

function forgeCapacityPerSecond(snapshot: GameSnapshot, now: number, sourceMultiplier: number): number {
  const level = snapshot.buildings.level('forge_hall');
  if (level <= 0 || sourceMultiplier <= 0) return 0;
  return snapshot.buildings.steelThroughput()
    * snapshot.population.staffingMultiplier('forge_hall', level)
    * snapshot.warmth.productionMultiplier(snapshot.buildings.furnaceLevel)
    * snapshot.population.satisfactionProduction(snapshot.buildings.totalHousing())
    * economyMultiplierFor(economyModifiers(snapshot), 'steel')
    * snapshot.quests.productionBonus(now)
    * sourceMultiplier;
}

function emptySimulationResult(): SimulationResult {
  return {
    buildingsDone: [],
    trainingDone: {},
    researchDone: [],
    resourceDelta: Object.fromEntries(RESOURCE_ORDER.map((r) => [r, 0])) as Resources,
    sparksDelta: 0,
  };
}

/**
 * Settle every deadline due at `now` through the same quest/reward path used by
 * active simulation. Callers use this before an offline production window so
 * old timers complete exactly once without receiving out-of-window economy.
 * Daily completion credit is intentionally attributed to the settlement
 * boundary; permanent growth progress and auto-claimed rewards are preserved.
 */
export function settleDueCompletions(snapshot: GameSnapshot, now: number): SimulationResult {
  const out = emptySimulationResult();
  const buildings = snapshot.buildings.update(now);
  if (buildings.length > 0) {
    out.buildingsDone.push(...buildings);
    record(snapshot, 'buildingUpgraded', buildings.length, now);
  }
  const research = snapshot.research.advance(now);
  if (research) {
    out.researchDone.push(research);
    record(snapshot, 'researchCompleted', 1, now);
  }
  const training = snapshot.training.advance(now);
  let trained = false;
  for (const [kind, count] of Object.entries(training) as [keyof typeof out.trainingDone, number][]) {
    if (count <= 0) continue;
    out.trainingDone[kind] = (out.trainingDone[kind] ?? 0) + count;
    trained = true;
  }
  if (trained) record(snapshot, 'troopTrained', 1, now);
  return out;
}

function processCompletions(snapshot: GameSnapshot, now: number, out: SimulationResult): void {
  const settled = settleDueCompletions(snapshot, now);
  out.buildingsDone.push(...settled.buildingsDone);
  out.researchDone.push(...settled.researchDone);
  for (const [kind, count] of Object.entries(settled.trainingDone) as [keyof typeof out.trainingDone, number][]) {
    out.trainingDone[kind] = (out.trainingDone[kind] ?? 0) + count;
  }
}

/**
 * Authoritative deterministic simulation used for both active play and offline
 * settlement. The stable order at every boundary is completion, atomic fuel,
 * Warmth, population, passive output, atomic refining, then Sparks.
 */
export function simulate(
  snapshot: GameSnapshot,
  startAt: number,
  endAt: number,
  sourceMultiplier: number,
): SimulationResult {
  const before = snapshot.resources.balances;
  const sparksBefore = snapshot.premium.sparks;
  const out = emptySimulationResult();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return out;

  let cursor = Math.max(0, startAt);
  const target = Math.max(cursor, endAt);
  while (cursor < target) {
    processCompletions(snapshot, cursor, out);
    snapshot.quests.dailySync(cursor);
    snapshot.rally.syncDay(cursor);

    let boundary = Math.min(target, nextUtcBoundary(cursor));
    for (const t of snapshot.buildings.pendingCompletions()) if (t > cursor) boundary = Math.min(boundary, t);
    const researchAt = snapshot.research.pendingCompletion();
    if (researchAt !== null && researchAt > cursor) boundary = Math.min(boundary, researchAt);
    for (const order of snapshot.training.orders) if (order.completesAt > cursor) boundary = Math.min(boundary, order.completesAt);

    const furnaceLevel = snapshot.buildings.furnaceLevel;
    const fuel = snapshot.warmth.fuelPerSecond(furnaceLevel);
    const forgeCapacity = snapshot.resources.get('iron') > 1e-9 && snapshot.resources.get('coal') > 1e-9
      ? forgeCapacityPerSecond(snapshot, cursor, sourceMultiplier)
      : 0;
    const forgeCoalRate = forgeCapacity * REFINERY.INPUT_PER_STEEL.coal;
    const forgeIronRate = forgeCapacity * REFINERY.INPUT_PER_STEEL.iron;
    const fuelWoodSeconds = fuel.wood > 0 ? snapshot.resources.get('wood') / fuel.wood : Infinity;
    // Furnace and Forge reserve coal from the same stock in the specified
    // order. Split where their combined demand exhausts it so the Furnace
    // cannot stay fueled beyond the point at which refining also consumes coal.
    const combinedCoalRate = fuel.coal + forgeCoalRate;
    const fuelCoalSeconds = combinedCoalRate > 0 ? snapshot.resources.get('coal') / combinedCoalRate : Infinity;
    const fuelSeconds = Math.min(fuelWoodSeconds, fuelCoalSeconds);
    const refineryIronSeconds = forgeIronRate > 0 ? snapshot.resources.get('iron') / forgeIronRate : Infinity;
    const maxWarmth = snapshot.warmth.maxWarmth(furnaceLevel);
    const fueledNow = fuelSeconds > 1e-9;
    const warmthSeconds = fueledNow
      ? Math.max(0, (maxWarmth - snapshot.warmth.warmth) / 8)
      : Math.max(0, snapshot.warmth.warmth / 5);
    const hasWoodProduction = BUILDING_ORDER.some((kind) =>
      buildingDef(kind).produces === 'wood' && snapshot.buildings.level(kind) > 0);
    const hasCoalProduction = BUILDING_ORDER.some((kind) =>
      buildingDef(kind).produces === 'coal' && snapshot.buildings.level(kind) > 0);
    const limitingFuelCanRecover = fuelWoodSeconds < fuelCoalSeconds - 1e-9
      ? hasWoodProduction
      : fuelCoalSeconds < fuelWoodSeconds - 1e-9
        ? hasCoalProduction
        : hasWoodProduction && hasCoalProduction;
    if (fueledNow && fuelSeconds > 1e-9) {
      boundary = Math.min(boundary, cursor + fuelSeconds * 1000);
    } else if (limitingFuelCanRecover) {
      // Re-evaluate at the canonical integration boundary after passive fuel
      // output has had a chance to restore both atomic inputs.
      boundary = Math.min(boundary, (Math.floor(cursor / 1000) + 1) * 1000);
    }
    if (refineryIronSeconds > 1e-9 && Number.isFinite(refineryIronSeconds)) {
      boundary = Math.min(boundary, cursor + refineryIronSeconds * 1000);
    }
    if (warmthSeconds > 1e-9) boundary = Math.min(boundary, cursor + warmthSeconds * 1000);

    // Survivor count changes are discrete and can change housing satisfaction,
    // so split exactly when the next whole survivor arrives.
    const populationState = snapshot.population.toJSON();
    const housingCap = snapshot.population.housingCap(snapshot.buildings.totalHousing());
    if (snapshot.population.total < housingCap && sourceMultiplier > 0) {
      const carry = Math.min(0.999999999, Math.max(0, populationState.growthCarry ?? 0));
      const growthSeconds = (1 - carry) / (POPULATION.GROWTH_PER_SEC * sourceMultiplier);
      if (growthSeconds > 1e-9) boundary = Math.min(boundary, cursor + growthSeconds * 1000);
    }

    // Bound long steady-state spans for the eight-hour performance budget.
    // Actual deadlines, UTC changes, fuel depletion, Warmth caps, and survivor
    // arrivals above still split at their exact timestamp; sixty seconds only
    // caps intervals with no intervening state transition.
    const cadenceMs = 60_000;
    boundary = Math.min(boundary, (Math.floor(cursor / cadenceMs) + 1) * cadenceMs);
    if (boundary <= cursor + 1e-6) boundary = Math.min(target, cursor + 1);
    const dtMs = boundary - cursor;

    const warmthBefore = snapshot.warmth.productionMultiplier(furnaceLevel);
    const warmthTick = snapshot.warmth.tick(dtMs, furnaceLevel, snapshot.resources);
    const warmthAfter = snapshot.warmth.productionMultiplier(furnaceLevel);
    const warmthAverage = (warmthBefore + warmthAfter) / 2;

    const extraHousing = snapshot.buildings.totalHousing();
    snapshot.population.tick(dtMs, extraHousing, sourceMultiplier);
    const satisfaction = snapshot.population.satisfactionProduction(extraHousing);
    const mods = economyModifiers(snapshot);
    const event = snapshot.quests.productionBonus(cursor);
    const seconds = dtMs / 1000;

    for (const kind of BUILDING_ORDER) {
      if (!isProducer(kind)) continue;
      const level = snapshot.buildings.level(kind);
      const produces = buildingDef(kind).produces;
      if (level <= 0 || !produces) continue;
      const economy = economyMultiplierFor(mods, produces);
      const amount = outputPerSec(kind, level)
        * snapshot.population.staffingMultiplier(kind, level)
        * warmthAverage * satisfaction * economy * event * sourceMultiplier * seconds;
      snapshot.resources.add({ [produces]: amount });
    }

    const forgeLevel = snapshot.buildings.level('forge_hall');
    if (forgeLevel > 0) {
      const steelEconomy = economyMultiplierFor(mods, 'steel');
      snapshot.buildings.refineryConversion(
        snapshot.resources,
        dtMs,
        snapshot.population.staffingMultiplier('forge_hall', forgeLevel)
          * warmthAverage * satisfaction * steelEconomy * event * sourceMultiplier,
      );
    }
    if (warmthTick.fueled) snapshot.premium.drip(dtMs, furnaceLevel, sourceMultiplier);
    if (sourceMultiplier === 1) snapshot.alliance.tickActive(dtMs);
    cursor = boundary;
  }

  processCompletions(snapshot, target, out);
  snapshot.quests.dailySync(target);
  snapshot.rally.syncDay(target);
  const after = snapshot.resources.balances;
  for (const key of RESOURCE_ORDER as readonly ResourceKind[]) out.resourceDelta[key] = after[key] - before[key];
  out.sparksDelta = snapshot.premium.sparks - sparksBefore;
  return out;
}
