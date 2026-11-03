import type { ChapterAIProfile } from './ChapterAIProfile';
export const CHAPTER_04_AI: ChapterAIProfile = {
  chapter: 4, patrolSpeedMultiplier: 1.12, investigateSpeedMultiplier: 1.2,
  searchSpeedMultiplier: 1.2, chaseSpeedMultiplier: 1.14, sightRangeMultiplier: 1.12,
  hearingRangeMultiplier: 1.35, investigateSounds: true, searchHidingSpots: true,
  detectFlashlight: true, flashlightSightBonus: 7, adaptiveMemory: false, extraSearchSeconds: 7,
};
export const CHAPTER_04 = {
  id: 'chapter-04', title: 'Power Failure', areaId: 'generator-and-maintenance', unlockAfter: 'chapter-03',
  objective: 'Restore auxiliary power and cross the maintenance tunnels.',
  storyBrief: 'The flashlight beam makes you easier to notice. Darkness is safer, but harder to navigate.', ai: CHAPTER_04_AI,
} as const;
