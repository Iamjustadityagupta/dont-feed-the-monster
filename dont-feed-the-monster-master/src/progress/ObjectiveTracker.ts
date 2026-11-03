import { DOCUMENTS } from '../Documents/DocumentRegistry';

export interface Objective {
  id: string;
  text: string;
}

export interface Chapter {
  index: number;
  title: string;
  purpose: string;
  objectives: Objective[];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    index: 1,
    title: 'CONTAINMENT',
    purpose: 'Introduce survival, exploration and Subject 09.',
    objectives: [
      { id: 'c1_learn', text: 'Understand the facility and basic controls.' },
      { id: 'c1_keycard', text: 'Find the security keycard.' },
      { id: 'c1_hide', text: 'Learn how to hide and use distractions.' },
      { id: 'c1_return', text: 'Return to the locked exit.' }
    ]
  },
  {
    index: 2,
    title: 'THE HUNT',
    purpose: 'Teach sound management and how the monster investigates noises.',
    objectives: [
      { id: 'c2_corridors', text: 'Explore maintenance corridors.' },
      { id: 'c2_component', text: 'Find the missing power component.' },
      { id: 'c2_power', text: 'Restore generator power.' },
      { id: 'c2_checkpoint', text: 'Activate the security checkpoint.' }
    ]
  },
  {
    index: 3,
    title: 'NO SAFE PLACE',
    purpose: 'Show that hiding and distractions are not always reliable.',
    objectives: [
      { id: 'c3_lab', text: 'Explore the research laboratory.' },
      { id: 'c3_token', text: 'Find the research access token.' },
      { id: 'c3_observe', text: 'Investigate observation rooms.' },
      { id: 'c3_adapt', text: 'Discover how the creature responds to repeated tactics.' }
    ]
  },
  {
    index: 4,
    title: 'THE TRUTH',
    purpose: 'Reveal that the team knew the risks and continued anyway.',
    objectives: [
      { id: 'c4_central', text: 'Reach the central laboratory.' },
      { id: 'c4_creds', text: 'Recover final credentials.' },
      { id: 'c4_archive', text: 'Access classified research records.' },
      { id: 'c4_origin', text: 'Investigate the original containment area.' }
    ]
  },
  {
    index: 5,
    title: "DON'T FEED IT",
    purpose: 'Test everything learned: stealth, sound, hiding and survival.',
    objectives: [
      { id: 'c5_return', text: 'Return to the original containment section.' },
      { id: 'c5_release', text: 'Activate the emergency release.' },
      { id: 'c5_pursuit', text: 'Survive the final pursuit.' },
      { id: 'c5_escape', text: 'Escape the facility.' }
    ]
  }
];

export const EVIDENCE: Readonly<Record<string, string>> = {
  ev_noise_response: 'Subject 09 reacts measurably to noise levels.',
  ev_protocol_rev3: 'Official hiding procedure, explicitly a delaying tactic.',
  ev_generator_fault: 'Generator B failing for weeks; part backordered.',
  ev_learning_behaviour: 'The creature learns and re-checks cleared spaces.',
  ev_halloran_credentials: 'Halloran left access that excludes the exit.',
  ev_risk_accepted: 'Board knowingly continued after four documented failure modes.',
  ev_starvation: 'Nine days unfed before the player arrives.',
  ev_deliberate_release: 'Hatch 1 was opened from inside, then the badge was scrubbed.'
};

export const QUESTIONS: Readonly<Record<string, string>> = {
  q_why_rev4: 'Why was the hiding protocol never revised past Rev. 3?',
  q_how_it_learns: 'How does it retain spatial memory between encounters?',
  q_who_is_voss: 'Who is A. Voss, and why did the Board overrule the review panel?',
  q_what_does_it_eat: 'What was it being fed, and by whom?',
  q_who_opened_hatch: 'Who authorised the hatch release, and why scrub their own badge?'
};

const DOCUMENT_MAP = new Map(
  DOCUMENTS.map(document => [document.id, document])
);

export class ObjectiveTracker {
  private chapterIndex = 1;

  private readonly completed = new Set<string>();
  private readonly documents = new Set<string>();

  getChapter(): Chapter {
    return CHAPTERS[this.chapterIndex - 1];
  }

  getChapterIndex(): number {
    return this.chapterIndex;
  }

  getCompletedCount(): number {
    return this.completed.size;
  }

  getTotalCount(): number {
    return CHAPTERS.reduce(
      (total, chapter) => total + chapter.objectives.length,
      0
    );
  }

  isComplete(id: string): boolean {
    return this.completed.has(id);
  }

  complete(id: string): boolean {
    if (this.completed.has(id)) {
      return false;
    }

    const exists = CHAPTERS.some(
      chapter => chapter.objectives.some(
        objective => objective.id === id
      )
    );

    if (!exists) {
      return false;
    }

    this.completed.add(id);
    return true;
  }

  getActive(): Objective[] {
    return this.getChapter().objectives.filter(
      objective => !this.completed.has(objective.id)
    );
  }

  getCompleted(): Objective[] {
    return CHAPTERS.flatMap(
      chapter => chapter.objectives
    ).filter(
      objective => this.completed.has(objective.id)
    );
  }

  collectDocument(id: string): void {
    if (DOCUMENT_MAP.has(id)) {
      this.documents.add(id);
    }
  }

  hasDocument(id: string): boolean {
    return this.documents.has(id);
  }

  getDocuments(): string[] {
    return [...this.documents];
  }

  advanceChapter(): boolean {
    if (this.chapterIndex >= CHAPTERS.length) {
      return false;
    }

    this.chapterIndex++;
    return true;
  }

  getEvidence(): string[] {
    const result = new Set<string>();

    this.documents.forEach(id => {
      const evidenceId =
        DOCUMENT_MAP.get(id)?.explanation.evidenceId;

      if (evidenceId) {
        result.add(evidenceId);
      }
    });

    return [...result];
  }

  getQuestions(): string[] {
    const result = new Set<string>();

    this.documents.forEach(id => {
      const questionId =
        DOCUMENT_MAP.get(id)?.explanation.questionId;

      if (questionId) {
        result.add(questionId);
      }
    });

    return [...result];
  }
}