
import { DOCUMENTS } from '../Documents/DocumentRegistry';
import {
  EVIDENCE,
  QUESTIONS,
  ObjectiveTracker,
} from '../progress/ObjectiveTracker';

type Tab =
  | 'overview'
  | 'objectives'
  | 'documents'
  | 'evidence'
  | 'testimony'
  | 'contradictions'
  | 'hypotheses'
  | 'questions';

const COLORS = {
  background: '#080a0b',
  panel: '#0e1113',
  panelLight: '#14191b',
  border: '#252b2d',
  text: '#e4ddca',
  muted: '#938b79',
  dim: '#5f625b',
  gold: '#c8a66a',
  red: '#a94d42',
  green: '#82977b',
};

const FONT_MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const FONT_SERIF = 'Georgia, "Times New Roman", serif';

function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char];
  });
}

export class JournalUI {
  private root: HTMLDivElement | null = null;
  private tab: Tab = 'overview';
  private openDocId: string | null = null;
  private searchTerm = '';

  constructor(
    private readonly tracker: ObjectiveTracker,
    private readonly canOpen: () => boolean,
    private readonly onOpenChange: (open: boolean) => void,
  ) {
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.root) {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
      return;
    }

    if (
      (event.code === 'KeyJ' || event.code === 'Tab') &&
      !event.repeat &&
      this.canOpen()
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open();
    }
  };

  open(): void {
    if (this.root || !this.canOpen()) return;

    this.onOpenChange(true);

    const root = document.createElement('div');
    root.className = 'dfm-investigation-journal';

    root.style.cssText = `
      position:fixed;
      inset:0;
      z-index:100;
      display:grid;
      grid-template-rows:68px minmax(0,1fr);
      overflow:hidden;
      color:${COLORS.text};
      background:
        radial-gradient(ellipse at 18% 0%,rgba(130,105,65,.09),transparent 40%),
        ${COLORS.background};
      font-family:${FONT_SERIF};
      isolation:isolate;
    `;

    root.innerHTML = `
      <style>
        .dfm-investigation-journal * { box-sizing:border-box; }
        .dfm-investigation-journal button,
        .dfm-investigation-journal input { font:inherit; }
        .dfm-investigation-journal button { cursor:pointer; }
        .dfm-j-header {
          display:flex;align-items:center;gap:20px;
          padding:0 3.2vw;border-bottom:1px solid ${COLORS.border};
          background:rgba(5,7,8,.94);
        }
        .dfm-j-brand {
          font:700 11px ${FONT_MONO};letter-spacing:.25em;
          color:${COLORS.gold};white-space:nowrap;
        }
        .dfm-j-case {
          font:10px ${FONT_MONO};letter-spacing:.16em;
          color:${COLORS.dim};
        }
        .dfm-j-progress {
          margin-left:auto;font:10px ${FONT_MONO};
          letter-spacing:.15em;color:${COLORS.muted};
        }
        .dfm-j-close {
          border:1px solid ${COLORS.border};background:transparent;
          color:${COLORS.muted};padding:9px 14px;
          font:10px ${FONT_MONO};letter-spacing:.2em;
        }
        .dfm-j-layout {
          display:grid;grid-template-columns:230px minmax(0,1fr) 250px;
          min-height:0;
        }
        .dfm-j-sidebar {
          overflow-y:auto;border-right:1px solid ${COLORS.border};
          padding:24px 14px;background:rgba(10,12,13,.82);
        }
        .dfm-j-nav-label {
          padding:8px 10px 13px;color:${COLORS.dim};
          font:9px ${FONT_MONO};letter-spacing:.23em;
        }
        .dfm-j-nav {
          display:flex;width:100%;align-items:center;gap:12px;
          text-align:left;padding:12px 10px;margin:2px 0;
          border:1px solid transparent;background:transparent;
          color:${COLORS.muted};font:10px ${FONT_MONO};
          letter-spacing:.12em;transition:background .16s,color .16s;
        }
        .dfm-j-nav:hover { background:#171b1c;color:${COLORS.text}; }
        .dfm-j-nav.active {
          background:rgba(200,166,106,.09);
          border-color:rgba(200,166,106,.22);
          color:${COLORS.gold};
        }
        .dfm-j-nav-icon { width:18px;color:${COLORS.dim}; }
        .dfm-j-main { min-width:0;overflow-y:auto;padding:36px clamp(22px,4vw,64px) 70px; }
        .dfm-j-right {
          overflow-y:auto;border-left:1px solid ${COLORS.border};
          background:rgba(10,12,13,.7);padding:26px 18px;
        }
        .dfm-j-eyebrow {
          color:${COLORS.gold};font:10px ${FONT_MONO};
          letter-spacing:.25em;text-transform:uppercase;
        }
        .dfm-j-title {
          margin:12px 0 9px;font:400 clamp(26px,3vw,42px)/1.15 ${FONT_SERIF};
          letter-spacing:-.025em;color:${COLORS.text};
        }
        .dfm-j-subtitle {
          max-width:680px;color:${COLORS.muted};
          font:italic 15px/1.7 ${FONT_SERIF};
        }
        .dfm-j-rule { height:1px;background:${COLORS.border};margin:25px 0; }
        .dfm-j-section-title {
          margin:0 0 13px;color:${COLORS.gold};
          font:10px ${FONT_MONO};letter-spacing:.22em;
        }
        .dfm-j-card {
          border:1px solid ${COLORS.border};background:${COLORS.panel};
          padding:18px 19px;margin-bottom:12px;
        }
        .dfm-j-card-title { color:${COLORS.text};font:17px/1.45 ${FONT_SERIF}; }
        .dfm-j-card-body { margin-top:8px;color:${COLORS.muted};font:13px/1.8 ${FONT_SERIF}; }
        .dfm-j-meta { color:${COLORS.dim};font:9px ${FONT_MONO};letter-spacing:.16em; }
        .dfm-j-pill {
          display:inline-block;padding:5px 8px;border:1px solid ${COLORS.border};
          color:${COLORS.muted};font:9px ${FONT_MONO};letter-spacing:.12em;
        }
        .dfm-j-stat-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px; }
        .dfm-j-stat {
          padding:17px;background:${COLORS.panel};border:1px solid ${COLORS.border};
        }
        .dfm-j-stat strong { display:block;font:25px ${FONT_SERIF};color:${COLORS.text}; }
        .dfm-j-stat span { display:block;margin-top:7px;color:${COLORS.dim};font:9px ${FONT_MONO};letter-spacing:.14em; }
        .dfm-j-bar { height:4px;background:#252a29;margin-top:12px;overflow:hidden; }
        .dfm-j-bar > i { display:block;height:100%;background:${COLORS.gold}; }
        .dfm-j-row {
          display:flex;justify-content:space-between;align-items:center;
          gap:15px;padding:14px 0;border-bottom:1px solid ${COLORS.border};
        }
        .dfm-j-row button {
          text-align:left;background:transparent;border:0;color:${COLORS.text};
          padding:0;font:15px/1.5 ${FONT_SERIF};
        }
        .dfm-j-row button:hover { color:${COLORS.gold}; }
        .dfm-j-search {
          width:100%;padding:12px 14px;margin:0 0 18px;
          background:${COLORS.panel};border:1px solid ${COLORS.border};
          outline:none;color:${COLORS.text};font:11px ${FONT_MONO};
        }
        .dfm-j-search:focus { border-color:${COLORS.gold}; }
        .dfm-j-document {
          white-space:pre-wrap;overflow-wrap:anywhere;
          padding:22px;background:#171713;border-left:2px solid ${COLORS.gold};
          color:#d5c9ad;font:14px/1.9 ${FONT_SERIF};
        }
        .dfm-j-empty {
          border:1px dashed ${COLORS.border};padding:26px;
          color:${COLORS.dim};font:italic 14px/1.7 ${FONT_SERIF};
        }
        .dfm-j-right-heading {
          margin:0 0 18px;color:${COLORS.gold};
          font:10px ${FONT_MONO};letter-spacing:.2em;
        }
        .dfm-j-profile {
          border:1px solid ${COLORS.border};padding:15px;background:${COLORS.panel};
        }
        .dfm-j-profile-mark {
          display:grid;place-items:center;width:100%;height:110px;
          margin-bottom:15px;border:1px solid #332723;
          background:radial-gradient(ellipse,#34221e 0%,#111313 70%);
          color:#bd7662;font:700 26px ${FONT_MONO};letter-spacing:.12em;
        }
        .dfm-j-profile p { color:${COLORS.muted};font:12px/1.75 ${FONT_SERIF}; }
        .dfm-j-footer {
          margin-top:24px;color:${COLORS.dim};font:9px/1.8 ${FONT_MONO};
          letter-spacing:.12em;
        }
        @media(max-width:1050px) {
          .dfm-j-layout { grid-template-columns:190px minmax(0,1fr); }
          .dfm-j-right { display:none; }
        }
        @media(max-width:650px) {
          .dfm-j-header { padding:0 12px;gap:10px; }
          .dfm-j-case { display:none; }
          .dfm-j-layout { grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr); }
          .dfm-j-sidebar { display:flex;overflow-x:auto;padding:8px;gap:5px;border-right:0;border-bottom:1px solid ${COLORS.border}; }
          .dfm-j-nav-label { display:none; }
          .dfm-j-nav { width:auto;flex-shrink:0;padding:10px; }
          .dfm-j-nav-icon { display:none; }
          .dfm-j-main { padding:24px 16px 55px; }
          .dfm-j-stat-grid { grid-template-columns:1fr 1fr; }
        }
      </style>

      <header class="dfm-j-header">
        <div class="dfm-j-brand">D.F.M. / INVESTIGATION</div>
        <div class="dfm-j-case">CASE FILE 09-██ / CLASSIFIED</div>
        <div class="dfm-j-progress" data-progress></div>
        <button class="dfm-j-close" data-close>ESC&nbsp; ✕</button>
      </header>

      <div class="dfm-j-layout">
        <aside class="dfm-j-sidebar">
          <div style="width:100%">
            <div class="dfm-j-nav-label">CASE DIRECTORY</div>
            <nav data-navigation>
              ${([
                ['overview', '01', 'CASE OVERVIEW'],
                ['objectives', '02', 'OBJECTIVES'],
                ['documents', '03', 'DOCUMENTS'],
                ['evidence', '04', 'EVIDENCE'],
                ['testimony', '05', 'TESTIMONY'],
                ['contradictions', '06', 'CONTRADICTIONS'],
                ['hypotheses', '07', 'HYPOTHESES'],
                ['questions', '08', 'UNRESOLVED'],
              ] as [Tab, string, string][]).map(([id, icon, label]) => `
                <button class="dfm-j-nav" data-tab="${id}">
                  <span class="dfm-j-nav-icon">${icon}</span>${label}
                </button>
              `).join('')}
            </nav>
            <div class="dfm-j-footer">
              FACILITY RECORDS DIVISION<br>
              INTERNAL USE ONLY<br>
              UNAUTHORISED ACCESS PROHIBITED
            </div>
          </div>
        </aside>

        <main class="dfm-j-main" data-main></main>

        <aside class="dfm-j-right">
          <h3 class="dfm-j-right-heading">SUBJECT PROFILE</h3>
          <div class="dfm-j-profile">
            <div class="dfm-j-profile-mark">09</div>
            <div class="dfm-j-eyebrow">CONTAINMENT STATUS</div>
            <div class="dfm-j-card-title" style="margin-top:8px">BREACH REPORTED</div>
            <p>Experimental organism. Current location unknown. Do not approach without authorisation.</p>
            <div class="dfm-j-rule"></div>
            <div class="dfm-j-meta">KNOWN BEHAVIOUR</div>
            <p>Responds to sound, investigates disturbances and may revisit previously searched locations.</p>
            <span class="dfm-j-pill">THREAT: HIGH</span>
          </div>
          <div class="dfm-j-rule"></div>
          <h3 class="dfm-j-right-heading">FIELD REMINDER</h3>
          <p class="dfm-j-card-body">Noise can expose your position. Change your tactics when the creature begins learning your patterns.</p>
          <div class="dfm-j-footer">SUBJECT 09 // FIELD NOTES<br>DOCUMENTS MAY BE INCOMPLETE</div>
        </aside>
      </div>
    `;

    document.body.appendChild(root);
    this.root = root;

    root.querySelector('[data-close]')?.addEventListener('click', () => this.close());

    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.tab = button.dataset.tab as Tab;
        this.openDocId = null;
        this.render();
      });
    });

    this.render();
  }

  close(): void {
    if (!this.root) return;

    this.root.remove();
    this.root = null;
    this.openDocId = null;

    this.onOpenChange(false);
  }

  dispose(): void {
    this.close();
    window.removeEventListener('keydown', this.onKey, true);
  }

  private render(): void {
    if (!this.root) return;

    const main = this.root.querySelector<HTMLElement>('[data-main]');
    if (!main) return;

    const progress = this.root.querySelector<HTMLElement>('[data-progress]');
    if (progress) {
      progress.textContent =
        `OBJECTIVES ${this.tracker.getCompletedCount()}/${this.tracker.getTotalCount()}`;
    }

    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === this.tab;
      button.classList.toggle('active', active);
    });

    if (this.tab === 'overview') this.renderOverview(main);
    else if (this.tab === 'objectives') this.renderObjectives(main);
    else if (this.tab === 'documents') {
      if (this.openDocId) this.renderDocument(main, this.openDocId);
      else this.renderDocuments(main);
    }
    else if (this.tab === 'evidence') this.renderEvidence(main);
    else if (this.tab === 'testimony') this.renderTestimony(main);
    else if (this.tab === 'contradictions') this.renderContradictions(main);
    else if (this.tab === 'hypotheses') this.renderHypotheses(main);
    else this.renderQuestions(main);
  }

  private heading(eyebrow: string, title: string, subtitle: string): string {
    return `
      <div class="dfm-j-eyebrow">${escapeHTML(eyebrow)}</div>
      <h1 class="dfm-j-title">${escapeHTML(title)}</h1>
      <p class="dfm-j-subtitle">${escapeHTML(subtitle)}</p>
      <div class="dfm-j-rule"></div>
    `;
  }

  private empty(message: string): string {
    return `<div class="dfm-j-empty">${escapeHTML(message)}</div>`;
  }

  private card(title: string, body: string, meta = ''): string {
    return `
      <article class="dfm-j-card">
        ${meta ? `<div class="dfm-j-meta">${escapeHTML(meta)}</div>` : ''}
        <div class="dfm-j-card-title">${escapeHTML(title)}</div>
        <div class="dfm-j-card-body">${escapeHTML(body)}</div>
      </article>
    `;
  }

  private renderOverview(main: HTMLElement): void {
    const chapter = this.tracker.getChapter();
    const active = this.tracker.getActive();
    const completed = this.tracker.getCompletedCount();
    const total = this.tracker.getTotalCount();
    const documents = this.tracker.getDocuments();
    const evidence = this.tracker.getEvidence();
    const percent = total ? Math.round((completed / total) * 100) : 0;

    main.innerHTML = `
      ${this.heading(
        'CLASSIFIED CASE FILE / 09',
        'Investigation overview',
        'A record of the containment failure, the surviving evidence and the route to escape.',
      )}

      <div class="dfm-j-stat-grid">
        <div class="dfm-j-stat"><strong>${completed}/${total}</strong><span>OBJECTIVES COMPLETE</span></div>
        <div class="dfm-j-stat"><strong>${documents.length}</strong><span>DOCUMENTS RECOVERED</span></div>
        <div class="dfm-j-stat"><strong>${evidence.length}</strong><span>EVIDENCE ITEMS</span></div>
      </div>

      <div class="dfm-j-rule"></div>
      <div class="dfm-j-section-title">CHAPTER ${chapter.index} / ${escapeHTML(chapter.title)}</div>
      <div class="dfm-j-card">
        <div class="dfm-j-card-title">${escapeHTML(chapter.purpose)}</div>
        <div class="dfm-j-bar"><i style="width:${percent}%"></i></div>
        <div class="dfm-j-meta" style="margin-top:10px">${percent}% OVERALL OBJECTIVE COMPLETION</div>
      </div>

      <div class="dfm-j-section-title" style="margin-top:28px">ACTIVE FIELD ORDERS</div>
      ${active.length ? active.map((o) => this.card(o.text, 'Pending field objective.', 'OPEN OBJECTIVE')).join('') : this.empty('No active objectives remain in this chapter.')}

      <div class="dfm-j-section-title" style="margin-top:28px">MISSION STATEMENT</div>
      ${this.card(
        'Survive. Investigate. Escape.',
        'Find a way out of the facility while discovering what the staff knew about Subject 09.',
        'PRIMARY DIRECTIVE',
      )}
    `;
  }

  private renderObjectives(main: HTMLElement): void {
    const chapter = this.tracker.getChapter();
    const active = this.tracker.getActive();
    const completed = this.tracker.getCompleted();

    main.innerHTML = `
      ${this.heading(
        `CHAPTER ${chapter.index} / FIELD ORDERS`,
        chapter.title,
        chapter.purpose,
      )}
      <div class="dfm-j-section-title">ACTIVE OBJECTIVES / ${active.length}</div>
      ${active.length ? active.map((o, i) => `
        <div class="dfm-j-row">
          <button>${String(i + 1).padStart(2, '0')} &nbsp; ${escapeHTML(o.text)}</button>
          <span class="dfm-j-pill">PENDING</span>
        </div>
      `).join('') : this.empty('All objectives in this chapter are complete.')}

      <div class="dfm-j-section-title" style="margin-top:30px">COMPLETED OBJECTIVES / ${completed.length}</div>
      ${completed.length ? completed.map((o) => `
        <div class="dfm-j-row">
          <button style="color:${COLORS.green}">✓ &nbsp; ${escapeHTML(o.text)}</button>
          <span class="dfm-j-pill">VERIFIED</span>
        </div>
      `).join('') : this.empty('No objectives have been verified yet.')}
    `;
  }

  private renderDocuments(main: HTMLElement): void {
    main.innerHTML = `
      ${this.heading('ARCHIVE / RECOVERED MATERIAL', 'Documents', 'Recovered notes, logs, transcripts and classified records.')}

      <input class="dfm-j-search" data-search placeholder="SEARCH RECOVERED DOCUMENTS..." value="${escapeHTML(this.searchTerm)}">

      <div data-document-list></div>
    `;

    const search = main.querySelector<HTMLInputElement>('[data-search]');
    search?.addEventListener('input', () => {
      this.searchTerm = search.value;
      this.renderDocumentRows(main);
    });

    this.renderDocumentRows(main);
  }

  private renderDocumentRows(main: HTMLElement): void {
    const list = main.querySelector<HTMLElement>('[data-document-list]');
    if (!list) return;

    const ids = this.tracker.getDocuments();
    const filtered = ids.filter((id) => {
      const doc = DOCUMENTS.find((d) => d.id === id);
      return `${doc?.title ?? id} ${doc?.pages.join(' ') ?? ''}`
        .toLowerCase()
        .includes(this.searchTerm.toLowerCase());
    });

    if (!filtered.length) {
      list.innerHTML = this.empty(
        ids.length ? 'No documents match this search.' : 'No documents recovered. Search the facility for paper records and research logs.',
      );
      return;
    }

    list.innerHTML = filtered.map((id, index) => {
      const doc = DOCUMENTS.find((d) => d.id === id);
      if (!doc) return '';

      return `
        <div class="dfm-j-row">
          <button data-open-doc="${escapeHTML(id)}">
            <span class="dfm-j-meta">${String(index + 1).padStart(2, '0')} / CHAPTER ${doc.chapter}</span><br>
            ${escapeHTML(doc.title)}
          </button>
          <span class="dfm-j-pill">RECOVERED</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll<HTMLButtonElement>('[data-open-doc]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openDocId = button.dataset.openDoc ?? null;
        this.render();
      });
    });
  }

  private renderDocument(main: HTMLElement, id: string): void {
    const doc = DOCUMENTS.find((d) => d.id === id);
    if (!doc) {
      this.openDocId = null;
      this.renderDocuments(main);
      return;
    }

    main.innerHTML = `
      <button data-back class="dfm-j-pill" style="margin-bottom:24px">← BACK TO ARCHIVE</button>
      ${this.heading(
        `RECOVERED RECORD / CHAPTER ${doc.chapter}`,
        doc.title,
        'Original document transcription. Text is preserved from the recovered facility record.',
      )}

      <div class="dfm-j-section-title">ORIGINAL RECORD</div>
      <div class="dfm-j-document">${escapeHTML(doc.pages.join('\n\n— PAGE BREAK —\n\n'))}</div>

      <div class="dfm-j-rule"></div>
      <div class="dfm-j-section-title">INVESTIGATOR'S NOTES</div>
      ${this.card('What this record indicates', doc.explanation.meaning)}
      ${this.card('Why this record matters', doc.explanation.purpose)}
      <span class="dfm-j-pill">${escapeHTML(doc.explanation.kind.replace('-', ' '))}</span>
    `;

    main.querySelector('[data-back]')?.addEventListener('click', () => {
      this.openDocId = null;
      this.render();
    });
  }

  private renderEvidence(main: HTMLElement): void {
    const ids = this.tracker.getEvidence();

    main.innerHTML = `
      ${this.heading('INVESTIGATION / VERIFIED CLUES', 'Evidence', 'Findings extracted from recovered documents.')}
      ${ids.length ? ids.map((id, i) => this.card(
        EVIDENCE[id] ?? id,
        'Derived from recovered facility material.',
        `EVIDENCE ITEM ${String(i + 1).padStart(2, '0')}`,
      )).join('') : this.empty('No evidence has been established. Recover documents to build the case.')}
    `;
  }

  private renderTestimony(main: HTMLElement): void {
    const docs = this.tracker.getDocuments()
      .map((id) => DOCUMENTS.find((d) => d.id === id))
      .filter((doc) => doc && (
        doc.explanation.kind.includes('transcript') ||
        doc.explanation.kind.includes('character') ||
        doc.title.toLowerCase().includes('transcript') ||
        doc.title.toLowerCase().includes('note')
      ));

    main.innerHTML = `
      ${this.heading('WITNESS RECORDS / RECOVERED STATEMENTS', 'Testimony', 'Statements and observations recovered from facility personnel.')}
      ${docs.length ? docs.map((doc) => this.card(
        doc!.title,
        doc!.pages.join('\n\n'),
        'RECOVERED STATEMENT',
      )).join('') : this.empty('No testimony recovered. Look for researcher notes, observation transcripts and staff records.')}
    `;
  }

  private renderContradictions(main: HTMLElement): void {
    main.innerHTML = `
      ${this.heading('CROSS-EXAMINATION / RECORD DISCREPANCIES', 'Contradictions', 'Conflicting records must be compared before a conclusion is accepted.')}
      ${this.empty('No verified contradiction has been established yet. Compare recovered records as the investigation develops.')}
    `;
  }

  private renderHypotheses(main: HTMLElement): void {
    const docs = this.tracker.getDocuments()
      .map((id) => DOCUMENTS.find((d) => d.id === id))
      .filter((doc) => doc && (
        doc.explanation.kind.includes('experiment') ||
        doc.explanation.kind.includes('mystery') ||
        doc.explanation.kind.includes('warning')
      ));

    main.innerHTML = `
      ${this.heading('ANALYST WORKSPACE / PROVISIONAL', 'Hypotheses', 'Possible explanations. These are not confirmed facts.')}
      ${docs.length ? docs.map((doc) => this.card(
        `Working lead: ${doc!.title}`,
        doc!.explanation.meaning,
        'PROVISIONAL / REQUIRES CORROBORATION',
      )).join('') : this.empty('No working hypotheses yet. Recover experiment records and incident reports to begin connecting the evidence.')}
    `;
  }

  private renderQuestions(main: HTMLElement): void {
    const ids = this.tracker.getQuestions();

    main.innerHTML = `
      ${this.heading('OPEN INVESTIGATION / NOT YET RESOLVED', 'Unresolved questions', 'Questions raised by evidence but not yet answered.')}
      ${ids.length ? ids.map((id, i) => this.card(
        QUESTIONS[id] ?? id,
        'Awaiting corroborating evidence.',
        `OPEN QUESTION ${String(i + 1).padStart(2, '0')}`,
      )).join('') : this.empty('No unresolved questions recorded yet. Collect documents to uncover new leads.')}
    `;
  }
}
