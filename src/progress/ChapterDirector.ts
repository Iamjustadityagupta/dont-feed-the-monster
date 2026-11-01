import { DOCUMENTS } from '../Documents/DocumentRegistry';
import { ObjectiveTracker } from './ObjectiveTracker';

const DOC_TO_OBJECTIVE: Readonly<Record<string, string>> = {
  doc_containment_warning: 'c1_learn',
  doc_hiding_protocol: 'c1_hide',
  doc_maintenance_log: 'c2_corridors',
  doc_power_component: 'c2_component',
  doc_observation_transcript: 'c3_adapt',
  doc_behavioural_note: 'c3_adapt',
  doc_final_credentials: 'c4_creds',
  doc_classified_summary: 'c4_archive',
  doc_feeding_log: 'c5_return',
  doc_containment_incident: 'c5_return'
};

export interface ChapterHooks {
  completeObjective(id: string): void;
  onChapterCleared?(chapterIndex: number): void;
}

export class ChapterDirector {
  private readonly clearedChapters = new Set<number>();

  constructor(
    private readonly tracker: ObjectiveTracker,
    private readonly hooks: ChapterHooks
  ) {}

  onDocumentCollected(id: string): void {
    const document = DOCUMENTS.find(
      item => item.id === id
    );

    if (!document) {
      return;
    }

    this.tracker.collectDocument(id);

    const objectiveId = DOC_TO_OBJECTIVE[id];

    if (objectiveId) {
      this.complete(objectiveId);
    }
  }

  complete(objectiveId: string): void {
    const completed = this.tracker.complete(objectiveId);

    if (!completed) {
      return;
    }

    this.hooks.completeObjective(objectiveId);
    this.checkChapterClear();
  }

  private checkChapterClear(): void {
    const chapter = this.tracker.getChapter();

    const allComplete = chapter.objectives.every(
      objective => this.tracker.isComplete(objective.id)
    );

    if (!allComplete) {
      return;
    }

    if (this.clearedChapters.has(chapter.index)) {
      return;
    }

    this.clearedChapters.add(chapter.index);

    this.hooks.onChapterCleared?.(chapter.index);

    this.tracker.advanceChapter();
  }
}