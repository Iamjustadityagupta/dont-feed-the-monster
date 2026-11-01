import type { ChapterAIProfile } from './ChapterAIProfile';

export const CHAPTER_02_AI: ChapterAIProfile = {
  chapter: 2, patrolSpeedMultiplier: 1.05, investigateSpeedMultiplier: 1.12,
  searchSpeedMultiplier: 1.05, chaseSpeedMultiplier: 1.04, sightRangeMultiplier: 1.05,
  hearingRangeMultiplier: 1.25, investigateSounds: true, searchHidingSpots: false,
  detectFlashlight: false, flashlightSightBonus: 0, adaptiveMemory: false, extraSearchSeconds: 2,
};
export const CHAPTER_02 = {
  id: 'chapter-02', title: 'The Forgotten Experiments', areaId: 'experimental-wing',
  unlockAfter: 'chapter-01', objective: 'Explore the experimental wing and uncover what happened to the other subjects.',
  storyBrief: 'Subject 09 reacts to sound. Thrown objects and noisy movement can attract it.', ai: CHAPTER_02_AI,
} as const;
