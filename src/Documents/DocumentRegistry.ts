export type DocumentExplanationKind =
  | 'clue'
  | 'warning'
  | 'experiment-result'
  | 'character-detail'
  | 'mystery';

export interface DocumentExplanation {
  meaning: string;
  purpose: string;
  kind: DocumentExplanationKind;
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

export interface PasswordLockerConfig {
  readonly lockerId: string;
  readonly code: string;
  readonly digits: number;
  readonly clueDocumentId: string;
  readonly evidenceId: string;
  readonly locationHint: string;
}

/**
 * Single authoritative source of truth for the password-protected locker
 * and its corresponding physical clue paper. Import this into PasswordLocker
 * so the keypad validation and the readable paper never diverge.
 */
export const PASSWORD_LOCKER_CONFIG: PasswordLockerConfig = Object.freeze({
  lockerId: 'locker_security_01',
  code: '0917',
  digits: 4,
  clueDocumentId: 'doc_security_password',
  evidenceId: 'ev_security_password',
  locationHint: 'Security Office — Locker 01'
});

export const STORY_DOCUMENTS: readonly GameDocument[] = [
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

export const PASSWORD_DOCUMENT: GameDocument = {
  id: PASSWORD_LOCKER_CONFIG.clueDocumentId,
  title: 'SECURITY ACCESS NOTE',
  chapter: 1,
  pages: [
    `SECURITY OFFICE — PERSONAL NOTE

Locker access reset after the last security audit (${PASSWORD_LOCKER_CONFIG.locationHint}).

Temporary keypad access code:

              ${PASSWORD_LOCKER_CONFIG.code}

Shred this slip once the night supervisor signs in. Do not leave it near the terminal.

— K. Mercer, Shift Security`
  ],
  explanation: {
    meaning: `This paper records the active ${PASSWORD_LOCKER_CONFIG.digits}-digit keypad code (${PASSWORD_LOCKER_CONFIG.code}) for the security locker.`,
    purpose: 'Allows the player to unlock PasswordLocker after searching the physical papers scattered around the facility.',
    kind: 'clue',
    evidenceId: PASSWORD_LOCKER_CONFIG.evidenceId
  }
};

interface FacilityPaperSeed {
  readonly title: string;
  readonly chapter: number;
  readonly kind: DocumentExplanationKind;
  readonly body: string;
  readonly meaning: string;
}

const FACILITY_PAPER_SEEDS: readonly FacilityPaperSeed[] = [
  {
    title: 'BREAKROOM FRIDGE NOTICE',
    chapter: 1,
    kind: 'character-detail',
    body: `STAFF NOTICE — SUB-LEVEL 1 GALLEY

Unlabelled containers will be discarded every Friday at 18:00. Whoever left the foil tray behind the milk carton three weeks ago: it is no longer food, please claim the tin.

— Facilities`,
    meaning: 'Routine staff friction from before the lockdown; contains no codes or tactical advantage.'
  },
  {
    title: 'FLASHLIGHT BATTERY SIGN-OUT',
    chapter: 1,
    kind: 'character-detail',
    body: `SUPPLY CAGE — CELL LOG

Shift A: 4x alkaline packs issued (Mercer)
Shift B: 6x alkaline packs issued (Okonkwo)
Shift C: 0 remaining — recharge cradle fault reported

Please stop taking cells from the emergency wall mounts.`,
    meaning: 'Explains why spare batteries are scarce around the facility without offering a puzzle code.'
  },
  {
    title: 'JANITORIAL CHEMICAL INVENTORY',
    chapter: 1,
    kind: 'mystery',
    body: `CUSTODIAL CLOSET B — MONTHLY COUNT

Sodium hypochlorite (5L): 3 jugs
Floor stripper: 1 drum
Absorbent sawdust: 0 bags (all sent to Corridor C)

Note: Re-order sawdust. Lab staff refused to say what spilled.`,
    meaning: 'Hints at an earlier bio-spill cleanup in Corridor C, serving as atmospheric worldbuilding.'
  },
  {
    title: 'BADGE READER FIRMWARE MEMO',
    chapter: 1,
    kind: 'mystery',
    body: `IT INFRASTRUCTURE BULLETIN #108

Card readers on Sub-Level 1 will blink amber twice before latching. Do not swipe rapid-fire; three failed reads trigger a 10-second local lockout.

Note: Keypad lockers operate offline and are unaffected by this patch.`,
    meaning: 'Clarifies facility hardware quirks while acting as a decoy technical memo.'
  },
  {
    title: 'PARKING STRUCTURE PERMIT LIST',
    chapter: 1,
    kind: 'character-detail',
    body: `SURFACE LOT B — OVERNIGHT VEHICLES

Bay 04 — Halloran, M. (Sedan, grey)
Bay 07 — Okonkwo, R. (Utility van)
Bay 12 — Mercer, K. (Compact, blue)

Gate arm frozen open since Tuesday sleet storm.`,
    meaning: 'Lists key staff whose vehicles never left the surface lot, reinforcing the suddenness of the incident.'
  },
  {
    title: 'EXTINGUISHER INSPECTION TAGS',
    chapter: 1,
    kind: 'warning',
    body: `FIRE MARSHAL WALKTHROUGH — WEST CORRIDOR

Unit FE-11: Pressure nominal.
Unit FE-12: Pin bent, gauge in red. Tagged for swap.
Unit FE-14: Missing from wall bracket. Found wedged in service door.`,
    meaning: 'Shows staff were propping heavy doors open despite strict containment rules.'
  },
  {
    title: 'SHIFT SWAP REQUEST — DENIED',
    chapter: 1,
    kind: 'character-detail',
    body: `FORM HR-19 — SCHEDULE ADJUSTMENT

Applicant: T. Lin (Archive Clerk)
Requested: Move from Night Watch to Day Intake
Reason: "Persistent low-frequency hum behind Archive Wall D causing migraines."

Supervisor Stamp: DENIED — Minimum staffing threshold.`,
    meaning: 'Everyday bureaucratic paper showing clerks heard activity behind the walls beforehand.'
  },
  {
    title: 'BOOT LOCKER KEY RECEIPT',
    chapter: 1,
    kind: 'mystery',
    body: `MUDROOM LOCKER RECEIPT

 Brass padlock #22 — Key snapped in cylinder.
 Bolt cutters requested from Maintenance Bay 2.

(Note: Mechanical locker only. Contains wet-weather coveralls and rubber overshoes.)`,
    meaning: 'Harmless decoy locker note so players distinguish mechanical padlocks from the keypad security locker.'
  },
  {
    title: 'VENDING MACHINE REFUND SLIP',
    chapter: 1,
    kind: 'character-detail',
    body: `CANTEEN PETTY CASH VOUCHER

Amount: 1.50
Item: Coil B4 jammed again (salted peanuts).
Do NOT shake the cabinet. Last week the tilt alarm paged Security to the canteen at 02:00.`,
    meaning: 'Lightly underscores how jittery site security already was about loud metallic impacts.'
  },
  {
    title: 'INTERCOM LINE FAULT TICKET',
    chapter: 1,
    kind: 'mystery',
    body: `TELECOM WORK ORDER #883

Extension 204 (East Checkpost) — Dead carrier, static only.
Cable jacket chewed or abraded above false ceiling tile 19.

Status: Deferred until ceiling clearance granted.`,
    meaning: 'Decoy maintenance ticket explaining why internal phones cannot summon help.'
  },
  {
    title: 'CALIBRATION CERTIFICATE — DECIBEL METER',
    chapter: 2,
    kind: 'experiment-result',
    body: `ACOUSTIC LAB — INSTRUMENT CHECK

Model: SLM-400 Dosimeter
Threshold Setpoint: 62 dBA continuous / 78 dBC peak
Result: PASS

Reminder: Drop-testing steel trays in empty hallways is prohibited outside scheduled trials.`,
    meaning: 'Reinforces the facility obsession with acoustic measurement without advancing a specific puzzle.'
  },
  {
    title: 'COOLANT PUMP PRESSURE LOG',
    chapter: 2,
    kind: 'mystery',
    body: `SUB-LEVEL 2 CHILLER LOOP

00:00 — 3.8 bar
04:00 — 3.7 bar
08:00 — 2.1 bar (bleed valve found half-open)
12:00 — Restored to 3.8 bar

Initials: R.O.`,
    meaning: 'Routine engineering log signed by Okonkwo; contains numeric readings that are deliberately not keypad codes.'
  },
  {
    title: 'WELDING GAS CYLINDER TALLY',
    chapter: 2,
    kind: 'warning',
    body: `MAINTENANCE BAY — COMPRESSED GAS

Argon: 2 full, 1 empty (chained)
Acetylene: 1 half-full — Regulator valve weeping slightly. Keep spark sources clear of Bay 2 corner.`,
    meaning: 'Environmental detail for the maintenance area with zero credential data.'
  },
  {
    title: 'AIR HANDLER FILTER CHANGEOUT',
    chapter: 2,
    kind: 'mystery',
    body: `HVAC PREVENTIVE SHEET — AHU-03

Pre-filters clogged with coarse grey fibrous residue. Not fibreglass insulation. Sample bagged for Dr. Halloran per standing directive, though lab intake never signed receipt.`,
    meaning: 'Suggests biological shedding inside the ductwork while remaining a non-essential background memo.'
  },
  {
    title: 'TOOL CRIB OVERDUE NOTICE',
    chapter: 2,
    kind: 'character-detail',
    body: `OVERDUE EQUIPMENT — MAINTENANCE

1x Digital multimeter (Asset #M-19)
1x Insulated torque wrench
Checked out to: D. Novak — 9 days overdue.

Novak's locker was cleared Tuesday. Nobody found the wrench.`,
    meaning: 'Quietly implies an earlier staff disappearance covered up as routine turnover.'
  },
  {
    title: 'DIESEL TRANSFER MANIFEST',
    chapter: 2,
    kind: 'mystery',
    body: `FUEL STORAGE — TANK B

 Reserve volume: 640 litres (approx. 72 hrs continuous load).
 Transfer pump primed manually. Fuel is clean; generator shutdowns are electrical, not starvation.`,
    meaning: 'Confirms Generator B has plenty of fuel and only failed due to the missing exciter part.'
  },
  {
    title: 'FLOOR DRAIN BACKUP REPORT',
    chapter: 2,
    kind: 'mystery',
    body: `PLUMBING WORK TICKET

Sump grate in Washdown Room 2 backing up during pump cycle. Auger hit an obstruction 4 metres down—bent the spring tip. Leaving cover bolted shut.`,
    meaning: 'Believable plumbing report adding texture to the sub-level utility rooms.'
  },
  {
    title: 'HARD HAT & EARPRO POLICY',
    chapter: 2,
    kind: 'warning',
    body: `SAFETY REMINDER — GENERATOR ENCLOSURE

Standard foam earplugs are DISCONTINUED past Sub-Level 1. Staff wearing ear protection failed to hear corridor movement warnings twice last quarter.`,
    meaning: 'Ironic workplace safety memo explaining why workers had to listen carefully in the dark.'
  },
  {
    title: 'CONDUIT REROUTING SKETCH NOTE',
    chapter: 2,
    kind: 'mystery',
    body: `ELECTRICAL NOTE — JUNCTION BOX J-14

Bypassed scorched neutral bus on lighting circuit C. Expect occasional ballast hum in the east hallway when main load cycles.`,
    meaning: 'Explains flickering fluorescent fixtures in the facility.'
  },
  {
    title: 'LOCKOUT TAGOUT REGISTER',
    chapter: 2,
    kind: 'mystery',
    body: `LOTO LOGBOOK — PAGE 44

Tag #08 — Crusher Hopper (Cleared)
Tag #09 — Return Fan Damper (ACTIVE — Do not energize, Okonkwo)
Tag #10 — Autoclave 2 (Cleared)`,
    meaning: 'Shows Okonkwo electrically isolated the ventilation damper after hearing movement inside.'
  },
  {
    title: 'ACOUSTIC TRIAL — STIMULUS LIST B',
    chapter: 3,
    kind: 'experiment-result',
    body: `TRIAL SERIES 14 — SOUND SAMPLES

Sample A: Ceramic mug shatter (0.4s) — High orientation
Sample B: Rubber-soled boot scuff — Minimal orientation
Sample C: Brass keys jingling — Immediate approach

Discard Sample C from future baseline runs. Response too rapid for shutter camera.`,
    meaning: 'Lab record reinforcing that sharp metallic sounds attract immediate attention.'
  },
  {
    title: 'CAMERA HOUSING REPLACEMENT REQUEST',
    chapter: 3,
    kind: 'experiment-result',
    body: `OBSERVATION CELL — OPTICS DAMAGE

Dome Camera 02 lens crazed from impact. Specimen struck the polycarbonate housing directly after infrared LEDs clicked on.

Recommendation: Disable IR relay click or switch to passive low-light tubes.`,
    meaning: 'Shows even tiny mechanical relay clicks drew the creature toward observation equipment.'
  },
  {
    title: 'SEDATION DART BALLISTICS MEMO',
    chapter: 3,
    kind: 'experiment-result',
    body: `VETERINARY / CONTAINMENT REVIEW

Carfentanil-xylazine compound (30 mL pneumatic projector):
- Trial 1: Deflected off dorsal ridge.
- Trial 2: Full intramuscular delivery. Specimen pulled dart free, chewed aluminium barrel flat, remained ambulatory for 4 hours.

Discontinue chemical restraint assumptions.`,
    meaning: 'Eliminates any hope of fighting or tranquilizing Subject 09.'
  },
  {
    title: 'BIOMETRIC BAND TELEMETRY LOG',
    chapter: 3,
    kind: 'character-detail',
    body: `STAFF STRESS MONITORING — VOLUNTARY PILOT

Observer ID: 04 (Halloran)
Resting HR in Observation Room 3: 94 bpm
Peak HR during Specimen Wall Contact: 138 bpm

Handwritten margin note: "Take the wristband back. I know when I am afraid."`,
    meaning: 'Characterizes Dr. Halloran under prolonged psychological strain.'
  },
  {
    title: 'ONE-WAY GLASS SEALANT CHECK',
    chapter: 3,
    kind: 'warning',
    body: `GLAZING INSPECTION — OBS ROOM 3

Laminated pane intact, but neoprene perimeter gasket is dry-rotted. Sound attenuation dropped from 48 dB to 31 dB. Assume whispers carry into the pit if leaning against the sill.`,
    meaning: 'Atmospheric warning about degraded soundproofing around observation windows.'
  },
  {
    title: 'SPECIMEN MASS ESTIMATE SHEET',
    chapter: 3,
    kind: 'experiment-result',
    body: `FLOOR LOAD CELL SUMMARY — CELL 09

Week 02: 184 kg
Week 06: 219 kg
Week 10: Scale sensor cable severed from underneath floor plate.

Note: Growth rate inconsistent with caloric intake recorded on chart.`,
    meaning: 'Deepens the biological mystery of Subject 09 without altering main story lore.'
  },
  {
    title: 'SLEEP DEPRIVATION WAIVER',
    chapter: 3,
    kind: 'character-detail',
    body: `MEDICAL DISPENSATION — SITE INFIRMARY

Dr. M. Halloran cleared for consecutive 16-hour observation blocks pending board review. Mild hand tremor noted; prescribed propranolol (declined by patient).`,
    meaning: 'Humanizes the research lead and frames the frantic tone of later notes.'
  },
  {
    title: 'AUDIO TAPE ARCHIVE INDEX',
    chapter: 3,
    kind: 'mystery',
    body: `REEL CABINET — DRAWER 2

Reel 09-A: Baseline silence (erased/reused)
Reel 09-B: Vocalization mimicry check — MOVED TO CENTRAL ARCHIVE
Reel 09-C: Ventilation scratch analysis

Do not play Reel 09-B over open speakers.`,
    meaning: 'Eerie decoy index hinting at archived recordings deeper in the facility.'
  },
  {
    title: 'OVERSIGHT TRAVEL VOUCHER',
    chapter: 4,
    kind: 'character-detail',
    body: `EXECUTIVE VISITOR LOG — SUB-LEVEL 4

Visitor: A. Voss (Board Liaison)
Arrival: 10:15
Departure: 10:42

Declined protective escort into Containment Wing. Signed risk continuance paperwork from the conference room and requested car service back to airstrip.`,
    meaning: 'Shows A. Voss never even looked at Subject 09 in person before approving continued trials.'
  },
  {
    title: 'SHREDDER BIN OVERFLOW MEMO',
    chapter: 4,
    kind: 'mystery',
    body: `CENTRAL LAB — DOCUMENT CONTROL

Cross-cut shredder motor thermally tripped. Do NOT leave classified drafts stacked beside the bin for morning custodial pickup. Burn bags are in Closet 4.`,
    meaning: 'Explains why intact confidential memos and scattered papers are still lying on desks.'
  },
  {
    title: 'ARCHIVE HUMIDITY ALARM LOG',
    chapter: 4,
    kind: 'mystery',
    body: `ENVIRONMENTAL LOGGER — VAULT B

Relative Humidity spiked to 74% at 03:10 when emergency dampers closed. Paper stock curlingslightly; silica canisters saturated.`,
    meaning: 'Purely mundane archive condition note serving as a realistic decoy paper.'
  },
  {
    title: 'SERVER RACK UPS BATTERY TEST',
    chapter: 4,
    kind: 'mystery',
    body: `DATA ROOM — UNINTERRUPTIBLE POWER

Lead-acid bank capacity: 18 minutes runtime on main loss.
Audit daemon prioritized: Door Access Logs & Hatch Telemetry remain powered even when corridor lighting drops.`,
    meaning: 'Explains how Hatch 1 electronic audit logs survived the generator failure in Chapter 5.'
  },
  {
    title: 'NDA REMINDER — CONTRACT STAFF',
    chapter: 4,
    kind: 'warning',
    body: `LEGAL COMPLIANCE — FORM 90-C

Any mention of subterranean excavation depth, acoustic trials, or specimen morphology outside perimeter fencing constitutes an immediate felony breach under Clause 12.`,
    meaning: 'Corporate secrecy boilerplate adding weight to the facility setting.'
  },
  {
    title: 'SPECIMEN ORIGIN SHIPPING MANIFEST',
    chapter: 4,
    kind: 'mystery',
    body: `RECEIVING DOCK — REDACTED BILL OF LADING

Crate Gross Weight: 410 kg (lead-lined steel)
Point of Origin: [BLACKED OUT IN MARKER]
Customs Declaration: "Core drilling geological samples — Keep upright"`,
    meaning: 'Tantalizing lore scrap hinting Subject 09 arrived disguised as mining cargo.'
  },
  {
    title: 'DECONTAMINATION SHOWER NOTICE',
    chapter: 4,
    kind: 'warning',
    body: `AIRLOCK 4 — WATER PRESSURE FAULT

Deluge valves jammed dry. Keep N95 respirators sealed when passing threshold; dry particulate remains on grating.`,
    meaning: 'Atmospheric hazard note near the lab transition.'
  },
  {
    title: 'COLD STORAGE DEFROST RECORD',
    chapter: 5,
    kind: 'mystery',
    body: `CARCASS FREEZER — CONTAINMENT ANNEX

Compressor dead 140+ hours. Remaining porcine halves spoiled and disposed down incinerator chute Thursday. Freezer Hooks 1 through 8 empty.`,
    meaning: 'Corroborates the cancelled feeding schedule: there is literally no food left on site.'
  },
  {
    title: 'BLAST DOOR HYDRAULIC BLEED',
    chapter: 5,
    kind: 'warning',
    body: `CONTAINMENT BULKHEAD 2

Manual hand-pump requires 40 strokes to crack seal if mains fail. Do not attempt while specimen is in adjacent vestibule—relief valve hisses loudly at 80 psi.`,
    meaning: 'Builds tension for the containment wing without altering door mechanics.'
  },
  {
    title: 'EMERGENCY BEACON CHECKLIST',
    chapter: 5,
    kind: 'mystery',
    body: `SURFACE RELAY — DISTRESS TRANSMITTER

 Automated distress squawk disabled per Board Directive 04 ("prevent unvetted municipal response"). Manual key switch located surface-side only.`,
    meaning: 'Explains why no outside rescue team is coming until the player escapes.'
  },
  {
    title: 'EVACUATION MUSTER ROLL — INCOMPLETE',
    chapter: 5,
    kind: 'character-detail',
    body: `WEST STAIRWELL HEADCOUNT — NIGHT OF INCIDENT

Mercer, K. — Present (injured ankle)
Okonkwo, R. — Sent back for generator tools
Halloran, M. — Unaccounted
Lin, T. — Present

Bottom line smudged: "Sealing inner fire door now. God forgive us."`,
    meaning: 'Final human trace of the staff evacuation before the player wakes/arrives inside.'
  }
];

export const DECOY_DOCUMENTS: readonly GameDocument[] = FACILITY_PAPER_SEEDS.map(
  (seed, index): GameDocument => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `doc_scattered_${number}`,
      title: seed.title,
      chapter: seed.chapter,
      pages: [seed.body],
      explanation: {
        meaning: seed.meaning,
        purpose: 'Believable facility paper that enriches environmental storytelling while acting as a non-password search decoy.',
        kind: seed.kind
      }
    };
  }
);

/**
 * Total: 50 unique physical papers (within the 40–50 target range).
 * - 10 original story documents (preserved verbatim)
 * - 1 authoritative password clue paper (synced with PASSWORD_LOCKER_CONFIG)
 * - 39 unique believable facility memos, logs, experiment notes, and decoys
 */
export const DOCUMENTS: readonly GameDocument[] = [
  ...STORY_DOCUMENTS,
  PASSWORD_DOCUMENT,
  ...DECOY_DOCUMENTS
];

const DOCUMENT_MAP: ReadonlyMap<string, GameDocument> = new Map<string, GameDocument>(
  DOCUMENTS.map((doc): [string, GameDocument] => [doc.id, doc])
);

if (DOCUMENT_MAP.size !== DOCUMENTS.length) {
  throw new Error(
    `[documents] Duplicate document ID detected: expected ${DOCUMENTS.length} unique IDs, got ${DOCUMENT_MAP.size}.`
  );
}

/**
 * Ordered list of all discoverable document IDs for deterministic seeded placement.
 */
export const DISCOVERABLE_DOCUMENT_IDS: readonly string[] = Object.freeze(
  DOCUMENTS.map((doc): string => doc.id)
);

/**
 * O(1) lookup preserved with exact original signature for PaperReader and save/load systems.
 */
export function getDocumentById(id: string): GameDocument | undefined {
  return DOCUMENT_MAP.get(id);
}

/**
 * Helper for chapter-filtered spawning or archive UI views.
 */
export function getDocumentsByChapter(chapter: number): readonly GameDocument[] {
  return DOCUMENTS.filter((doc): boolean => doc.chapter === chapter);
}

/**
 * Deterministic Fisher-Yates shuffle using a 32-bit seed (Mulberry32) so
 * physical paper placement across facility desks/shelves restores identically
 * on save/load when given the run's saved seed.
 */
export function getSeededDocumentOrder(seed: number): GameDocument[] {
  const ordered: GameDocument[] = [...DOCUMENTS];
  let state = seed >>> 0;

  const nextRandom = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const current = ordered[i];
    const swapTarget = ordered[j];
    if (current !== undefined && swapTarget !== undefined) {
      ordered[i] = swapTarget;
      ordered[j] = current;
    }
  }

  return ordered;
}