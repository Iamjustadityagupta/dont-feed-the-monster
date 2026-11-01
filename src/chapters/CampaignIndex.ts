import { CHAPTER_01_CAMPAIGN } from './Chapter01_Containment';
import { CHAPTER_02 } from './Chapter02_ForgottenExperiments';
import { CHAPTER_03 } from './Chapter03_SilentWard';
import { CHAPTER_04 } from './Chapter04_PowerFailure';
import { CHAPTER_05 } from './Chapter05_Project09';
import type { ChapterAIProfile } from './ChapterAIProfile';

export interface CampaignChapter {
  readonly id: string; readonly title: string; readonly areaId: string;
  readonly unlockAfter: string | null; readonly objective: string;
  readonly storyBrief: string; readonly ai: ChapterAIProfile;
}
export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = [
  { id: CHAPTER_01_CAMPAIGN.id, title: CHAPTER_01_CAMPAIGN.title, areaId: 'containment-block',
    unlockAfter: null, objective: 'Search the facility for a security keycard.',
    storyBrief: CHAPTER_01_CAMPAIGN.storyBrief, ai: CHAPTER_01_CAMPAIGN.ai },
  CHAPTER_02, CHAPTER_03, CHAPTER_04, CHAPTER_05,
];
export function getCampaignChapter(id: string): CampaignChapter | undefined {
  return CAMPAIGN_CHAPTERS.find((chapter) => chapter.id === id);
}
export function getNextChapter(id: string): CampaignChapter | undefined {
  const index = CAMPAIGN_CHAPTERS.findIndex((chapter) => chapter.id === id);
  return index >= 0 ? CAMPAIGN_CHAPTERS[index + 1] : undefined;
}
