export interface DocumentExplanation {
  meaning: string;
  purpose: string;
  kind:
    | 'clue'
    | 'warning'
    | 'experiment-result'
    | 'character-detail'
    | 'mystery';
  evidenceId?: string;
  questionId?: string;
}

export interface GameDocument {
  id: string;
  title: string;
  chapter: number;
  pages: string[];
  explanation: DocumentExplanation;
}

export const DOCUMENTS: readonly GameDocument[] = [
  {
    id: 'doc_containment_warning',
    title: 'CONTAINMENT WARNING',
    chapter: 1,
    pages: [
      `CONTAINMENT WING — RESTRICTED

Do not enter the containment wing without authorization.

Subject 09 has demonstrated unusual responses to environmental noise. Raised voices, dropped tools and dragging furniture all register. Staff are advised to move slowly and keep conversation to a minimum past the second bulkhead.

— Dr. M. Halloran, Site Safety`
    ],
    explanation: {
      meaning: 'The staff already knew loud sounds make Subject 09 react. Walking and talking carelessly near it is what gets you noticed.',
      purpose: 'Teaches sound-based stealth in the first room and establishes noise as the resource you manage.',
      kind: 'warning',
      evidenceId: 'ev_noise_response'
    }
  },
  {
    id: 'doc_hiding_protocol',
    title: 'STAFF HIDING PROTOCOL (REV. 3)',
    chapter: 1,
    pages: [
      `EMERGENCY PROCEDURE

1. Enter the nearest locker or service recess.
2. Hold still. Do not breathe against the vent grille.
3. Wait for the specimen to pass the doorway before moving.`,
      `NOTE: Protocol assumes the specimen has not yet seen you. Once visual contact is made, Rev. 3 states hiding will only delay it.

Handwritten beneath: "Delay is still time. Take it."`
    ],
    explanation: {
      meaning: 'Hiding buys seconds, not safety. It only works if the creature has not already spotted you.',
      purpose: 'Introduces the hide mechanic and plants that hiding is a delaying tactic.',
      kind: 'clue',
      evidenceId: 'ev_protocol_rev3',
      questionId: 'q_why_rev4'
    }
  },
  {
    id: 'doc_maintenance_log',
    title: 'MAINTENANCE LOG — WEEK 11',
    chapter: 2,
    pages: [
      `Mon: Replaced two failed ballasts, sub-level 2. Noise complaints from Lab.
Wed: Generator B thrown again. Third time this month. Part ordered — 6 weeks.
Thu: Something in the return duct. Not rats. Too heavy.
Fri: Locked the duct hatch. Whatever it is, it can stay down there.`
    ],
    explanation: {
      meaning: 'The generator has been failing for weeks and the replacement part never arrived. Something large is using the return ducts.',
      purpose: 'Points at the generator as the Chapter 2 task and hints the creature travels through ventilation.',
      kind: 'clue',
      evidenceId: 'ev_generator_fault'
    }
  },
  {
    id: 'doc_power_component',
    title: 'PARTS REQUISITION — GENERATOR B',
    chapter: 2,
    pages: [
      `REQUISITION #4471

1x Brushless exciter assembly, 40 kW class
Status: BACKORDERED

Handling: Deliver to Maintenance Bay 2, not the front desk. Front desk staff keep signing for the wrong crates.

Signed: R. Okonkwo`
    ],
    explanation: {
      meaning: 'The exact part needed to restart the generator is named, and it was never delivered to where it belongs.',
      purpose: 'Turns "restore power" into a concrete search: the part is in maintenance, not the generator room.',
      kind: 'clue',
      evidenceId: 'ev_generator_fault'
    }
  },
  {
    id: 'doc_observation_transcript',
    title: 'OBSERVATION ROOM 3 — TRANSCRIPT',
    chapter: 3,
    pages: [
      `[14:02] HALLORAN: Baseline. No stimulus.
[14:03] HALLORAN: Now the recording.
[14:04] (metal clatter, three times)
[14:04] HALLORAN: It is orienting. Not moving yet.
[14:05] HALLORAN: Again.
[14:05] (metal clatter, three times)
[14:06] HALLORAN: It is not orienting this time. It is walking.`,
      `[14:07] HALLORAN: Third time and it goes straight past the source. Straight to the room the sound came FROM last time.
[14:09] HALLORAN: Note this. It learns.`
    ],
    explanation: {
      meaning: 'Repeating the same distraction stops working. Subject 09 remembers where the previous noise came from and checks there instead.',
      purpose: 'The mechanical payoff for Chapter 3: vary tactics instead of reusing one hiding spot or one thrown object.',
      kind: 'experiment-result',
      evidenceId: 'ev_learning_behaviour',
      questionId: 'q_how_it_learns'
    }
  },
  {
    id: 'doc_behavioural_note',
    title: 'BEHAVIOURAL NOTE — DR. HALLORAN',
    chapter: 3,
    pages: [
      `It does not hunt like a predator. It hunts like something checking a hypothesis.

When it finds nothing, it does not leave. It stays and works the area, methodically, room by room.

Twice now it has gone back to a locker it already checked. I have stopped writing "intelligent" in the reports. The board reads it as a claim and wants proof.`
    ],
    explanation: {
      meaning: 'The creature returns to places it already searched, so a hiding spot that worked once is not guaranteed to work twice.',
      purpose: 'Justifies the chapter pressure and builds Halloran as the one who understood it best.',
      kind: 'character-detail',
      evidenceId: 'ev_learning_behaviour',
      questionId: 'q_how_it_learns'
    }
  },
  {
    id: 'doc_final_credentials',
    title: 'CENTRAL LAB — CREDENTIAL SLIP',
    chapter: 4,
    pages: [
      `LEVEL 5 — CENTRAL LABORATORY

Holder: M. HALLORAN

Emergency clause: if the wing is sealed, this slip opens the archive and the containment hatch. It does not open the exit.

Handwritten: "Someone has to still be able to get in. That is the whole point."`
    ],
    explanation: {
      meaning: 'Halloran left credentials that open the archive and the old containment hatch — pointedly not the way out.',
      purpose: 'Grants archive access and the route into containment while confirming the exit needs something else.',
      kind: 'clue',
      evidenceId: 'ev_halloran_credentials'
    }
  },
  {
    id: 'doc_classified_summary',
    title: 'CLASSIFIED — RISK ACCEPTANCE MEMO',
    chapter: 4,
    pages: [
      `To: Oversight Board
Re: Subject 09, continued habitation

Internal review flagged four categories of failure: acoustic triggering, learned route memory, non-return to containment after excursion, and unpredictable appetite.

Each is documented. None is mitigated.`,
      `Recommendation of review panel: suspend trials until all four are addressed.
Board decision: trials continue. Budget cycle.

Signed for the Board: A. Voss`
    ],
    explanation: {
      meaning: 'The board was told in writing about four known failure modes and continued anyway, for budget reasons.',
      purpose: 'Delivers the chapter revelation: the disaster was a decision, not an accident. Names Voss as signatory.',
      kind: 'experiment-result',
      evidenceId: 'ev_risk_accepted',
      questionId: 'q_who_is_voss'
    }
  },
  {
    id: 'doc_feeding_log',
    title: 'FEEDING SCHEDULE — CANCELLED',
    chapter: 5,
    pages: [
      `Feeds were timed to the generator cycle so the noise would mask the delivery.

Last entry:

"Generator down. Feed suspended until power restored.

It has not been fed in nine days.

Do not be in the containment wing when it is."`
    ],
    explanation: {
      meaning: 'The creature has been unfed for over a week. The final section is not just enclosed — it is starving.',
      purpose: 'Raises the finale stakes and explains the aggression spike in the last pursuit.',
      kind: 'warning',
      evidenceId: 'ev_starvation',
      questionId: 'q_what_does_it_eat'
    }
  },
  {
    id: 'doc_containment_incident',
    title: 'INCIDENT REPORT — HATCH 1',
    chapter: 5,
    pages: [
      `[REDACTED TIME]

Hatch 1 opened from the inside.

No alarm. No external command. Log shows the release was authorised, then the authorising badge was removed from the system four minutes later.

Whoever let it out did not want to be found in the log.`
    ],
    explanation: {
      meaning: 'Someone deliberately opened the containment hatch, then erased their own name from the record.',
      purpose: 'Sets up the deliberate-sabotage thread and keeps the human mystery alive alongside the creature.',
      kind: 'mystery',
      evidenceId: 'ev_deliberate_release',
      questionId: 'q_who_opened_hatch'
    }
  }
];

export function getDocumentById(
  id: string
): GameDocument | undefined {
  return DOCUMENTS.find(document => document.id === id);
}