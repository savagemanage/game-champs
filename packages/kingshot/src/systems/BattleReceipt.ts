import type { Army, ResourceCost, TroopKind } from '../types';

export type BattleMode = 'campaign' | 'replay';

/** Immutable, persisted proof of a resolved battle. */
export interface BattleReceipt {
  id: string;
  revision: number;
  mode: BattleMode;
  wave: number;
  win: boolean;
  reward: ResourceCost;
  penalty: ResourceCost;
  casualties: Army;
  survivors: Army;
  deployed: Army;
  committedAt: number;
  armyPower: number;
  wavePower: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  townDefense: number;
  /** Per-stack matchup-weighted effective contribution for result explanation. */
  contributions: Partial<Record<TroopKind, number>>;
  acknowledged?: boolean;
}
