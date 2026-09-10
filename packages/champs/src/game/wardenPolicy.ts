export interface WardenCharge {
  acquiredAt: number;
  expiresAt: number;
}

export interface WardenPolicySnapshot {
  now: number;
  charge: WardenCharge | null;
  hasValidTarget: boolean;
  hasSiegePressure: boolean;
}

/** Enemy teams deliberately hold the charge for five seconds, then use pressure or the expiry boundary. */
export function shouldDeployHeldWarden(snapshot: WardenPolicySnapshot): boolean {
  const { charge } = snapshot;
  if (!charge || !snapshot.hasValidTarget || snapshot.now >= charge.expiresAt) return false;
  const heldLongEnough = snapshot.now - charge.acquiredAt >= 5;
  const lastEligibleSecond = charge.expiresAt - snapshot.now <= 1;
  return heldLongEnough && (snapshot.hasSiegePressure || lastEligibleSecond);
}
