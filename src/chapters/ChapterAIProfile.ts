export interface ChapterAIProfile {
  readonly chapter: number;
  readonly patrolSpeedMultiplier: number;
  readonly investigateSpeedMultiplier: number;
  readonly searchSpeedMultiplier: number;
  readonly chaseSpeedMultiplier: number;
  readonly sightRangeMultiplier: number;
  readonly hearingRangeMultiplier: number;
  readonly investigateSounds: boolean;
  readonly searchHidingSpots: boolean;
  readonly detectFlashlight: boolean;
  readonly flashlightSightBonus: number;
  readonly adaptiveMemory: boolean;
  readonly extraSearchSeconds: number;
}

export const CHAPTER_01_AI: ChapterAIProfile = {
  chapter: 1, patrolSpeedMultiplier: 1, investigateSpeedMultiplier: 1,
  searchSpeedMultiplier: 1, chaseSpeedMultiplier: 1, sightRangeMultiplier: 1,
  hearingRangeMultiplier: 0.65, investigateSounds: false, searchHidingSpots: false,
  detectFlashlight: false, flashlightSightBonus: 0, adaptiveMemory: false, extraSearchSeconds: 0,
};

export function validateAIProfile(profile: ChapterAIProfile): string[] {
  const errors: string[] = [];
  if (profile.chapter < 1 || profile.chapter > 5) errors.push('chapter must be between 1 and 5');
  for (const key of ['patrolSpeedMultiplier', 'investigateSpeedMultiplier', 'searchSpeedMultiplier', 'chaseSpeedMultiplier', 'sightRangeMultiplier', 'hearingRangeMultiplier'] as const) {
    if (!Number.isFinite(profile[key]) || profile[key] <= 0) errors.push(`${key} must be positive`);
  }
  if (profile.flashlightSightBonus < 0 || profile.extraSearchSeconds < 0) errors.push('bonuses cannot be negative');
  return errors;
}
