
const INTRO_PAGES = [
  {
    chapter: 'PROLOGUE / 01',
    title: 'THE FACILITY',
    text: `You are inside an underground research complex.

The facility was built to study an experimental organism designated SUBJECT 09.

For years, the research team documented its behaviour, conducted experiments and monitored its responses.

The records were classified. The warnings were ignored.

Tonight, containment has failed.`,
  },
  {
    chapter: 'CLASSIFIED RECORD / 09',
    title: 'WHAT THEY CREATED',
    text: `Subject 09 was not an intruder.

It was an experimental organism held inside the facility.

The surviving records describe a creature that responds to sound, investigates disturbances and appears to learn from previous encounters.

Researchers documented increasingly dangerous behaviour.

The exact process that transformed Subject 09 remains unknown.

The surviving reports disagree about its feeding schedule, memory and the final containment procedure. Treat every document as evidence, not unquestionable truth.

Someone knew the risks. The experiments continued anyway.`,
  },
  {
    chapter: 'INCIDENT REPORT / REDACTED',
    title: 'THE BREACH',
    text: `Emergency systems are failing.

Security doors are locked. Power is unstable. Research records have been scattered throughout the complex.

The containment incident may not have been an accident.

One report suggests that a containment hatch was opened from the inside. Another indicates that the authorising badge was removed from the system.

Someone wanted the truth hidden.

You have to find out who.`,
  },
  {
    chapter: 'SURVIVAL DIRECTIVE',
    title: 'YOUR OBJECTIVE',
    text: `You wake inside the damaged facility.

Your immediate objective is to survive and escape.

Find the security keycard. Explore the rooms. Recover documents and evidence.

Subject 09 reacts to noise. Sprinting and careless interactions may attract its attention.

Hide when necessary. Use distractions to redirect it.

Do not assume that a hiding place will remain safe forever.

Every recovered record brings you closer to the truth.

Your journal keeps recovered documents, evidence, testimony, contradictions, working hypotheses and unanswered questions together. Revisit it whenever you need to connect the clues.`,
  },
];

const CONTROLS = [
  ['W / A / S / D', 'Move'],
  ['CLICK GAME VIEW', 'Capture mouse / enable pointer lock'],
  ['MOUSE X / Y', 'Look freely — full 360° horizontal view'],
  ['W / A / S / D', 'Move relative to the direction you face'],
  ['LEFT SHIFT', 'Sprint — noise can attract Subject 09'],
  ['C / CTRL', 'Crouch and reduce movement noise'],
  ['E', 'Interact / collect / hide / read'],
  ['G', 'Throw a distraction to redirect the creature'],
  ['J / TAB', 'Open investigation dossier / journal'],
  ['ESC', 'Release mouse / close overlay / pause']
];

export class IntroSequence {
  private el: HTMLDivElement | null = null;
  private pageIndex = 0;
  private onDone: (() => void) | null = null;
  private onStart: (() => void) | null = null;
  private started = false;
  private finished = false;

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.el) return;

    if (event.code === 'Escape') {
      event.preventDefault();
      this.finish();
      return;
    }

    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      this.next();
    }
  };

  play(onDone: () => void): void;
  play(onStart: () => void, onDone: () => void): void;

  play(
    onStartOrDone: (() => void),
    onDoneMaybe?: () => void,
  ): void {
    if (this.el) return;

    this.onStart = onDoneMaybe ? onStartOrDone : null;
    this.onDone = onDoneMaybe ?? onStartOrDone;

    this.pageIndex = 0;
    this.started = false;
    this.finished = false;

    const root = document.createElement('div');
    root.className = 'dfm-cinematic-intro';

    root.style.cssText = `
      position:fixed;
      inset:0;
      z-index:120;
      display:grid;
      place-items:center;
      padding:30px;
      color:#e5dcc7;
      background:
        radial-gradient(ellipse at 50% 42%,rgba(78,54,39,.20),transparent 55%),
        linear-gradient(135deg,#0b0d0e,#030405 70%);
      font-family:Georgia,"Times New Roman",serif;
      opacity:0;
      transition:opacity .9s ease;
    `;

    root.innerHTML = `
      <style>
        .dfm-intro-frame {
          width:min(850px,100%);
          max-height:calc(100dvh - 60px);
          box-sizing:border-box;
          display:flex;
          flex-direction:column;
          padding:clamp(24px,5vw,60px);
          border:1px solid rgba(190,158,105,.22);
          background:rgba(8,10,11,.78);
          box-shadow:0 30px 100px rgba(0,0,0,.55);
        }
        .dfm-intro-content {
          flex:1 1 auto;
          min-height:0;
          overflow-y:auto;
          overscroll-behavior:contain;
          scrollbar-width:thin;
          scrollbar-color:#806a46 rgba(40,39,34,.45);
          padding-right:12px;
          margin-right:-12px;
        }
        .dfm-intro-content::-webkit-scrollbar {width:7px;}
        .dfm-intro-content::-webkit-scrollbar-track {background:rgba(40,39,34,.45);}
        .dfm-intro-content::-webkit-scrollbar-thumb {background:#806a46;border-radius:8px;}
        .dfm-intro-top {
          display:flex;justify-content:space-between;gap:15px;
          color:#8e8068;font:10px ui-monospace,monospace;
          letter-spacing:.24em;
        }
        .dfm-intro-title {
          margin:45px 0 24px;color:#e5dcc7;
          font:400 clamp(34px,6vw,58px)/1.08 Georgia,serif;
          letter-spacing:-.035em;
        }
        .dfm-intro-text {
          min-height:190px;white-space:pre-line;
          color:#b9b09e;font:16px/2 Georgia,serif;
          max-width:67ch;
        }
        .dfm-intro-rule {height:1px;background:#302c24;margin:30px 0;}
        .dfm-intro-bottom {
          display:flex;align-items:center;justify-content:space-between;gap:15px;
        }
        .dfm-intro-button {
          border:1px solid #806a46;background:#b08d56;color:#0a0b0b;
          padding:13px 21px;font:700 10px ui-monospace,monospace;
          letter-spacing:.2em;cursor:pointer;
        }
        .dfm-intro-button:hover {background:#d0ae75;}
        .dfm-intro-skip {
          border:0;background:transparent;color:#777061;
          font:10px ui-monospace,monospace;letter-spacing:.18em;cursor:pointer;
        }
        .dfm-intro-progress {
          height:2px;margin-top:25px;background:#282722;
        }
        .dfm-intro-progress i {
          display:block;height:100%;background:#b08d56;transition:width .3s;
        }
        .dfm-controls {
          display:grid;grid-template-columns:1fr 1fr;gap:9px 20px;
          margin-top:22px;
        }
        .dfm-control {
          display:flex;justify-content:space-between;gap:12px;
          padding:9px 0;border-bottom:1px solid #242523;
          font:10px ui-monospace,monospace;
        }
        .dfm-control b {color:#c8a66a;font-weight:600;}
        .dfm-control span {color:#a39a87;text-align:right;}
        @media(max-width:600px) {
          .dfm-intro-frame {max-height:calc(100dvh - 24px);padding:20px;}
          .dfm-controls {grid-template-columns:1fr;}
          .dfm-intro-title {margin:28px 0 18px;}
          .dfm-intro-text {min-height:0;font-size:14px;}
          .dfm-intro-rule {margin:18px 0;}
        }
      </style>
      <div class="dfm-intro-frame">
        <div class="dfm-intro-top">
          <span>DON'T FEED THE MONSTER</span>
          <span>RESTRICTED / LEVEL 09</span>
        </div>
        <div data-content class="dfm-intro-content"></div>
        <div class="dfm-intro-rule"></div>
        <div class="dfm-intro-bottom">
          <span data-counter class="dfm-intro-top"></span>
          <div style="display:flex;gap:18px;align-items:center">
            <button class="dfm-intro-skip" data-skip>SKIP INTRO / ESC</button>
            <button class="dfm-intro-button" data-next>CONTINUE →</button>
          </div>
        </div>
        <div class="dfm-intro-progress"><i data-progress></i></div>
      </div>
    `;

    document.body.appendChild(root);
    this.el = root;

    root.querySelector('[data-next]')?.addEventListener('click', () => this.next());
    root.querySelector('[data-skip]')?.addEventListener('click', () => this.finish());

    window.addEventListener('keydown', this.onKey, true);

    requestAnimationFrame(() => {
      if (this.el) this.el.style.opacity = '1';
    });

    this.renderPage();
  }

  private startGameplay(): void {
    if (this.started) return;
    this.started = true;
    this.onStart?.();
  }

  private next(): void {
    if (!this.el || this.finished) return;

    if (this.pageIndex < INTRO_PAGES.length) {
      this.pageIndex += 1;
      this.renderPage();
      return;
    }

    this.finish();
  }

  private renderPage(): void {
    if (!this.el) return;

    const content = this.el.querySelector<HTMLElement>('[data-content]');
    const counter = this.el.querySelector<HTMLElement>('[data-counter]');
    const progress = this.el.querySelector<HTMLElement>('[data-progress]');
    const nextButton = this.el.querySelector<HTMLButtonElement>('[data-next]');

    if (!content || !counter || !progress || !nextButton) return;

    const isControls = this.pageIndex === INTRO_PAGES.length;

    if (isControls) {
      content.innerHTML = `
        <div class="dfm-intro-top" style="margin-top:42px">PLAYER FIELD MANUAL</div>
        <h1 class="dfm-intro-title">How to survive.</h1>
        <p class="dfm-intro-text" style="min-height:0">
          Learn the controls before entering the facility.
          Watch your noise. Investigate carefully.
          Do not let Subject 09 corner you.
        </p>
        <div class="dfm-controls">
          ${CONTROLS.map(([key, action]) => `
            <div class="dfm-control"><b>${key}</b><span>${action}</span></div>
          `).join('')}
        </div>
        <p style="margin:24px 0 0;color:#877b65;font:11px/1.7 ui-monospace,monospace">
          FRAGMENT COMBINATION AND FLASHLIGHT: FOLLOW THE IN-GAME HUD PROMPTS.
        </p>
      `;

      counter.textContent = 'FIELD MANUAL / FINAL';
      nextButton.textContent = 'ENTER FACILITY →';
      progress.style.width = '100%';
      return;
    }

    const page = INTRO_PAGES[this.pageIndex];

    content.innerHTML = `
      <div class="dfm-intro-top" style="margin-top:42px">
        ${page.chapter}
      </div>
      <h1 class="dfm-intro-title">${page.title}</h1>
      <p class="dfm-intro-text">${page.text}</p>
    `;

    counter.textContent =
      `BRIEFING ${String(this.pageIndex + 1).padStart(2, '0')} / ${INTRO_PAGES.length + 1}`;

    nextButton.textContent = 'CONTINUE →';

    progress.style.width =
      `${((this.pageIndex + 1) / (INTRO_PAGES.length + 1)) * 100}%`;
  }

  private finish(): void {
    if (!this.el || this.finished) return;

    this.finished = true;

    const root = this.el;
    root.style.opacity = '0';

    window.removeEventListener('keydown', this.onKey, true);

    window.setTimeout(() => {
      root.remove();

      if (this.el === root) {
        this.el = null;
      }

      this.startGameplay();

      const callback = this.onDone;
      this.onDone = null;
      this.onStart = null;

      callback?.();
    }, 700);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);

    if (this.el) {
      this.el.remove();
      this.el = null;
    }

    this.onDone = null;
    this.onStart = null;
    this.finished = true;
  }
}
