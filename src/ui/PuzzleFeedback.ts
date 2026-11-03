import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

/** Severity/kind of a transient puzzle feedback message (structurally identical to GameUI's PuzzleFeedbackKind). */
export type PuzzleFeedbackKind = 'success' | 'error' | 'info';

/** Canonical puzzle moments this component has preset atmospheric copy for. */
export type PuzzleFeedbackEvent =
  | 'item-collected'
  | 'drawer-empty'
  | 'key-accepted'
  | 'lock-opened'
  | 'missing-fragment'
  | 'combination-complete'
  | 'box-opened'
  | 'door-unlocked'
  | 'incorrect-password'
  | 'locker-opened';

const EVENT_COPY: Record<PuzzleFeedbackEvent, { text: string; kind: PuzzleFeedbackKind }> = {
  'item-collected': { text: 'Picked it up.', kind: 'success' },
  'drawer-empty': { text: 'Empty.', kind: 'info' },
  'key-accepted': { text: 'The key turns.', kind: 'success' },
  'lock-opened': { text: 'Lock disengaged.', kind: 'success' },
  'missing-fragment': { text: "You're still missing a piece.", kind: 'error' },
  'combination-complete': { text: 'The pieces fit together.', kind: 'success' },
  'box-opened': { text: 'The box creaks open.', kind: 'success' },
  'door-unlocked': { text: 'The door unlocks.', kind: 'success' },
  'incorrect-password': { text: 'Incorrect code.', kind: 'error' },
  'locker-opened': { text: 'The locker clicks open.', kind: 'success' },
};

const DEFAULT_DURATION_MS = 2400;

/**
 * Short, atmospheric, non-blocking puzzle messages (e.g. "Picked it up.",
 * "Incorrect code."). Never a full-screen popup — just a small toast that
 * fades in/out on its own timer. Safe to call show() repeatedly; each call
 * restarts the timer and never leaves a stray timeout behind.
 */
export class PuzzleFeedback implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private hideTimer: number | null = null;
  private disposed = false;

  constructor() {
    this.root = el('div', 'dfm-feedback') as HTMLDivElement;
    this.root.dataset.visible = 'false';
    this.root.dataset.kind = 'info';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
  }

  /** Shows `message` for `durationMs` (default ~2.4s), replacing whatever is currently shown. */
  show(message: string, kind: PuzzleFeedbackKind = 'info', durationMs = DEFAULT_DURATION_MS): void {
    if (this.disposed || message.length === 0) return;
    this.clearTimer();
    this.root.textContent = message;
    this.root.dataset.kind = kind;
    this.root.dataset.visible = 'true';
    this.hideTimer = window.setTimeout(() => this.hide(), Math.max(400, durationMs));
  }

  /** Convenience wrapper around show() using the preset copy for a known puzzle moment. */
  showEvent(event: PuzzleFeedbackEvent, durationMs = DEFAULT_DURATION_MS): void {
    const preset = EVENT_COPY[event];
    this.show(preset.text, preset.kind, durationMs);
  }

  hide(): void {
    this.clearTimer();
    this.root.dataset.visible = 'false';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.group.dispose();
    this.root.remove();
  }

  private clearTimer(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}