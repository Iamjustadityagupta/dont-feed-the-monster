import { CHAPTER_01 } from './chapter01containment';
import { CHAPTER_01_AI } from './ChapterAIProfile';

export const CHAPTER_01_CAMPAIGN = {
  ...CHAPTER_01,
  ai: CHAPTER_01_AI,
  nextChapterId: 'chapter-02',
  storyBrief: 'Escape the containment block after Subject 09 breaches its holding cell.',
} as const;
