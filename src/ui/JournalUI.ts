
import { DOCUMENTS } from '../Documents/DocumentRegistry';

import {
  CHAPTERS,
  EVIDENCE,
  QUESTIONS,
  ObjectiveTracker
} from '../progress/ObjectiveTracker';

type Tab = 'objectives' | 'documents';

export class JournalUI {
  private root: HTMLDivElement | null = null;

  private tab: Tab = 'objectives';
  private openDocId: string | null = null;

  constructor(
    private readonly tracker: ObjectiveTracker,
    private readonly canOpen: () => boolean,
    private readonly onOpenChange: (open: boolean) => void
  ) {
    window.addEventListener(
      'keydown',
      this.onKey,
      true
    );
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  private readonly onKey = (
    event: KeyboardEvent
  ): void => {
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
    if (this.root) return;
    if (!this.canOpen()) return;

    this.onOpenChange(true);

    const element = document.createElement('div');

    element.style.cssText = `
      position:fixed;
      inset:0;
      z-index:60;
      background:rgba(6,7,8,.95);
      display:grid;
      grid-template-rows:auto 1fr;
      font-family:Georgia,serif;
      color:#c9c0ab
    `;

    element.innerHTML = `
      <header style="
        display:flex;
        gap:22px;
        align-items:center;
        padding:18px 32px;
        border-bottom:1px solid #23262a
      ">
        <strong style="
          letter-spacing:.3em;
          font:700 12px/1 ui-monospace,monospace;
          color:#8d8471
        ">INVESTIGATION</strong>

        <span
          data-progress
          style="
            font:600 11px/1 ui-monospace,monospace;
            letter-spacing:.2em;
            color:#4f4a40
          "
        ></span>

        <nav style="
          display:flex;
          gap:18px;
          margin-left:auto
        ">
          <button data-tab="objectives">OBJECTIVES</button>
          <button data-tab="documents">DOCUMENTS</button>
        </nav>

        <button
          data-close
          style="
            background:none;
            border:1px solid #2c3034;
            color:#8d8471;
            padding:7px 12px;
            font:600 11px/1 ui-monospace,monospace;
            letter-spacing:.2em;
            cursor:pointer
          "
        >ESC</button>
      </header>

      <main style="
        overflow:auto;
        padding:34px 32px 70px;
        max-width:78ch
      "></main>
    `;

    element
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach(button => {
        button.style.cssText = `
          background:none;
          border:0;
          color:#7c7466;
          font:600 12px/1 ui-monospace,monospace;
          letter-spacing:.2em;
          cursor:pointer;
          padding:8px 4px
        `;

        button.addEventListener('click', () => {
          this.tab = button.dataset.tab as Tab;
          this.openDocId = null;
          this.render();
        });
      });

    element
      .querySelector<HTMLButtonElement>('[data-close]')
      ?.addEventListener('click', () => this.close());

    document.body.appendChild(element);

    this.root = element;

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

    window.removeEventListener(
      'keydown',
      this.onKey,
      true
    );
  }

  private render(): void {
    if (!this.root) return;

    const main = this.root.querySelector('main');

    if (!main) return;

    const progress =
      this.root.querySelector<HTMLSpanElement>(
        '[data-progress]'
      );

    if (progress) {
      progress.textContent =
        `${this.tracker.getCompletedCount()}/` +
        `${this.tracker.getTotalCount()}`;
    }

    this.root
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach(button => {
        const active =
          button.dataset.tab === this.tab;

        button.style.color = active
          ? '#e6dcc4'
          : '#7c7466';

        button.style.borderBottom = active
          ? '1px solid #e6dcc4'
          : '0';
      });

    main.innerHTML = '';

    if (this.tab === 'objectives') {
      this.renderObjectives(main);
    } else if (this.openDocId) {
      this.renderDocument(main, this.openDocId);
    } else {
      this.renderDocumentList(main);
    }
  }

  private section(
    title: string,
    body: string,
    accent = '#8d8471'
  ): string {
    return `
      <section style="margin-bottom:30px">
        <h2 style="
          font:700 11px/1 ui-monospace,monospace;
          letter-spacing:.26em;
          color:${accent};
          margin:0 0 12px
        ">${title}</h2>

        ${body}
      </section>
    `;
  }

  private list(
    items: string[],
    colour: string,
    mark: string
  ): string {
    if (!items.length) {
      return `
        <p style="
          color:#4f4a40;
          margin:0;
          font-style:italic
        ">Nothing yet.</p>
      `;
    }

    return `
      <ul style="list-style:none;padding:0;margin:0">
        ${items.map(item => `
          <li style="
            padding:9px 0;
            border-bottom:1px solid #1b1e21;
            color:${colour}
          ">
            <span style="
              color:#5f594d;
              margin-right:10px
            ">${mark}</span>${item}
          </li>
        `).join('')}
      </ul>
    `;
  }

  /**
   * Collected documents of a given explanation kind, rendered as their one-line "meaning" so the journal reads
   * like case notes rather than a second copy of the document list. Derived from DocumentRegistry's existing
   * `explanation.kind` field — no separate testimony/contradiction/hypothesis data model needed.
   */
  private collectedByKind(kind: string): string[] {
    const result: string[] = [];

    for (const id of this.tracker.getDocuments()) {
      const doc = DOCUMENTS.find(item => item.id === id);
      if (doc && doc.explanation.kind === kind) {
        result.push(doc.explanation.meaning);
      }
    }

    return result;
  }

  private renderObjectives(main: HTMLElement): void {
    const chapter = this.tracker.getChapter();

    main.innerHTML = [
      this.section(
        `CHAPTER ${chapter.index} — ${chapter.title}`,
        `<p style="
          margin:0;
          color:#8f8878;
          font-style:italic
        ">${chapter.purpose}</p>`
      ),

      this.section(
        'CURRENT OBJECTIVE',
        this.list(
          this.tracker.getActive().map(item => item.text),
          '#e6dcc4',
          '›'
        ),
        '#c8a86a'
      ),

      this.section(
        'COMPLETED',
        this.list(
          this.tracker.getCompleted().map(item => item.text),
          '#6f6959',
          '✓'
        )
      ),

      this.section(
        'MAIN PURPOSE',
        `<p style="
          margin:0;
          line-height:1.7;
          color:#a8a08d
        ">Survive Subject 09 and escape the facility — while finding out what the staff knew.</p>`
      ),

      this.section(
        'COLLECTED DOCUMENTS',
        this.list(
          this.tracker.getDocuments().map(id =>
            DOCUMENTS.find(doc => doc.id === id)?.title ?? id
          ),
          '#a8a08d',
          '▪'
        )
      ),

      this.section(
        'EVIDENCE',
        this.list(
          this.tracker.getEvidence().map(
            id => EVIDENCE[id] ?? id
          ),
          '#a8a08d',
          '◆'
        )
      ),

      this.section(
        'TESTIMONY',
        this.list(this.collectedByKind('character-detail'), '#a8a08d', '“ ”')
      ),

      this.section(
        'CONTRADICTIONS',
        this.list(this.collectedByKind('mystery'), '#c89a6a', '⚠')
      ),

      this.section(
        'HYPOTHESES',
        this.list(this.collectedByKind('experiment-result'), '#a8a08d', '∴')
      ),

      this.section(
        'UNRESOLVED QUESTIONS',
        this.list(
          this.tracker.getQuestions().map(
            id => QUESTIONS[id] ?? id
          ),
          '#c8a86a',
          '?'
        )
      )
    ].join('');
  }

  private renderDocumentList(main: HTMLElement): void {
    const ids = this.tracker.getDocuments();

    if (!ids.length) {
      main.innerHTML = `
        <p style="
          color:#4f4a40;
          font-style:italic
        ">No documents collected.</p>
      `;

      return;
    }

    main.innerHTML = `
      <ul style="list-style:none;padding:0;margin:0">
        ${ids.map(id => {
          const title =
            DOCUMENTS.find(doc => doc.id === id)?.title ?? id;

          return `
            <li>
              <button
                data-doc="${id}"
                style="
                  width:100%;
                  text-align:left;
                  background:none;
                  border:0;
                  border-bottom:1px solid #1b1e21;
                  color:#c9c0ab;
                  padding:14px 0;
                  cursor:pointer;
                  font:400 16px/1.4 Georgia,serif
                "
              >${title}</button>
            </li>
          `;
        }).join('')}
      </ul>
    `;

    main
      .querySelectorAll<HTMLButtonElement>('[data-doc]')
      .forEach(button => {
        button.addEventListener('click', () => {
          this.openDocId = button.dataset.doc ?? null;
          this.render();
        });
      });
  }

  private renderDocument(
    main: HTMLElement,
    id: string
  ): void {
    const doc = DOCUMENTS.find(
      item => item.id === id
    );

    if (!doc) return;

    const chapter = CHAPTERS[doc.chapter - 1];

    const block = (
      title: string,
      body: string,
      accent: string
    ): string => this.section(title, body, accent);

    main.innerHTML = `
      <button
        data-back
        style="
          background:none;
          border:0;
          color:#6f6959;
          font:600 11px/1 ui-monospace,monospace;
          letter-spacing:.2em;
          cursor:pointer;
          padding:0 0 20px
        "
      >‹ BACK</button>

      <h1 style="
        font:400 24px/1.3 Georgia,serif;
        color:#e6dcc4;
        margin:0 0 26px
      ">${doc.title}</h1>

      ${block(
        'ORIGINAL MESSAGE',
        `<pre style="
          margin:0;
          white-space:pre-wrap;
          font:400 15px/1.8 Georgia,serif;
          color:#d3c9b2;
          background:#121416;
          border-left:2px solid #2c3034;
          padding:18px 20px
        ">${doc.pages.join('\n\n— page break —\n\n')}</pre>`,
        '#8d8471'
      )}

      ${block(
        'WHAT THIS MESSAGE MEANS',
        `<p style="margin:0;line-height:1.75">${doc.explanation.meaning}</p>`,
        '#c8a86a'
      )}

      ${block(
        'PURPOSE',
        `<p style="margin:0;line-height:1.75">${doc.explanation.purpose}</p>`,
        '#c8a86a'
      )}

      ${block(
        'TYPE',
        `<p style="
          margin:0;
          text-transform:uppercase;
          letter-spacing:.18em;
          font:600 11px/1.6 ui-monospace,monospace;
          color:#7c7466
        ">${doc.explanation.kind.replace('-', ' ')}</p>`,
        '#5f594d'
      )}

      <p style="
        color:#4f4a40;
        font-size:13px
      ">Chapter ${doc.chapter} · ${chapter?.title ?? 'Unknown chapter'}</p>
    `;

    main
      .querySelector<HTMLButtonElement>('[data-back]')
      ?.addEventListener('click', () => {
        this.openDocId = null;
        this.render();
      });
  }
}
