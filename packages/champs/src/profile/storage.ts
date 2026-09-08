import { createDefaultProfile, migrateProfile, PROFILE_STORAGE_KEY } from './profile';
import type { ChampsProfile, ProfileStorage } from './types';

function browserStorage(): ProfileStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function resolveStorage(storage: ProfileStorage | null | undefined): ProfileStorage | undefined {
  return storage === undefined ? browserStorage() : storage ?? undefined;
}

/** Load and migrate a profile. Every storage/parse failure returns safe defaults. */
export function loadProfile(storage?: ProfileStorage | null): ChampsProfile {
  const target = resolveStorage(storage);
  if (!target) return createDefaultProfile();

  try {
    const serialized = target.getItem(PROFILE_STORAGE_KEY);
    return serialized === null
      ? createDefaultProfile()
      : migrateProfile(JSON.parse(serialized) as unknown);
  } catch {
    return createDefaultProfile();
  }
}

/** Save a normalized current-version profile. Returns false on any failure. */
export function saveProfile(
  profile: ChampsProfile,
  storage?: ProfileStorage | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(migrateProfile(profile)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear persisted progression and return fresh in-memory defaults even when
 * storage is unavailable or throws.
 */
export function resetProfile(storage?: ProfileStorage | null): ChampsProfile {
  const profile = createDefaultProfile();
  const target = resolveStorage(storage);
  if (!target) return profile;

  try {
    target.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // The caller can still continue safely with the returned in-memory profile.
  }
  return profile;
}
