import type { ChapterAIProfile } from './ChapterAIProfile';
export const CHAPTER_05_AI: ChapterAIProfile = {
  chapter: 5, patrolSpeedMultiplier: 1.18, investigateSpeedMultiplier: 1.25,
  searchSpeedMultiplier: 1.28, chaseSpeedMultiplier: 1.2, sightRangeMultiplier: 1.18,
  hearingRangeMultiplier: 1.45, investigateSounds: true, searchHidingSpots: true,
  detectFlashlight: true, flashlightSightBonus: 9, adaptiveMemory: true, extraSearchSeconds: 10,
};
export const CHAPTER_05 = {
  id: 'chapter-05', title: 'Project 09', areaId: 'classified-sector', unlockAfter: 'chapter-04',
  objective: 'Enter the classified sector, uncover the truth, and reach the final exit.',
  storyBrief: 'Subject 09 adapts to repeated hiding and distraction tactics. Do not rely on the same trick twice.', ai: CHAPTER_05_AI,
} as const;
