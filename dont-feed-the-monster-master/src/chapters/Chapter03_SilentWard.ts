import type { ChapterAIProfile } from './ChapterAIProfile';
export const CHAPTER_03_AI: ChapterAIProfile = {
  chapter: 3, patrolSpeedMultiplier: 1.08, investigateSpeedMultiplier: 1.15,
  searchSpeedMultiplier: 1.16, chaseSpeedMultiplier: 1.08, sightRangeMultiplier: 1.08,
  hearingRangeMultiplier: 1.3, investigateSounds: true, searchHidingSpots: true,
  detectFlashlight: false, flashlightSightBonus: 0, adaptiveMemory: false, extraSearchSeconds: 5,
};
export const CHAPTER_03 = {
  id: 'chapter-03', title: 'The Silent Ward', areaId: 'medical-wing', unlockAfter: 'chapter-02',
  objective: 'Search the medical ward for patient records and a route to the lower levels.',
  storyBrief: 'Subject 09 checks nearby hiding places after losing sight of you.', ai: CHAPTER_03_AI,
} as const;
