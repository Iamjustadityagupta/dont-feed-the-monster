import type { Disposable } from '../core/Disposable';

/**
 * A4 paper overlay.
 *
 *   paperSheet.show('Some text')            // one page
 *   paperSheet.show(['page 1', 'page 2'])   // several pages (A / D or arrows to turn)
 *
 * The sheet stays on screen until the player presses E or Escape (or clicks "put down").
 * All text is inserted with textContent, never innerHTML.
 */

/**
 * Handwriting stack. Corsiva-style faces first (Monotype Corsiva on Windows/Office, Apple Chancery on macOS,
 * URW Chancery / Z003 on Linux), then other script faces, then the generic `cursive`.
 * Deliberately contains no Calibri / Cambria / Georgia-style office or serif fonts.
 */
export const HANDWRITING_FONT_STACK =
  '"Monotype Corsiva","Apple Chancery","URW Chancery L","Z003","Lucida Calligraphy","Lucida Handwriting",' +
  '"Snell Roundhand","Segoe Script","Brush Script MT","Caveat",cursive';

export type PaperCloseReason = 'interact' | 'escape' | 'button' | 'forced';

export interface PaperShowOptions {
  /** Called once when the player (or the game) puts the paper away. */
  onClose?: (reason: PaperCloseReason) => void;
}

export interface PaperSheetOptions {
  /** Fires whenever the paper becomes visible / hidden to the player. */
  onOpenChange?: (open: boolean) => void;
}

const MAX_FONT_UNITS = 3.4; // font-size in "u" (1u = 1% of the sheet width)
const MIN_FONT_UNITS = 1.5;
const A4_RATIO = 210 / 297;

const NOISE_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>' +
    '<feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.26  0 0 0 0 0.12  0 0 0 0.55 0"/></filter>' +
    '<rect width="240" height="240" filter="url(#n)"/></svg>',
);

const CSS = `
.dfm-paper-backdrop{
  position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:1vh;padding:1vh 1.5vw;isolation:isolate;
  background:radial-gradient(ellipse 58% 78% at 50% 43%,rgba(22,17,11,.24),rgba(0,0,0,.74) 76%),rgba(1,2,3,.54);
  -webkit-backdrop-filter:blur(3px) brightness(.48) saturate(.72);backdrop-filter:blur(3px) brightness(.48) saturate(.72);
  animation:dfm-paper-fade .24s ease-out both
}
.dfm-paper-backdrop[hidden]{display:none}
.dfm-paper-backdrop *{box-sizing:border-box}
.dfm-paper-sheet{
  --u:8px;position:relative;flex:none;width:min(94vw,calc(92vh * ${A4_RATIO.toFixed(5)}));aspect-ratio:210 / 297;
  display:flex;flex-direction:column;padding:calc(var(--u)*8.2) calc(var(--u)*9) calc(var(--u)*7.2);
  color:#191c1b;background-color:#b9a887;border:1px solid rgba(74,52,26,.68);
  background-image:
    linear-gradient(90deg,rgba(82,58,29,.16),transparent 7%,transparent 93%,rgba(82,58,29,.13)),
    repeating-linear-gradient(to bottom,transparent 0 calc(var(--u)*3.75),rgba(87,75,54,.045) calc(var(--u)*3.75) calc(var(--u)*3.88)),
    radial-gradient(ellipse at 8% 10%,rgba(118,78,34,.18),transparent 30%),
    radial-gradient(circle at 84% 15%,transparent 0 calc(var(--u)*5.6),rgba(104,70,34,.22) calc(var(--u)*5.7) calc(var(--u)*6.1),transparent calc(var(--u)*6.2)),
    radial-gradient(ellipse at 18% 78%,rgba(122,92,48,.18),transparent 45%),
    radial-gradient(ellipse at 70% 40%,rgba(122,92,48,.11),transparent 50%),\n    radial-gradient(ellipse 13% 8% at 88% 83%,rgba(75,12,10,.42),transparent 72%),\n    radial-gradient(ellipse 8% 5% at 11% 31%,rgba(83,16,12,.34),transparent 70%),\n    radial-gradient(circle at 16% 33%,rgba(65,10,8,.26) 0 2%,transparent 2.8%),\n    radial-gradient(circle at 20% 36%,rgba(65,10,8,.24) 0 1.1%,transparent 2%),
    url("data:image/svg+xml,${NOISE_SVG}");
  box-shadow:0 0 0 1px rgba(16,12,7,.8),0 calc(var(--u)*1.3) calc(var(--u)*4) rgba(0,0,0,.72),
    inset 0 0 calc(var(--u)*7) rgba(110,78,34,.42),inset 0 0 1px calc(var(--u)*.3) rgba(255,248,225,.42);
  transform:rotate(-.55deg);animation:dfm-paper-in .34s cubic-bezier(.2,.8,.25,1) both;overflow:hidden;
  font-family:${HANDWRITING_FONT_STACK}
}
.dfm-paper-sheet::before{
  content:"";position:absolute;z-index:2;left:50%;top:calc(var(--u)*1.3);width:calc(var(--u)*13);height:calc(var(--u)*4.5);
  transform:translateX(-50%) rotate(-2deg);background:linear-gradient(135deg,rgba(239,226,181,.75),rgba(194,173,126,.42));
  border:1px solid rgba(119,94,54,.16);box-shadow:0 1px 3px rgba(0,0,0,.28)
}
.dfm-paper-sheet::after{
  content:"";position:absolute;inset:calc(var(--u)*1.8);z-index:0;pointer-events:none;
  border:1px solid rgba(106,79,43,.13);box-shadow:inset 0 0 0 1px rgba(255,248,228,.18)
}
.dfm-paper-text{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:hidden;font-size:calc(var(--u)*var(--fs,3.2));line-height:1.38;letter-spacing:.012em;text-shadow:none}
.dfm-paper-text p{margin:0 0 .34em;overflow-wrap:anywhere;white-space:pre-wrap}
.dfm-paper-text p.hd{font-size:1.3em;font-weight:700;letter-spacing:.045em;margin-bottom:.5em;text-decoration:underline;text-decoration-color:rgba(51,47,36,.28);text-decoration-thickness:.045em;text-underline-offset:.14em}
.dfm-paper-text .gap{height:.62em}
.dfm-paper-page{position:relative;z-index:1;flex:none;margin-top:calc(var(--u)*1.5);text-align:center;font-size:calc(var(--u)*2.2);opacity:.58}
.dfm-paper-hint{
  position:relative;z-index:3;flex:none;display:flex;gap:12px;align-items:center;justify-content:center;
  font:600 11px/1 ui-monospace,"SFMono-Regular",Menlo,monospace;letter-spacing:.15em;color:#ded2b5;
  text-shadow:0 1px 8px #000;text-transform:uppercase;white-space:nowrap;padding:5px 8px;
  background:rgba(7,7,6,.48);border:1px solid rgba(217,204,170,.16);box-shadow:0 5px 22px rgba(0,0,0,.16)
}
.dfm-paper-hint button{all:unset;cursor:pointer;color:inherit;letter-spacing:inherit;font:inherit;text-transform:inherit;padding:7px 10px;border:1px solid rgba(217,204,170,.48);background:rgba(217,204,170,.035);border-radius:2px;transition:background .16s,border-color .16s}
.dfm-paper-hint button:hover,.dfm-paper-hint button:focus-visible{background:rgba(217,204,170,.16);border-color:rgba(232,221,194,.8);outline:none}
@keyframes dfm-paper-fade{from{opacity:0}to{opacity:1}}
@keyframes dfm-paper-in{from{opacity:0;transform:translateY(5vh) rotate(-3.5deg) scale(.94)}to{opacity:1;transform:rotate(-.55deg) scale(1)}}
@media (max-width:560px){
  .dfm-paper-backdrop{gap:1.2vh;padding:1vh 3vw}
  .dfm-paper-hint{gap:5px;font-size:9px;letter-spacing:.08em}
  .dfm-paper-hint button{padding:7px 6px}
}
@media (prefers-reduced-motion:reduce){.dfm-paper-backdrop,.dfm-paper-sheet{animation:none}}
`;

/** Small deterministic hash so each line gets a stable, hand-written wobble. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function isHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 3 && t.length < 60 && /[A-Z]/.test(t) && t === t.toUpperCase();
}

export class PaperSheet implements Disposable {
  private readonly styleTag: HTMLStyleElement;
  private readonly backdrop: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly pageEl: HTMLDivElement;
  private readonly hintKeys: HTMLSpanElement;
  private readonly pageHint: HTMLSpanElement;
  private readonly closeButton: HTMLButtonElement;

  private pages: string[] = [];
  private pageIndex = 0;
  private open = false;
  private suspended = false;
  private disposed = false;
  private onClose: ((reason: PaperCloseReason) => void) | null = null;
  private lastVisible = false;

  constructor(private readonly options: PaperSheetOptions = {}) {
    this.styleTag = document.createElement('style');
    this.styleTag.dataset.dfm = 'paper-sheet';
    this.styleTag.textContent = CSS;
    document.head.appendChild(this.styleTag);

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'dfm-paper-backdrop';
    this.backdrop.hidden = true;
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'Paper note');

    this.sheet = document.createElement('div');
    this.sheet.className = 'dfm-paper-sheet';
    this.textEl = document.createElement('div');
    this.textEl.className = 'dfm-paper-text';
    this.pageEl = document.createElement('div');
    this.pageEl.className = 'dfm-paper-page';
    this.sheet.append(this.textEl, this.pageEl);

    const hint = document.createElement('div');
    hint.className = 'dfm-paper-hint';
    this.pageHint = document.createElement('span');
    this.hintKeys = document.createElement('span');
    this.hintKeys.textContent = 'E / ESC';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Put it down';
    this.closeButton.addEventListener('click', this.onCloseClick);
    hint.append(this.pageHint, this.hintKeys, this.closeButton);

    this.backdrop.append(this.sheet, hint);
    document.body.appendChild(this.backdrop);

    // Capture phase on window: while the paper is up it sees every key before any gameplay listener does.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onResize);
  }

  /** True while the paper is actually on screen (false when closed, or when hidden behind the pause menu). */
  get isOpen(): boolean {
    return this.open && !this.suspended && !this.disposed;
  }

  /**
   * Shows `content` on the A4 sheet. Replaces whatever is currently shown.
   * Stays up until the player puts it away.
   */
  show(content: string | readonly string[], options: PaperShowOptions = {}): void {
    if (this.disposed) return;
    const raw = typeof content === 'string' ? [content] : [...content];
    const pages = raw.map((p) => p.replace(/\r\n?/g, '\n').trim()).filter((p) => p.length > 0);
    if (pages.length === 0) {
      console.warn('[paper] show() called with no text; ignoring.');
      return;
    }

    // If something is already open, finish it cleanly first.
    if (this.open) this.close('forced');

    this.pages = pages;
    this.pageIndex = 0;
    this.open = true;
    this.suspended = false;
    this.onClose = options.onClose ?? null;
    this.backdrop.hidden = false;
    this.renderPage();
    this.syncVisibility();
    this.closeButton.focus({ preventScroll: true });
  }

  /** Puts the paper away. Safe to call when nothing is open. */
  close(reason: PaperCloseReason = 'forced'): void {
    if (!this.open) return;
    this.open = false;
    this.suspended = false;
    this.backdrop.hidden = true;
    this.textEl.replaceChildren();
    this.pages = [];
    this.pageIndex = 0;
    const cb = this.onClose;
    this.onClose = null;
    this.syncVisibility();
    cb?.(reason);
  }

  /** Hides the paper (e.g. behind the pause menu) without discarding it. */
  suspend(): void {
    if (!this.open || this.suspended) return;
    this.suspended = true;
    this.backdrop.hidden = true;
    this.syncVisibility();
  }

  /** Brings a suspended paper back. */
  resume(): void {
    if (!this.open || !this.suspended) return;
    this.suspended = false;
    this.backdrop.hidden = false;
    this.renderPage();
    this.syncVisibility();
  }

  dispose(): void {
    if (this.disposed) return;
    this.close('forced');
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.onResize);
    this.closeButton.removeEventListener('click', this.onCloseClick);
    this.backdrop.remove();
    this.styleTag.remove();
  }

  // ---------------------------------------------------------------------------------------------------------------

  private syncVisibility(): void {
    const visible = this.isOpen;
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    if (visible) document.exitPointerLock?.();
    this.options.onOpenChange?.(visible);
  }

  private readonly onCloseClick = (): void => this.close('button');

  private readonly onResize = (): void => {
    if (this.isOpen) this.updateUnit();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    // The paper owns the keyboard while it is up: nothing reaches gameplay, journal or settings.
    event.stopImmediatePropagation();

    switch (event.code) {
      case 'KeyE':
      case 'Escape':
        event.preventDefault();
        if (event.repeat) return;
        this.close(event.code === 'Escape' ? 'escape' : 'interact');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        event.preventDefault();
        this.flip(-1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        event.preventDefault();
        this.flip(1);
        break;
      default:
        break;
    }
  };

  private flip(direction: number): void {
    const next = Math.min(this.pages.length - 1, Math.max(0, this.pageIndex + Math.sign(direction)));
    if (next === this.pageIndex) return;
    this.pageIndex = next;
    this.renderPage();
  }

  private updateUnit(): void {
    this.sheet.style.setProperty('--u', `${this.sheet.clientWidth / 100}px`);
  }

  private renderPage(): void {
    const text = this.pages[this.pageIndex] ?? '';
    this.textEl.replaceChildren();

    for (const line of text.split('\n')) {
      if (line.trim() === '') {
        const gap = document.createElement('div');
        gap.className = 'gap';
        this.textEl.appendChild(gap);
        continue;
      }
      const p = document.createElement('p');
      p.textContent = line;
      if (isHeading(line)) p.className = 'hd';
      // Stable hand-written wobble: a hair of rotation and indent per line.
      const r = hash(line + this.pageIndex);
      p.style.transform = `rotate(${((r - 0.5) * 0.7).toFixed(2)}deg)`;
      p.style.marginLeft = `${((hash(line) - 0.5) * 1.2).toFixed(2)}%`;
      this.textEl.appendChild(p);
    }

    const multi = this.pages.length > 1;
    this.pageEl.textContent = multi ? `${this.pageIndex + 1} / ${this.pages.length}` : '';
    this.pageHint.textContent = multi ? 'A / D  turn page' : '';
    this.pageHint.style.display = multi ? '' : 'none';

    this.updateUnit();
    this.fitText();
  }

  /** Shrinks the handwriting until the page fits on the sheet. */
  private fitText(): void {
    let size = MAX_FONT_UNITS;
    this.textEl.style.setProperty('--fs', String(size));
    while (this.textEl.scrollHeight > this.textEl.clientHeight + 1 && size > MIN_FONT_UNITS) {
      size = Math.max(MIN_FONT_UNITS, size - 0.1);
      this.textEl.style.setProperty('--fs', size.toFixed(2));
    }
  }
}
